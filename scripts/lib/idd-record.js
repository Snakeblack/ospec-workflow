"use strict";

// Pure record reducers for idd-state/v1 (openspec/specs/idd/spec.md,
// REQ-idd-003, 005–008, 011). Each takes the current state (or null when the
// change does not exist yet) and returns { state, changed } without mutating
// its input. Repeating a record is a no-op; rewriting a recorded fact with
// different content is refused with a coded IddRecordError. No filesystem
// access: idd-store.js persists the result.

const {
  CHANGE_ID_PATTERN,
  GATES,
  INTENT_KINDS,
  OBLIGATIONS,
  SIGNALS,
  SIGNAL_SOURCES,
  STATE_SCHEMA,
  canWithdraw,
  isIntentAmbiguous,
} = require("./idd-contract.js");

const SIGNAL_BY_ID = new Map(SIGNALS.map((signal) => [signal.id, signal]));
const OBLIGATION_BY_ID = new Map(OBLIGATIONS.map((obligation) => [obligation.id, obligation]));
const ALWAYS_REASON = "every change with a resolved intent";

class IddRecordError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "IddRecordError";
    this.code = code;
  }
}

function refuse(code, message) {
  throw new IddRecordError(code, message);
}

function unchanged(state) {
  return { state, changed: false };
}

function requireOpen(state) {
  if (state.status === "closed") refuse("change-closed", `change ${state.change} is closed`);
}

