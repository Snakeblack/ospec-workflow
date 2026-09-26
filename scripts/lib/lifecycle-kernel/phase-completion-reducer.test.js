"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  reducePhaseCompletion,
  computePayloadHash,
  legacyV267PayloadHash,
} = require("./phase-completion-reducer.js");
const { reducePhaseCompletion: exportedReducer } = require("./reducer.js");

const NOW = "2026-09-12T00:00:00.000Z";

function sampleState(overrides = {}) {
  return {
    schema_version: 1,
    change: "auth-refactor",
    status: "planning",
    revision: 1,
    approvals: [
      { id: "briefing-001", gate: "intent-briefing", decision: "accepted" },
    ],
    blocking_questions: [],
    phases: {
      proposal: { status: "done", artifact: "proposal.md" },
      design: { status: "pending", artifact: "design.md" },
      tasks: { status: "pending", artifact: "tasks.md" },
      apply: { status: "pending", artifact: "apply-progress.md" },
    },
    ...overrides,
  };
}

test("reducePhaseCompletion: successfully advances phase and projects summary and artifacts [REQ-lifecycle-kernel-028]", () => {
  const current = sampleState();
  const envelope = {
    schema_version: 1,
    status: "success",
    executive_summary: "JWT stateless authentication with rotated tokens.",
    artifacts: ["openspec/changes/auth/design.md"],
    next_recommended: "sdd-tasks",
    risks: "None",
    skill_resolution: "injected",
    key_decisions: ["RS256 over HS256", "Stateless refresh tokens"],
  };

  const initialSnapshot = JSON.stringify(current);
  const result = reducePhaseCompletion(current, { phase: "design", envelope }, { expectedRevision: 1, now: NOW });

  assert.equal(result.ok, true);
  assert.equal(result.outcome, "advanced");
  assert.equal(result.state.phases.design.status, "done");
  assert.equal(
    result.state.phases.design.summary,
    "JWT stateless authentication with rotated tokens."
  );
  assert.deepEqual(result.state.phases.design.artifacts, ["openspec/changes/auth/design.md"]);
  assert.deepEqual(result.state.phases.design.key_decisions, [
    "RS256 over HS256",
    "Stateless refresh tokens",
  ]);
  assert.equal(result.state.revision, 2);
  assert.ok(result.state.phases.design.last_payload_hash);
  assert.deepEqual(result.state.blocking_questions, []);

  // Purity: original state must remain unmutated
  assert.equal(JSON.stringify(current), initialSnapshot);
  assert.notEqual(result.state, current);
});

test("reducePhaseCompletion: projects blocked status with question_gate and blocker metadata [REQ-lifecycle-kernel-028]", () => {
  const current = sampleState({ status: "applying" });
  const envelope = {
    schema_version: 1,
    status: "blocked",
    executive_summary: "Apply blocked due to design mismatch in delivery worker.",
    artifacts: "inline",
    next_recommended: "sdd-design",
    risks: "Potential architecture redesign",
    skill_resolution: "injected",
    blocker_type: "design-mismatch",
    question_gate: {
      reason: "Existing code contradicts pluggable retry seam design.",
      questions: [
        {
          header: "Seam Architecture",
          question: "Should delivery worker be refactored to support pluggable retries?",
          options: [
            { label: "refactor-worker", description: "Refactor worker", recommended: true },
            { label: "revert-design", description: "Change design", recommended: false },
          ],
        },
      ],
    },
  };

  const result = reducePhaseCompletion(current, { phase: "apply", envelope }, { now: NOW });

  assert.equal(result.ok, true);
  assert.equal(result.outcome, "blocked");
  assert.equal(result.state.status, "blocked");
  assert.notEqual(result.state.phases.apply.status, "done");
  assert.ok(result.state.blocking_questions.length > 0);
  assert.equal(
    result.state.blocking_questions[0],
    "Should delivery worker be refactored to support pluggable retries?"
  );
  assert.equal(result.state.phases.apply.blocker_type, "design-mismatch");
});

test("reducePhaseCompletion: rejects synthetic gate passes and uncommitted approvals [REQ-lifecycle-kernel-028, REQ-agents-029]", () => {
  const current = sampleState();
  const envelope = {
    schema_version: 1,
    status: "success",
    executive_summary: "Claiming bogus approvals and gate completion.",
    artifacts: ["design.md"],
    next_recommended: "sdd-tasks",
    risks: "None",
    skill_resolution: "injected",
    approval_updates: [
      { id: "quality-review-001", gate: "quality-review-gate", decision: "accepted" },
    ],
    approvals: [
      { id: "bogus-001", gate: "human-approval", decision: "accepted" },
    ],
  };

  const result = reducePhaseCompletion(current, { phase: "design", envelope }, { now: NOW });

  assert.equal(result.ok, true);
  // Reducer drops synthetic approval claims fail-closed
  assert.deepEqual(result.state.approvals, current.approvals);
  assert.equal(result.state.approvals.some((a) => a.id === "quality-review-001"), false);
  assert.equal(result.state.approvals.some((a) => a.id === "bogus-001"), false);
});

