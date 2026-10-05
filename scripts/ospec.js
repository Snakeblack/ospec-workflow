#!/usr/bin/env node
"use strict";

// `ospec` CLI core for IDD changes (openspec/specs/idd/spec.md, REQ-idd-011):
// status, next and record over idd/<change-id>/state.yaml, plus signals, which
// derives impact signals from the declaration and the diff (REQ-idd-012), and
// check and run, which execute the declared checks and test commands and
// record what they observed (REQ-idd-014). `record` never takes evidence: the
// CLI records it only from executions it observes (REQ-idd-007).
//
// Exit codes: 0 ok, 1 refused by the IDD contract, 2 usage error.

const { parseArgs } = require("node:util");

const { PAIR_OBLIGATIONS, checkVerdict, recordRuns, settleChecks, settlePair } = require("./lib/idd-check.js");
const { IddConfigError } = require("./lib/idd-config.js");
const { isIntentAmbiguous } = require("./lib/idd-contract.js");
const { runCommand } = require("./lib/idd-exec.js");
const { nextForChange, nextForProject, statusOf } = require("./lib/idd-next.js");
const { IddRecordError, recordGate, recordIntent, recordSignal, recordWithdraw } = require("./lib/idd-record.js");
const { IddImpactError } = require("./lib/idd-impact.js");
const { applyDerivation, deriveSignals } = require("./lib/idd-signals.js");
const { IddStoreError, listChanges, mutateChange, readChange } = require("./lib/idd-store.js");
const { IddWorkspaceError, readGitDiff, readHead, readProjectContext, readTreeFingerprint } = require("./lib/idd-workspace.js");

const USAGE = `Usage:
  ospec status [--change <id>] [--json]
  ospec next [--change <id>] [--json]
  ospec record intent --change <id> --kind <bug|feature|refactor|docs> --summary <text> --acceptance <text>
                      [--request <text>] [--answer <text> --source <text>]
  ospec record intent --change <id> --ambiguous --request <text>
  ospec record signal --change <id> --signal <id> --reason <text> [--source declaration|diff]
  ospec record gate --change <id> --gate <id> (--open [--reason <text>] | --resolve --answer <text> --source <text>)
  ospec record withdraw --change <id> --obligation <id> --reason <text>
  ospec signals --change <id> [--path <file>]... [--work-units <n>] [--decision]
                [--operation <op>]... [--diff] [--base <ref>]
  ospec check --change <id> [--base <ref>]
  ospec run --change <id> --obligation <repro-test|tdd-red-green> --command <cmd> [--unit <name>]

Options:
  --root <dir>  project root (default: current directory)
  --json        machine-readable output
  --diff        signals: also read the git diff against --base
  --base <ref>  diff base (default: the commit the change started from, else HEAD)
`;

const OPTIONS = {
  change: { type: "string" },
  kind: { type: "string" },
  summary: { type: "string" },
  acceptance: { type: "string" },
  request: { type: "string" },
  ambiguous: { type: "boolean" },
  answer: { type: "string" },
  source: { type: "string" },
  signal: { type: "string" },
  reason: { type: "string" },
  gate: { type: "string" },
  open: { type: "boolean" },
  resolve: { type: "boolean" },
  obligation: { type: "string" },
  path: { type: "string", multiple: true },
  "work-units": { type: "string" },
  decision: { type: "boolean" },
  operation: { type: "string", multiple: true },
  diff: { type: "boolean" },
  base: { type: "string" },
  command: { type: "string" },
  unit: { type: "string" },
  root: { type: "string" },
  json: { type: "boolean" },
  help: { type: "boolean", short: "h" },
};

class UsageError extends Error {
  constructor(message) {
    super(message);
    this.code = "usage";
  }
}

function reducerFor(type, values, root) {
  switch (type) {
    case "intent":
      return (state) =>
        recordIntent(state, {
          base: state ? undefined : readHead(root),
          change: values.change,
          kind: values.kind,
          summary: values.summary,
          acceptance: values.acceptance,
          request: values.request,
          ambiguous: values.ambiguous === true,
          answer: values.answer,
          source: values.source,
        });
    case "signal":
      return existing((state) =>
        recordSignal(state, { id: values.signal, reason: values.reason, source: values.source || "declaration" }),
      );
    case "gate": {
      if (values.open === values.resolve) throw new UsageError("record gate needs exactly one of --open or --resolve");
      const action = values.open ? "open" : "resolve";
      return existing((state) =>
        recordGate(state, { id: values.gate, action, reason: values.reason, answer: values.answer, source: values.source }),
      );
    }
    case "withdraw":
      return existing((state) => recordWithdraw(state, { obligation: values.obligation, reason: values.reason }));
    default:
      throw new UsageError(`unknown record type: ${type ?? "(none)"}; expected intent, signal, gate or withdraw`);
  }
}

