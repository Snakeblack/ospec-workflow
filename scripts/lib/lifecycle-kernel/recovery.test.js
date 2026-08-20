"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  validateRecoveryHonesty,
  selectHonestTransitions,
} = require("./recovery.js");
const { digestLifecycleState } = require("./state-digest.js");
const { runHarnessScenario } = require("../minimal-kernel-harness.js");

test("syntactically valid recovery that returns same blocking digest fails honesty", () => {
  const before = {
    schema_version: 1,
    status: "blocked",
    nodes: { n1: { id: "n1", phase: "failed", attempt: 1 } },
  };
  const after = {
    schema_version: 1,
    status: "blocked",
    nodes: { n1: { id: "n1", phase: "failed", attempt: 2 } },
  };
  const result = validateRecoveryHonesty({
    beforeState: before,
    afterState: after,
    outcome: "advanced",
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, "recovery-non-advancing");
  assert.equal(result.before_digest, digestLifecycleState(before));
});

test("recovery that advances digest is honest", () => {
  const before = {
    schema_version: 1,
    status: "blocked",
    nodes: { n1: { id: "n1", phase: "failed", attempt: 1 } },
  };
  const after = {
    schema_version: 1,
    status: "ready",
    nodes: { n1: { id: "n1", phase: "pending", attempt: 1 } },
  };
  const result = validateRecoveryHonesty({
    beforeState: before,
    afterState: after,
    outcome: "advanced",
  });
  assert.equal(result.ok, true);
  assert.notEqual(result.before_digest, result.after_digest);
});

test("recovery that reaches terminal is honest", () => {
  const before = {
    schema_version: 1,
    status: "blocked",
    nodes: { n1: { id: "n1", phase: "failed", attempt: 1 } },
  };
  const after = {
    schema_version: 1,
    status: "terminal",
    nodes: { n1: { id: "n1", phase: "terminal", attempt: 1, exhausted: true } },
  };
  const result = validateRecoveryHonesty({
    beforeState: before,
    afterState: after,
    outcome: "terminal",
  });
  assert.equal(result.ok, true);
});

test("selectHonestTransitions replaces non-advancing recover with decide/stop", () => {
  const state = {
    schema_version: 1,
    status: "blocked",
    nodes: { n1: { id: "n1", phase: "failed", attempt: 1, dead_end_recover: true } },
  };
  const transitions = selectHonestTransitions(state, {
    probeRecovery: () => ({
      afterState: state,
      outcome: "advanced",
    }),
  });
  assert.ok(transitions.every((t) => t.operation !== "recover"));
  assert.ok(transitions.some((t) => t.kind === "decide" || t.kind === "stop"));
});

test("harness recover fixture advances digest (recoverable triangulation)", async () => {
  const before = {
    schema_version: 1,
    status: "blocked",
    nodes: { n1: { id: "n1", phase: "failed", attempt: 1 } },
  };
  const beforeDigest = digestLifecycleState(before);
  const result = await runHarnessScenario({
    id: "recovery-advances",
    initialState: before,
    operations: [{ operation: "recover", arguments: { node_id: "n1" } }],
  });
  assert.notEqual(result.final_state_digest, beforeDigest);
  assert.equal(result.snapshot.state.nodes.n1.phase, "pending");
});

test("exhausted failure exposes decide not recover (human-decision triangulation)", async () => {
  const result = await runHarnessScenario({
    id: "recovery-exhausted-decide",
    initialState: {
      schema_version: 1,
      status: "blocked",
      nodes: { n1: { id: "n1", phase: "failed", attempt: 3, exhausted: true } },
    },
    operations: [{ operation: "status" }],
  });
  assert.equal(result.next_transition.kind, "decide");
  assert.ok(!result.transitions.some((t) => t.operation === "recover"));
});

test("validateRecoveryHonesty fails closed when causalFailure is ambiguous_effect without reconciliation", () => {
  const before = {
    schema_version: 1,
    status: "blocked",
    nodes: { n1: { id: "n1", phase: "failed", attempt: 1 } },
  };
  const after = {
    schema_version: 1,
    status: "ready",
    nodes: { n1: { id: "n1", phase: "pending", attempt: 1 } },
  };

  const result = validateRecoveryHonesty({
    beforeState: before,
    afterState: after,
    outcome: "advanced",
    causalFailure: { category: "ambiguous_effect", code: "UNKNOWN_OUTCOME" },
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, "ambiguous-effect-unresolved");
});

test("blockingFingerprint ignores transient telemetry and zero_delta_attempts counters", () => {
  const { blockingFingerprint } = require("./recovery.js");
  const state1 = {
    schema_version: 1,
    status: "running",
    nodes: {
      n1: {
        id: "n1",
        phase: "started",
        attempt: 1,
        zero_delta_attempts: 0,
        telemetry: { duration_ms: 100 },
        consumption: { turns: 1 },
      },
    },
  };
  const state2 = {
    schema_version: 1,
    status: "running",
    nodes: {
      n1: {
        id: "n1",
        phase: "started",
        attempt: 2,
        zero_delta_attempts: 1,
        telemetry: { duration_ms: 5000 },
        consumption: { turns: 2 },
      },
    },
  };

  assert.equal(blockingFingerprint(state1), blockingFingerprint(state2));
});
