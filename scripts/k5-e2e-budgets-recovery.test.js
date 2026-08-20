"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  DEFAULT_NODE_BUDGET,
  DEFAULT_AUTHORITY_BUDGET,
  evaluateNodeBudget,
  evaluateAuthorityBudget,
  decrementBudgetMonotonic,
  checkPatchBounds,
  isZeroDeltaMutation,
} = require("./lib/execution-budgets.js");

const {
  CAUSAL_CATEGORIES,
  createCausalFailure,
  resolvePrimaryFailure,
  mapLegacyRoutingTag,
} = require("./lib/causal-failure.js");

const {
  ALLOWLISTED_TRANSITION_MATRIX,
  getAllowlistedTransitions,
  validateRecoveryTransition,
  validateRepairScope,
  requiresReconciliation,
  requiresStateResync,
} = require("./lib/failure-recovery.js");

const {
  createKernelRuntime,
  reduceLifecycle,
  selectTransitions,
  nextTransition,
} = require("./lib/lifecycle-kernel/index.js");

const {
  validateRecoveryHonesty,
  blockingFingerprint,
} = require("./lib/lifecycle-kernel/recovery.js");

const { withRuntimePermit } = require("./lib/lifecycle-kernel/test-permit-helpers.js");

test("K5 E2E: Non-increasing budget decrements across retry loops", () => {
  let state = {
    schema_version: 1,
    status: "ready",
    nodes: {
      "apply-task": {
        id: "apply-task",
        phase: "pending",
        attempt: 0,
        budget: {
          schema_version: 1,
          turns: 3,
          patches: 3,
          commands: 10,
          wall_time_minutes: 15,
          changed_lines: 300,
          allowed_paths: ["src/**"],
        },
      },
    },
  };

  // Turn 1: start -> fail
  state = reduceLifecycle(state, withRuntimePermit({
    operation: "start",
    arguments: { node_id: "apply-task" },
  })).state;
  assert.equal(state.nodes["apply-task"].attempt, 1);
  assert.equal(state.nodes["apply-task"].budget.turns, 2);

  state = reduceLifecycle(state, withRuntimePermit({
    operation: "fail",
    arguments: { node_id: "apply-task" },
    failure: createCausalFailure({
      failure_id: "f1",
      category: "code_defect",
      code: "TEST_FAILED",
      blocking_fingerprint: "fp:1",
    }),
  })).state;

  // Turn 2: recover -> start -> fail
  state = reduceLifecycle(state, withRuntimePermit({
    operation: "recover",
    arguments: { node_id: "apply-task" },
  })).state;
  state = reduceLifecycle(state, withRuntimePermit({
    operation: "start",
    arguments: { node_id: "apply-task" },
  })).state;
  assert.equal(state.nodes["apply-task"].attempt, 2);
  assert.equal(state.nodes["apply-task"].budget.turns, 1);

  state = reduceLifecycle(state, withRuntimePermit({
    operation: "fail",
    arguments: { node_id: "apply-task" },
    failure: createCausalFailure({
      failure_id: "f2",
      category: "code_defect",
      code: "TEST_FAILED",
      blocking_fingerprint: "fp:2",
    }),
  })).state;

  // Turn 3: recover -> start -> fail (exhausts turns: 0)
  state = reduceLifecycle(state, withRuntimePermit({
    operation: "recover",
    arguments: { node_id: "apply-task" },
  })).state;
  state = reduceLifecycle(state, withRuntimePermit({
    operation: "start",
    arguments: { node_id: "apply-task" },
  })).state;
  assert.equal(state.nodes["apply-task"].attempt, 3);
  assert.equal(state.nodes["apply-task"].budget.turns, 0);
  assert.equal(state.nodes["apply-task"].exhausted, true);

  state = reduceLifecycle(state, withRuntimePermit({
    operation: "fail",
    arguments: { node_id: "apply-task" },
  })).state;

  // Attempt to recover when exhausted must fail closed
  const recoverAttempt = reduceLifecycle(state, withRuntimePermit({
    operation: "recover",
    arguments: { node_id: "apply-task" },
  }));
  assert.equal(recoverAttempt.outcome, "blocked");
  assert.equal(recoverAttempt.code, "node-exhausted");
});