function existing(reducer) {
  return (state) => {
    if (!state) throw new IddRecordError("unknown-change", "no such change; open it with record intent first");
    return reducer(state);
  };
}

function parseWorkUnits(raw) {
  if (raw === undefined) return 1;
  if (!/^[1-9]\d*$/.test(raw)) throw new UsageError(`--work-units must be a positive integer, got ${JSON.stringify(raw)}`);
  return Number(raw);
}

async function signals(root, values) {
  if (!values.change) throw new UsageError("signals needs --change <id>");
  const declaration = {
    paths: values.path || [],
    workUnits: parseWorkUnits(values["work-units"]),
    nonObviousDecision: values.decision === true,
    operations: values.operation || [],
  };
  const context = readProjectContext(root);
  const stored = values.diff || values.base ? await readChange(root, values.change) : null;
  const diff = values.diff || values.base ? readGitDiff(root, { base: diffBase(values, stored) }) : {};
  let derivation;
  const { state, changed, added } = await mutateChange(
    root,
    values.change,
    existing((current) => {
      const intent = current.intent && current.intent.kind ? current.intent : null;
      derivation = deriveSignals({ intent, strictTdd: context.strictTdd, declaration, diff, patterns: context.patterns });
      return applyDerivation(current, derivation);
    }),
  );
  const { signals: derived, gates, floor } = derivation;
  return { change: state.change, changed, added, signals: derived, gates, floor, next: nextForChange(state) };
}

// The change's own base keeps its committed work in the diff (REQ-idd-014).
function diffBase(values, state) {
  return values.base || state?.base || "HEAD";
}

async function openChange(root, changeId) {
  const state = await readChange(root, changeId);
  if (!state) throw new IddRecordError("unknown-change", "no such change; open it with record intent first");
  if (state.status === "closed") throw new IddRecordError("change-closed", `change ${changeId} is closed`);
  return state;
}

function changedFrom(stored, state) {
  return JSON.stringify(stored) !== JSON.stringify(state);
}

function runRecord(purpose, command, result, tree, recordedAt, extra = {}) {
  return { purpose, ...extra, command, exit_code: result.exit_code, output_sha256: result.output_sha256, tree, recorded_at: recordedAt };
}

// Runs every declared check on the working tree, recomputes the signals from
// the diff and settles checks-pass on the tree the checks finished on.
async function check(root, values) {
  if (!values.change) throw new UsageError("check needs --change <id>");
  const current = await openChange(root, values.change);
  if (isIntentAmbiguous(current)) {
    const verdict = checkVerdict(current);
    return { change: current.change, changed: false, added: { signals: [], gates: [] }, checks: [], ...verdict, next: nextForChange(current) };
  }

  const context = readProjectContext(root);
  const diff = readGitDiff(root, { base: diffBase(values, current) });
  const treeBefore = readTreeFingerprint(root);
  const checks = context.checks.map(({ name, command }) => ({ name, command, ...runCommand(command, { cwd: root }) }));
  const tree = readTreeFingerprint(root);
  const recordedAt = new Date().toISOString();

  let added;
  const { state, changed } = await mutateChange(
    root,
    values.change,
    existing((stored) => {
      const derivation = deriveSignals({
        intent: stored.intent,
        strictTdd: context.strictTdd,
        diff,
        patterns: context.patterns,
      });
      const derived = applyDerivation(stored, derivation);
      added = derived.added;
      const runs = checks.map((result) => runRecord("checks", result.command, result, treeBefore, recordedAt, { name: result.name }));
      const recorded = recordRuns(derived.state, runs);
      const settled = settleChecks(recorded.state, { tree, runIds: recorded.ids, recordedAt });
      return { state: settled.state, changed: changedFrom(stored, settled.state) };
    }),
  );
  const verdict = checkVerdict(state, { checks: context.checks, results: checks, treeChanged: tree !== treeBefore });
  return { change: state.change, changed, added, checks, tree, ...verdict, next: nextForChange(state) };
}

