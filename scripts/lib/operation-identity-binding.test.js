"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  resolveOperationIdentityBinding,
  DECISION_STATUSES,
} = require("./operation-identity-binding.js");

const BINDING = {
  changePath: "openspec/changes/alpha",
  phase: "sdd-apply",
  expectedRevision: "rev-7",
  operation: "apply",
};

const TARGET = {
  changePath: "openspec/changes/alpha",
  phase: "sdd-apply",
  revision: "rev-7",
  operation: "apply",
};

function candidate(overrides = {}) {
  return {
    changePath: "openspec/changes/alpha",
    phase: "sdd-apply",
    revision: "rev-7",
    operation: "apply",
    ...overrides,
  };
}

function deepFreeze(value) {
  if (value !== null && typeof value === "object") {
    for (const key of Object.keys(value)) deepFreeze(value[key]);
    Object.freeze(value);
  }
  return value;
}

test("exact binding against identified target snapshot binds without authorizing any effect", () => {
  const decision = resolveOperationIdentityBinding({
    ...BINDING,
    target: { ...TARGET },
  });
  assert.equal(decision.status, "bound");
  assert.ok(decision.reasons.includes("binding.exact_match"));
  assert.ok(decision.reasons.includes("outcome.no_record"));
  assert.equal(decision.record.revision, "rev-7");
  assert.equal(decision.effect, undefined);
});

test("decision exposes no permit, effect, or dispatch field in any status", () => {
  const bound = resolveOperationIdentityBinding({
    ...BINDING,
    target: { ...TARGET },
  });
  const rejected = resolveOperationIdentityBinding({
    ...BINDING,
    expectedRevision: "rev-6",
    target: { ...TARGET },
  });
  const reconciliation = resolveOperationIdentityBinding({
    ...BINDING,
    target: { ...TARGET, lastOutcome: "success" },
  });
  for (const decision of [bound, rejected, reconciliation]) {
    assert.equal(decision.effect, undefined);
    assert.equal(decision.authorized, undefined);
    assert.equal(decision.permit, undefined);
    assert.equal(decision.dispatch, undefined);
  }
});

test("malformed binding rejects closed", () => {
  const decision = resolveOperationIdentityBinding({
    changePath: BINDING.changePath,
    phase: BINDING.phase,
    operation: BINDING.operation,
    expectedRevision: 7,
    target: { ...TARGET },
  });
  assert.equal(decision.status, "rejected");
  assert.ok(decision.reasons.includes("binding.malformed"));
});

test("partial binding (some identity fields set) is malformed", () => {
  const decision = resolveOperationIdentityBinding({
    changePath: BINDING.changePath,
    target: { ...TARGET },
  });
  assert.equal(decision.status, "rejected");
  assert.ok(decision.reasons.includes("binding.malformed"));
});

test("changePath mismatch rejects closed", () => {
  const decision = resolveOperationIdentityBinding({
    ...BINDING,
    changePath: "openspec/changes/beta",
    target: { ...TARGET },
  });
  assert.equal(decision.status, "rejected");
  assert.ok(decision.reasons.includes("binding.change_mismatch"));
});

test("expectedRevision mismatch rejects closed", () => {
  const decision = resolveOperationIdentityBinding({
    ...BINDING,
    expectedRevision: "rev-6",
    target: { ...TARGET, revision: "rev-7" },
  });
  assert.equal(decision.status, "rejected");
  assert.ok(decision.reasons.includes("binding.revision_mismatch"));
});

test("stale phase rejects closed", () => {
  const decision = resolveOperationIdentityBinding({
    ...BINDING,
    target: { ...TARGET, phase: "sdd-verify" },
  });
  assert.equal(decision.status, "rejected");
  assert.ok(decision.reasons.includes("binding.phase_mismatch"));
});

test("operation mismatch rejects closed", () => {
  const decision = resolveOperationIdentityBinding({
    ...BINDING,
    operation: "verify",
    target: { ...TARGET },
  });
  assert.equal(decision.status, "rejected");
  assert.ok(decision.reasons.includes("binding.operation_mismatch"));
});

test("binding with incomplete target snapshot surfaces reconciliation-required signal", () => {
  const decision = resolveOperationIdentityBinding({
    ...BINDING,
    target: { changePath: TARGET.changePath, phase: TARGET.phase },
  });
  assert.equal(decision.status, "reconciliation_required");
  assert.ok(decision.reasons.includes("target.unresolved_identity"));
});

test("single exact candidate binds when target snapshot is absent", () => {
  const decision = resolveOperationIdentityBinding({
    ...BINDING,
    candidates: [candidate()],
  });
  assert.equal(decision.status, "bound");
  assert.equal(decision.record.changePath, BINDING.changePath);
});

