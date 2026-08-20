"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  ALLOWLISTED_TRANSITION_MATRIX,
  getAllowlistedTransitions,
  validateRecoveryTransition,
  validateRepairScope,
  requiresReconciliation,
  requiresStateResync,
} = require("./failure-recovery.js");

test("ALLOWLISTED_TRANSITION_MATRIX: maps each causal failure category to exact allowlisted transitions", () => {
  assert.deepEqual(ALLOWLISTED_TRANSITION_MATRIX.code_defect, ["repair", "replan", "escalate", "stop"]);
  assert.deepEqual(ALLOWLISTED_TRANSITION_MATRIX.validation_gap, ["replan", "escalate", "stop"]);
  assert.deepEqual(ALLOWLISTED_TRANSITION_MATRIX.ambiguous_effect, ["escalate", "stop"]);
  assert.deepEqual(ALLOWLISTED_TRANSITION_MATRIX.cas_conflict, ["replan", "escalate", "stop"]);
  assert.deepEqual(ALLOWLISTED_TRANSITION_MATRIX.environment_tooling, ["replan", "escalate", "stop"]);
});

test("getAllowlistedTransitions: prunes repair when attempts budget is exhausted", () => {
  const withAttempts = getAllowlistedTransitions("code_defect", { remainingAttempts: 2 });
  assert.deepEqual(withAttempts, ["repair", "replan", "escalate", "stop"]);

  const zeroAttempts = getAllowlistedTransitions("code_defect", { remainingAttempts: 0 });
  assert.deepEqual(zeroAttempts, ["replan", "escalate", "stop"]);
});

test("validateRecoveryTransition: validates operations against allowlist and rejects forbidden transitions", () => {
  // Code defect permits repair when attempts > 0
  assert.equal(validateRecoveryTransition("code_defect", "repair", { remainingAttempts: 1 }).ok, true);

  // Validation gap rejects repair
  const gapRepair = validateRecoveryTransition("validation_gap", "repair");
  assert.equal(gapRepair.ok, false);
  assert.equal(gapRepair.code, "UNALLOWLISTED_RECOVERY_OPERATION");

  // Ambiguous effect rejects repair and replan
  const ambRepair = validateRecoveryTransition("ambiguous_effect", "repair");
  assert.equal(ambRepair.ok, false);
  const ambReplan = validateRecoveryTransition("ambiguous_effect", "replan");
  assert.equal(ambReplan.ok, false);
  const ambEscalate = validateRecoveryTransition("ambiguous_effect", "escalate");
  assert.equal(ambEscalate.ok, true);

  // Unknown operation rejected
  assert.equal(validateRecoveryTransition("code_defect", "arbitrary_retry").ok, false);
});

test("validateRepairScope: validates targetNodeId, modifiedPaths, and finding_ids against bounded scope", () => {
  const scope = {
    node_ids: ["node-apply-auth"],
    allowed_paths: ["src/auth/**", "tests/auth/**"],
    finding_ids: ["F-001", "F-002"],
  };

  // Valid repair within bounds
  const valid = validateRepairScope({
    scope,
    targetNodeId: "node-apply-auth",
    modifiedPaths: ["src/auth/jwt.js"],
    resolvedFindingIds: ["F-001"],
  });
  assert.equal(valid.ok, true);
  assert.deepEqual(valid.violations, []);

  // Node ID out of scope
  const invalidNode = validateRepairScope({
    scope,
    targetNodeId: "node-apply-billing",
    modifiedPaths: ["src/auth/jwt.js"],
    resolvedFindingIds: ["F-001"],
  });
  assert.equal(invalidNode.ok, false);
  assert.ok(invalidNode.violations.some((v) => v.includes("node-apply-billing")));

  // Path out of scope
  const invalidPath = validateRepairScope({
    scope,
    targetNodeId: "node-apply-auth",
    modifiedPaths: ["src/billing/invoice.js"],
    resolvedFindingIds: ["F-001"],
  });
  assert.equal(invalidPath.ok, false);
  assert.ok(invalidPath.violations.some((v) => v.includes("src/billing/invoice.js")));

  // Finding ID out of scope
  const invalidFinding = validateRepairScope({
    scope,
    targetNodeId: "node-apply-auth",
    modifiedPaths: ["src/auth/jwt.js"],
    resolvedFindingIds: ["F-999"],
  });
  assert.equal(invalidFinding.ok, false);
  assert.ok(invalidFinding.violations.some((v) => v.includes("F-999")));
});

test("requiresReconciliation and requiresStateResync enforce non-mutation policies", () => {
  assert.equal(requiresReconciliation("ambiguous_effect"), true);
  assert.equal(requiresReconciliation("code_defect"), false);

  assert.equal(requiresStateResync("cas_conflict"), true);
  assert.equal(requiresStateResync("environment_tooling"), false);
});

test("validateRepairScope: fails closed strictly when scope is empty, null, or missing bounding arrays", () => {
  // Empty scope object with targets
  const emptyScope = validateRepairScope({
    scope: {},
    targetNodeId: "n1",
    modifiedPaths: ["src/foo.js"],
    resolvedFindingIds: ["F-1"],
  });
  assert.equal(emptyScope.ok, false);
  assert.ok(emptyScope.violations.length >= 3);

  // Null/non-object scope
  const nullScope = validateRepairScope({
    scope: null,
    targetNodeId: "n1",
  });
  assert.equal(nullScope.ok, false);

  const arrayScope = validateRepairScope({
    scope: [],
    targetNodeId: "n1",
  });
  assert.equal(arrayScope.ok, false);
});
