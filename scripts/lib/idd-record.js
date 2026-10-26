"use strict";

// Pure record reducers for idd-state/v1 (openspec/specs/idd/spec.md,
// REQ-idd-003, 005–008, 011). Each takes the current state (or null when the
// change does not exist yet) and returns { state, changed } without mutating
// its input. Repeating a record is a no-op; rewriting a recorded fact with
// different content is refused with a coded IddRecordError. No filesystem
// access: idd-store.js persists the result.

const {
  CHANGE_ID_PATTERN,
  DECISIONS_ROOT,
  GATED_IMPACTS,
  GATES,
  GATE_SOURCES,
  IMPACTS,
  INTENT_KINDS,
  OBLIGATIONS,
  RECORDED_IMPACTS,
  REFERENCE_KINDS,
  RETRACTABLE_SIGNALS,
  SIGNALS,
  SIGNAL_SOURCES,
  STATE_SCHEMA,
  canWithdraw,
  isIntentAmbiguous,
  signalGaps,
} = require("./idd-contract.js");
const { factsFromCoverage } = require("./idd-facts.js");
const { normalizePath } = require("./idd-impact.js");

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

function refuse(code, message, how) {
  const error = new IddRecordError(code, message);
  if (how) error.how = how;
  throw error;
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

// A repeated intent without a facts declaration keeps the recorded one; one
// with a declaration must match it.
function sameFacts(state, input) {
  if (input.kind === "feature") {
    if (input.coverage == null) return true;
    const built = factsFromCoverage(input.coverage);
    return !built.error && sameJson(built.facts, state.facts);
  }
  if (input.openFacts == null && input.noOpenFacts == null) return true;
  return sameJson(declaredFacts(input), state.facts);
}

function factsFor(input) {
  if (input.kind !== "feature") return declaredFacts(input);
  const built = factsFromCoverage(input.coverage);
  if (built.error) refuse(built.error.code, built.error.message, built.error.how);
  return built.facts;
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

// Every resolved intent declares its open facts: the behavior questions that
// neither the request nor the code settles, or the basis for declaring none
// (REQ-idd-018). Open facts open the open-facts gate.
function declaredFacts(input) {
  const open = [...new Set((input.openFacts || []).map((question) => String(question).trim()))];
  const none = input.noOpenFacts === true;
  const undeclared = "declare the open facts with --open-fact, or --no-open-facts with --basis";
  if (open.some((question) => question === "")) refuse("facts-undeclared", "an open fact must be a question");
  if (none === open.length > 0) refuse("facts-undeclared", undeclared);
  if (none) {
    requireText(input.basis, "facts-undeclared", "--no-open-facts needs the --basis that settles every behavior");
    return { basis: input.basis };
  }
  return { open };
}

function questionsOf(facts) {
  return facts?.open || (facts?.coverage || []).flatMap((entry) => (entry.question ? [entry.question] : []));
}

function applyFacts(state, facts) {
  state.facts = facts;
  if (questionsOf(facts).length > 0) state.gates.push({ id: "open-facts", status: "open" });
}

// The kinds a resolved intent may move to (E1.44, B9): only up, from docs to a
// refactor, a bug or a feature, and from a refactor to a bug or a feature.
const KIND_RANK = Object.freeze({ docs: 0, refactor: 1, bug: 2, feature: 2 });

function raisesKind(from, to) {
  return Object.hasOwn(KIND_RANK, to) && KIND_RANK[to] > KIND_RANK[from];
}

// A raised intent replaces the intent and its open facts. The answers already
// given stay recorded, and only a question not asked before opens a new
// open-facts entry.
function raiseIntent(state, input) {
  if (state.gates.some((gate) => gate.id === "open-facts" && gate.status === "open")) {
    refuse("open-facts-open", "the open facts already asked have no answer yet: resolve open-facts before the intent changes");
  }
  validateResolvedIntent(input);
  const facts = factsFor(input);
  const asked = new Set(questionsOf(state.facts));
  const next = structuredClone(state);
  next.intent = resolvedIntent(input);
  next.facts = facts;
  if (questionsOf(facts).some((question) => !asked.has(question))) next.gates.push({ id: "open-facts", status: "open" });
  return { state: next, changed: true };
}

function recordIntent(state, input = {}) {
  if (state) {
    requireOpen(state);
    if (!isIntentAmbiguous(state)) {
      const { request = state.intent.request, ...rest } = input;
      if (!input.ambiguous && raisesKind(state.intent.kind, input.kind)) return raiseIntent(state, { ...rest, request });
      const candidate = resolvedIntent({ ...rest, request });
      if (input.ambiguous || !sameJson(candidate, state.intent) || !sameFacts(state, input)) {
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
    requireGateSource(input.source);
    const facts = factsFor(input);
    const next = structuredClone(state);
    next.intent = resolvedIntent({ ...input, request: state.intent.request });
    const gate = next.gates.find((entry) => entry.id === "ambiguous-intent");
    gate.status = "resolved";
    gate.answer = input.answer;
    gate.source = input.source;
    applyFacts(next, facts);
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
  // The commit the change starts from, so later diffs cover its whole work.
  if (input.base !== undefined) {
    if (input.base !== null && (typeof input.base !== "string" || input.base === "")) {
      refuse("invalid-base", "the change base must be a commit id or null");
    }
    next.base = input.base;
  }
  if (input.ambiguous) {
    requireText(input.request, "intent-incomplete", "an ambiguous intent must keep the original request");
    next.intent = { request: input.request, kind: null, summary: null, acceptance: null };
    next.gates.push({ id: "ambiguous-intent", status: "open" });
  } else {
    validateResolvedIntent(input);
    const facts = factsFor(input);
    next.intent = resolvedIntent(input);
    applyFacts(next, facts);
    addSignal(next, { id: "always", reason: ALWAYS_REASON, source: "declaration" });
  }
  return { state: next, changed: true };
}

function requireGateSource(source) {
  if (!GATE_SOURCES.includes(source)) refuse("invalid-source", `gate source must be one of ${GATE_SOURCES.join(", ")}`);
}

function recordSignal(state, { id, reason, source } = {}) {
  requireOpen(state);
  if (isIntentAmbiguous(state)) refuse("ambiguous-intent-open", "no signal is derived while the intent is ambiguous");
  const signal = SIGNAL_BY_ID.get(id);
  if (!signal) refuse("unknown-signal", `unknown signal: ${id}`);
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
  if (id === "open-facts" && action === "open") {
    refuse("gate-managed-by-intent", "open-facts is opened by the open facts of record intent");
  }
  if (id === "review-limit" && action === "open") {
    refuse("gate-managed-by-review", "review-limit is opened by ospec check once the trust reviews of the change are used up");
  }
  if (id === "checks-changed" && action === "open") {
    refuse("gate-managed-by-check", "checks-changed is opened by ospec check when the checks in idd/config.yaml differ from the change's base");
  }
  // review-limit and checks-changed repeat, one entry per authorized review
  // (REQ-idd-016) or approved set of checks: the open entry is the one to
  // answer, else the latest.
  let index = state.gates.findIndex((gate) => gate.id === id && gate.status === "open");
  if (index === -1) index = state.gates.findLastIndex((gate) => gate.id === id);
  const existing = index === -1 ? null : state.gates[index];

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
    requireGateSource(source);
    if (!existing) refuse("gate-not-open", `gate ${id} is not open`);
    if (existing.status === "resolved") {
      if (existing.answer === answer && existing.source === source) return unchanged(state);
      refuse("gate-conflict", `gate ${id} is already resolved with a different answer`);
    }
    const next = structuredClone(state);
    const gate = next.gates[index];
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

// Reopens each obligation an active signal derives that a hand edit removed or
// withdrew (B2), as a returning signal does (REQ-idd-006): `ospec check` runs
// it, so the change gets out of the state close refuses.
function reopenDerived(state) {
  requireOpen(state);
  const gaps = signalGaps(state);
  if (gaps.length === 0) return unchanged(state);
  const next = structuredClone(state);
  for (const { obligation: id, signal } of gaps) {
    const target = next.obligations.find((entry) => entry.id === id);
    if (!target) {
      next.obligations.push({ id, signal, status: "pending", evidence: [] });
      continue;
    }
    Object.assign(target, { signal, status: "pending", evidence: [] });
    delete target.withdrawn_reason;
  }
  return { state: next, changed: true };
}

function sortedUnion(left, right) {
  return [...new Set([...left, ...right])].sort();
}

// Records the plan `ospec signals` was told about (E1.11). A later declaration
// widens it: paths and operations accumulate, the work units keep the largest
// count and a declared decision stays declared, so nothing planned is dropped.
function recordPlan(state, { paths = [], workUnits = 1, nonObviousDecision = false, operations = [] } = {}) {
  requireOpen(state);
  if (isIntentAmbiguous(state)) refuse("ambiguous-intent-open", "no plan is declared while the intent is ambiguous");
  if (!Number.isInteger(workUnits) || workUnits < 1) refuse("invalid-plan", "work units must be a positive integer");
  const previous = state.plan || { paths: [], work_units: 1, decision: false, operations: [] };
  const plan = {
    paths: sortedUnion(previous.paths, paths.map(normalizePath)),
    work_units: Math.max(previous.work_units, workUnits),
    decision: previous.decision || nonObviousDecision === true,
    operations: sortedUnion(previous.operations, operations.map(String)),
  };
  if (state.plan && sameJson(plan, state.plan)) return unchanged(state);
  return { state: { ...structuredClone(state), plan }, changed: true };
}

// Retracts a signal the diff does not confirm (E1.11): the signal leaves the
// active list, its pending obligation is withdrawn with the reason and the
// retraction stays recorded. A signal from the diff qualifies once the diff no
// longer derives it (#418). `confirmedBy` is the reason the current diff
// derives the signal, or null; idd-workspace.js reads the diff. A later
// diff or declaration that derives the signal again reopens its obligation
// (REQ-idd-006). With the user's `answer` (#416), persistent-data that only the
// content of the diff derives (`contentOnly`) is retracted too, with the `hits`
// the answer covers; the derivation keeps it out while the diff holds no other.
function recordRetract(state, { id, reason, confirmedBy = null, contentOnly = false, hits = [], answer, source } = {}) {
  requireOpen(state);
  if (!SIGNAL_BY_ID.has(id)) refuse("unknown-signal", `unknown signal: ${id}`);
  if (!RETRACTABLE_SIGNALS.includes(id)) {
    refuse("signal-not-retractable", `signal ${id} derives from the intent or the project configuration; only ${RETRACTABLE_SIGNALS.join(", ")} can be retracted`);
  }
  requireText(reason, "reason-required", `retracting ${id} needs a reason`);
  const answered = answer !== undefined || source !== undefined;
  if (answered) {
    if (!answer || !source) refuse("gate-answer-required", `retracting ${id} with the user's answer needs the answer and its source`);
    requireGateSource(source);
  }
  const signal = state.signals.find((entry) => entry.id === id);
  if (!signal) {
    const last = (state.retracted || []).findLast((entry) => entry.id === id);
    if (!last) refuse("signal-not-recorded", `change ${state.change} has no signal ${id}`);
    if (last.retract_reason === reason && last.answer === answer && last.answer_source === source) return unchanged(state);
    refuse("retract-conflict", `signal ${id} was retracted with a different reason`);
  }
  if (answered) {
    if (!contentOnly || hits.length === 0) {
      const why = confirmedBy ? `the diff derives it: ${confirmedBy}` : "the diff does not derive it; retract it without an answer";
      refuse("retract-answer-refused", `only persistent-data that the content of the diff alone derives is retracted with the user's answer; ${why}`);
    }
  } else {
    const how = contentOnly ? "if the user confirms there is no persistent data, add --answer \"<their words>\" --source user" : undefined;
    if (confirmedBy) refuse("signal-confirmed-by-diff", `the diff confirms signal ${id}: ${confirmedBy}`, how);
  }
  const obligationId = SIGNAL_BY_ID.get(id).obligation;
  const obligation = state.obligations.find((entry) => entry.id === obligationId);
  if (obligation?.status === "satisfied") refuse("obligation-satisfied", `obligation ${obligationId} of signal ${id} is already satisfied`);

  const next = structuredClone(state);
  next.signals = next.signals.filter((entry) => entry.id !== id);
  const entry = { id, reason: signal.reason, source: signal.source, retract_reason: reason };
  if (answered) Object.assign(entry, { confirmed_by: confirmedBy, hits: [...hits], answer, answer_source: source });
  next.retracted = [...(next.retracted || []), entry];
  const target = next.obligations.find((entry) => entry.id === obligationId);
  if (target && target.status === "pending") {
    target.status = "withdrawn";
    target.withdrawn_reason = reason;
  }
  return { state: next, changed: true };
}

function referenceLabel({ kind, id }) {
  return kind === "adr" ? `ADR ${id}` : `scenario ${id}`;
}

// Records the architecture references `ospec signals` was told the change
// touches (E3.1), each still without its impact. A reference already recorded
// keeps its impact; a new one reopens a settled declaration, which no longer
// covers every reference.
function recordReferences(state, refs = []) {
  requireOpen(state);
  const missing = refs.filter((ref) => !(state.impacts || []).some((entry) => entry.kind === ref.kind && entry.id === ref.id));
  if (missing.length === 0) return unchanged(state);
  const next = structuredClone(state);
  next.impacts = [...(next.impacts || []), ...missing.map(({ kind, id }) => ({ kind, id, impact: null }))];
  const declaration = next.obligations.find((entry) => entry.id === "adr-impact-declaration");
  if (declaration?.status === "satisfied") {
    declaration.status = "pending";
    declaration.evidence = [];
  }
  return { state: next, changed: true };
}

function requireRecordPath(record) {
  requireText(record, "invalid-record", "--record needs the path of the new ADR");
  const file = normalizePath(record);
  if (!file.startsWith(`${DECISIONS_ROOT}/`) || !file.endsWith(".md") || file.split("/").includes("..")) {
    refuse("invalid-record", `the new ADR must be a .md file under ${DECISIONS_ROOT}/, got ${record}`);
  }
  return file;
}

// An amendment, a supersession or a contradiction is the user's decision
// (REQ-idd-008): it opens adr-amend-or-contradict, or adds its reason while
// the gate is still open. Once the user answered, a new one is refused, so
// no departure from an ADR passes without being asked.
function openImpactGate(next, reason) {
  const gate = next.gates.find((entry) => entry.id === "adr-amend-or-contradict");
  if (!gate) next.gates.push({ id: "adr-amend-or-contradict", status: "open", reason });
  else if (gate.status === "open") gate.reason = gate.reason ? `${gate.reason}; ${reason}` : reason;
  else refuse("gate-resolved", `adr-amend-or-contradict is already resolved (${gate.answer}); declare every amendment before the user answers`);
}

/**
 * Declares the impact of a change on one declared architecture reference
 * (E3.1, REQ-idd-005): none, conforms, amends, supersedes or contradicts, with
 * its reason. An impact is declared once; afterwards only the new ADR that
 * amends or supersedes an ADR can be attached with `record`.
 */
function recordImpact(state, { kind, id, impact, reason, record } = {}) {
  requireOpen(state);
  if (isIntentAmbiguous(state)) refuse("ambiguous-intent-open", "no impact is declared while the intent is ambiguous");
  if (!REFERENCE_KINDS.includes(kind) || typeof id !== "string" || id === "") {
    refuse("invalid-reference", "record impact needs --adr <id> or --quality <id>");
  }
  const label = referenceLabel({ kind, id });
  const entry = (state.impacts || []).find((item) => item.kind === kind && item.id === id);
  if (!entry) {
    refuse("reference-not-declared", `${label} is not declared: run ospec signals --change ${state.change} --${kind === "adr" ? "adr" : "quality"} ${id}`);
  }
  const file = record == null ? undefined : requireRecordPath(record);
  const canRecord = (value) => kind === "adr" && RECORDED_IMPACTS.includes(value);

  if (impact == null) {
    if (file === undefined) refuse("impact-required", "record impact needs --impact <value>, or --record to attach the new ADR");
    if (entry.impact == null) refuse("impact-required", `declare the impact of ${label} before attaching its new ADR`);
  } else {
    if (!IMPACTS.includes(impact)) refuse("invalid-impact", `impact must be one of ${IMPACTS.join(", ")}, got ${impact}`);
    requireText(reason, "reason-required", `the impact on ${label} needs a reason`);
    if (entry.impact != null && (entry.impact !== impact || entry.reason !== reason)) {
      refuse("impact-conflict", `${label} is already declared as ${entry.impact}: ${entry.reason}`);
    }
  }
  const value = impact ?? entry.impact;
  if (file !== undefined && !canRecord(value)) {
    refuse("invalid-record", `only an ADR amended or superseded names its new ADR; ${label} is ${value}`);
  }
  if (file !== undefined && entry.record !== undefined && entry.record !== file) {
    refuse("impact-conflict", `${label} already names its new ADR ${entry.record}`);
  }
  if (entry.impact != null && (file === undefined || entry.record === file)) return unchanged(state);

  const next = structuredClone(state);
  const target = next.impacts.find((item) => item.kind === kind && item.id === id);
  if (target.impact == null) {
    target.impact = impact;
    target.reason = reason;
    if (GATED_IMPACTS.includes(impact)) openImpactGate(next, `${label} ${impact}: ${reason}`);
  }
  if (file !== undefined) target.record = file;
  return { state: next, changed: true };
}

// Records the manual evidence of a fitness function no command checks (E3.3,
// REQ-idd-022). `manual` says whether the reference is a manual item of the
// change, as the CLI read it from the base. The evidence is kept for the
// record and never satisfies an obligation (ADR-0005).
function recordAttestation(state, { kind, id, evidence, recordedAt, manual } = {}) {
  requireOpen(state);
  if (isIntentAmbiguous(state)) refuse("ambiguous-intent-open", "no fitness evidence is recorded while the intent is ambiguous");
  if (!REFERENCE_KINDS.includes(kind) || typeof id !== "string" || id === "") {
    refuse("invalid-reference", "record fitness needs --adr <id> or --quality <id>");
  }
  const label = referenceLabel({ kind, id });
  requireText(evidence, "evidence-required", `the fitness evidence of ${label} needs --evidence <text>`);
  if (!manual) refuse("not-manual-fitness", `${label} has no manual fitness function in change ${state.change}: only one without an executable check takes manual evidence`);
  const existing = (state.attestations || []).find((item) => item.kind === kind && item.id === id);
  if (existing) {
    if (existing.evidence === evidence) return unchanged(state);
    refuse("attestation-conflict", `${label} already has its fitness evidence: ${existing.evidence}`);
  }
  const next = structuredClone(state);
  next.attestations = [...(next.attestations || []), { kind, id, evidence, recorded_at: recordedAt }];
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

function recordAssumption(state, { text } = {}) {
  requireOpen(state);
  requireText(text, "assumption-required", "an assumption needs text");
  const assumptions = state.assumptions || [];
  if (assumptions.includes(text)) return unchanged(state);
  return { state: { ...structuredClone(state), assumptions: [...assumptions, text] }, changed: true };
}

module.exports = {
  IddRecordError,
  recordAssumption,
  recordAttestation,
  recordEvidence,
  recordGate,
  recordImpact,
  recordIntent,
  recordPlan,
  recordReferences,
  recordRetract,
  recordSignal,
  recordWithdraw,
  reopenDerived,
};
