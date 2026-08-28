"use strict";

const { createCausalFailure, CAUSAL_CATEGORIES } = require("../causal-failure.js");

function createChallengeBudgetTracker(declaredBudget = {}) {
  let remainingChallenges = Math.max(1, Math.floor(Number(declaredBudget.max_challenges || 1)));
  let remainingMutations = Math.max(
    0,
    Math.floor(
      Number(
        declaredBudget.mutation_budget !== undefined ? declaredBudget.mutation_budget : 0
      )
    )
  );
  let remainingTimeSeconds = Math.max(
    0.1,
    Number(declaredBudget.timeout_seconds !== undefined ? declaredBudget.timeout_seconds : 60)
  );

  return {
    consumeChallenge() {
      if (remainingChallenges <= 0) return false;
      remainingChallenges -= 1;
      return true;
    },
    consumeMutations(count = 1) {
      const needed = Math.max(0, Math.floor(Number(count)));
      if (remainingMutations < needed) return false;
      remainingMutations -= needed;
      return true;
    },
    consumeTime(seconds = 0) {
      const needed = Math.max(0, Number(seconds));
      if (remainingTimeSeconds < needed) return false;
      remainingTimeSeconds = Math.max(0, remainingTimeSeconds - needed);
      return true;
    },
    isExhausted() {
      if (remainingChallenges <= 0) return { exhausted: true, dimension: "max_challenges" };
      if (remainingMutations <= 0) return { exhausted: true, dimension: "mutation_budget" };
      if (remainingTimeSeconds <= 0) return { exhausted: true, dimension: "timeout_seconds" };
      return { exhausted: false };
    },
    getRemaining() {
      return {
        max_challenges: remainingChallenges,
        mutation_budget: remainingMutations,
        timeout_seconds: remainingTimeSeconds,
      };
    },
    buildExhaustionFailure({ candidateId, planId, dimension }) {
      return createCausalFailure({
        category: CAUSAL_CATEGORIES.VALIDATION_GAP,
        code: "CHALLENGE_BUDGET_EXHAUSTED",
        blocking_fingerprint: `challenge-budget:${planId}:${dimension}`,
        details: {
          candidate_id: candidateId,
          plan_id: planId,
          exhausted_dimension: dimension,
        },
      });
    },
  };
}

module.exports = { createChallengeBudgetTracker };
