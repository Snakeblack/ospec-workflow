"use strict";

const catalog = require("./catalog.js");
const planner = require("./planner.js");
const budget = require("./budget.js");
const mutator = require("./mutator.js");
const runner = require("./runner.js");
const integrity = require("./integrity.js");
const diffScope = require("./diff-scope.js");

/**
 * Rejects any attempt to use challenge outputs as delivery or lifecycle authority.
 * @param {Object} [_intent]
 * @returns {{ ok: false, reason_code: string, error: string }}
 */
function rejectDeliveryAuthorityMisuse(_intent) {
  return {
    ok: false,
    reason_code: "CHALLENGE_AUTHORITY_MISUSE",
    error:
      "Challenge plans and results are non-authoritative complementary evidence; OpenSpec/Git/Candidate remain sole delivery and lifecycle authority",
  };
}

module.exports = {
  // Catalog
  CHALLENGE_TYPES: catalog.CHALLENGE_TYPES,
  CHALLENGE_OBJECTIVES: catalog.CHALLENGE_OBJECTIVES,
  isValidChallengeType: catalog.isValidChallengeType,
  validateChallengeType: catalog.validateChallengeType,

  // Planner
  createChallengePlan: planner.createChallengePlan,
  STRATEGY_CHALLENGE_SELECTION: planner.STRATEGY_CHALLENGE_SELECTION,
  DEFAULT_CHALLENGE_BUDGET: planner.DEFAULT_CHALLENGE_BUDGET,

  // Budget
  createChallengeBudgetTracker: budget.createChallengeBudgetTracker,

  // Mutator
  generateFocalMutations: mutator.generateFocalMutations,
  applyFocalMutation: mutator.applyFocalMutation,
  revertSourcePatch: mutator.revertSourcePatch,
  inspectTestAssertions: mutator.inspectTestAssertions,
  OPERATOR_MUTATIONS: mutator.OPERATOR_MUTATIONS,

  // Runner
  emitChallengeResult: runner.emitChallengeResult,
  executeChallengePlan: runner.executeChallengePlan,

  // Canonical integrity boundary
  computeChallengePlanId: integrity.computeChallengePlanId,
  computeChallengeResultId: integrity.computeChallengeResultId,
  validateChallengePlan: integrity.validateChallengePlan,
  validateChallengeResult: integrity.validateChallengeResult,
  validateChallengeResultSet: integrity.validateChallengeResultSet,
  deriveVerifiedDiffScope: diffScope.deriveVerifiedDiffScope,
  parseUnifiedDiff: diffScope.parseUnifiedDiff,

  // Authority Guard
  rejectDeliveryAuthorityMisuse,
};