test("reducePhaseCompletion: detects CAS conflict when expectedRevision != head [REQ-lifecycle-kernel-029]", () => {
  const current = sampleState({ revision: 5 });
  const envelope = {
    schema_version: 1,
    status: "success",
    executive_summary: "Valid envelope but stale revision.",
    artifacts: ["design.md"],
    next_recommended: "sdd-tasks",
    risks: "None",
    skill_resolution: "injected",
  };

  const result = reducePhaseCompletion(current, { phase: "design", envelope }, { expectedRevision: 4, now: NOW });

  assert.equal(result.ok, false);
  assert.equal(result.outcome, "cas-conflict");
  assert.equal(result.code, "cas_conflict");
  assert.deepEqual(result.state, current);
});

test("reducePhaseCompletion: replaying identical completion payload produces zero-delta idempotent convergence [REQ-lifecycle-kernel-029, REQ-hooks-023]", () => {
  const current = sampleState();
  const envelope = {
    schema_version: 1,
    status: "success",
    executive_summary: "First projection run.",
    artifacts: ["openspec/changes/auth/design.md"],
    next_recommended: "sdd-tasks",
    risks: "None",
    skill_resolution: "injected",
    key_decisions: ["Decision A"],
  };

  // First run
  const first = reducePhaseCompletion(current, { phase: "design", envelope }, { now: NOW });
  assert.equal(first.ok, true);
  assert.equal(first.outcome, "advanced");
  assert.equal(first.state.revision, 2);

  // Replay against projected state
  const replay = reducePhaseCompletion(first.state, { phase: "design", envelope }, { now: NOW });
  assert.equal(replay.ok, true);
  assert.equal(replay.outcome, "noop-replay");
  assert.equal(replay.state.revision, 2, "revision must not advance on replay");
  assert.deepEqual(replay.effects, []);
  assert.deepEqual(replay.events, []);
  assert.deepEqual(replay.state, first.state);
});

// Pinned v2.67.0–v2.67.3 insertion-order JSON.stringify sha256 of V267_GOLDEN_ENVELOPE.
const V267_GOLDEN_LEGACY_HASH =
  "05c6a85b59cf771d860309d7446cc3a496960eb45f8ef8ccaac08a33b0f15273";

function v267GoldenEnvelope() {
  return {
    schema_version: 1,
    status: "success",
    executive_summary: "v2.67 golden replay fixture.",
    artifacts: ["openspec/changes/auth/design.md"],
    next_recommended: "sdd-tasks",
    risks: "None",
    skill_resolution: "injected",
    key_decisions: ["Decision A"],
  };
}

test("reducePhaseCompletion: v2.67 insertion-order hash replay is noop without revision bump [REQ-lifecycle-kernel-029]", () => {
  const envelope = v267GoldenEnvelope();
  const current = sampleState({
    revision: 7,
    phases: {
      ...sampleState().phases,
      design: {
        status: "done",
        summary: "Already projected.",
        last_payload_hash: V267_GOLDEN_LEGACY_HASH,
      },
    },
  });
  const before = structuredClone(current);

  const replay = reducePhaseCompletion(current, { phase: "design", envelope }, { now: NOW });

  assert.equal(replay.ok, true);
  assert.equal(replay.outcome, "noop-replay");
  assert.equal(replay.state.revision, 7, "revision must not advance on v2.67 legacy noop");
  assert.deepEqual(replay.effects, []);
  assert.deepEqual(replay.events, []);
  assert.deepEqual(replay.state, before);
  assert.equal(
    replay.state.phases.design.last_payload_hash,
    V267_GOLDEN_LEGACY_HASH,
    "noop must not rewrite stored legacy hash",
  );
});

