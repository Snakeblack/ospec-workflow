#!/usr/bin/env node
"use strict";

// `ospec` CLI core for IDD changes (openspec/specs/idd/spec.md, REQ-idd-011):
// status, next and record over idd/<change-id>/state.yaml, plus signals, which
// derives impact signals from the declaration and the diff (REQ-idd-012), and
// check and run, which execute the declared checks and test commands and
// record what they observed (REQ-idd-014). `record` never takes evidence: the
// CLI records it only from executions it observes (REQ-idd-007). `doctor`
// diagnoses the installation and the project without writing (REQ-idd-019).
//
// Exit codes: 0 ok, 1 refused by the IDD contract (or doctor found an error),
// 2 usage error.

const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const { parseArgs } = require("node:util");

const {
  RUN_OBLIGATIONS,
  checkVerdict,
  recordRuns,
  settleChecks,
  settleContract,
  settleMigration,
  settlePair,
  settleTreeBound,
} = require("./lib/idd-check.js");
const { classifyContractPaths } = require("./lib/idd-contracts.js");
const { archiveChange, closeChange, livingDocStatus, renderEvidence } = require("./lib/idd-close.js");
const { IddConfigError } = require("./lib/idd-config.js");
const { ARCHIVE_ROOT, LIVING_DOC_FILE, STATE_FILE, isIntentAmbiguous } = require("./lib/idd-contract.js");
const { runCommand } = require("./lib/idd-exec.js");
const { nextForChange, nextForProject, statusOf } = require("./lib/idd-next.js");
const { IddRecordError, recordGate, recordIntent, recordRetract, recordSignal, recordWithdraw } = require("./lib/idd-record.js");
const {
  buildCandidate,
  candidateDiffHash,
  correctTrustReview,
  currentReview,
  recordTrustFindings,
  settleReviewFreshness,
  startTrustReview,
  validateTrustCorrection,
} = require("./lib/idd-review.js");
const { IddImpactError, matchImpact } = require("./lib/idd-impact.js");
const { DoctorUsageError, renderDoctor, runDoctor } = require("./lib/ospec-doctor.js");
const { applyDerivation, deriveSignals } = require("./lib/idd-signals.js");
const { IddStoreError, changeDir, listChanges, mutateChange, readChange } = require("./lib/idd-store.js");
const { withFileLock } = require("./lib/ospec-state.js");
const {
  IddWorkspaceError,
  commitTree,
  readCheckTreeFingerprint,
  readGitDiff,
  readHead,
  readProjectContext,
  readTreeFingerprint,
  snapshotTree,
  treeBlobs,
  treeNumstat,
} = require("./lib/idd-workspace.js");

