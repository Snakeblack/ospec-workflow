"use strict";

// Machine-readable IDD contract (openspec/specs/idd/spec.md, REQ-idd-001..010).
// The catalog, state schema and layout here are the single source the ospec
// CLI (E1.2–E1.4) consumes; idd-contract.test.js keeps them in parity with the
// spec. Pure data and validators: no filesystem access.

const MODES = Object.freeze(["idd", "sdd"]);
// Until E1.6 makes IDD the default entry (REQ-idd-001).
const DEFAULT_MODE = "sdd";

const CHANGE_ROOT = "idd";
const ARCHIVE_ROOT = "idd/archive";
const STATE_FILE = "state.yaml";
const CHANGE_ID_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const LIVING_DOC_FILE = "change.md";
const LIVING_DOC_SECTIONS = Object.freeze(["Intent and acceptance", "Plan", "Decisions", "Evidence"]);
const EVIDENCE_MARKERS = Object.freeze({
  start: "<!-- ospec:evidence:start -->",
  end: "<!-- ospec:evidence:end -->",
});

const STATE_SCHEMA = "idd-state/v1";
const STATE_FIELDS = Object.freeze([
  "schema",
  "change",
  "mode",
  "status",
  "intent",
  "signals",
  "obligations",
  "gates",
  "evidence",
  "base",
  "runs",
]);
const CHANGE_STATUSES = Object.freeze(["open", "closed"]);
const INTENT_KINDS = Object.freeze(["bug", "feature", "refactor", "docs"]);
const SIGNAL_SOURCES = Object.freeze(["declaration", "diff"]);
const OBLIGATION_STATUSES = Object.freeze(["pending", "satisfied", "withdrawn"]);
const GATE_STATUSES = Object.freeze(["open", "resolved"]);
// What a CLI-observed run was for (REQ-idd-014): the declared checks, or the
// test command of a red → green pair.
const RUN_PURPOSES = Object.freeze(["checks", "repro-test", "tdd-red-green", "migration-test"]);
// Evidence kinds proven by CLI-observed runs, and the run purpose behind each.
const RUN_EVIDENCE = Object.freeze({
  "check-run": "checks",
  "repro-run-pair": "repro-test",
  "tdd-red-green": "tdd-red-green",
  "migration-test": "migration-test",
});
const SHA256 = /^sha256:[0-9a-f]{64}$/;

// Signal → obligation, in the spec's table order (REQ-idd-005).
const SIGNALS = Object.freeze(
  [
    { id: "always", obligation: "checks-pass" },
    { id: "strict-tdd", obligation: "tdd-red-green" },
    { id: "bug-fix", obligation: "repro-test" },
    { id: "multi-unit-or-decision", obligation: "living-doc" },
    { id: "public-contract", obligation: "contract-spec-and-test" },
    { id: "persistent-data", obligation: "migration-compat-and-test" },
    { id: "security-boundary", obligation: "trust-review" },
    { id: "adr-or-quality-attribute", obligation: "adr-impact-declaration", availableFrom: "E3.1" },
  ].map(Object.freeze),
);

const OBLIGATIONS = Object.freeze(
  [
    { id: "checks-pass", evidence: "check-run" },
    { id: "tdd-red-green", evidence: "tdd-red-green" },
    { id: "repro-test", evidence: "repro-run-pair" },
    { id: "living-doc", evidence: "living-doc-current" },
    { id: "contract-spec-and-test", evidence: "contract-spec-and-test" },
    { id: "migration-compat-and-test", evidence: "migration-test" },
    { id: "trust-review", evidence: "frozen-review" },
    { id: "adr-impact-declaration", evidence: "adr-impact-declaration" },
  ].map(Object.freeze),
);

const EVIDENCE_KINDS = Object.freeze(OBLIGATIONS.map((obligation) => obligation.evidence));

const GATES = Object.freeze(["ambiguous-intent", "adr-amend-or-contradict", "irreversible-operation"]);

const SIGNAL_BY_ID = new Map(SIGNALS.map((signal) => [signal.id, signal]));
const OBLIGATION_BY_ID = new Map(OBLIGATIONS.map((obligation) => [obligation.id, obligation]));

function resolveMode({ changeMode, projectMode } = {}) {
  for (const mode of [changeMode, projectMode]) {
    if (mode == null) continue;
    if (!MODES.includes(mode)) throw new Error(`unknown mode: ${mode}`);
    return mode;
  }
  return DEFAULT_MODE;
}

function deriveObligations(signalIds) {
  const obligations = new Set();
  for (const id of signalIds) {
    const signal = SIGNAL_BY_ID.get(id);
    if (!signal) throw new Error(`unknown signal: ${id}`);
    if (signal.availableFrom) throw new Error(`signal ${id} is not available until ${signal.availableFrom}`);
    obligations.add(signal.obligation);
  }
  return [...obligations].sort();
}