test("no matching candidate rejects when target snapshot is absent", () => {
  const decision = resolveOperationIdentityBinding({
    ...BINDING,
    expectedRevision: "rev-9",
    candidates: [candidate()],
  });
  assert.equal(decision.status, "rejected");
  assert.ok(decision.reasons.includes("binding.record_not_found"));
});

test("fully agreeing duplicate candidates collapse and bind", () => {
  const decision = resolveOperationIdentityBinding({
    ...BINDING,
    candidates: [candidate(), candidate({ lastOutcome: undefined })],
  });
  assert.equal(decision.status, "bound");
  assert.equal(decision.record.revision, "rev-7");
});

test("conflicting revision records for the binding changePath reject closed even when one exactly matches", () => {
  const decision = resolveOperationIdentityBinding({
    ...BINDING,
    candidates: [candidate(), candidate({ revision: "rev-9", lastOutcome: "success" })],
  });
  assert.equal(decision.status, "rejected");
  assert.ok(decision.reasons.includes("input.contradictory_snapshots"));
});

test("conflicting outcome records for the binding changePath reject closed", () => {
  const decision = resolveOperationIdentityBinding({
    ...BINDING,
    candidates: [candidate(), candidate({ lastOutcome: "failure" })],
  });
  assert.equal(decision.status, "rejected");
  assert.ok(decision.reasons.includes("input.contradictory_snapshots"));
});

test("records for other changePaths are irrelevant in the candidates-only path", () => {
  const decision = resolveOperationIdentityBinding({
    ...BINDING,
    candidates: [
      candidate(),
      candidate({
        changePath: "openspec/changes/other",
        phase: "sdd-verify",
        revision: "rev-1",
        operation: "clarify",
        lastOutcome: "success",
      }),
    ],
  });
  assert.equal(decision.status, "bound");
  assert.equal(decision.record.changePath, BINDING.changePath);
});

test("absent binding with a single candidate returns named legacy passthrough", () => {
  const decision = resolveOperationIdentityBinding({
    candidates: [candidate({ changePath: "openspec/changes/solo" })],
  });
  assert.equal(decision.status, "legacy_passthrough");
  assert.equal(decision.record.changePath, "openspec/changes/solo");
  assert.ok(decision.reasons.includes("absent_binding.single_candidate_legacy"));
  assert.equal(decision.effect, undefined);
});

test("absent binding with two active candidates fails closed and never picks recency", () => {
  const decision = resolveOperationIdentityBinding({
    candidates: [
      candidate({ changePath: "openspec/changes/most-recent", lastActiveAt: "2026-09-27T00:00:00Z" }),
      candidate({ changePath: "openspec/changes/older", lastActiveAt: "2026-09-20T00:00:00Z" }),
    ],
  });
  assert.equal(decision.status, "rejected");
  assert.ok(decision.reasons.includes("absent_binding.ambiguous"));
  assert.equal(decision.record, null);
});

test("absent binding with no candidates rejects closed", () => {
  const decision = resolveOperationIdentityBinding({});
  assert.equal(decision.status, "rejected");
  assert.ok(decision.reasons.includes("absent_binding.no_candidate"));
});

test("legacy passthrough fails closed when the single candidate records an outcome", () => {
  const success = resolveOperationIdentityBinding({
    candidates: [candidate({ lastOutcome: "success" })],
  });
  assert.equal(success.status, "reconciliation_required");
  assert.ok(success.reasons.includes("outcome.recorded_success"));

  const unknown = resolveOperationIdentityBinding({
    candidates: [candidate({ lastOutcome: "unknown" })],
  });
  assert.equal(unknown.status, "reconciliation_required");
  assert.ok(unknown.reasons.includes("target.unknown_outcome"));
});

test("agreement between target and candidate records binds", () => {
  const decision = resolveOperationIdentityBinding({
    ...BINDING,
    target: { ...TARGET },
    candidates: [
      candidate(),
      candidate({
        changePath: "openspec/changes/unrelated",
        phase: "sdd-verify",
        revision: "rev-1",
        operation: "clarify",
      }),
    ],
  });
  assert.equal(decision.status, "bound");
  assert.equal(decision.record.revision, "rev-7");
});

test("candidate record contradicting the target rejects closed instead of being ignored", () => {
  const revisionDivergence = resolveOperationIdentityBinding({
    ...BINDING,
    target: { ...TARGET },
    candidates: [candidate({ revision: "rev-9" })],
  });
  assert.equal(revisionDivergence.status, "rejected");
  assert.ok(revisionDivergence.reasons.includes("input.contradictory_snapshots"));

  const phaseDivergence = resolveOperationIdentityBinding({
    ...BINDING,
    target: { ...TARGET },
    candidates: [candidate({ phase: "sdd-verify" })],
  });
  assert.equal(phaseDivergence.status, "rejected");
  assert.ok(phaseDivergence.reasons.includes("input.contradictory_snapshots"));
});