function requireText(value, code, message) {
  if (typeof value !== "string" || value.trim() === "") refuse(code, message);
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function addSignal(state, { id, reason, source }) {
  if (state.signals.some((signal) => signal.id === id)) return false;
  const { obligation: obligationId } = SIGNAL_BY_ID.get(id);
  state.signals.push({ id, reason, source });
  const existing = state.obligations.find((obligation) => obligation.id === obligationId);
  if (!existing) {
    state.obligations.push({ id: obligationId, signal: id, status: "pending", evidence: [] });
  } else if (existing.status === "withdrawn") {
    // A returning signal reopens its obligation (REQ-idd-006).
    existing.status = "pending";
    existing.signal = id;
    delete existing.withdrawn_reason;
  }
  return true;
}

function resolvedIntent(input) {
  const intent = {};
  if (input.request != null) intent.request = input.request;
  intent.kind = input.kind;
  intent.summary = input.summary;
  intent.acceptance = input.acceptance;
  return intent;
}

function validateResolvedIntent(input) {
  if (!INTENT_KINDS.includes(input.kind)) {
    refuse("intent-incomplete", `intent kind must be one of ${INTENT_KINDS.join(", ")}`);
  }
  requireText(input.summary, "intent-incomplete", "intent summary is required");
  requireText(input.acceptance, "intent-incomplete", "intent acceptance is required");
}

function recordIntent(state, input = {}) {
  if (state) {
    requireOpen(state);
    if (!isIntentAmbiguous(state)) {
      const { request = state.intent.request, ...rest } = input;
      const candidate = resolvedIntent({ ...rest, request });
      if (input.ambiguous || !sameJson(candidate, state.intent)) {
        refuse("intent-conflict", `change ${state.change} already has a different resolved intent`);
      }
      return unchanged(state);
    }
    if (input.ambiguous) {
      if (input.request != null && input.request !== state.intent.request) {
        refuse("intent-conflict", `change ${state.change} is already open with a different request`);
      }
      return unchanged(state);
    }
    // Resolving the ambiguous intent is the gate's resolution (REQ-idd-008).
    validateResolvedIntent(input);
    if (!input.answer || !input.source) {
      refuse("gate-answer-required", "resolving ambiguous-intent needs the user's answer and its source");
    }
    const next = structuredClone(state);
    next.intent = resolvedIntent({ ...input, request: state.intent.request });
    const gate = next.gates.find((entry) => entry.id === "ambiguous-intent");
    gate.status = "resolved";
    gate.answer = input.answer;
    gate.source = input.source;
    addSignal(next, { id: "always", reason: ALWAYS_REASON, source: "declaration" });
    return { state: next, changed: true };
  }

  if (typeof input.change !== "string" || !CHANGE_ID_PATTERN.test(input.change)) {
    refuse("invalid-change-id", `change id must be kebab-case, got ${JSON.stringify(input.change)}`);
  }
  const next = {
    schema: STATE_SCHEMA,
    change: input.change,
    mode: "idd",
    status: "open",
    intent: null,
    signals: [],
    obligations: [],
    gates: [],
    evidence: [],
  };
  if (input.ambiguous) {
    requireText(input.request, "intent-incomplete", "an ambiguous intent must keep the original request");
    next.intent = { request: input.request, kind: null, summary: null, acceptance: null };
    next.gates.push({ id: "ambiguous-intent", status: "open" });
  } else {
    validateResolvedIntent(input);
    next.intent = resolvedIntent(input);
    addSignal(next, { id: "always", reason: ALWAYS_REASON, source: "declaration" });
  }
  return { state: next, changed: true };
}

function recordSignal(state, { id, reason, source } = {}) {
  requireOpen(state);
  if (isIntentAmbiguous(state)) refuse("ambiguous-intent-open", "no signal is derived while the intent is ambiguous");
  const signal = SIGNAL_BY_ID.get(id);
  if (!signal) refuse("unknown-signal", `unknown signal: ${id}`);
  if (signal.availableFrom) refuse("signal-unavailable", `signal ${id} is not available until ${signal.availableFrom}`);
  requireText(reason, "reason-required", `signal ${id} needs a reason`);
  if (!SIGNAL_SOURCES.includes(source)) refuse("invalid-source", `signal source must be one of ${SIGNAL_SOURCES.join(", ")}`);

  if (state.signals.some((entry) => entry.id === id)) return unchanged(state);
  const next = structuredClone(state);
  addSignal(next, { id, reason, source });
  return { state: next, changed: true };
}

function recordGate(state, { id, action, reason, answer, source } = {}) {
  requireOpen(state);
  if (!GATES.includes(id)) refuse("unknown-gate", `unknown gate: ${id}`);
  if (id === "ambiguous-intent") {
    refuse("gate-managed-by-intent", "ambiguous-intent is opened and resolved through record intent");
  }
  const existing = state.gates.find((gate) => gate.id === id);

  if (action === "open") {
    if (existing) return unchanged(state);
    const next = structuredClone(state);
    const gate = { id, status: "open" };
    if (reason != null) {
      requireText(reason, "reason-required", `gate ${id} reason must be text`);
      gate.reason = reason;
    }
    next.gates.push(gate);
    return { state: next, changed: true };
  }

  if (action === "resolve") {
    if (!answer || !source) refuse("gate-answer-required", `resolving ${id} needs the user's answer and its source`);
    if (!existing) refuse("gate-not-open", `gate ${id} is not open`);
    if (existing.status === "resolved") {
      if (existing.answer === answer && existing.source === source) return unchanged(state);
      refuse("gate-conflict", `gate ${id} is already resolved with a different answer`);
    }
    const next = structuredClone(state);
    const gate = next.gates.find((entry) => entry.id === id);
    gate.status = "resolved";
    gate.answer = answer;
    gate.source = source;
    return { state: next, changed: true };
  }

  return refuse("invalid-action", `gate action must be open or resolve, got ${JSON.stringify(action)}`);
}

function recordWithdraw(state, { obligation: obligationId, reason } = {}) {
  requireOpen(state);
  requireText(reason, "reason-required", `withdrawing ${obligationId} needs a reason`);
  const obligation = state.obligations.find((entry) => entry.id === obligationId);
  if (!obligation) refuse("unknown-obligation", `change ${state.change} has no obligation ${obligationId}`);
  if (obligation.status === "satisfied") refuse("obligation-satisfied", `obligation ${obligationId} is already satisfied`);
  if (obligation.status === "withdrawn") {
    if (obligation.withdrawn_reason === reason) return unchanged(state);
    refuse("withdraw-conflict", `obligation ${obligationId} was withdrawn with a different reason`);
  }
  const allowed = canWithdraw(state, obligationId);
  if (!allowed.ok) refuse("withdraw-refused", allowed.reason);

  const next = structuredClone(state);
  const target = next.obligations.find((entry) => entry.id === obligationId);
  target.status = "withdrawn";
  target.withdrawn_reason = reason;
  return { state: next, changed: true };
}

// Library-only until E1.4 wires it to the commands that produce evidence
// (REQ-idd-007): the CLI never lets the model assert evidence.
function recordEvidence(state, { id, kind, obligation: obligationId, recordedAt, detail } = {}) {
  requireOpen(state);
  requireText(id, "evidence-id-required", "evidence needs an id");
  const obligation = state.obligations.find((entry) => entry.id === obligationId);
  if (!obligation) refuse("unknown-obligation", `change ${state.change} has no obligation ${obligationId}`);
  const expectedKind = OBLIGATION_BY_ID.get(obligationId).evidence;
  if (kind !== expectedKind) refuse("evidence-kind-mismatch", `${obligationId} needs ${expectedKind} evidence, got ${kind}`);
  requireText(recordedAt, "evidence-time-required", `evidence ${id} needs recorded_at`);

  const entry = { id, kind, obligation: obligationId, recorded_at: recordedAt };
  if (detail !== undefined) entry.detail = detail;
  const existing = state.evidence.find((item) => item.id === id);
  if (existing) {
    if (sameJson(existing, entry)) return unchanged(state);
    refuse("evidence-conflict", `evidence ${id} is already recorded with different content`);
  }
  if (obligation.status === "withdrawn") refuse("obligation-withdrawn", `obligation ${obligationId} is withdrawn`);

  const next = structuredClone(state);
  next.evidence.push(entry);
  const target = next.obligations.find((item) => item.id === obligationId);
  target.status = "satisfied";
  target.evidence = [...target.evidence, id];
  return { state: next, changed: true };
}

module.exports = {
  IddRecordError,
  recordEvidence,
  recordGate,
  recordIntent,
  recordSignal,
  recordWithdraw,
};