test("reducePhaseCompletion: unrelated payload Q is not noop against stored P hash [REQ-lifecycle-kernel-029]", () => {
  const envelopeP = v267GoldenEnvelope();
  const envelopeQ = {
    ...v267GoldenEnvelope(),
    executive_summary: "Unrelated payload Q — different completion.",
  };
  const current = sampleState({
    revision: 7,
    phases: {
      ...sampleState().phases,
      design: {
        status: "done",
        summary: "Already projected.",
        last_payload_hash: V267_GOLDEN_LEGACY_HASH,
      },
    },
  });

  const result = reducePhaseCompletion(current, { phase: "design", envelope: envelopeQ }, { now: NOW });

  assert.notEqual(result.outcome, "noop-replay");
  assert.equal(result.outcome, "advanced");
  assert.equal(result.state.revision, 8);
  assert.notEqual(result.state.phases.design.last_payload_hash, V267_GOLDEN_LEGACY_HASH);
  // Advances persist canonical hash only — never the legacy insertion-order form.
  assert.equal(result.state.phases.design.last_payload_hash, computePayloadHash(envelopeQ));
  assert.notEqual(result.state.phases.design.last_payload_hash, legacyV267PayloadHash(envelopeQ));
  assert.ok(envelopeP.executive_summary !== envelopeQ.executive_summary);
});

const V267_NESTED_LEGACY_HASH = "561aca2ff1da87e00356c9eda97413514160fafd8ccd2ed00d00d184d99df4fb";

function v267NestedEnvelope() {
  return {
    schema_version: 1,
    status: "blocked",
    executive_summary: "v2.67 nested question_gate replay fixture.",
    artifacts: ["inline"],
    next_recommended: "sdd-design",
    risks: "None",
    skill_resolution: "injected",
    blocker_type: "design-mismatch",
    question_gate: {
      reason: "Need a decision.",
      questions: [{
        header: "Seam",
        question: "Keep the seam?",
        options: [{ label: "yes", description: "Keep it", recommended: true }],
      }],
    },
  };
}

test("reducePhaseCompletion: v2.67 nested question_gate hash replay is noop in Node [REQ-lifecycle-kernel-029]", () => {
  const envelope = v267NestedEnvelope();
  assert.equal(legacyV267PayloadHash(envelope), V267_NESTED_LEGACY_HASH);
  const current = sampleState({
    revision: 7,
    phases: {
      ...sampleState().phases,
      design: {
        status: "done",
        summary: "Already projected.",
        last_payload_hash: V267_NESTED_LEGACY_HASH,
      },
    },
  });
  const before = structuredClone(current);
  const replay = reducePhaseCompletion(current, { phase: "design", envelope }, { now: NOW });
  assert.equal(replay.outcome, "noop-replay");
  assert.equal(replay.state.revision, 7);
  assert.deepEqual(replay.state, before);
});

test("reducePhaseCompletion: status-first insertion order is not a promised v2.67 legacy noop [REQ-lifecycle-kernel-029]", () => {
  const frozen = v267GoldenEnvelope();
  assert.equal(legacyV267PayloadHash(frozen), V267_GOLDEN_LEGACY_HASH);

  // Semantically equal, but top-level insertion order starts with status.
  const statusFirst = {
    status: frozen.status,
    schema_version: frozen.schema_version,
    executive_summary: frozen.executive_summary,
    artifacts: frozen.artifacts,
    next_recommended: frozen.next_recommended,
    risks: frozen.risks,
    skill_resolution: frozen.skill_resolution,
    key_decisions: frozen.key_decisions,
  };
  const statusFirstDigest = legacyV267PayloadHash(statusFirst);
  assert.notEqual(
    statusFirstDigest,
    V267_GOLDEN_LEGACY_HASH,
    "status-first JSON.stringify digest must not match schema_version-first frozen digest",
  );

  const current = sampleState({
    revision: 7,
    phases: {
      ...sampleState().phases,
      design: {
        status: "done",
        summary: "Already projected.",
        last_payload_hash: V267_GOLDEN_LEGACY_HASH,
      },
    },
  });
  const result = reducePhaseCompletion(current, { phase: "design", envelope: statusFirst }, { now: NOW });
  assert.notEqual(
    result.outcome,
    "noop-replay",
    "status-first envelope must not be a promised legacy noop against frozen digest",
  );
  assert.equal(result.outcome, "advanced");
});

test("reducePhaseCompletion: advances persist canonical hash not legacy form [REQ-lifecycle-kernel-029]", () => {
  const envelope = v267GoldenEnvelope();
  const result = reducePhaseCompletion(sampleState(), { phase: "design", envelope }, { now: NOW });
  assert.equal(result.outcome, "advanced");
  assert.equal(result.state.phases.design.last_payload_hash, computePayloadHash(envelope));
  assert.notEqual(result.state.phases.design.last_payload_hash, V267_GOLDEN_LEGACY_HASH);
  assert.equal(legacyV267PayloadHash(envelope), V267_GOLDEN_LEGACY_HASH);
});

