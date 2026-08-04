"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { selectTransitions, nextTransition } = require("./transition-selector.js");
const { digestLifecycleState } = require("./state-digest.js");

function stateWith(nodes, status = "ready") {
  return {
    schema_version: 1,
    status,
    nodes,
  };
}

test("equivalent states produce byte-equivalent ordered transitions", () => {
  const left = stateWith({
    b: { id: "b", phase: "pending", attempt: 0 },
    a: { id: "a", phase: "pending", attempt: 0 },
  });
  const right = stateWith({
    a: { id: "a", attempt: 0, phase: "pending" },
    b: { phase: "pending", id: "b", attempt: 0 },
  });

  const leftTransitions = selectTransitions(left);
  const rightTransitions = selectTransitions(right);
  assert.equal(JSON.stringify(leftTransitions), JSON.stringify(rightTransitions));
  assert.equal(digestLifecycleState(left), digestLifecycleState(right));
  assert.ok(leftTransitions.length >= 2);
  // Secondary ordering is by node id ascending within the same priority.
  assert.equal(leftTransitions[0].arguments.node_id, "a");
  assert.equal(leftTransitions[1].arguments.node_id, "b");
});

test("transition priority prefers recover over start over complete", () => {
  const state = stateWith({
    c: { id: "c", phase: "pending", attempt: 0 },
    a: { id: "a", phase: "interrupted", attempt: 1 },
    b: { id: "b", phase: "started", attempt: 1 },
  });
  const transitions = selectTransitions(state);
  assert.equal(transitions[0].operation, "recover");
  assert.equal(transitions[0].arguments.node_id, "a");
  assert.ok(transitions.some((t) => t.operation === "complete"));
  assert.ok(transitions.some((t) => t.operation === "start"));
});

test("terminal state exposes no ordinary execute transition", () => {
  const state = stateWith(
    {
      n1: { id: "n1", phase: "terminal", attempt: 3, exhausted: true },
    },
    "terminal"
  );
  const transitions = selectTransitions(state);
  assert.ok(!transitions.some((t) => t.kind === "execute" && t.operation === "start"));
  assert.ok(!transitions.some((t) => t.kind === "execute" && t.operation === "complete"));
  const next = nextTransition(state);
  assert.ok(next);
  assert.ok(next.kind === "decide" || next.kind === "stop" || next.operation === "recover");
});

test("exhausted operation cannot restart implicitly", () => {
  const state = stateWith({
    n1: { id: "n1", phase: "failed", attempt: 3, exhausted: true },
  });
  const transitions = selectTransitions(state);
  assert.ok(!transitions.some((t) => t.operation === "start"));
  const next = nextTransition(state);
  assert.ok(["decide", "stop", "recover"].includes(next.kind) || next.operation === "recover");
});