function validateState(state) {
  const errors = [];
  const fail = (message) => errors.push(message);

  if (state == null || typeof state !== "object") {
    return { ok: false, errors: ["state must be an object"] };
  }
  for (const key of Object.keys(state)) {
    if (!STATE_FIELDS.includes(key)) fail(`unknown field: ${key}`);
  }
  if (state.schema !== STATE_SCHEMA) fail(`schema must be ${STATE_SCHEMA}`);
  if (typeof state.change !== "string" || !CHANGE_ID_PATTERN.test(state.change)) {
    fail("change must be a kebab-case id");
  }
  if (state.mode !== "idd") fail("mode must be idd");
  if (!CHANGE_STATUSES.includes(state.status)) fail(`status must be one of ${CHANGE_STATUSES.join(", ")}`);

  for (const key of ["signals", "obligations", "gates", "evidence"]) {
    if (!Array.isArray(state[key])) fail(`${key} must be a list`);
  }
  if ("runs" in state && !Array.isArray(state.runs)) fail("runs must be a list");
  if (state.base != null && typeof state.base !== "string") fail("base must be a commit id");
  if (errors.length > 0) return { ok: false, errors };

  // While ambiguous-intent is open the intent stays unresolved, keeps the
  // original request and nothing is derived from it (REQ-idd-003, REQ-idd-008).
  const intent = state.intent || {};
  if (isIntentAmbiguous(state)) {
    if (typeof intent.request !== "string" || intent.request === "") fail("intent.request is required while the intent is ambiguous");
    for (const key of ["kind", "summary", "acceptance"]) {
      if (intent[key] != null) fail(`intent.${key} must stay null while the intent is ambiguous`);
    }
    if (state.signals.length > 0) fail("no signal may be active while the intent is ambiguous");
    if (state.obligations.length > 0) fail("no obligation may exist while the intent is ambiguous");
  } else {
    if (!INTENT_KINDS.includes(intent.kind)) fail(`intent.kind must be one of ${INTENT_KINDS.join(", ")}`);
    for (const key of ["summary", "acceptance"]) {
      if (typeof intent[key] !== "string" || intent[key] === "") fail(`intent.${key} is required`);
    }
  }
  if (intent.request != null && typeof intent.request !== "string") fail("intent.request must be text");

  for (const signal of state.signals) {
    if (!SIGNAL_BY_ID.has(signal.id)) fail(`unknown signal: ${signal.id}`);
    if (typeof signal.reason !== "string" || signal.reason === "") fail(`signal ${signal.id} needs a reason`);
    if (!SIGNAL_SOURCES.includes(signal.source)) fail(`signal ${signal.id} source must be declaration or diff`);
  }

  const runs = state.runs || [];
  const runIndex = new Map();
  runs.forEach((run, index) => {
    validateRun(run, fail);
    if (runIndex.has(run.id)) fail(`run ${run.id} is recorded twice`);
    runIndex.set(run.id, index);
  });

  const evidenceById = new Map();
  for (const entry of state.evidence) {
    if (!EVIDENCE_KINDS.includes(entry.kind)) fail(`evidence ${entry.id} has unknown kind ${entry.kind}`);
    if (!OBLIGATION_BY_ID.has(entry.obligation)) fail(`evidence ${entry.id} names unknown obligation`);
    if (typeof entry.recorded_at !== "string") fail(`evidence ${entry.id} needs recorded_at`);
    if (entry.kind in RUN_EVIDENCE) validateRunEvidence(entry, runs, runIndex, fail);
    evidenceById.set(entry.id, entry);
  }
  for (const entry of state.evidence) {
    if (entry.kind === "contract-spec-and-test") validateContractEvidence(entry, evidenceById, fail);
  }

  for (const obligation of state.obligations) {
    const catalog = OBLIGATION_BY_ID.get(obligation.id);
    if (!catalog) {
      fail(`unknown obligation: ${obligation.id}`);
      continue;
    }
    if (SIGNAL_BY_ID.get(obligation.signal)?.obligation !== obligation.id) {
      fail(`obligation ${obligation.id} is not derived by signal ${obligation.signal}`);
    }
    if (!OBLIGATION_STATUSES.includes(obligation.status)) fail(`obligation ${obligation.id} has unknown status`);
    const evidenceIds = Array.isArray(obligation.evidence) ? obligation.evidence : [];
    if (obligation.status === "satisfied") {
      if (evidenceIds.length === 0) fail(`obligation ${obligation.id} is satisfied without recorded evidence`);
      for (const id of evidenceIds) {
        const entry = evidenceById.get(id);
        if (!entry || entry.kind !== catalog.evidence || entry.obligation !== obligation.id) {
          fail(`obligation ${obligation.id} needs ${catalog.evidence} evidence, got ${id}`);
        }
      }
    }
    if (obligation.status === "withdrawn" && !obligation.withdrawn_reason) {
      fail(`obligation ${obligation.id} is withdrawn without a reason`);
    }
  }

  for (const gate of state.gates) {
    if (!GATES.includes(gate.id)) fail(`unknown gate: ${gate.id}`);
    if (!GATE_STATUSES.includes(gate.status)) fail(`gate ${gate.id} has unknown status`);
    if (gate.reason != null && typeof gate.reason !== "string") fail(`gate ${gate.id} reason must be text`);
    if (gate.status === "resolved" && (!gate.answer || !gate.source)) {
      fail(`gate ${gate.id} is resolved without the user's answer and its source`);
    }
  }

  return { ok: errors.length === 0, errors };
}