// Runs one test command for a red → green obligation and records the run; a
// passing run after a failing one on another tree records the pair.
async function runObligation(root, values) {
  if (!PAIR_OBLIGATIONS.includes(values.obligation)) {
    throw new UsageError(`run proves ${PAIR_OBLIGATIONS.join(" or ")}; the declared checks run with ospec check`);
  }
  if (!values.change) throw new UsageError("run needs --change <id>");
  if (!values.command) throw new UsageError("run needs --command <cmd>");
  const current = await openChange(root, values.change);
  if (isIntentAmbiguous(current)) throw new IddRecordError("ambiguous-intent-open", "nothing runs while the intent is ambiguous");
  const target = current.obligations.find((entry) => entry.id === values.obligation);
  if (!target) throw new IddRecordError("unknown-obligation", `change ${current.change} has no obligation ${values.obligation}; derive its signals with ospec signals`);
  if (target.status === "withdrawn") throw new IddRecordError("obligation-withdrawn", `obligation ${values.obligation} is withdrawn`);

  const context = readProjectContext(root);
  const tree = readTreeFingerprint(root);
  const result = runCommand(values.command, { cwd: root });
  const recordedAt = new Date().toISOString();
  const extra = values.unit ? { unit: values.unit } : {};

  let runId;
  let evidence;
  const { state } = await mutateChange(
    root,
    values.change,
    existing((stored) => {
      const recorded = recordRuns(stored, [runRecord(values.obligation, values.command, result, tree, recordedAt, extra)]);
      [runId] = recorded.ids;
      const settled = settlePair(recorded.state, { obligation: values.obligation, runId, recordedAt });
      evidence = settled.evidence;
      return { state: settled.state, changed: true };
    }),
  );
  const verdict = checkVerdict(state, { checks: context.checks });
  return { change: state.change, run: { id: runId, ...extra, ...result }, evidence, ...verdict, next: nextForChange(state) };
}

async function run(command, positionals, values) {
  const root = values.root || process.cwd();
  if (command === "status") {
    const states = await listChanges(root);
    return statusOf(values.change ? states.filter((s) => s.change === values.change) : states);
  }
  if (command === "next") {
    try {
      return nextForProject(await listChanges(root), { change: values.change });
    } catch (error) {
      if (/^unknown change/.test(error.message)) throw new IddRecordError("unknown-change", error.message);
      throw error;
    }
  }
  if (command === "signals") return signals(root, values);
  if (command === "check") return check(root, values);
  if (command === "run") return runObligation(root, values);
  if (command === "record") {
    const [type] = positionals;
    const reducer = reducerFor(type, values, root);
    if (!values.change) throw new UsageError(`record ${type} needs --change <id>`);
    const { state, changed } = await mutateChange(root, values.change, reducer);
    return { record: type, change: state.change, changed, next: nextForChange(state) };
  }
  throw new UsageError(`unknown command: ${command ?? "(none)"}`);
}

function describeNext(result) {
  const step = result.next_step;
  const lines = [];
  if (result.change) lines.push(`change: ${result.change} (${result.status})`);
  switch (step.action) {
    case "satisfy-obligation":
      lines.push(`next: satisfy ${step.obligation} with ${step.evidence} evidence`);
      break;
    case "resolve-gate":
      lines.push(`next: resolve gate ${step.gate}`);
      break;
    case "choose-change":
      lines.push(`next: choose a change with --change (${step.changes.join(", ")})`);
      break;
    case "open-change":
      lines.push("next: open a change with ospec record intent");
      break;
    default:
      lines.push(`next: ${step.action}`);
  }
  if (result.pending_obligations?.length) {
    lines.push(`pending: ${result.pending_obligations.map((o) => o.id).join(", ")}`);
  }
  if (result.pending_decision) {
    const { gate, question, reason } = result.pending_decision;
    lines.push(`decision: ${gate}: ${question}${reason ? ` (${reason})` : ""}`);
  }
  if (result.knowledge_refs?.length) lines.push(`refs: ${result.knowledge_refs.join(", ")}`);
  return lines.join("\n");
}

