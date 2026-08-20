"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  CAUSAL_CATEGORIES,
  CAUSAL_PRIORITY,
  createCausalFailure,
  mapLegacyRoutingTag,
  resolvePrimaryFailure,
} = require("./causal-failure.js");

test("CAUSAL_CATEGORIES and CAUSAL_PRIORITY establish deterministic 5-category ranking", () => {
  assert.equal(CAUSAL_CATEGORIES.ENVIRONMENT_TOOLING, "environment_tooling");
  assert.equal(CAUSAL_CATEGORIES.CAS_CONFLICT, "cas_conflict");
  assert.equal(CAUSAL_CATEGORIES.AMBIGUOUS_EFFECT, "ambiguous_effect");
  assert.equal(CAUSAL_CATEGORIES.VALIDATION_GAP, "validation_gap");
  assert.equal(CAUSAL_CATEGORIES.CODE_DEFECT, "code_defect");

  assert.equal(CAUSAL_PRIORITY.environment_tooling, 1);
  assert.equal(CAUSAL_PRIORITY.cas_conflict, 2);
  assert.equal(CAUSAL_PRIORITY.ambiguous_effect, 3);
  assert.equal(CAUSAL_PRIORITY.validation_gap, 4);
  assert.equal(CAUSAL_PRIORITY.code_defect, 5);
});

test("createCausalFailure: constructs valid descriptor with automatic priority mapping", () => {
  const failure = createCausalFailure({
    failure_id: "fail-tool-01",
    category: "environment_tooling",
    code: "TOOL_PROCESS_CRASH",
    blocking_fingerprint: "fp:crash-sigkill",
    details: { pid: 1234, exitCode: 137 },
  });

  assert.deepEqual(failure, {
    schema_version: 1,
    failure_id: "fail-tool-01",
    category: "environment_tooling",
    code: "TOOL_PROCESS_CRASH",
    priority: 1,
    blocking_fingerprint: "fp:crash-sigkill",
    details: { pid: 1234, exitCode: 137 },
  });
});

test("mapLegacyRoutingTag: maps legacy verify routing tags to canonical categories and codes", () => {
  assert.deepEqual(mapLegacyRoutingTag("spec"), {
    category: "validation_gap",
    code: "SPEC_REQUIREMENTS_AMBIGUOUS",
  });

  assert.deepEqual(mapLegacyRoutingTag("design"), {
    category: "validation_gap",
    code: "DESIGN_CONTRACT_MISMATCH",
  });

  assert.deepEqual(mapLegacyRoutingTag("tasks"), {
    category: "validation_gap",
    code: "TASK_DECOMPOSITION_GAP",
  });

  assert.deepEqual(mapLegacyRoutingTag("code"), {
    category: "code_defect",
    code: "CODE_IMPLEMENTATION_DEFECT",
  });

  assert.deepEqual(mapLegacyRoutingTag("evidence-format"), {
    category: "validation_gap",
    code: "VERIFY_EVIDENCE_FORMAT_INVALID",
  });
});

test("resolvePrimaryFailure: deterministically resolves highest-priority failure from mixed sets", () => {
  const defectFailure = createCausalFailure({
    failure_id: "f-defect-1",
    category: "code_defect",
    code: "TEST_ASSERTION_FAILED",
    blocking_fingerprint: "fp:defect",
  });

  const toolTimeout = createCausalFailure({
    failure_id: "f-tool-1",
    category: "environment_tooling",
    code: "TOOL_TIMEOUT",
    blocking_fingerprint: "fp:timeout",
  });

  const casRace = createCausalFailure({
    failure_id: "f-cas-1",
    category: "cas_conflict",
    code: "CAS_REVISION_MISMATCH",
    blocking_fingerprint: "fp:cas",
  });

  const gapFailure = createCausalFailure({
    failure_id: "f-gap-1",
    category: "validation_gap",
    code: "SPEC_REQUIREMENTS_AMBIGUOUS",
    blocking_fingerprint: "fp:gap",
  });

  // Mixed: defect + toolTimeout -> toolTimeout wins (P1 > P5)
  const primary1 = resolvePrimaryFailure([defectFailure, toolTimeout]);
  assert.equal(primary1.failure_id, "f-tool-1");
  assert.equal(primary1.category, "environment_tooling");

  // Mixed: defect + gap + cas -> cas wins (P2 > P4 > P5)
  const primary2 = resolvePrimaryFailure([defectFailure, gapFailure, casRace]);
  assert.equal(primary2.failure_id, "f-cas-1");
  assert.equal(primary2.category, "cas_conflict");

  // Tie-breaker on identical priority uses failure_id
  const toolA = createCausalFailure({
    failure_id: "f-tool-a",
    category: "environment_tooling",
    code: "TOOL_TIMEOUT",
    blocking_fingerprint: "fp:t1",
  });
  const toolB = createCausalFailure({
    failure_id: "f-tool-b",
    category: "environment_tooling",
    code: "TOOL_TIMEOUT",
    blocking_fingerprint: "fp:t2",
  });

  const primaryTie = resolvePrimaryFailure([toolB, toolA]);
  assert.equal(primaryTie.failure_id, "f-tool-a");
});

test("resolvePrimaryFailure: returns null for empty or invalid input", () => {
  assert.equal(resolvePrimaryFailure([]), null);
  assert.equal(resolvePrimaryFailure(null), null);
});
