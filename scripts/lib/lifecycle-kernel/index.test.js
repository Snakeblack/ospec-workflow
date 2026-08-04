"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  runKernelOperation,
  createMemoryStore,
  reduceLifecycle,
  digestLifecycleState,
} = require("./index.js");

test("public runKernelOperation advances state through store and journal", async () => {
  const store = createMemoryStore({
    state: {
      schema_version: 1,
      status: "ready",
      nodes: { n1: { id: "n1", phase: "pending", attempt: 0 } },
    },
  });
  const executed = [];
  const result = await runKernelOperation({
    operation: "start",
    arguments: { node_id: "n1" },
    authorityToken: "opaque:t1",
    store,
    effectExecutor: async (effect) => {
      executed.push(effect.effect_id);
      return { ok: true };
    },
    clock: () => 0,
  });

  assert.equal(result.outcome, "advanced");
  assert.match(result.state_digest, /^sha256:[a-f0-9]{64}$/);
  assert.equal(result.status.nodes.n1.phase, "started");
  assert.equal(executed.length, 1);
  assert.ok(result.events.length >= 1);

  const status = await runKernelOperation({
    operation: "status",
    store,
  });
  assert.equal(status.state_digest, result.state_digest);
  assert.equal(status.next_transition.operation, "complete");
});

test("invalid transition via public API does not mutate store", async () => {
  const store = createMemoryStore({
    state: {
      schema_version: 1,
      status: "ready",
      nodes: { n1: { id: "n1", phase: "pending", attempt: 0 } },
    },
  });
  const before = digestLifecycleState((await store.load()).state);
  const result = await runKernelOperation({
    operation: "complete",
    arguments: { node_id: "n1" },
    authorityToken: "opaque:t1",
    store,
    effectExecutor: async () => ({ ok: true }),
  });
  assert.equal(result.outcome, "blocked");
  assert.equal(result.code, "invalid-transition");
  assert.equal(digestLifecycleState((await store.load()).state), before);
});

test("reducer-only helper remains available but is not the public conformance entry", () => {
  assert.equal(typeof reduceLifecycle, "function");
  assert.equal(typeof runKernelOperation, "function");
});

test("effectExecutor {ok:false} blocks without committing reduced success state", async () => {
  const initialState = {
    schema_version: 1,
    status: "ready",
    nodes: { n1: { id: "n1", phase: "pending", attempt: 0 } },
  };
  const store = createMemoryStore({ state: initialState });
  const beforeDigest = digestLifecycleState(initialState);

  const result = await runKernelOperation({
    operation: "start",
    arguments: { node_id: "n1" },
    authorityToken: "opaque:t1",
    store,
    effectExecutor: async () => ({ ok: false, reason: "persist-denied" }),
    clock: () => 0,
  });

  assert.equal(result.outcome, "blocked");
  assert.equal(result.code, "effect-failed");
  assert.equal(result.state_digest, beforeDigest);

  const snap = store.snapshot();
  assert.equal(digestLifecycleState(snap.state), beforeDigest);
  assert.equal(snap.state.nodes.n1.phase, "pending");
  assert.equal(snap.journal.length, 1);
  assert.equal(snap.journal[0].status, "failed");
});

test("mutating operation without effectExecutor fail-closes and does not commit", async () => {
  const initialState = {
    schema_version: 1,
    status: "ready",
    nodes: { n1: { id: "n1", phase: "pending", attempt: 0 } },
  };
  const store = createMemoryStore({ state: initialState });
  const beforeDigest = digestLifecycleState(initialState);

  const result = await runKernelOperation({
    operation: "start",
    arguments: { node_id: "n1" },
    authorityToken: "opaque:t1",
    store,
    clock: () => 0,
  });

  assert.equal(result.outcome, "blocked");
  assert.equal(result.code, "effect-executor-required");
  assert.equal(digestLifecycleState(store.snapshot().state), beforeDigest);
  assert.equal(store.snapshot().journal.length, 0);

  const statusOnly = await runKernelOperation({ operation: "status", store });
  assert.notEqual(statusOnly.outcome, "blocked");
  assert.equal(digestLifecycleState(store.snapshot().state), beforeDigest);
});

