"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const { reduceLifecycle } = require("./reducer.js");
const { digestLifecycleState } = require("./state-digest.js");
const { withRuntimePermit } = require("./test-permit-helpers.js");

function baseState(overrides = {}) {
  return {
    schema_version: 1,
    status: "ready",
    nodes: {
      n1: { id: "n1", phase: "pending", attempt: 0 },
    },
    ...overrides,
  };
}

test("reduceLifecycle is pure: no fs/process/clock/random identifiers in source", () => {
  const source = fs.readFileSync(path.join(__dirname, "reducer.js"), "utf8");
  assert.doesNotMatch(source, /\brequire\s*\(\s*["']node:(fs|child_process|os|net|http|https|crypto)["']/);
  assert.doesNotMatch(source, /\brequire\s*\(\s*["']fs["']/);
  assert.doesNotMatch(source, /\brequire\s*\(\s*["']child_process["']/);
  assert.doesNotMatch(source, /\bDate\.now\b/);
  assert.doesNotMatch(source, /\bMath\.random\b/);
  assert.doesNotMatch(source, /\bprocess\.(exit|env|cwd)\b/);
});

test("reduceLifecycle returns new state, effects with effect_class, events without mutating input", () => {
  const state = baseState();
  const frozen = JSON.stringify(state);
  const result = reduceLifecycle(state, withRuntimePermit({
    operation: "start",
    arguments: { node_id: "n1" },
  }));

  assert.equal(JSON.stringify(state), frozen);
  assert.notEqual(result.state, state);
  assert.equal(result.state.nodes.n1.phase, "started");
  assert.equal(result.outcome, "advanced");
  assert.ok(Array.isArray(result.effects));
  assert.ok(result.effects.length >= 1);
  assert.equal(result.effects[0].kind, "persist-node");
  assert.equal(result.effects[0].effect_class, "idempotent-keyed");
  assert.ok(Array.isArray(result.events));
  assert.ok(result.events.some((e) => e.kind === "operation-started"));
  assert.notEqual(digestLifecycleState(result.state), digestLifecycleState(state));
});

test("reduceLifecycle fails closed for invalid complete", () => {
  const state = baseState();
  const before = digestLifecycleState(state);
  const result = reduceLifecycle(state, withRuntimePermit({
    operation: "complete",
    arguments: { node_id: "n1" },
  }));
  assert.equal(result.outcome, "blocked");
  assert.equal(result.code, "invalid-transition");
  assert.equal(digestLifecycleState(result.state), before);
  assert.deepEqual(result.effects, []);
});

test("reduceLifecycle rejects unauthorized mutation", () => {
  const state = baseState();
  const result = reduceLifecycle(state, {
    operation: "start",
    arguments: { node_id: "n1" },
    authorityToken: null,
  });
  assert.equal(result.outcome, "blocked");
  assert.equal(result.code, "unauthorized");
  assert.deepEqual(result.effects, []);
});

test("reduceLifecycle rejects token-only mutation (token ≠ permit)", () => {
  const state = baseState();
  const result = reduceLifecycle(state, {
    operation: "start",
    arguments: { node_id: "n1" },
    authorityToken: "opaque:t1",
  });
  assert.equal(result.outcome, "blocked");
  assert.equal(result.code, "unauthorized");
});

test("complete after start advances to completed", () => {
  const started = reduceLifecycle(baseState(), withRuntimePermit({
    operation: "start",
    arguments: { node_id: "n1" },
  })).state;
  const result = reduceLifecycle(started, withRuntimePermit({
    operation: "complete",
    arguments: { node_id: "n1" },
  }));
  assert.equal(result.state.nodes.n1.phase, "completed");
  assert.equal(result.outcome, "terminal");
  assert.equal(result.state.status, "terminal");
});

test("missing effect_class on synthetic effect fails requireEffectClass at shell boundary", () => {
  const { requireEffectClass } = require("./effect-policy.js");
  const result = reduceLifecycle(baseState(), withRuntimePermit({
    operation: "start",
    arguments: { node_id: "n1" },
  }));
  assert.equal(requireEffectClass(result.effects[0]).ok, true);
  assert.equal(requireEffectClass({ kind: "persist-node", payload: {} }).code, "effect-class-required");
});

test("reduceLifecycle: decrements node budget only from runtime-owned deltas", () => {
  const state = {
    schema_version: 1,
    status: "ready",
    nodes: {
      n1: {
        id: "n1",
        phase: "pending",
        attempt: 0,
        budget: { schema_version: 1, turns: 5, patches: 2, commands: 10, wall_time_minutes: 15, changed_lines: 400, allowed_paths: [] },
      },
    },
  };

  const started = reduceLifecycle(state, withRuntimePermit({
    operation: "start",
    arguments: { node_id: "n1" },
    runtime_consumed: { turns: 1, patches: 1, commands: 2 },
  }));

  assert.equal(started.state.nodes.n1.attempt, 1);
  assert.equal(started.state.nodes.n1.budget.turns, 4);
  assert.equal(started.state.nodes.n1.budget.patches, 1);
  assert.equal(started.state.nodes.n1.budget.commands, 8);
});

test("reduceLifecycle: detects zero-delta mutation and records zero-delta-attempt event", () => {
  const state = {
    schema_version: 1,
    status: "running",
    nodes: {
      n1: {
        id: "n1",
        phase: "started",
        attempt: 1,
        budget: { schema_version: 1, turns: 5, patches: 2, commands: 10, wall_time_minutes: 15, changed_lines: 400, allowed_paths: [] },
      },
    },
  };

  const res = reduceLifecycle(state, withRuntimePermit({
    operation: "fail",
    arguments: { node_id: "n1" },
    mutation: true,
    modified_files_count: 0,
    changed_lines: 0,
    state_advanced: false,
  }));

  assert.equal(res.state.nodes.n1.zero_delta_attempts, 1);
  assert.ok(res.events.some((e) => e.kind === "zero-delta-attempt"));
  assert.equal(res.state.nodes.n1.budget.turns, 4);
});

test("reduceLifecycle: exhausted node budget fails closed on recover", () => {
  const state = {
    schema_version: 1,
    status: "blocked",
    nodes: {
      n1: {
        id: "n1",
        phase: "failed",
        attempt: 5,
        exhausted: true,
        budget: { schema_version: 1, turns: 0, patches: 0, commands: 0, wall_time_minutes: 0, changed_lines: 0, allowed_paths: [] },
      },
    },
  };

  const res = reduceLifecycle(state, withRuntimePermit({
    operation: "recover",
    arguments: { node_id: "n1" },
  }));

  assert.equal(res.outcome, "blocked");
  assert.equal(res.code, "node-exhausted");
  assert.equal(res.state.nodes.n1.phase, "failed");
});