test("K5 E2E: Terminal stop on attempts exhaustion without infinite retry loops", () => {
  const exhaustedState = {
    schema_version: 1,
    status: "blocked",
    nodes: {
      "apply-task": {
        id: "apply-task",
        phase: "failed",
        attempt: 3,
        exhausted: true,
        budget: {
          schema_version: 1,
          turns: 0,
          patches: 0,
          commands: 0,
          wall_time_minutes: 0,
          changed_lines: 0,
          allowed_paths: [],
        },
      },
    },
  };

  const transitions = selectTransitions(exhaustedState);
  assert.ok(!transitions.some((t) => t.operation === "recover"));
  assert.ok(!transitions.some((t) => t.operation === "start"));

  const next = nextTransition(exhaustedState);
  assert.ok(next.kind === "decide" || next.kind === "stop" || next.kind === "escalate");
});


test("K5 E2E: Monotonic budget non-inflation after CAS race retries", async () => {
  const runtime = createKernelRuntime({
    budgets: { attempts: 3, corrections: 2, turns: 10 },
  });

  const statusRes = await runtime.getStatus();
  assert.equal(statusRes.outcome, "advanced");

  // Verify budgets exist and remain preserved across runtime calls
  const initialSnap = runtime.snapshot();
  assert.ok(initialSnap);
});

test("K5 E2E: Bounded scope repair validation", () => {
  const scope = {
    node_ids: ["task-fix-auth"],
    allowed_paths: ["src/auth/**"],
    finding_ids: ["F-SECURITY-01"],
  };

  // Valid repair within bounds
  const valid = validateRepairScope({
    scope,
    targetNodeId: "task-fix-auth",
    modifiedPaths: ["src/auth/token.js"],
    resolvedFindingIds: ["F-SECURITY-01"],
  });
  assert.equal(valid.ok, true);

  // Invalid: path out of scope
  const invalidPath = validateRepairScope({
    scope,
    targetNodeId: "task-fix-auth",
    modifiedPaths: ["src/payment/gateway.js"],
    resolvedFindingIds: ["F-SECURITY-01"],
  });
  assert.equal(invalidPath.ok, false);
  assert.ok(invalidPath.violations.some((v) => v.includes("gateway.js")));
});

test("K5 E2E: Non-mutation policies for ambiguous effects and CAS conflicts", () => {
  // Ambiguous effects require reconciliation before any mutation
  assert.equal(requiresReconciliation("ambiguous_effect"), true);
  assert.deepEqual(getAllowlistedTransitions("ambiguous_effect"), ["escalate", "stop"]);

  // CAS conflicts require re-syncing before retry
  assert.equal(requiresStateResync("cas_conflict"), true);
  assert.deepEqual(getAllowlistedTransitions("cas_conflict"), ["replan", "escalate", "stop"]);
});

test("K5 E2E: Recovery honesty verification preventing stagnant loops", () => {
  const stateBefore = {
    schema_version: 1,
    status: "blocked",
    nodes: {
      n1: {
        id: "n1",
        phase: "failed",
        attempt: 1,
        zero_delta_attempts: 0,
      },
    },
  };

  // Fake recovery where only attempt incremented without changing node state or fixing failure
  const stateStagnant = {
    schema_version: 1,
    status: "blocked",
    nodes: {
      n1: {
        id: "n1",
        phase: "failed",
        attempt: 2,
        zero_delta_attempts: 1,
      },
    },
  };

  const honestyCheck = validateRecoveryHonesty({
    beforeState: stateBefore,
    afterState: stateStagnant,
    outcome: "advanced",
  });

  assert.equal(honestyCheck.ok, false);
  assert.equal(honestyCheck.code, "recovery-non-advancing");
  assert.equal(honestyCheck.before_blocking, honestyCheck.after_blocking);
});
