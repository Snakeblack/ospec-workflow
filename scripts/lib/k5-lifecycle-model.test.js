"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  K5_EXECUTABLE_INVARIANTS,
  DEFERRED_INVARIANTS,
  checkInvariant,
  runAllInvariantCheckers,
} = require("./lifecycle-model.js");

test("K5 Model Conformance: K5 manifest lists 7 executable invariants", async () => {
  assert.equal(K5_EXECUTABLE_INVARIANTS.length, 7);

  const deferredIds = new Set(DEFERRED_INVARIANTS.map((d) => d.id));
  for (const inv of K5_EXECUTABLE_INVARIANTS) {
    assert.equal(deferredIds.has(inv.id), false, `Invariant ${inv.id} must not be deferred`);
    assert.equal(inv.optional, false, `Invariant ${inv.id} must be non-optional`);

    const result = await checkInvariant(inv.id);
    assert.equal(result.ok, true, `Checker for ${inv.id} must pass: ${JSON.stringify(result)}`);
  }

  const all = await runAllInvariantCheckers();
  assert.equal(all.k5_count, 7);
  assert.equal(all.ok, true);
});

test("K5 Invariant 1: Non-increasing budget decrements across retry loops and CAS reconciliations", async () => {
  const result = await checkInvariant("inv-k5-budget-monotonicity");
  assert.equal(result.ok, true);
  assert.equal(result.invariant_id, "inv-k5-budget-monotonicity");
});

test("K5 Invariant 2: Highest-priority causal failure governs recovery transition selection", async () => {
  const result = await checkInvariant("inv-k5-causal-priority");
  assert.equal(result.ok, true);
  assert.equal(result.invariant_id, "inv-k5-causal-priority");
});

test("K5 Invariant 3: Recovery operations are strictly allowlisted per failure category", async () => {
  const result = await checkInvariant("inv-k5-allowlist-enforcement");
  assert.equal(result.ok, true);
  assert.equal(result.invariant_id, "inv-k5-allowlist-enforcement");
});

test("K5 Invariant 4: Non-advancing mutation steps consume attempt budget without advancing blocking state", async () => {
  const result = await checkInvariant("inv-k5-zero-delta-consumption");
  assert.equal(result.ok, true);
  assert.equal(result.invariant_id, "inv-k5-zero-delta-consumption");
});

test("K5 Invariant 5: Exhausted budgets prune execution transitions and force terminal states", async () => {
  const result = await checkInvariant("inv-k5-budget-exhaustion-terminal");
  assert.equal(result.ok, true);
  assert.equal(result.invariant_id, "inv-k5-budget-exhaustion-terminal");
});

test("K5 Invariant 6: Honest recovery requires advancement of the blocking fingerprint or terminal state", async () => {
  const result = await checkInvariant("inv-k5-honest-recovery-advancement");
  assert.equal(result.ok, true);
  assert.equal(result.invariant_id, "inv-k5-honest-recovery-advancement");
});

test("K5 Invariant 7: Transient consumption and telemetry keys are stripped from semantic state digests", async () => {
  const result = await checkInvariant("inv-k5-telemetry-isolation");
  assert.equal(result.ok, true);
  assert.equal(result.invariant_id, "inv-k5-telemetry-isolation");
});