test("store without commitJournal fail-closes before mutating effects", async () => {
  const initialState = {
    schema_version: 1,
    status: "ready",
    nodes: { n1: { id: "n1", phase: "pending", attempt: 0 } },
  };
  let state = JSON.parse(JSON.stringify(initialState));
  let journal = [];
  const store = {
    async load() {
      return {
        state: JSON.parse(JSON.stringify(state)),
        journal: JSON.parse(JSON.stringify(journal)),
      };
    },
    async commit({ state: nextState, journal: nextJournal }) {
      state = JSON.parse(JSON.stringify(nextState));
      journal = JSON.parse(JSON.stringify(nextJournal));
      return { state, journal };
    },
  };
  const beforeDigest = digestLifecycleState(initialState);
  const result = await runKernelOperation({
    operation: "start",
    arguments: { node_id: "n1" },
    authorityToken: "opaque:t1",
    store,
    effectExecutor: async () => ({ ok: true }),
  });
  assert.equal(result.outcome, "blocked");
  assert.equal(result.code, "journal-durability-required");
  assert.equal(digestLifecycleState(state), beforeDigest);
  assert.equal(journal.length, 0);
});

test("preseeded unknown journal fail-closes without mutating store", async () => {
  const initialState = {
    schema_version: 1,
    status: "ready",
    nodes: { n1: { id: "n1", phase: "pending", attempt: 0 } },
  };
  const unknownJournal = [
    {
      schema_version: 1,
      kernel_version: 1,
      operation_id: "sha256:op",
      effect_id: "sha256:will-be-ignored-until-derived",
      status: "unknown",
      result: { ok: false, error: "prior-ambiguous" },
    },
  ];
  // Seed unknown against the real effect_id that start will derive.
  const { deriveOperationId, deriveEffectId } = require("./journal.js");
  const { reduceLifecycle } = require("./reducer.js");
  const operationId = deriveOperationId({
    state: initialState,
    operation: "start",
    arguments: { node_id: "n1" },
  });
  const reduced = reduceLifecycle(initialState, {
    operation: "start",
    arguments: { node_id: "n1" },
    authorityToken: "opaque:t1",
  });
  const effectId = deriveEffectId(operationId, reduced.effects[0]);
  unknownJournal[0].effect_id = effectId;
  unknownJournal[0].operation_id = operationId;

  const store = createMemoryStore({
    state: initialState,
    journal: unknownJournal,
  });
  const beforeDigest = digestLifecycleState(initialState);
  const beforeJournal = JSON.stringify(store.snapshot().journal);

  const result = await runKernelOperation({
    operation: "start",
    arguments: { node_id: "n1" },
    authorityToken: "opaque:t1",
    store,
    effectExecutor: async () => ({ ok: true }),
  });

  assert.equal(result.outcome, "blocked");
  assert.equal(result.code, "reconciliation-required");
  assert.equal(digestLifecycleState(store.snapshot().state), beforeDigest);
  assert.equal(JSON.stringify(store.snapshot().journal), beforeJournal);
});

test("ambiguous executor throw after started durable-marks unknown and resume fail-closes", async () => {
  const initialState = {
    schema_version: 1,
    status: "ready",
    nodes: { n1: { id: "n1", phase: "pending", attempt: 0 } },
  };
  const store = createMemoryStore({ state: initialState });
  const beforeDigest = digestLifecycleState(initialState);

  const first = await runKernelOperation({
    operation: "start",
    arguments: { node_id: "n1" },
    authorityToken: "opaque:t1",
    store,
    effectExecutor: async () => {
      throw new Error("executor-crashed-mid-flight");
    },
    clock: () => 0,
  });

  assert.equal(first.outcome, "blocked");
  assert.equal(first.code, "reconciliation-required");
  assert.equal(first.state_digest, beforeDigest);

  const afterThrow = store.snapshot();
  assert.equal(afterThrow.state.nodes.n1.phase, "pending");
  assert.equal(afterThrow.journal.length, 1);
  assert.equal(afterThrow.journal[0].status, "unknown");

  let resumedExecutions = 0;
  const resume = await runKernelOperation({
    operation: "start",
    arguments: { node_id: "n1" },
    authorityToken: "opaque:t1",
    store,
    effectExecutor: async () => {
      resumedExecutions += 1;
      return { ok: true };
    },
    clock: () => 0,
  });

  assert.equal(resume.outcome, "blocked");
  assert.equal(resume.code, "reconciliation-required");
  assert.equal(resumedExecutions, 0);
  assert.equal(digestLifecycleState(store.snapshot().state), beforeDigest);
  assert.equal(store.snapshot().journal[0].status, "unknown");
});
