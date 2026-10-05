"use strict";

// Test fixtures for K6c challenge plans and results. The live verifier and
// Assurance Graph still read challenge evidence (integrity.js), but no runtime
// produces it since E1.5 retired the planner and runner; these builders keep
// the plan selection table and the result shape for their tests.

const { CHALLENGE_TYPES } = require("../adversarial-challenges/catalog.js");
const { computeChallengePlanId, computeChallengeResultId } = require("../adversarial-challenges/integrity.js");

const STRATEGY_CHALLENGE_SELECTION = Object.freeze({
  "bug": {
    selected: ["revert", "regression-acceptance"],
    skipped: {
      "focal-mutation": "STRATEGY_OMISSION_OUT_OF_SCOPE",
      "independent-acceptance": "STRATEGY_OMISSION_OUT_OF_SCOPE",
      "compatibility-acceptance": "STRATEGY_OMISSION_NOT_APPLICABLE",
      "test-inspection": "STRATEGY_OMISSION_COVERED_BY_REVERT",
      "structural-validation": "STRATEGY_OMISSION_NOT_APPLICABLE",
      "behavior-equivalence": "STRATEGY_OMISSION_NOT_APPLICABLE",
      "rollback": "STRATEGY_OMISSION_NOT_APPLICABLE",
    },
  },
  "refactor": {
    selected: ["behavior-equivalence", "focal-mutation"],
    skipped: {
      "revert": "STRATEGY_OMISSION_IRRELEVANT_FOR_REFACTOR",
      "independent-acceptance": "STRATEGY_OMISSION_OUT_OF_SCOPE",
      "regression-acceptance": "STRATEGY_OMISSION_COVERED_BY_EQUIVALENCE",
      "compatibility-acceptance": "STRATEGY_OMISSION_NOT_APPLICABLE",
      "test-inspection": "STRATEGY_OMISSION_OPTIONAL",
      "structural-validation": "STRATEGY_OMISSION_NOT_APPLICABLE",
      "rollback": "STRATEGY_OMISSION_NOT_APPLICABLE",
    },
  },
  "migration": {
    selected: ["rollback", "compatibility-acceptance"],
    skipped: {
      "revert": "STRATEGY_OMISSION_NOT_APPLICABLE",
      "focal-mutation": "STRATEGY_OMISSION_NOT_APPLICABLE",
      "independent-acceptance": "STRATEGY_OMISSION_OUT_OF_SCOPE",
      "regression-acceptance": "STRATEGY_OMISSION_COVERED_BY_COMPATIBILITY",
      "test-inspection": "STRATEGY_OMISSION_OPTIONAL",
      "structural-validation": "STRATEGY_OMISSION_OPTIONAL",
      "behavior-equivalence": "STRATEGY_OMISSION_NOT_APPLICABLE",
    },
  },
  "config-docs": {
    selected: ["structural-validation", "test-inspection"],
    skipped: {
      "revert": "STRATEGY_OMISSION_NOT_APPLICABLE",
      "focal-mutation": "STRATEGY_OMISSION_NO_CODE_LOGIC",
      "independent-acceptance": "STRATEGY_OMISSION_OUT_OF_SCOPE",
      "regression-acceptance": "STRATEGY_OMISSION_NOT_APPLICABLE",
      "compatibility-acceptance": "STRATEGY_OMISSION_NOT_APPLICABLE",
      "behavior-equivalence": "STRATEGY_OMISSION_NOT_APPLICABLE",
      "rollback": "STRATEGY_OMISSION_NOT_APPLICABLE",
    },
  },
  "feature": {
    selected: ["independent-acceptance", "focal-mutation"],
    skipped: {
      "revert": "STRATEGY_OMISSION_FEATURE_ADDITION",
      "regression-acceptance": "STRATEGY_OMISSION_OPTIONAL",
      "compatibility-acceptance": "STRATEGY_OMISSION_NOT_APPLICABLE",
      "test-inspection": "STRATEGY_OMISSION_COVERED_BY_FOCAL",
      "structural-validation": "STRATEGY_OMISSION_NOT_APPLICABLE",
      "behavior-equivalence": "STRATEGY_OMISSION_NOT_APPLICABLE",
      "rollback": "STRATEGY_OMISSION_NOT_APPLICABLE",
    },
  },
  "strict-tdd": {
    selected: ["independent-acceptance", "focal-mutation"],
    skipped: {
      "revert": "STRATEGY_OMISSION_COVERED_BY_RED_GREEN",
      "regression-acceptance": "STRATEGY_OMISSION_OPTIONAL",
      "compatibility-acceptance": "STRATEGY_OMISSION_NOT_APPLICABLE",
      "test-inspection": "STRATEGY_OMISSION_COVERED_BY_RED_GREEN",
      "structural-validation": "STRATEGY_OMISSION_NOT_APPLICABLE",
      "behavior-equivalence": "STRATEGY_OMISSION_NOT_APPLICABLE",
      "rollback": "STRATEGY_OMISSION_NOT_APPLICABLE",
    },
  },
});

