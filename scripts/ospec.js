#!/usr/bin/env node
"use strict";

// `ospec` CLI core for IDD changes (openspec/specs/idd/spec.md, REQ-idd-011):
// status, next and record over idd/<change-id>/state.yaml. Signals, gates and
// withdrawals are recorded here; evidence is not, because the CLI records it
// only from executions it observes (REQ-idd-007, wired in E1.4).
//
// Exit codes: 0 ok, 1 refused by the IDD contract, 2 usage error.

const { parseArgs } = require("node:util");

const { nextForChange, nextForProject, statusOf } = require("./lib/idd-next.js");
const { IddRecordError, recordGate, recordIntent, recordSignal, recordWithdraw } = require("./lib/idd-record.js");
const { IddStoreError, listChanges, mutateChange } = require("./lib/idd-store.js");

const USAGE = `Usage:
  ospec status [--change <id>] [--json]
  ospec next [--change <id>] [--json]
  ospec record intent --change <id> --kind <bug|feature|refactor|docs> --summary <text> --acceptance <text>
                      [--request <text>] [--answer <text> --source <text>]
  ospec record intent --change <id> --ambiguous --request <text>
  ospec record signal --change <id> --signal <id> --reason <text> [--source declaration|diff]
  ospec record gate --change <id> --gate <id> (--open [--reason <text>] | --resolve --answer <text> --source <text>)
  ospec record withdraw --change <id> --obligation <id> --reason <text>

Options:
  --root <dir>  project root (default: current directory)
  --json        machine-readable output
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

function reducerFor(type, values) {
  switch (type) {
    case "intent":
      return (state) =>
        recordIntent(state, {
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
  if (command === "record") {
    const [type] = positionals;
    const reducer = reducerFor(type, values);
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

function describe(command, result) {
  if (command === "next") return describeNext(result);
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
    const known = usage || error instanceof IddRecordError || error instanceof IddStoreError;
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
