"use strict";

// Machine-readable IDD contract (openspec/specs/idd/spec.md, REQ-idd-001..010).
// The catalog, state schema and layout here are the single source the ospec
// CLI (E1.2–E1.4) consumes; idd-contract.test.js keeps them in parity with the
// spec. Pure data and validators: no filesystem access.

const MODES = Object.freeze(["idd", "sdd"]);
// IDD is the default entry since E1.6 (REQ-idd-001).
const DEFAULT_MODE = "idd";

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
  "facts",
  "plan",
  "signals",
  "retracted",
  "obligations",
  "gates",
  "evidence",
  "base",
  "runs",
  "reviews",
  "closed_at",
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

const GATES = Object.freeze(["ambiguous-intent", "open-facts", "adr-amend-or-contradict", "irreversible-operation"]);

// Signals a declaration of planned paths or work units can overstate, so a
// declared one may be retracted while the diff does not confirm it (E1.11).
// The rest derive from the intent or the project configuration.
const RETRACTABLE_SIGNALS = Object.freeze(["multi-unit-or-decision", "public-contract", "persistent-data", "security-boundary"]);

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
  if ("reviews" in state && !Array.isArray(state.reviews)) fail("reviews must be a list");
  if ("retracted" in state && !Array.isArray(state.retracted)) fail("retracted must be a list");
  if (state.closed_at != null && (state.status !== "closed" || typeof state.closed_at !== "string")) {
    fail("closed_at is the close time of a closed change");
  }
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
  validateFacts(state, fail);
  validatePlan(state.plan, fail);

  for (const signal of state.signals) {
    if (!SIGNAL_BY_ID.has(signal.id)) fail(`unknown signal: ${signal.id}`);
    if (typeof signal.reason !== "string" || signal.reason === "") fail(`signal ${signal.id} needs a reason`);
    if (!SIGNAL_SOURCES.includes(signal.source)) fail(`signal ${signal.id} source must be declaration or diff`);
  }
  for (const entry of state.retracted || []) {
    const isText = (value) => typeof value === "string" && value.trim() !== "";
    if (!RETRACTABLE_SIGNALS.includes(entry?.id)) fail(`retracted signal ${entry?.id} is not retractable`);
    else if (!isText(entry.reason) || entry.source !== "declaration" || !isText(entry.retract_reason)) {
      fail(`retracted signal ${entry.id} needs its declared reason and the reason it was retracted`);
    }
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
  const reviews = state.reviews || [];
  for (const review of reviews) {
    if (review == null || review.schema_version !== 2 || typeof review.lineage_id !== "string" || typeof review.status !== "string") {
      fail("a review must be a schema v2 review lineage with its id and status");
    }
  }
  for (const entry of state.evidence) {
    if (entry.kind === "contract-spec-and-test") validateContractEvidence(entry, evidenceById, fail);
    if (entry.kind === "frozen-review") validateReviewEvidence(entry, reviews, fail);
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

// frozen-review must name an approved review of the candidate it names, with
// the findings it froze (REQ-idd-016).
function validateReviewEvidence(entry, reviews, fail) {
  const detail = entry.detail || {};
  const review = reviews.find((lineage) => lineage?.lineage_id === detail.lineage_id);
  const approved =
    review &&
    review.status === "approved" &&
    review.current_candidate_id === detail.candidate_id &&
    review.findings_digest === detail.findings_digest;
  if (!approved) fail(`evidence ${entry.id} needs an approved trust review of its candidate`);
}

// The open-facts declaration (REQ-idd-018): the behavior questions neither the
// request nor the code settles, or the basis for declaring none. States
// recorded before the declaration existed have no facts and stay valid.
function validateFacts(state, fail) {
  const facts = state.facts;
  const gate = state.gates.find((entry) => entry.id === "open-facts");
  if (facts == null) {
    if (gate) fail("the open-facts gate needs the open facts it asks");
    return;
  }
  const isText = (value) => typeof value === "string" && value.trim() !== "";
  const keys = Object.keys(facts);
  if (keys.length !== 1 || !["open", "basis"].includes(keys[0])) {
    fail("facts must hold either the open questions or the basis for none");
    return;
  }
  if (keys[0] === "open") {
    if (!Array.isArray(facts.open) || facts.open.length === 0 || !facts.open.every(isText)) {
      fail("facts.open must list at least one question");
    }
    if (!gate) fail("open facts need the open-facts gate");
  } else {
    if (!isText(facts.basis)) fail("facts.basis must say why no fact is open");
    if (gate) fail("the open-facts gate needs open facts, not a basis");
  }
}

// The declared plan (E1.11): what `ospec signals` was told the change touches.
// States recorded before the plan existed have none and stay valid.
function validatePlan(plan, fail) {
  if (plan === undefined) return;
  const isTextList = (value) => Array.isArray(value) && value.every((entry) => typeof entry === "string" && entry !== "");
  const valid =
    plan !== null &&
    typeof plan === "object" &&
    isTextList(plan.paths) &&
    Number.isInteger(plan.work_units) &&
    plan.work_units >= 1 &&
    typeof plan.decision === "boolean" &&
    isTextList(plan.operations) &&
    Object.keys(plan).length === 4;
  if (!valid) fail("plan must hold its paths, work_units (at least 1), decision and operations");
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
  RETRACTABLE_SIGNALS,
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
