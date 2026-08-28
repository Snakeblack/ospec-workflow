"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const adversarial = require("./index.js");

test("REQ-adversarial-challenges-001/002/003/004: Subsystem index exports all key modules and guards", () => {
  // Catalog
  assert.ok(adversarial.CHALLENGE_TYPES);
  assert.ok(adversarial.CHALLENGE_OBJECTIVES);
  assert.equal(typeof adversarial.isValidChallengeType, "function");
  assert.equal(typeof adversarial.validateChallengeType, "function");

  // Planner
  assert.equal(typeof adversarial.createChallengePlan, "function");
  assert.ok(adversarial.STRATEGY_CHALLENGE_SELECTION);
  assert.ok(adversarial.DEFAULT_CHALLENGE_BUDGET);

  // Budget
  assert.equal(typeof adversarial.createChallengeBudgetTracker, "function");

  // Mutator
  assert.equal(typeof adversarial.generateFocalMutations, "function");
  assert.equal(typeof adversarial.applyFocalMutation, "function");
  assert.equal(typeof adversarial.revertSourcePatch, "function");
  assert.equal(typeof adversarial.inspectTestAssertions, "function");

  // Runner
  assert.equal(typeof adversarial.emitChallengeResult, "function");
  assert.equal(typeof adversarial.executeChallengePlan, "function");

  // Authority Guard
  assert.equal(typeof adversarial.rejectDeliveryAuthorityMisuse, "function");
});

test("REQ-harness-authority-canon-012: rejectDeliveryAuthorityMisuse fails closed", () => {
  const result = adversarial.rejectDeliveryAuthorityMisuse({
    operation: "deliver",
    from_challenge_results_alone: true,
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason_code, "CHALLENGE_AUTHORITY_MISUSE");
  assert.match(result.error, /non-authoritative complementary evidence/i);
});
