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
} = require("./execution-budgets.js");

const {
  CAUSAL_CATEGORIES,
  CAUSAL_PRIORITY,
  createCausalFailure,
  resolvePrimaryFailure,
  mapLegacyRoutingTag,
} = require("./causal-failure.js");

const {
  ALLOWLISTED_TRANSITION_MATRIX,
  getAllowlistedTransitions,
  validateRecoveryTransition,
  validateRepairScope,
  requiresReconciliation,
  requiresStateResync,
} = require("./failure-recovery.js");

const {
  createKernelRuntime,
  reduceLifecycle,
  selectTransitions,
  nextTransition,
} = require("./lifecycle-kernel/index.js");

const {
  validateRecoveryHonesty,
  blockingFingerprint,
} = require("./lifecycle-kernel/recovery.js");

const {
  digestLifecycleState,
} = require("./lifecycle-kernel/state-digest.js");

const { withRuntimePermit } = require("./lifecycle-kernel/test-permit-helpers.js");

test("K5 Combined Scenario: Node execution budgets, turn decrements and exhaustion", () => {
  let state = {
    schema_version: 1,
    status: "ready",
    nodes: {
      "apply-k5": {
        id: "apply-k5",
        phase: "pending",
        attempt: 0,
        budget: {
          schema_version: 1,
          turns: 2,
          patches: 2,
          commands: 5,
          wall_time_minutes: 10,
          changed_lines: 100,
          allowed_paths: ["src/**"],
        },
      },
    },
  };

  // Turn 1
  state = reduceLifecycle(state, withRuntimePermit({
    operation: "start",
    arguments: { node_id: "apply-k5" },
  })).state;
  assert.equal(state.nodes["apply-k5"].attempt, 1);
  assert.equal(state.nodes["apply-k5"].budget.turns, 1);

  state = reduceLifecycle(state, withRuntimePermit({
    operation: "fail",
    arguments: { node_id: "apply-k5" },
    failure: createCausalFailure({
      failure_id: "f-1",
      category: "code_defect",
      code: "SYNTAX_ERROR",
      blocking_fingerprint: "fp:1",
    }),
  })).state;
  assert.equal(state.nodes["apply-k5"].phase, "failed");

  // Turn 2
  state = reduceLifecycle(state, withRuntimePermit({
    operation: "recover",
    arguments: { node_id: "apply-k5" },
  })).state;
  state = reduceLifecycle(state, withRuntimePermit({
    operation: "start",
    arguments: { node_id: "apply-k5" },
  })).state;
  assert.equal(state.nodes["apply-k5"].attempt, 2);
  assert.equal(state.nodes["apply-k5"].budget.turns, 0);
  assert.equal(state.nodes["apply-k5"].exhausted, true);

  state = reduceLifecycle(state, withRuntimePermit({
    operation: "fail",
    arguments: { node_id: "apply-k5" },
  })).state;

  // Transitions after turn exhaustion
  const next = nextTransition(state);
  assert.ok(next.kind === "decide" || next.kind === "stop" || next.kind === "escalate");
});


test("K5 Combined Scenario: Authority / Effect quotas CAS conflict and recovery allowlists", () => {
  const authBudget = {
    schema_version: 1,
    effect_attempts: 3,
    authority_mutations: 5,
    evidence_runs: 2,
    review_sweeps: 2,
  };

  const eval1 = evaluateAuthorityBudget(authBudget, {
    effect_attempts: 1,
    authority_mutations: 2,
    evidence_runs: 1,
    review_sweeps: 1,
  });
  assert.equal(eval1.exhausted, false);
  assert.equal(eval1.remaining.evidence_runs, 1);

  // CAS conflict category requires state resync and prunes blind repair
  assert.equal(requiresStateResync("cas_conflict"), true);
  assert.deepEqual(getAllowlistedTransitions("cas_conflict"), ["replan", "escalate", "stop"]);

  // Validation gap prunes repair and offers replan / escalate
  assert.deepEqual(getAllowlistedTransitions("validation_gap"), ["replan", "escalate", "stop"]);
});

test("K5 Combined Scenario: Mixed causal failures priority determinism", () => {
  const mixed = [
    createCausalFailure({ failure_id: "c1", category: "code_defect", code: "UNIT_FAIL" }),
    createCausalFailure({ failure_id: "c2", category: "environment_tooling", code: "TOOL_MISSING" }),
    createCausalFailure({ failure_id: "c3", category: "ambiguous_effect", code: "EFFECT_UNKNOWN" }),
  ];

  const primary = resolvePrimaryFailure(mixed);
  assert.equal(primary.category, "environment_tooling");
  assert.equal(primary.priority, 1);
});

test("K5 Combined Scenario: Zero-delta mutations and telemetry isolation", () => {
  assert.equal(
    isZeroDeltaMutation({ modifiedFilesCount: 0, changedLines: 0, stateAdvanced: false }),
    true
  );
  assert.equal(
    isZeroDeltaMutation({ modifiedFilesCount: 1, changedLines: 10, stateAdvanced: false }),
    false
  );

  const cleanState = {
    schema_version: 1,
    status: "ready",
    nodes: { n1: { id: "n1", phase: "pending", attempt: 0 } },
  };
  const noisyState = {
    schema_version: 1,
    status: "ready",
    telemetry: { wall_clock_ms: 5000, mem_mb: 256 },
    consumption: { tokens: 1000 },
    nodes: { n1: { id: "n1", phase: "pending", attempt: 0, wall_clock_ms: 120 } },
  };

  assert.equal(
    digestLifecycleState(cleanState),
    digestLifecycleState(noisyState)
  );
});

test("K5 Combined Scenario: Bounded repair scope validation", () => {
  const scope = {
    node_ids: ["fix-bug"],
    allowed_paths: ["lib/**/*.js"],
    finding_ids: ["F1", "F2"],
  };

  const valid = validateRepairScope({
    scope,
    targetNodeId: "fix-bug",
    modifiedPaths: ["lib/utils.js"],
    resolvedFindingIds: ["F1"],
  });
  assert.equal(valid.ok, true);

  const invalid = validateRepairScope({
    scope,
    targetNodeId: "wrong-node",
    modifiedPaths: ["docs/readme.md"],
    resolvedFindingIds: ["F3"],
  });
  assert.equal(invalid.ok, false);
  assert.equal(invalid.violations.length, 3);
});
