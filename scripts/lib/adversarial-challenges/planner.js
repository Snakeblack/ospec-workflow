"use strict";

const { sha256Fingerprint } = require("../canonical-json.js");
const { CHALLENGE_TYPES } = require("./catalog.js");

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
 * @param {string} params.policySnapshotId
 * @param {string} params.evidenceStrategy
 * @param {Object} [params.budgetOverrides]
 * @returns {Object} ChallengePlanV1 payload
 */
function createChallengePlan({
  candidateId,
  policySnapshotId,
  evidenceStrategy,
  budgetOverrides = {},
}) {
  const normStrategy = STRATEGY_CHALLENGE_SELECTION[evidenceStrategy]
    ? evidenceStrategy
    : "strict-tdd";
  const selectionDef = STRATEGY_CHALLENGE_SELECTION[normStrategy];

  const selected = [...selectionDef.selected];
  const skipped = Object.entries(selectionDef.skipped).map(([challenge_type, reason]) => ({
    challenge_type,
    reason,
  }));
  const reasons = [
    `STRATEGY_${normStrategy.toUpperCase().replace(/-/g, "_")}_SELECTED`,
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
    policy_snapshot_id: policySnapshotId,
    evidence_strategy: normStrategy,
    selected,
    skipped,
    reasons,
    budget,
  };

  const plan_id = sha256Fingerprint("challenge-plan:v1", canonicalBody);

  return {
    ...canonicalBody,
    plan_id,
  };
}

module.exports = {
  createChallengePlan,
  STRATEGY_CHALLENGE_SELECTION,
  DEFAULT_CHALLENGE_BUDGET,
};
