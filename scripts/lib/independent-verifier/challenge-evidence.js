"use strict";

const { validateChallengeResultSet } = require("../adversarial-challenges/integrity.js");

function fail(reason_code, error) { return { ok: false, reason_code, error: error || reason_code }; }

function evaluateChallengeEvidence(input, bindings, { required = false } = {}) {
  const plan = input.challengePlan || input.challenge_plan;
  const results = Array.isArray(input.challengeResults) ? input.challengeResults : (Array.isArray(input.challenge_results) ? input.challenge_results : []);
  if (!required && !plan && results.length === 0) return { ok: true, status: "not-required", replay_challenges: null };
  if (!plan) return fail("CHALLENGE_INTEGRITY_INVALID", "required K6c verification has no canonical challenge plan");
  const gate = validateChallengeResultSet(plan, results, { candidate: bindings.candidate, executionGraph: bindings.executionGraph, policySnapshot: input.policySnapshot });
  if (!gate.ok) return fail("CHALLENGE_INTEGRITY_INVALID", gate.error);
  if (results.some((result) => result.outcome !== "passed")) return fail("CHALLENGE_VERIFICATION_FAILED", "one or more canonical challenges did not pass");
  const replay = { plan, results: [...results].sort((left, right) => left.challenge_type.localeCompare(right.challenge_type)) };
  if (!required) {
    return { ok: true, status: "optional", replay_challenges: replay };
  }
  return {
    ok: true,
    status: "accepted",
    challenge_verification: { status: "accepted", plan_id: plan.plan_id, result_ids: results.map((result) => result.result_id).sort() },
    replay_challenges: replay,
  };
}

module.exports = { evaluateChallengeEvidence };