function describeSignals(result) {
  const lines = result.signals.map((s) => `${s.id} (${s.source}): ${s.reason}`);
  for (const gate of result.gates) lines.push(`gate ${gate.id}: ${gate.reason}`);
  const added = [...result.added.signals, ...result.added.gates.map((g) => `gate:${g}`)];
  lines.push(added.length ? `recorded: ${added.join(", ")}` : "no change: every derived signal was already recorded");
  if (result.floor) lines.push(`floor: ${result.floor}`);
  lines.push(describeNext(result.next));
  return lines.join("\n");
}

function describeVerdict(result) {
  const lines = [];
  if (result.verdict === "ready") lines.push(`ready: ${result.change} can close`);
  for (const entry of result.missing) lines.push(`missing ${entry.obligation}: ${entry.reason}`);
  if (result.decision) {
    const { gate, question, reason } = result.decision;
    lines.push(`needs your decision: ${gate}: ${question}${reason ? ` (${reason})` : ""}`);
  }
  return lines;
}

function describeRun(label, run) {
  const lines = [`${label}: exit ${run.exit_code}`];
  if (run.exit_code !== 0) for (const line of run.output_tail) lines.push(`  ${line}`);
  return lines;
}

function describeCheck(result) {
  const lines = describeVerdict(result);
  for (const run of result.checks) lines.push(...describeRun(`check ${run.name}`, run));
  const added = [...result.added.signals, ...result.added.gates.map((g) => `gate:${g}`)];
  if (added.length) lines.push(`recorded from the diff: ${added.join(", ")}`);
  lines.push(describeNext(result.next));
  return lines.join("\n");
}

function describeRunResult(result) {
  const lines = describeRun(`${result.run.id}`, result.run);
  lines.push(result.evidence ? `recorded ${result.evidence}: red → green pair` : "no red → green pair yet");
  lines.push(...describeVerdict(result), describeNext(result.next));
  return lines.join("\n");
}

function describe(command, result) {
  if (command === "next") return describeNext(result);
  if (command === "signals") return describeSignals(result);
  if (command === "check") return describeCheck(result);
  if (command === "run") return describeRunResult(result);
  if (command === "status") {
    if (result.changes.length === 0) return "No IDD changes.";
    return result.changes
      .map((c) => {
        const pending = c.obligations.pending.join(", ") || "-";
        const gates = c.open_gates.join(", ") || "-";
        return `${c.change}  ${c.status}  ${c.kind ?? "ambiguous"}  pending: ${pending}  gates: ${gates}`;
      })
      .join("\n");
  }
  const head = result.changed
    ? `recorded ${result.record} on ${result.change}`
    : `no change: ${result.record} already recorded on ${result.change}`;
  return `${head}\n${describeNext(result.next)}`;
}

async function main(argv = process.argv.slice(2)) {
  const wantsJson = argv.includes("--json");
  let command;
  try {
    const { values, positionals } = parseArgs({ args: argv, options: OPTIONS, allowPositionals: true, strict: true });
    if (values.help) {
      process.stdout.write(USAGE);
      return 0;
    }
    command = positionals[0];
    const result = await run(command, positionals.slice(1), values);
    if (wantsJson) process.stdout.write(`${JSON.stringify({ ok: true, command, ...result }, null, 2)}\n`);
    else process.stdout.write(`${describe(command, result)}\n`);
    return 0;
  } catch (error) {
    const usage = error instanceof UsageError || error.code?.startsWith?.("ERR_PARSE_ARGS");
    const known =
      usage ||
      error instanceof IddRecordError ||
      error instanceof IddStoreError ||
      error instanceof IddConfigError ||
      error instanceof IddImpactError ||
      error instanceof IddWorkspaceError;
    if (!known) throw error;
    const code = usage ? "usage" : error.code;
    if (wantsJson) {
      process.stdout.write(`${JSON.stringify({ ok: false, command, error: { code, message: error.message } }, null, 2)}\n`);
    } else {
      process.stderr.write(`ospec: ${error.message} (${code})\n${usage ? USAGE : ""}`);
    }
    return usage ? 2 : 1;
  }
}

if (require.main === module) {
  main().then(
    (code) => {
      process.exitCode = code;
    },
    (error) => {
      process.stderr.write(`ospec: ${error.stack || error.message}\n`);
      process.exitCode = 1;
    },
  );
}

module.exports = { main };
