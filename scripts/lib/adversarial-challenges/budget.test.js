"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const { loadSchemaById, validateInstance } = require("../kernel-schema-validator.js");
const { createChallengeBudgetTracker } = require("./budget.js");

const ROOT = path.resolve(__dirname, "../../..");
const failureSchema = loadSchemaById("ospec://schemas/kernel/causal-failure/v1", { rootDir: ROOT });

test("REQ-adversarial-challenges-003: Monotonic consumption of challenge quota", () => {
  const tracker = createChallengeBudgetTracker({
    max_challenges: 2,
    mutation_budget: 5,
    timeout_seconds: 10,
  });

  assert.equal(tracker.getRemaining().max_challenges, 2);
  assert.equal(tracker.consumeChallenge(), true);
  assert.equal(tracker.getRemaining().max_challenges, 1);
  assert.equal(tracker.consumeChallenge(), true);
  assert.equal(tracker.getRemaining().max_challenges, 0);

  // Attempting to consume beyond quota fails
  assert.equal(tracker.consumeChallenge(), false);
  assert.equal(tracker.getRemaining().max_challenges, 0);

  const status = tracker.isExhausted();
  assert.equal(status.exhausted, true);
  assert.equal(status.dimension, "max_challenges");
});

test("REQ-adversarial-challenges-003: Monotonic consumption of mutation quota", () => {
  const tracker = createChallengeBudgetTracker({
    max_challenges: 3,
    mutation_budget: 4,
    timeout_seconds: 10,
  });

  assert.equal(tracker.consumeMutations(3), true);
  assert.equal(tracker.getRemaining().mutation_budget, 1);
  assert.equal(tracker.consumeMutations(2), false, "Over-consumption must fail");
  assert.equal(tracker.getRemaining().mutation_budget, 1);
  assert.equal(tracker.consumeMutations(1), true);
  assert.equal(tracker.getRemaining().mutation_budget, 0);
  assert.equal(tracker.consumeMutations(1), false);
});

test("REQ-adversarial-challenges-003: Monotonic consumption of time quota", () => {
  const tracker = createChallengeBudgetTracker({
    max_challenges: 3,
    mutation_budget: 5,
    timeout_seconds: 1.5,
  });

  assert.equal(tracker.consumeTime(0.5), true);
  assert.equal(tracker.getRemaining().timeout_seconds, 1.0);
  assert.equal(tracker.consumeTime(2.0), false);
  assert.equal(tracker.consumeTime(1.0), true);
  assert.equal(tracker.getRemaining().timeout_seconds, 0);
  assert.equal(tracker.consumeTime(0.1), false);

  const status = tracker.isExhausted();
  assert.equal(status.exhausted, true);
  assert.equal(status.dimension, "timeout_seconds");
});

test("REQ-adversarial-challenges-003: buildExhaustionFailure produces valid causal-failure/v1", () => {
  const tracker = createChallengeBudgetTracker({
    max_challenges: 1,
    mutation_budget: 0,
    timeout_seconds: 30,
  });

  const failure = tracker.buildExhaustionFailure({
    candidateId: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    planId: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    dimension: "mutation_budget",
  });

  assert.equal(failure.schema_version, 1);
  assert.equal(failure.category, "validation_gap");
  assert.equal(failure.code, "CHALLENGE_BUDGET_EXHAUSTED");
  assert.equal(failure.blocking_fingerprint, "challenge-budget:sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb:mutation_budget");
  assert.equal(failure.details.exhausted_dimension, "mutation_budget");

  const valRes = validateInstance(failureSchema, failure);
  assert.equal(valRes.valid, true, `Generated causal failure must be valid: ${JSON.stringify(valRes.errors)}`);
});

test("REQ-adversarial-challenges-003: Boundary protections on negative or zero limits", () => {
  const tracker = createChallengeBudgetTracker({
    max_challenges: -5,
    mutation_budget: -10,
    timeout_seconds: 0,
  });

  // max_challenges is clamped to minimum 1
  assert.equal(tracker.getRemaining().max_challenges, 1);
  // mutation_budget is clamped to minimum 0
  assert.equal(tracker.getRemaining().mutation_budget, 0);
  // timeout_seconds is clamped to minimum 0.1
  assert.ok(tracker.getRemaining().timeout_seconds >= 0.1);
});