function validateRun(run, fail) {
  const label = `run ${run?.id}`;
  if (run == null || typeof run !== "object") return fail("a run must be an object");
  if (typeof run.id !== "string" || run.id === "") fail("a run needs an id");
  if (!RUN_PURPOSES.includes(run.purpose)) fail(`${label} has unknown purpose ${run.purpose}`);
  if (typeof run.command !== "string" || run.command === "") fail(`${label} needs a command`);
  if (!Number.isInteger(run.exit_code)) fail(`${label} needs an integer exit_code`);
  if (!SHA256.test(run.output_sha256 || "")) fail(`${label} needs an output_sha256 digest`);
  if (!SHA256.test(run.tree || "")) fail(`${label} needs a tree digest`);
  if (typeof run.recorded_at !== "string") fail(`${label} needs recorded_at`);
  return undefined;
}

// Run-backed evidence must name the runs that prove it (REQ-idd-014): every
// declared check passing on one tree, or a failing run followed by a passing
// run of the same command on a different tree.
function validateRunEvidence(entry, runs, runIndex, fail) {
  const purpose = RUN_EVIDENCE[entry.kind];
  const detail = entry.detail || {};
  const runOf = (id) => (runIndex.has(id) ? runs[runIndex.get(id)] : null);
  if (entry.kind === "check-run") {
    const ids = Array.isArray(detail.runs) ? detail.runs : [];
    if (ids.length === 0 || !SHA256.test(detail.tree || "")) {
      return fail(`evidence ${entry.id} must name its tree and the check runs on it`);
    }
    for (const id of ids) {
      const run = runOf(id);
      if (!run || run.purpose !== purpose || run.exit_code !== 0 || run.tree !== detail.tree) {
        fail(`evidence ${entry.id} names ${id}, which is not a passing check run on its tree`);
      }
    }
    return undefined;
  }
  if (entry.kind === "migration-test") {
    const run = runOf(detail.run);
    const plan = typeof detail.plan === "string" && detail.plan.trim() !== "";
    if (!run || run.purpose !== purpose || run.exit_code !== 0 || run.tree !== detail.tree || !plan) {
      fail(`evidence ${entry.id} needs a passing migration test run on its tree and the declared compatibility or rollback plan`);
    }
    return undefined;
  }
  const red = runOf(detail.red);
  const green = runOf(detail.green);
  const paired =
    red &&
    green &&
    red.purpose === purpose &&
    green.purpose === purpose &&
    red.exit_code !== 0 &&
    green.exit_code === 0 &&
    red.command === green.command &&
    red.tree !== green.tree &&
    runIndex.get(red.id) < runIndex.get(green.id);
  if (!paired) fail(`evidence ${entry.id} needs a failing run followed by a passing run of the same command on another tree`);
  return undefined;
}

// contract-spec-and-test needs a contract document and a test in the diff,
// with every check passing on the same tree (REQ-idd-015).
function validateContractEvidence(entry, evidenceById, fail) {
  const detail = entry.detail || {};
  const check = evidenceById.get(detail.check);
  const listed = (key) => Array.isArray(detail[key]) && detail[key].length > 0;
  if (!check || check.kind !== "check-run" || check.detail?.tree !== detail.tree || !listed("documents") || !listed("tests")) {
    fail(`evidence ${entry.id} needs a contract document, a test and a passing check on its tree`);
  }
}

function isIntentAmbiguous(state) {
  return state.gates.some((gate) => gate.id === "ambiguous-intent" && gate.status === "open");
}

function canWithdraw(state, obligationId) {
  for (const signal of state.signals) {
    if (SIGNAL_BY_ID.get(signal.id)?.obligation === obligationId) {
      return { ok: false, reason: `signal ${signal.id} still derives ${obligationId}` };
    }
  }
  return { ok: true };
}

function canClose(state) {
  const blocking = [
    ...state.obligations.filter((o) => o.status === "pending").map((o) => o.id),
    ...state.gates.filter((g) => g.status === "open").map((g) => `gate:${g.id}`),
  ];
  return { ok: blocking.length === 0, blocking };
}

module.exports = {
  ARCHIVE_ROOT,
  CHANGE_ID_PATTERN,
  CHANGE_ROOT,
  CHANGE_STATUSES,
  DEFAULT_MODE,
  EVIDENCE_KINDS,
  EVIDENCE_MARKERS,
  GATES,
  GATE_STATUSES,
  INTENT_KINDS,
  LIVING_DOC_FILE,
  LIVING_DOC_SECTIONS,
  MODES,
  OBLIGATIONS,
  OBLIGATION_STATUSES,
  RUN_EVIDENCE,
  RUN_PURPOSES,
  SIGNALS,
  SIGNAL_SOURCES,
  STATE_FIELDS,
  STATE_FILE,
  STATE_SCHEMA,
  canClose,
  canWithdraw,
  deriveObligations,
  isIntentAmbiguous,
  resolveMode,
  validateState,
};
