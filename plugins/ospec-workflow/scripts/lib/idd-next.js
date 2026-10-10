"use strict";

// Pure, deterministic reads of idd-state/v1 and supplied check context for
// `ospec next` and `ospec status` (REQ-idd-011). The same inputs yield the same
// output, whatever order the state's signals were recorded in.

const { CHANGE_ROOT, GATES, LIVING_DOC_FILE, OBLIGATIONS } = require("./idd-contract.js");
const { configureChecksStep } = require("./idd-checks-config.js");

// Order in which pending obligations are worked: evidence produced while
// building comes first, checks run on the finished diff, and the living
// document is confirmed current at close (REQ-idd-004).
const WORK_ORDER = Object.freeze([
  "repro-test",
  "tdd-red-green",
  "contract-spec-and-test",
  "migration-compat-and-test",
  "adr-impact-declaration",
  "trust-review",
  "checks-pass",
  "living-doc",
]);

const GATE_QUESTIONS = Object.freeze({
  "ambiguous-intent": "What must this change achieve? Confirm its kind, summary and acceptance.",
  "open-facts": "Before the change is built, answer these behavior questions that neither the request nor the code settles.",
  "adr-amend-or-contradict": "This change amends or contradicts an ADR. Approve the amendment?",
  "irreversible-operation": "This operation is destructive or irreversible. Approve it?",
});

const EVIDENCE_BY_OBLIGATION = new Map(OBLIGATIONS.map((obligation) => [obligation.id, obligation.evidence]));

// The ospec command that records each obligation's evidence (REQ-idd-014).
const HOW = Object.freeze({
  "checks-pass": (change) => `ospec check --change ${change}`,
  "repro-test": (change) =>
    `ospec run --change ${change} --obligation repro-test --command "<test>": once failing before the fix, again passing after it`,
  "tdd-red-green": (change) =>
    `ospec run --change ${change} --obligation tdd-red-green --command "<test>" [--unit <name>]: failing before the code, passing after it`,
  "contract-spec-and-test": (change) => `update the contract document and its test, then ospec check --change ${change}`,
  "living-doc": (change) => `write the Plan and Decisions of idd/${change}/change.md, then ospec close --change ${change}`,
  "trust-review": (change) =>
    `ospec review start --change ${change}, dispatch review-trust on the returned paths, then ospec review record --change ${change} --result '<findings json>'`,
  "migration-compat-and-test": (change) =>
    `ospec run --change ${change} --obligation migration-compat-and-test --command "<migration test>" --plan "<compatibility or rollback>"`,
});

// The plan is declared once `ospec signals` recorded it, or once the change
// has evidence of its own: a signal the diff derived or a run the CLI observed
// (E1.11). States recorded before the plan existed are judged by the latter.
function planDeclared(state) {
  return state.plan != null || state.signals.some((signal) => signal.source === "diff") || (state.runs || []).length > 0;
}

function declarePlanStep(change) {
  return {
    action: "declare-plan",
    how: `ospec signals --change ${change} --path <file>... [--work-units <n>] [--decision] [--operation <op>]`,
  };
}

function byWorkOrder(left, right) {
  return WORK_ORDER.indexOf(left.id) - WORK_ORDER.indexOf(right.id);
}

function byGateOrder(left, right) {
  return GATES.indexOf(left.id) - GATES.indexOf(right.id);
}

function pendingDecision(state, gate) {
  const reason = gate.id === "ambiguous-intent" ? state.intent.request : gate.reason;
  const decision = { gate: gate.id, question: GATE_QUESTIONS[gate.id] };
  if (reason) decision.reason = reason;
  if (gate.id === "open-facts") decision.questions = state.facts.open;
  return decision;
}

function nextForChange(state, { checks, candidateCommand } = {}) {
  const pending = state.obligations
    .filter((obligation) => obligation.status === "pending")
    .sort(byWorkOrder)
    .map(({ id, signal }) => ({ id, signal, evidence: EVIDENCE_BY_OBLIGATION.get(id) }));
  const openGates = state.gates.filter((gate) => gate.status === "open").sort(byGateOrder);
  const livingDoc = state.obligations.some((o) => o.id === "living-doc" && o.status !== "withdrawn");

  let nextStep;
  if (state.status === "closed") {
    nextStep = { action: "none" };
  } else if (openGates.length > 0) {
    // Every gate is the user's decision, taken before the work it decides
    // (REQ-idd-008, REQ-idd-018), in gate order: ambiguous-intent first.
    nextStep = { action: "resolve-gate", gate: openGates[0].id };
  } else if (!planDeclared(state)) {
    // The plan is declared before anything is edited (E1.11).
    nextStep = declarePlanStep(state.change);
  } else if (pending.length > 0) {
    nextStep = { action: "satisfy-obligation", obligation: pending[0].id, evidence: pending[0].evidence };
    if (HOW[pending[0].id]) nextStep.how = HOW[pending[0].id](state.change);
    if (checks?.length === 0 && ["checks-pass", "contract-spec-and-test"].includes(pending[0].id)) {
      nextStep = configureChecksStep(candidateCommand);
    }
  } else {
    nextStep = { action: "close" };
  }

  return {
    change: state.change,
    status: state.status,
    intent: state.intent,
    pending_obligations: pending,
    pending_decision: state.status === "open" && openGates.length > 0 ? pendingDecision(state, openGates[0]) : null,
    next_step: nextStep,
    knowledge_refs: livingDoc ? [`${CHANGE_ROOT}/${state.change}/${LIVING_DOC_FILE}`] : [],
  };
}

function nextForProject(states, { change, ...context } = {}) {
  if (change) {
    const state = states.find((entry) => entry.change === change);
    if (!state) throw new Error(`unknown change: ${change}`);
    return nextForChange(state, context);
  }
  const open = states.filter((state) => state.status === "open");
  if (open.length === 0) return { change: null, next_step: { action: "open-change" } };
  if (open.length === 1) return nextForChange(open[0], context);
  return {
    change: null,
    next_step: { action: "choose-change", changes: open.map((state) => state.change).sort() },
  };
}

function idsWithStatus(state, status) {
  return state.obligations
    .filter((obligation) => obligation.status === status)
    .sort(byWorkOrder)
    .map((obligation) => obligation.id);
}

function statusOf(states) {
  const changes = [...states]
    .sort((left, right) => (left.change < right.change ? -1 : left.change > right.change ? 1 : 0))
    .map((state) => ({
      change: state.change,
      status: state.status,
      kind: state.intent.kind,
      summary: state.intent.summary,
      obligations: {
        pending: idsWithStatus(state, "pending"),
        satisfied: idsWithStatus(state, "satisfied"),
        withdrawn: idsWithStatus(state, "withdrawn"),
      },
      open_gates: state.gates
        .filter((gate) => gate.status === "open")
        .sort(byGateOrder)
        .map((gate) => gate.id),
    }));
  return { changes };
}

module.exports = {
  GATE_QUESTIONS,
  WORK_ORDER,
  nextForChange,
  planDeclared,
  nextForProject,
  statusOf,
};