const DEFAULT_CHALLENGE_BUDGET = Object.freeze({
  max_challenges: 3,
  mutation_budget: 10,
  timeout_seconds: 60,
});

/**
 * Generates a deterministic ChallengePlan for a candidate and policy snapshot.
 * @param {Object} params
 * @param {string} params.candidateId
 * @param {string} params.nodeId
 * @param {string} params.policySnapshotId
 * @param {string} params.evidenceStrategy
 * @param {Object} [params.budgetOverrides]
 * @returns {Object} ChallengePlanV1 payload
 */
function createChallengePlan({
  candidateId,
  nodeId,
  policySnapshotId,
  evidenceStrategy,
  budgetOverrides = {},
}) {
  if (typeof candidateId !== "string" || !candidateId) throw new TypeError("createChallengePlan requires candidateId");
  if (typeof nodeId !== "string" || !nodeId.trim()) throw new TypeError("createChallengePlan requires nodeId");
  if (typeof policySnapshotId !== "string" || !policySnapshotId) throw new TypeError("createChallengePlan requires policySnapshotId");
  if (typeof evidenceStrategy !== "string" || evidenceStrategy.trim() === "") {
    throw new TypeError("createChallengePlan requires evidenceStrategy");
  }
  if (!STRATEGY_CHALLENGE_SELECTION[evidenceStrategy]) {
    throw new TypeError("createChallengePlan rejects unknown evidenceStrategy");
  }
  const selectionDef = STRATEGY_CHALLENGE_SELECTION[evidenceStrategy];

  const selected = [...selectionDef.selected];
  const skipped = CHALLENGE_TYPES.filter((type) => !selected.includes(type)).map((challenge_type) => ({
    challenge_type,
    reason: selectionDef.skipped[challenge_type],
  }));
  const reasons = [
    `STRATEGY_${evidenceStrategy.toUpperCase().replace(/-/g, "_")}_SELECTED`,
    ...skipped.map((s) => s.reason),
  ];

  const budget = {
    max_challenges: Math.max(
      1,
      Number(budgetOverrides.max_challenges || DEFAULT_CHALLENGE_BUDGET.max_challenges)
    ),
    mutation_budget: Math.max(
      0,
      Number(
        budgetOverrides.mutation_budget !== undefined
          ? budgetOverrides.mutation_budget
          : DEFAULT_CHALLENGE_BUDGET.mutation_budget
      )
    ),
    timeout_seconds: Math.max(
      0.1,
      Number(budgetOverrides.timeout_seconds || DEFAULT_CHALLENGE_BUDGET.timeout_seconds)
    ),
  };

  const canonicalBody = {
    schema_version: 1,
    kind: "challenge-plan/v1",
    candidate_id: candidateId,
    node_id: nodeId,
    policy_snapshot_id: policySnapshotId,
    evidence_strategy: evidenceStrategy,
    selected,
    skipped,
    reasons,
    budget,
  };

  const plan_id = computeChallengePlanId(canonicalBody);

  return {
    ...canonicalBody,
    plan_id,
  };
}

function emitChallengeResult({ planId, candidateId, nodeId, policySnapshotId, evidenceStrategy, challengeType, outcome, evidenceIds = [], details = {} }) {
  const body = { schema_version: 1, kind: "challenge-result/v1", plan_id: planId, candidate_id: candidateId, node_id: nodeId, policy_snapshot_id: policySnapshotId, evidence_strategy: evidenceStrategy, challenge_type: challengeType, outcome, evidence_ids: [...new Set(evidenceIds)].sort(), details: details && typeof details === "object" && !Array.isArray(details) ? details : {} };
  return { ...body, result_id: computeChallengeResultId(body) };
}

module.exports = {
  createChallengePlan,
  emitChallengeResult,
  STRATEGY_CHALLENGE_SELECTION,
  DEFAULT_CHALLENGE_BUDGET,
};
