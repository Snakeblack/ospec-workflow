"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  MODEL_CONFIG,
  EXECUTABLE_INVARIANTS,
  DEFERRED_INVARIANTS,
  exploreModel,
  checkInvariant,
  runAllInvariantCheckers,
  opaquePortsEqual,
  isDecisionStaleForSubject,
  replayCounterexample,
  createFaultySelector,
} = require("./lifecycle-model.js");

test("MODEL_CONFIG publishes versioned domains, actions, limits and mapping", () => {
  assert.equal(MODEL_CONFIG.schema_version, 1);
  assert.equal(typeof MODEL_CONFIG.model_version, "string");
  assert.ok(Array.isArray(MODEL_CONFIG.state_domains.phases));
  assert.ok(MODEL_CONFIG.state_domains.phases.includes("pending"));
  assert.ok(Array.isArray(MODEL_CONFIG.actions));
  assert.ok(MODEL_CONFIG.actions.includes("start"));
  assert.ok(Number.isInteger(MODEL_CONFIG.limits.max_depth));
  assert.ok(Number.isInteger(MODEL_CONFIG.limits.max_visits));
  assert.equal(typeof MODEL_CONFIG.abstraction_mapping, "object");
  assert.ok(MODEL_CONFIG.abstraction_mapping.nodes);
});

test("every executable invariant has a non-optional checker", () => {
  assert.equal(EXECUTABLE_INVARIANTS.length, 8);
  for (const inv of EXECUTABLE_INVARIANTS) {
    assert.equal(typeof inv.id, "string");
    assert.equal(typeof inv.name, "string");
    assert.equal(inv.optional, false);
    assert.equal(typeof checkInvariant, "function");
    const result = checkInvariant(inv.id);
    assert.equal(typeof result.ok, "boolean");
  }
  const all = runAllInvariantCheckers();
  const enforced = all.results.filter((r) => r.counts_as_enforced);
  assert.equal(enforced.length, 8);
  assert.equal(all.enforced_count, 8);
  assert.equal(all.ok, true);
});

test("inv-no-duplicate-effects is non-vacuous: completed effects skip, planned execute", () => {
  const result = checkInvariant("inv-no-duplicate-effects");
  assert.equal(result.ok, true);
  assert.equal(result.invariant_id, "inv-no-duplicate-effects");
  assert.ok(result.detail, "checker must expose decision detail (not a vacuous ok)");
  assert.equal(result.detail.completed.action, "skip");
  assert.equal(result.detail.completed.reason, "already-completed");
  assert.equal(result.detail.planned.action, "execute");
  assert.equal(result.detail.failed.action, "skip");
  // A second completed reconcile must still skip (replay safety).
  assert.equal(result.detail.replay_completed.action, "skip");
});

test("deferred invariants are listed but do not count as K2 enforcement", () => {
  assert.ok(DEFERRED_INVARIANTS.length >= 3);
  for (const inv of DEFERRED_INVARIANTS) {
    assert.equal(inv.enforced_in_k2, false);
    assert.ok(inv.owned_by);
  }
  const all = runAllInvariantCheckers();
  assert.ok(!all.results.some((r) => r.deferred === true && r.counts_as_enforced));
  assert.equal(all.enforced_count, EXECUTABLE_INVARIANTS.length);
});

test("opaque SubjectId change invalidates bound decision without Candidate fields", () => {
  const decision = {
    subject_id: "opaque:subject-a",
    authority_token: "opaque:auth-1",
    budget_ref: "opaque:budget-1",
    policy_ref: "opaque:policy-1",
  };
  assert.equal(opaquePortsEqual(decision.subject_id, "opaque:subject-a"), true);
  assert.equal(
    isDecisionStaleForSubject(decision, "opaque:subject-b"),
    true
  );
  assert.equal(
    isDecisionStaleForSubject(decision, "opaque:subject-a"),
    false
  );
  assert.equal(decision.candidate, undefined);
});

test("seeded faulty selector produces a stable counterexample", () => {
  const faulty = createFaultySelector({ seed: "k2-fault-1" });
  const exploration = exploreModel({
    selector: faulty,
    seed: "k2-fault-1",
    max_depth: 3,
    max_visits: 50,
  });
  assert.equal(exploration.ok, false);
  assert.ok(exploration.counterexample);
  assert.equal(exploration.counterexample.seed, "k2-fault-1");
  assert.ok(Array.isArray(exploration.counterexample.trace));
  assert.ok(exploration.counterexample.trace.length >= 1);
  assert.match(exploration.counterexample.invariant_id, /^inv-/);

  const again = exploreModel({
    selector: faulty,
    seed: "k2-fault-1",
    max_depth: 3,
    max_visits: 50,
  });
  assert.equal(
    JSON.stringify(again.counterexample.trace),
    JSON.stringify(exploration.counterexample.trace)
  );
});

test("healthy exploration finds no counterexample under bounds", () => {
  const exploration = exploreModel({
    seed: "k2-healthy-1",
    max_depth: 4,
    max_visits: 80,
  });
  assert.equal(exploration.ok, true);
  assert.equal(exploration.counterexample, null);
  assert.ok(exploration.visited >= 1);
});

test("counterexample replays through Minimal Kernel Harness", async () => {
  const faulty = createFaultySelector({ seed: "k2-fault-replay" });
  const exploration = exploreModel({
    selector: faulty,
    seed: "k2-fault-replay",
    max_depth: 3,
    max_visits: 50,
  });
  assert.ok(exploration.counterexample);
  const replay = await replayCounterexample(exploration.counterexample);
  assert.equal(replay.ok, false);
  assert.equal(replay.reproduced, true);
  assert.equal(replay.invariant_id, exploration.counterexample.invariant_id);
});