const USAGE = `Usage:
  ospec status [--change <id>] [--json]
  ospec next [--change <id>] [--json]
  ospec record intent --change <id> --kind <bug|feature|refactor|docs> --summary <text> --acceptance <text>
                      (--open-fact <question>... | --no-open-facts --basis <text>)
                      [--request <text>] [--answer <text> --source <text>]
  ospec record intent --change <id> --ambiguous --request <text>
  ospec record signal --change <id> --signal <id> --reason <text> [--source declaration|diff]
  ospec record gate --change <id> --gate <id> (--open [--reason <text>] | --resolve --answer <text> --source <text>)
  ospec record withdraw --change <id> --obligation <id> --reason <text>
  ospec record retract --change <id> --signal <id> --reason <text>
  ospec signals --change <id> [--path <file>]... [--work-units <n>] [--decision]
                [--operation <op>]... [--diff] [--base <ref>]
  ospec check --change <id> [--base <ref>]
  ospec run --change <id> --obligation <repro-test|tdd-red-green|migration-compat-and-test> --command <cmd>
            [--unit <name>] [--plan <compatibility or rollback plan>]
  ospec review start|correct --change <id> [--base <ref>]
  ospec review record|validate --change <id> --result <json>|@<file>
  ospec close --change <id>
  ospec doctor [--target <host>] [--json]

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
  "open-fact": { type: "string", multiple: true },
  "no-open-facts": { type: "boolean" },
  basis: { type: "string" },
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
  plan: { type: "string" },
  result: { type: "string" },
  root: { type: "string" },
  target: { type: "string" },
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
          openFacts: values["open-fact"],
          noOpenFacts: values["no-open-facts"],
          basis: values.basis,
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
    case "retract":
      if (!values.signal) throw new UsageError("record retract needs --signal <id>");
      return existing((state) => recordRetract(state, { id: values.signal, reason: values.reason, confirmedBy: diffConfirmation(root, state, values.signal) }));
    default:
      throw new UsageError(`unknown record type: ${type ?? "(none)"}; expected intent, signal, gate, withdraw or retract`);
  }
}

// The reason the current diff derives a signal, or null (E1.11). Only the diff
// confirms a declared signal, so a retraction reads it against the change's base
// and needs git, as `ospec check` does.
function diffConfirmation(root, state, signalId) {
  if (state.status !== "open" || !state.signals.some((signal) => signal.id === signalId && signal.source === "declaration")) return null;
  const context = readProjectContext(root);
  const diff = readGitDiff(root, { base: diffBase({}, state) });
  const { signals: derived } = deriveSignals({ intent: state.intent, diff, patterns: context.patterns });
  return derived.find((signal) => signal.id === signalId && signal.source === "diff")?.reason ?? null;
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

// A call that names paths, work units, a decision or an operation declares the
// plan; one that only reads the diff does not (E1.11).
function declaresPlan(values) {
  return Boolean(values.path?.length || values["work-units"] !== undefined || values.decision || values.operation?.length);
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
      return applyDerivation(current, derivation, { plan: declaresPlan(values) ? declaration : null });
    }),
  );
  const { signals: derived, gates, floor } = derivation;
  return { change: state.change, changed, added, signals: derived, gates, floor, next: nextForChange(state, context) };
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
  const checkTreeBefore = readCheckTreeFingerprint(root, context.checks);
  const checks = context.checks.map(({ name, command }) => ({ name, command, ...runCommand(command, { cwd: root }) }));
  const tree = readTreeFingerprint(root);
  const checkTree = readCheckTreeFingerprint(root);
  const recordedAt = new Date().toISOString();
  const contractPaths = classifyContractPaths(diff.paths, context.contractPatterns);
  const reasons = {};
  const reviewed = currentReview(current);
  let reviewedChanged = false;
  if (reviewed) {
    const trees = reviewTrees(root, values, current);
    reviewedChanged = reviewedPathsChanged(root, reviewed, trees.tree, trees.numstat, context.patterns);
  }

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
      const runs = checks.map((result) => runRecord("checks", result.command, result, checkTreeBefore, recordedAt, { name: result.name }));
      const recorded = recordRuns(derived.state, runs);
      const settled = settleChecks(recorded.state, { tree: checkTree, runIds: recorded.ids, recordedAt });
      const bound = settleTreeBound(settled.state, { tree });
      const contract = settleContract(bound, { tree: checkTree, checkEvidence: settled.evidence, ...contractPaths, recordedAt });
      if (contract.reason) reasons["contract-spec-and-test"] = contract.reason;
      const fresh = settleReviewFreshness(contract.state, { reviewedChanged });
      return { state: fresh, changed: changedFrom(stored, fresh) };
    }),
  );
  const verdict = checkVerdict(state, {
    checks: context.checks,
    candidateCommand: context.candidateCommand,
    results: checks,
    treeChanged: tree !== treeBefore || checkTree !== checkTreeBefore,
    reasons,
    livingDoc: readLivingDoc(root, state),
  });
  return { change: state.change, changed, added, checks, tree: checkTree, ...verdict, next: nextForChange(state, context) };
}

// Runs one test command for an obligation `ospec run` proves and records the
// run: a passing run after a failing one on another tree records a red → green
// pair, and a passing migration test records its evidence with the plan.
async function runObligation(root, values) {
  const purpose = RUN_OBLIGATIONS[values.obligation];
  if (!purpose) {
    throw new UsageError(`run proves ${Object.keys(RUN_OBLIGATIONS).join(", ")}; the declared checks run with ospec check`);
  }
  const migration = values.obligation === "migration-compat-and-test";
  if (!values.change) throw new UsageError("run needs --change <id>");
  if (!values.command) throw new UsageError("run needs --command <cmd>");
  if (migration && !values.plan?.trim()) throw new UsageError("a migration test run needs --plan <compatibility or rollback plan>");
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
      const recorded = recordRuns(stored, [runRecord(purpose, values.command, result, tree, recordedAt, extra)]);
      [runId] = recorded.ids;
      const settled = migration
        ? settleMigration(recorded.state, { runId, plan: values.plan.trim(), recordedAt })
        : settlePair(recorded.state, { obligation: values.obligation, runId, recordedAt });
      evidence = settled.evidence;
      return { state: settled.state, changed: true };
    }),
  );
  const verdict = checkVerdict(state, { ...context, livingDoc: readLivingDoc(root, state) });
  return { change: state.change, run: { id: runId, ...extra, ...result }, evidence, ...verdict, next: nextForChange(state, context) };
}

// --- close (REQ-idd-009, REQ-idd-017) ---------------------------------------

function livingDocFile(root, changeId) {
  return path.join(changeDir(root, changeId), LIVING_DOC_FILE);
}

function readLivingDoc(root, state) {
  if (!state.obligations.some((entry) => entry.id === "living-doc" && entry.status !== "withdrawn")) return null;
  try {
    return livingDocStatus(fs.readFileSync(livingDocFile(root, state.change), "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return livingDocStatus(null);
    throw error;
  }
}

function writeEvidenceSection(root, state) {
  const file = livingDocFile(root, state.change);
  if (!fs.existsSync(file)) return;
  const text = fs.readFileSync(file, "utf8");
  const rendered = renderEvidence(text, state);
  if (rendered !== text) fs.writeFileSync(file, rendered);
}

// The evidence that checks-pass holds must come from the tree being closed:
// the last check also settled every other tree-bound obligation on it.
function requireFreshChecks(root, state) {
  const checks = state.obligations.find((entry) => entry.id === "checks-pass");
  if (checks?.status !== "satisfied") return;
  const evidence = state.evidence.find((entry) => entry.id === checks.evidence.at(-1));
  if (evidence?.detail?.tree !== readCheckTreeFingerprint(root)) {
    throw new IddRecordError("evidence-stale", "the tree changed after the last ospec check: run ospec check before closing");
  }
}

async function findArchived(root, changeId) {
  const archive = path.join(root, ...ARCHIVE_ROOT.split("/"));
  let names = [];
  try {
    names = await fsp.readdir(archive);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const name = names.filter((entry) => entry.endsWith(`-${changeId}`) && /^\d{4}-\d{2}-\d{2}-/.test(entry)).sort().at(-1);
  if (!name) return null;
  const state = JSON.parse(await fsp.readFile(path.join(archive, name, STATE_FILE), "utf8"));
  return state.change === changeId && state.status === "closed" ? state : null;
}

async function close(root, values) {
  if (!values.change) throw new UsageError("close needs --change <id>");
  changeDir(root, values.change);
  await fsp.mkdir(path.join(root, ...ARCHIVE_ROOT.split("/")), { recursive: true });
  const lockTarget = path.join(root, ...ARCHIVE_ROOT.split("/"), `${values.change}.close`);
  return withFileLock(lockTarget, async () => {
    let state = await readChange(root, values.change);
    if (!state) {
      const archived = await findArchived(root, values.change);
      if (!archived) throw new IddRecordError("unknown-change", "no such change; open it with record intent first");
      state = archived;
    } else if (state.status === "open") {
      requireFreshChecks(root, state);
      const livingDoc = readLivingDoc(root, state);
      const closedAt = new Date().toISOString();
      ({ state } = await mutateChange(root, values.change, existing((stored) => ({ ...closeChange(stored, { closedAt, livingDoc }), changed: true }))));
    }
    if (await fsp.stat(changeDir(root, state.change)).then(() => true, () => false)) writeEvidenceSection(root, state);
    const archive = await archiveChange(root, state);
    return { change: state.change, status: state.status, closed_at: state.closed_at, archive };
  });
}

// --- trust review on the bounded review lineage (REQ-idd-016) --------------

function readResult(raw) {
  if (!raw) throw new UsageError("review record and review validate need --result <json> or --result @<file>");
  let text = raw;
  if (raw.startsWith("@")) {
    try {
      text = fs.readFileSync(raw.slice(1), "utf8");
    } catch (error) {
      throw new UsageError(`cannot read ${raw.slice(1)}: ${error.message}`);
    }
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new UsageError(`--result is not JSON: ${error.message}`);
  }
}

// Whether the reviewed paths, or any security-boundary path the diff now
// touches, differ from the last reviewed candidate.
function reviewedPathsChanged(root, lineage, tree, numstat, patterns) {
  if (!lineage) return true;
  const paths = new Set(lineage.genesis.paths);
  for (const { path: file } of numstat) {
    if (matchImpact(file, patterns).some((hit) => hit.signal === "security-boundary")) paths.add(file);
  }
  const reviewed = treeBlobs(root, lineage.current_candidate.candidate_tree);
  const current = treeBlobs(root, tree);
  return [...paths].some((file) => reviewed.get(file) !== current.get(file));
}

function reviewTrees(root, values, state) {
  const baseTree = commitTree(root, values.base || state.base || readHead(root));
  const tree = snapshotTree(root);
  return { baseTree, tree, numstat: treeNumstat(root, baseTree, tree) };
}

async function review(root, positionals, values) {
  const [action] = positionals;
  if (!["start", "record", "correct", "validate"].includes(action)) {
    throw new UsageError(`unknown review action: ${action ?? "(none)"}; expected start, record, correct or validate`);
  }
  if (!values.change) throw new UsageError(`review ${action} needs --change <id>`);
  const result = action === "record" || action === "validate" ? readResult(values.result) : null;
  const current = await openChange(root, values.change);
  if (isIntentAmbiguous(current)) throw new IddRecordError("ambiguous-intent-open", "no review runs while the intent is ambiguous");
  const recordedAt = new Date().toISOString();
  const context = action === "start" || action === "correct" ? readProjectContext(root) : null;
  const trees = context ? reviewTrees(root, values, current) : null;

  let outcome;
  const { state } = await mutateChange(
    root,
    values.change,
    existing((stored) => {
      const lineage = currentReview(stored);
      if (action === "start") {
        const { baseTree, tree, numstat } = trees;
        const candidate = buildCandidate({
          baseTree,
          candidateTree: tree,
          numstat,
          baseBlobs: treeBlobs(root, baseTree),
          candidateBlobs: treeBlobs(root, tree),
        });
        const reviewedChanged = reviewedPathsChanged(root, lineage, tree, numstat, context.patterns);
        outcome = startTrustReview(stored, { candidate, reviewedChanged });
      } else if (action === "record") {
        outcome = recordTrustFindings(stored, { result, recordedAt });
      } else if (action === "correct") {
        if (!lineage) throw new IddRecordError("review-refused", "no trust review to correct: run ospec review start");
        const { tree } = trees;
        const changes = treeNumstat(root, lineage.current_candidate.candidate_tree, tree);
        const diffHash = candidateDiffHash(lineage.genesis.paths, treeBlobs(root, lineage.genesis.candidate.base_tree), treeBlobs(root, tree));
        outcome = correctTrustReview(stored, { changes, candidateTree: tree, diffHash });
      } else {
        outcome = validateTrustCorrection(stored, { result, recordedAt });
      }
      return { state: outcome.state, changed: outcome.changed !== false };
    }),
  );
  const lineage = currentReview(state);
  const summary = { lineage_id: lineage.lineage_id, generation: lineage.generation, status: lineage.status };
  if (outcome.request) summary.request = outcome.request;
  if (outcome.finding_ids) summary.validate = { validator: outcome.validator, finding_ids: outcome.finding_ids };
  if (lineage.findings.length) summary.findings = lineage.findings.map(({ id, severity, summary: text, blocking }) => ({ id, severity, summary: text, blocking }));
  return {
    change: state.change,
    action,
    review: summary,
    evidence: outcome.evidence ?? null,
    ...checkVerdict(state, { checks: (context || readProjectContext(root)).checks, livingDoc: readLivingDoc(root, state) }),
    next: nextForChange(state),
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
      const states = await listChanges(root);
      const next = nextForProject(states, { change: values.change });
      // Intent gates and change selection do not depend on configuration.
      if (next.next_step.action !== "satisfy-obligation" || !["checks-pass", "contract-spec-and-test"].includes(next.next_step.obligation)) return next;
      return nextForProject(states, { change: values.change, ...readProjectContext(root) });
    } catch (error) {
      if (/^unknown change/.test(error.message)) throw new IddRecordError("unknown-change", error.message);
      throw error;
    }
  }
  if (command === "signals") return signals(root, values);
  if (command === "check") return check(root, values);
  if (command === "run") return runObligation(root, values);
  if (command === "review") return review(root, positionals, values);
  if (command === "close") return close(root, values);
  if (command === "doctor") return runDoctor({ root, target: values.target ?? null });
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
    case "configure-checks":
      lines.push(`next: ${step.how}`);
      break;
    case "declare-plan":
      lines.push(`next: declare the plan: ${step.how}`);
      break;
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
    const { gate, question, reason, questions = [] } = result.pending_decision;
    lines.push(`decision: ${gate}: ${question}${reason ? ` (${reason})` : ""}`);
    for (const entry of questions) lines.push(`  - ${entry}`);
  }
  if (result.knowledge_refs?.length) lines.push(`refs: ${result.knowledge_refs.join(", ")}`);
  return lines.join("\n");
}

function describeSignals(result) {
  const lines = result.signals.map((s) => `${s.id} (${s.source}): ${s.reason}`);
  for (const gate of result.gates) lines.push(`gate ${gate.id}: ${gate.reason}`);
  const added = [...result.added.signals, ...result.added.gates.map((g) => `gate:${g}`)];
  if (added.length) lines.push(`recorded: ${added.join(", ")}`);
  else if (result.changed) lines.push("recorded the plan; every derived signal was already recorded");
  else lines.push("no change: the plan and every derived signal were already recorded");
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
  lines.push(result.evidence ? `recorded evidence ${result.evidence}` : "no evidence recorded by this run");
  lines.push(...describeVerdict(result), describeNext(result.next));
  return lines.join("\n");
}

function describeReview(result) {
  const { review } = result;
  const lines = [`review ${review.generation} (${review.status}) of ${result.change}`];
  if (review.request) {
    lines.push(`dispatch ${review.request.reviewer} (lens ${review.request.lens}) on: ${review.request.paths.join(", ")}`);
    lines.push(`then: ospec review record --change ${result.change} --result '{"findings":[...]}'`);
  }
  if (review.validate) {
    lines.push(`dispatch ${review.validate.validator} for: ${review.validate.finding_ids.join(", ")}`);
    lines.push(`then: ospec review validate --change ${result.change} --result '{"outcomes":[...],"regression":{...}}'`);
  }
  for (const finding of review.findings || []) lines.push(`${finding.id} ${finding.severity}: ${finding.summary}`);
  if (result.evidence) lines.push(`recorded evidence ${result.evidence}`);
  lines.push(...describeVerdict(result), describeNext(result.next));
  return lines.join("\n");
}

function describeClose(result) {
  const { archive } = result;
  const how = archive.already_complete ? "already archived in" : "closed and archived in";
  return `${result.change} ${how} ${archive.destination} (${archive.files} files, ${archive.inventory_sha256})`;
}

function describe(command, result) {
  if (command === "next") return describeNext(result);
  if (command === "close") return describeClose(result);
  if (command === "doctor") return renderDoctor(result);
  if (command === "review") return describeReview(result);
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
    return command === "doctor" ? result.exit_code : 0;
  } catch (error) {
    const usage = error instanceof UsageError || error instanceof DoctorUsageError || error.code?.startsWith?.("ERR_PARSE_ARGS");
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