test("candidate recording an outcome the target omits fails closed without adopting either snapshot", () => {
  const success = resolveOperationIdentityBinding({
    ...BINDING,
    target: { ...TARGET },
    candidates: [candidate({ lastOutcome: "success" })],
  });
  assert.equal(success.status, "rejected");
  assert.ok(success.reasons.includes("input.contradictory_snapshots"));
  assert.equal(success.record.lastOutcome, undefined);

  const unknown = resolveOperationIdentityBinding({
    ...BINDING,
    target: { ...TARGET },
    candidates: [candidate({ lastOutcome: "unknown" })],
  });
  assert.equal(unknown.status, "rejected");
  assert.ok(unknown.reasons.includes("input.contradictory_snapshots"));
});

test("candidate and target outcomes that disagree fail closed", () => {
  const conflict = resolveOperationIdentityBinding({
    ...BINDING,
    target: { ...TARGET, lastOutcome: "success" },
    candidates: [candidate({ lastOutcome: "failure" })],
  });
  assert.equal(conflict.status, "rejected");
  assert.ok(conflict.reasons.includes("input.contradictory_snapshots"));
});

test("consistent no-outcome snapshots including duplicate candidates bind", () => {
  const duplicated = resolveOperationIdentityBinding({
    ...BINDING,
    target: { ...TARGET },
    candidates: [candidate(), candidate({ lastOutcome: undefined })],
  });
  assert.equal(duplicated.status, "bound");

  const agreeingOutcomes = resolveOperationIdentityBinding({
    ...BINDING,
    target: { ...TARGET, lastOutcome: "failure" },
    candidates: [candidate({ lastOutcome: "failure" })],
  });
  assert.equal(agreeingOutcomes.status, "reconciliation_required");
  assert.ok(agreeingOutcomes.reasons.includes("outcome.recorded_failure"));
});

test("duplicate same-changePath candidate with hidden outcome is not ignored", () => {
  const decision = resolveOperationIdentityBinding({
    ...BINDING,
    target: { ...TARGET },
    candidates: [candidate(), candidate({ lastOutcome: "success" })],
  });
  assert.equal(decision.status, "rejected");
  assert.ok(decision.reasons.includes("input.contradictory_snapshots"));
});

test("unknown outcome is only a reconciliation-required signal, never a retry", () => {
  const decision = resolveOperationIdentityBinding({
    ...BINDING,
    target: { ...TARGET, lastOutcome: "unknown" },
  });
  assert.equal(decision.status, "reconciliation_required");
  assert.ok(decision.reasons.includes("target.unknown_outcome"));
});

test("recorded success fails closed even with arbitrary replay flags", () => {
  const decision = resolveOperationIdentityBinding({
    ...BINDING,
    target: { ...TARGET, lastOutcome: "success" },
    allowReplay: true,
    replay: true,
    force: true,
  });
  assert.equal(decision.status, "reconciliation_required");
  assert.ok(decision.reasons.includes("outcome.recorded_success"));
});

test("recorded failure fails closed until external reconciliation", () => {
  const decision = resolveOperationIdentityBinding({
    ...BINDING,
    target: { ...TARGET, lastOutcome: "failure" },
  });
  assert.equal(decision.status, "reconciliation_required");
  assert.ok(decision.reasons.includes("outcome.recorded_failure"));
});

test("unrecognized outcome fails to reconciliation-required signal", () => {
  const decision = resolveOperationIdentityBinding({
    ...BINDING,
    target: { ...TARGET, lastOutcome: "weird" },
  });
  assert.equal(decision.status, "reconciliation_required");
  assert.ok(decision.reasons.includes("target.unrecognized_outcome"));
});

test("verify success alone is never treated as a PASS", () => {
  const decision = resolveOperationIdentityBinding({
    ...BINDING,
    operation: "verify",
    target: { ...TARGET, operation: "verify", lastOutcome: "success" },
    allowReplay: true,
  });
  assert.equal(decision.status, "reconciliation_required");
  assert.equal(decision.effect, undefined);
  assert.ok(!decision.reasons.includes("binding.exact_match"));
  for (const status of DECISION_STATUSES) {
    assert.ok(!["pass", "approved", "ok"].includes(status));
  }
});

test("adapter is pure: frozen snapshots are not mutated and decision is frozen", () => {
  const input = deepFreeze({
    ...BINDING,
    target: deepFreeze({ ...TARGET, lastOutcome: "failure" }),
    candidates: deepFreeze([candidate({ lastOutcome: "failure" })]),
  });
  const decision = resolveOperationIdentityBinding(input);
  assert.equal(decision.status, "reconciliation_required");
  assert.ok(Object.isFrozen(decision));
  assert.ok(Object.isFrozen(decision.reasons));
  assert.equal(input.target.lastOutcome, "failure");
});
