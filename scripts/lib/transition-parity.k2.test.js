"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  deriveSurfacesFromKernel,
  validateProjectionParity,
  validateCommandHonesty,
} = require("./transition-parity.js");
const { selectTransitions, nextTransition } = require("./lifecycle-kernel/transition-selector.js");
const { digestLifecycleState } = require("./lifecycle-kernel/state-digest.js");
const { runHarnessScenario } = require("./minimal-kernel-harness.js");

const state = {
  schema_version: 1,
  status: "ready",
  nodes: { n1: { id: "n1", phase: "pending", attempt: 0 } },
};

test("human and negotiated projections derived independently can diverge", () => {
  const human = {
    code: "ready",
    cause: "pending-work",
    next_action: { kind: "execute", operation: "start", command: "ospec start --node-id=n1" },
    state_digest: "sha256:aaa",
  };
  const negotiated = {
    code: "ready",
    cause: "pending-work",
    next_action: { kind: "execute", operation: "complete", command: "ospec complete --node-id=n1" },
    state_digest: "sha256:aaa",
  };
  const result = validateProjectionParity({ human, negotiated, kernelSelected: null });
  assert.equal(result.ok, false);
  assert.ok(result.mismatches.some((m) => m.field === "next_action"));
});

test("both projections derived from same K2-selected transition share discriminants and digest", () => {
  const selected = nextTransition(state);
  const digest = digestLifecycleState(state);
  const surfaces = deriveSurfacesFromKernel({
    state,
    selected,
    code: "ready",
    cause: "pending-work",
  });
  assert.equal(surfaces.human.state_digest, digest);
  assert.equal(surfaces.negotiated.state_digest, digest);
  const result = validateProjectionParity({
    human: surfaces.human,
    negotiated: surfaces.negotiated,
    kernelSelected: selected,
    stateDigest: digest,
  });
  assert.equal(result.ok, true);
  assert.equal(surfaces.human.next_action.operation, selected.operation);
  assert.equal(surfaces.negotiated.next_action.operation, selected.operation);
});

test("projection attempting to override selected operation fails closed", () => {
  const selected = nextTransition(state);
  const digest = digestLifecycleState(state);
  const human = {
    code: "ready",
    cause: "pending-work",
    state_digest: digest,
    next_action: {
      kind: "execute",
      operation: "fail",
      command: "ospec fail --node-id=n1",
    },
  };
  const negotiated = deriveSurfacesFromKernel({
    state,
    selected,
    code: "ready",
    cause: "pending-work",
  }).negotiated;
  const result = validateProjectionParity({
    human,
    negotiated,
    kernelSelected: selected,
    stateDigest: digest,
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, "projection-override");
  assert.equal(digestLifecycleState(state), digest);
});

test("command honesty rejects dead-end recovery that preserves blocking digest", async () => {
  const blocked = {
    schema_version: 1,
    status: "blocked",
    nodes: { n1: { id: "n1", phase: "failed", attempt: 1, dead_end_recover: true } },
  };
  // Shape-valid recover transition.
  const transition = {
    kind: "execute",
    operation: "recover",
    command: "ospec recover --node-id=n1",
    arguments: [{ name: "node_id", value: "n1", token: "--node-id=n1" }],
  };
  const honesty = await validateCommandHonesty({
    state: blocked,
    transition,
    // Probe that pretends recover leaves the same blocking fingerprint.
    executeProbe: async () => ({
      afterState: {
        schema_version: 1,
        status: "blocked",
        nodes: { n1: { id: "n1", phase: "failed", attempt: 2, dead_end_recover: true } },
      },
      outcome: "advanced",
    }),
  });
  assert.equal(honesty.ok, false);
  assert.equal(honesty.code, "command-not-honest");
  assert.ok(["decide", "stop"].includes(honesty.replacement.kind));
});

test("command honesty accepts advancing recover via harness", async () => {
  const blocked = {
    schema_version: 1,
    status: "blocked",
    nodes: { n1: { id: "n1", phase: "failed", attempt: 1 } },
  };
  const transition = {
    kind: "execute",
    operation: "recover",
    command: "ospec recover --node-id=n1",
    arguments: [{ name: "node_id", value: "n1", token: "--node-id=n1" }],
  };
  const honesty = await validateCommandHonesty({
    state: blocked,
    transition,
    executeProbe: async () => {
      const result = await runHarnessScenario({
        id: "honesty-recover",
        initialState: blocked,
        operations: [{ operation: "recover", arguments: { node_id: "n1" } }],
      });
      return { afterState: result.snapshot.state, outcome: result.outcome };
    },
  });
  assert.equal(honesty.ok, true);
});

test("selectTransitions still available for kernel authority", () => {
  assert.ok(selectTransitions(state).length >= 1);
});