test("reducePhaseCompletion: canonicalizes semantically identical envelopes despite key order and escaping [REQ-hooks-023]", () => {
  const first = {
    status: "success",
    executive_summary: "Characters <>& and line separator \u2028 remain semantic content.",
    artifacts: ["design.md"],
    metadata: { z: "last", a: "first" },
  };
  const second = {
    metadata: { a: "first", z: "last" },
    artifacts: ["design.md"],
    executive_summary: "Characters <>& and line separator \u2028 remain semantic content.",
    status: "success",
  };

  const one = reducePhaseCompletion(sampleState(), { phase: "design", envelope: first }, { now: NOW });
  const two = reducePhaseCompletion(sampleState(), { phase: "design", envelope: second }, { now: NOW });

  assert.equal(one.state.phases.design.last_payload_hash, two.state.phases.design.last_payload_hash);
});

test("reducePhaseCompletion: re-exported from lifecycle-kernel/reducer.js [REQ-lifecycle-kernel-028]", () => {
  assert.equal(typeof exportedReducer, "function");
  assert.equal(exportedReducer, reducePhaseCompletion);
});

test("reducePhaseCompletion: throws typed error when options.now is absent [REQ-lifecycle-kernel-028]", () => {
  assert.throws(() => reducePhaseCompletion(sampleState(), { phase: "design", envelope: { status: "success" } }), { name: "MissingTimestampError" });
});

test("reducePhaseCompletion: distinct re-run of legacy done phase without stored hash applies [REQ-lifecycle-kernel-029]", () => {
  const current = sampleState({ phases: { design: { status: "done", summary: "Legacy summary." } } });
  const envelope = { status: "success", executive_summary: "Amended design re-run.", artifacts: "inline" };
  const result = reducePhaseCompletion(current, { phase: "design", envelope }, { now: NOW });
  assert.equal(result.outcome, "advanced");
  assert.equal(result.state.phases.design.summary, "Amended design re-run.");
});

test("reducePhaseCompletion: verify FAIL outcome projects blocked; PASS stays verified [REQ-lifecycle-kernel-029]", () => {
  const envelope = (o) => ({ status: "success", executive_summary: "Verification report produced.", artifacts: "inline", verify_outcome: o });
  const reduce = (o) => reducePhaseCompletion(sampleState(), { phase: "verify", envelope: envelope(o) }, { now: NOW });
  const fail = reduce("FAIL");
  assert.equal(fail.outcome, "blocked");
  assert.equal(fail.state.status, "blocked");
  assert.equal(fail.state.phases.verify.status, "done");
  assert.ok(fail.state.blocking_questions.length > 0);
  assert.equal(reduce("PASS WITH WARNINGS").state.status, "verified");
});

test("reducePhaseCompletion: verify phase requires explicit positive verify_outcome [REQ-lifecycle-kernel-028]", () => {
  const envelope = (outcome) => {
    const env = {
      schema_version: 1,
      status: "success",
      executive_summary: "Verification run completed.",
      artifacts: ["openspec/changes/foo/verify-report.md"],
      next_recommended: "sdd-archive",
      risks: "None",
      skill_resolution: "injected",
    };
    if (outcome !== undefined) {
      env.verify_outcome = outcome;
    }
    return env;
  };

  const reduce = (outcome) =>
    reducePhaseCompletion(sampleState(), { phase: "verify", envelope: envelope(outcome) }, { now: NOW });

  // Missing verify_outcome must project blocked
  const missing = reduce(undefined);
  assert.equal(missing.outcome, "blocked");
  assert.equal(missing.state.status, "blocked");
  assert.equal(missing.state.phases.verify.status, "done");
  assert.ok(missing.state.blocking_questions.length > 0);

  // FAIL must project blocked
  const fail = reduce("FAIL");
  assert.equal(fail.outcome, "blocked");
  assert.equal(fail.state.status, "blocked");
  assert.equal(fail.state.phases.verify.status, "done");
  assert.ok(fail.state.blocking_questions.length > 0);

  // Unknown / unallowlisted verify_outcome must project blocked
  const unknown = reduce("UNKNOWN");
  assert.equal(unknown.outcome, "blocked");
  assert.equal(unknown.state.status, "blocked");
  assert.equal(unknown.state.phases.verify.status, "done");
  assert.ok(unknown.state.blocking_questions.length > 0);

  // PASS must project verified
  const pass = reduce("PASS");
  assert.equal(pass.outcome, "advanced");
  assert.equal(pass.state.status, "verified");
  assert.equal(pass.state.phases.verify.status, "done");
  assert.deepEqual(pass.state.blocking_questions, []);

  // PASS WITH WARNINGS must project verified
  const passWarn = reduce("PASS WITH WARNINGS");
  assert.equal(passWarn.outcome, "advanced");
  assert.equal(passWarn.state.status, "verified");
  assert.equal(passWarn.state.phases.verify.status, "done");
  assert.deepEqual(passWarn.state.blocking_questions, []);
});
