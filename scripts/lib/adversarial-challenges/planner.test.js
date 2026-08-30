"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const { loadSchemaById, validateInstance } = require("../kernel-schema-validator.js");
const {
  createChallengePlan,
  STRATEGY_CHALLENGE_SELECTION,
  DEFAULT_CHALLENGE_BUDGET,
} = require("./planner.js");
const { CHALLENGE_TYPES } = require("./catalog.js");

const ROOT = path.resolve(__dirname, "../../..");
const planSchema = loadSchemaById("ospec://schemas/kernel/challenge-plan/v1", { rootDir: ROOT });

const SAMPLE_CANDIDATE_ID = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const SAMPLE_POLICY_ID = "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const SAMPLE_NODE_ID = "repair-focal";

test("REQ-adversarial-challenges-002: Proportional plan generated for bug strategy", () => {
  const plan = createChallengePlan({
    candidateId: SAMPLE_CANDIDATE_ID,
    nodeId: SAMPLE_NODE_ID,
    policySnapshotId: SAMPLE_POLICY_ID,
    evidenceStrategy: "bug",
  });

  assert.equal(plan.evidence_strategy, "bug");
  assert.deepEqual(plan.selected, ["revert", "regression-acceptance"]);
  assert.equal(plan.skipped.length, 7);

  // Every non-selected challenge type must be in skipped
  const skippedTypes = plan.skipped.map((s) => s.challenge_type);
  for (const type of CHALLENGE_TYPES) {
    if (!plan.selected.includes(type)) {
      assert.ok(skippedTypes.includes(type), `Omitted type ${type} must be in skipped`);
      const entry = plan.skipped.find((s) => s.challenge_type === type);
      assert.ok(entry.reason && entry.reason.length > 0, `Omitted type ${type} must have explicit reason`);
    }
  }

  const valRes = validateInstance(planSchema, plan);
  assert.equal(valRes.valid, true, `Generated bug plan must be schema valid: ${JSON.stringify(valRes.errors)}`);
});

test("REQ-adversarial-challenges-002: Proportional plan generated for refactor strategy", () => {
  const plan = createChallengePlan({
    candidateId: SAMPLE_CANDIDATE_ID,
    nodeId: SAMPLE_NODE_ID,
    policySnapshotId: SAMPLE_POLICY_ID,
    evidenceStrategy: "refactor",
  });

  assert.equal(plan.evidence_strategy, "refactor");
  assert.deepEqual(plan.selected, ["behavior-equivalence", "focal-mutation"]);
  assert.equal(plan.skipped.some((s) => s.challenge_type === "revert"), true);

  const valRes = validateInstance(planSchema, plan);
  assert.equal(valRes.valid, true, `Generated refactor plan must be schema valid: ${JSON.stringify(valRes.errors)}`);
});

test("REQ-adversarial-challenges-002: Proportional plan generated for migration strategy", () => {
  const plan = createChallengePlan({
    candidateId: SAMPLE_CANDIDATE_ID,
    nodeId: SAMPLE_NODE_ID,
    policySnapshotId: SAMPLE_POLICY_ID,
    evidenceStrategy: "migration",
  });

  assert.equal(plan.evidence_strategy, "migration");
  assert.deepEqual(plan.selected, ["rollback", "compatibility-acceptance"]);

  const valRes = validateInstance(planSchema, plan);
  assert.equal(valRes.valid, true, `Generated migration plan must be schema valid: ${JSON.stringify(valRes.errors)}`);
});

test("REQ-adversarial-challenges-002: Proportional plan generated for config-docs strategy", () => {
  const plan = createChallengePlan({
    candidateId: SAMPLE_CANDIDATE_ID,
    nodeId: SAMPLE_NODE_ID,
    policySnapshotId: SAMPLE_POLICY_ID,
    evidenceStrategy: "config-docs",
  });

  assert.equal(plan.evidence_strategy, "config-docs");
  assert.deepEqual(plan.selected, ["structural-validation", "test-inspection"]);

  const valRes = validateInstance(planSchema, plan);
  assert.equal(valRes.valid, true, `Generated config-docs plan must be schema valid: ${JSON.stringify(valRes.errors)}`);
});

test("REQ-adversarial-challenges-002: Proportional plan generated for feature and strict-tdd strategies", () => {
  const featurePlan = createChallengePlan({
    candidateId: SAMPLE_CANDIDATE_ID,
    nodeId: SAMPLE_NODE_ID,
    policySnapshotId: SAMPLE_POLICY_ID,
    evidenceStrategy: "feature",
  });
  assert.deepEqual(featurePlan.selected, ["independent-acceptance", "focal-mutation"]);
  assert.equal(validateInstance(planSchema, featurePlan).valid, true);

  const strictPlan = createChallengePlan({
    candidateId: SAMPLE_CANDIDATE_ID,
    nodeId: SAMPLE_NODE_ID,
    policySnapshotId: SAMPLE_POLICY_ID,
    evidenceStrategy: "strict-tdd",
  });
  assert.deepEqual(strictPlan.selected, ["independent-acceptance", "focal-mutation"]);
  assert.equal(validateInstance(planSchema, strictPlan).valid, true);
});

test("REQ-adversarial-challenges-002: Identical inputs yield deterministic ChallengePlan and plan_id", () => {
  const plan1 = createChallengePlan({
    candidateId: SAMPLE_CANDIDATE_ID,
    nodeId: SAMPLE_NODE_ID,
    policySnapshotId: SAMPLE_POLICY_ID,
    evidenceStrategy: "bug",
  });

  const plan2 = createChallengePlan({
    candidateId: SAMPLE_CANDIDATE_ID,
    nodeId: SAMPLE_NODE_ID,
    policySnapshotId: SAMPLE_POLICY_ID,
    evidenceStrategy: "bug",
  });

  assert.equal(plan1.plan_id, plan2.plan_id);
  assert.deepEqual(plan1, plan2);
  assert.match(plan1.plan_id, /^sha256:[a-f0-9]{64}$/);
});

test("REQ-adversarial-challenges-002: Budget overrides are respected and bounded", () => {
  const customPlan = createChallengePlan({
    candidateId: SAMPLE_CANDIDATE_ID,
    nodeId: SAMPLE_NODE_ID,
    policySnapshotId: SAMPLE_POLICY_ID,
    evidenceStrategy: "bug",
    budgetOverrides: {
      max_challenges: 5,
      mutation_budget: 20,
      timeout_seconds: 120,
    },
  });

  assert.equal(customPlan.budget.max_challenges, 5);
  assert.equal(customPlan.budget.mutation_budget, 20);
  assert.equal(customPlan.budget.timeout_seconds, 120);
  assert.equal(validateInstance(planSchema, customPlan).valid, true);
});
