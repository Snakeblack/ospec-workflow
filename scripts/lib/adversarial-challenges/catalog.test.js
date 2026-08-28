"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  CHALLENGE_TYPES,
  CHALLENGE_OBJECTIVES,
  isValidChallengeType,
  validateChallengeType,
} = require("./catalog.js");

test("REQ-adversarial-challenges-001: Challenge catalog contains exactly the 9 closed types", () => {
  const expectedTypes = [
    "revert",
    "focal-mutation",
    "independent-acceptance",
    "regression-acceptance",
    "compatibility-acceptance",
    "test-inspection",
    "structural-validation",
    "behavior-equivalence",
    "rollback",
  ];

  assert.equal(CHALLENGE_TYPES.length, 9);
  assert.deepEqual([...CHALLENGE_TYPES], expectedTypes);
  assert.ok(Object.isFrozen(CHALLENGE_TYPES), "CHALLENGE_TYPES must be frozen");

  for (const type of expectedTypes) {
    assert.ok(CHALLENGE_OBJECTIVES[type], `Objective for ${type} must exist`);
    assert.equal(typeof CHALLENGE_OBJECTIVES[type], "string");
    assert.ok(CHALLENGE_OBJECTIVES[type].length > 0);
  }
  assert.ok(Object.isFrozen(CHALLENGE_OBJECTIVES), "CHALLENGE_OBJECTIVES must be frozen");
});

test("REQ-adversarial-challenges-001: isValidChallengeType validates correctly", () => {
  for (const type of CHALLENGE_TYPES) {
    assert.equal(isValidChallengeType(type), true, `${type} must be valid`);
  }

  assert.equal(isValidChallengeType("unknown-type"), false);
  assert.equal(isValidChallengeType("fuzz-chaos-injection"), false);
  assert.equal(isValidChallengeType(""), false);
  assert.equal(isValidChallengeType(null), false);
  assert.equal(isValidChallengeType(undefined), false);
  assert.equal(isValidChallengeType(123), false);
  assert.equal(isValidChallengeType({}), false);
});

test("REQ-adversarial-challenges-001: validateChallengeType returns success for supported types", () => {
  const result = validateChallengeType("focal-mutation");
  assert.equal(result.ok, true);
  assert.equal(result.type, "focal-mutation");
  assert.equal(result.objective, CHALLENGE_OBJECTIVES["focal-mutation"]);
});

test("REQ-adversarial-challenges-001: validateChallengeType fails closed for unsupported types", () => {
  const result = validateChallengeType("fuzz-chaos-injection");
  assert.equal(result.ok, false);
  assert.equal(result.reason_code, "UNSUPPORTED_CHALLENGE_TYPE");
  assert.match(result.error, /Unsupported challenge type/);

  const emptyResult = validateChallengeType("");
  assert.equal(emptyResult.ok, false);
  assert.equal(emptyResult.reason_code, "UNSUPPORTED_CHALLENGE_TYPE");

  const nullResult = validateChallengeType(null);
  assert.equal(nullResult.ok, false);
  assert.equal(nullResult.reason_code, "UNSUPPORTED_CHALLENGE_TYPE");
});
