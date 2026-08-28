"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const { loadSchemaById, validateInstance } = require("../kernel-schema-validator.js");
const { createChallengePlan } = require("./planner.js");
const { executeChallengePlan, emitChallengeResult } = require("./runner.js");

const ROOT = path.resolve(__dirname, "../../..");
const resultSchema = loadSchemaById("ospec://schemas/kernel/challenge-result/v1", { rootDir: ROOT });

const SAMPLE_CANDIDATE_ID = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const SAMPLE_POLICY_ID = "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

test("REQ-adversarial-challenges-004: emitChallengeResult produces deterministic and valid result", () => {
  const res1 = emitChallengeResult({
    planId: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
    candidateId: SAMPLE_CANDIDATE_ID,
    challengeType: "focal-mutation",
    outcome: "passed",
    nodeId: "repair-focal",
    evidenceIds: ["sha256:2222222222222222222222222222222222222222222222222222222222222222"],
    details: { defects_detected: 2 },
  });

  const res2 = emitChallengeResult({
    planId: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
    candidateId: SAMPLE_CANDIDATE_ID,
    challengeType: "focal-mutation",
    outcome: "passed",
    nodeId: "repair-focal",
    evidenceIds: ["sha256:2222222222222222222222222222222222222222222222222222222222222222"],
    details: { defects_detected: 2 },
  });

  assert.equal(res1.result_id, res2.result_id);
  assert.match(res1.result_id, /^sha256:[a-f0-9]{64}$/);

  const val = validateInstance(resultSchema, res1);
  assert.equal(val.valid, true, `Result must match schema: ${JSON.stringify(val.errors)}`);
});

test("REQ-adversarial-challenges-004: executeChallengePlan detects seeded defects and passes", async () => {
  const plan = createChallengePlan({
    candidateId: SAMPLE_CANDIDATE_ID,
    policySnapshotId: SAMPLE_POLICY_ID,
    evidenceStrategy: "feature",
  }); // selected: ["independent-acceptance", "focal-mutation"]

  const context = {
    sourceCode: "function add(a, b) {\n  return a + b;\n}",
    targetLines: [2],
    // Test runner returns failed (exitCode 1) when mutated code has defect -> defect caught
    runTests: async (code) => {
      if (code.includes("-")) {
        return { pass: false, exitCode: 1 }; // Defect detected!
      }
      return { pass: true, exitCode: 0 };
    },
    runAcceptance: async () => ({ pass: true, outcome: "passed" }),
  };

  const outcome = await executeChallengePlan(plan, context);
  assert.equal(outcome.ok, true);
  assert.equal(outcome.results.length, 2);

  const focalRes = outcome.results.find((r) => r.challenge_type === "focal-mutation");
  assert.ok(focalRes);
  assert.equal(focalRes.outcome, "passed");

  for (const res of outcome.results) {
    const val = validateInstance(resultSchema, res);
    assert.equal(val.valid, true);
  }
});

test("REQ-adversarial-challenges-004: executeChallengePlan flags complacent test suite", async () => {
  const plan = createChallengePlan({
    candidateId: SAMPLE_CANDIDATE_ID,
    policySnapshotId: SAMPLE_POLICY_ID,
    evidenceStrategy: "feature",
  });

  const context = {
    sourceCode: "function add(a, b) {\n  return a + b;\n}",
    targetLines: [2],
    // Complacent test suite: always passes even on mutated code
    runTests: async () => ({ pass: true, exitCode: 0 }),
    runAcceptance: async () => ({ pass: true, outcome: "passed" }),
  };

  const outcome = await executeChallengePlan(plan, context);
  assert.equal(outcome.ok, true);

  const focalRes = outcome.results.find((r) => r.challenge_type === "focal-mutation");
  assert.ok(focalRes);
  assert.equal(focalRes.outcome, "failed");
  assert.equal(focalRes.details.reason, "COMPLACENT_TEST_DETECTED");
});

test("REQ-adversarial-challenges-004: executeChallengePlan detects tautological test assertions", async () => {
  const plan = createChallengePlan({
    candidateId: SAMPLE_CANDIDATE_ID,
    policySnapshotId: SAMPLE_POLICY_ID,
    evidenceStrategy: "config-docs",
  }); // selected: ["structural-validation", "test-inspection"]

  const context = {
    testSourceCode: "test('tautological', () => { assert.equal(true, true); });",
    validateStructure: async () => ({ pass: true }),
  };

  const outcome = await executeChallengePlan(plan, context);
  assert.equal(outcome.ok, true);

  const inspectionRes = outcome.results.find((r) => r.challenge_type === "test-inspection");
  assert.ok(inspectionRes);
  assert.equal(inspectionRes.outcome, "failed");
  assert.equal(inspectionRes.details.reason, "TAUTOLOGICAL_TEST_DETECTED");
});

test("REQ-adversarial-challenges-003: executeChallengePlan halts on budget exhaustion", async () => {
  const plan = createChallengePlan({
    candidateId: SAMPLE_CANDIDATE_ID,
    policySnapshotId: SAMPLE_POLICY_ID,
    evidenceStrategy: "feature",
    budgetOverrides: {
      max_challenges: 1, // Only 1 allowed, but plan has 2 selected
    },
  });

  const context = {
    runAcceptance: async () => ({ pass: true }),
    runTests: async () => ({ pass: false }),
    sourceCode: "return a + b;",
  };

  const outcome = await executeChallengePlan(plan, context);
  assert.equal(outcome.ok, false);
  assert.ok(outcome.causalFailure);
  assert.equal(outcome.causalFailure.code, "CHALLENGE_BUDGET_EXHAUSTED");
  assert.equal(outcome.causalFailure.category, "validation_gap");
  assert.equal(outcome.causalFailure.details.exhausted_dimension, "max_challenges");
});
