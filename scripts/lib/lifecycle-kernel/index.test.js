"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  runKernelOperation,
  createAuthorityStore,
  createPermitLedger,
  mintOperationPermit,
  reduceLifecycle,
  digestLifecycleState,
  interruptError,
} = require("./index.js");
const { withRuntimePermit } = require("./test-permit-helpers.js");

function pendingState() {
  return {
    schema_version: 1,
    status: "ready",
    nodes: { n1: { id: "n1", phase: "pending", attempt: 0 } },
  };
}

test("public runKernelOperation advances state through authority store CAS and journal", async () => {
  const store = createAuthorityStore({ initial: { state: pendingState(), journal: [] } });
  const executed = [];
  const result = await runKernelOperation({
    operation: "start",
    arguments: { node_id: "n1" },
    store,
    effectExecutor: async (effect) => {
      executed.push(effect.effect_id);
      assert.equal(effect.effect_class, "idempotent-keyed");
      return { ok: true };
    },
    clock: () => 0,
  });

  assert.equal(result.outcome, "advanced");
  assert.match(result.state_digest, /^sha256:[a-f0-9]{64}$/);
  assert.equal(result.status.nodes.n1.phase, "started");
  assert.equal(executed.length, 1);
  assert.ok(result.events.length >= 1);
  assert.ok(result.operation_receipt);
  assert.equal(result.operation_receipt.kind, "operation-receipt/v1");

  const status = await runKernelOperation({
    operation: "status",
    store,
  });
  assert.equal(status.state_digest, result.state_digest);
  assert.equal(status.next_transition.operation, "complete");
});

test("invalid transition via public API does not mutate store", async () => {
  const store = createAuthorityStore({ initial: { state: pendingState() } });
  const before = digestLifecycleState((await store.load()).state);
  const result = await runKernelOperation({
    operation: "complete",
    arguments: { node_id: "n1" },
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
  const initialState = pendingState();
  const store = createAuthorityStore({ initial: { state: initialState } });
  const beforeDigest = digestLifecycleState(initialState);

  const result = await runKernelOperation({
    operation: "start",
    arguments: { node_id: "n1" },
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
  const initialState = pendingState();
  const store = createAuthorityStore({ initial: { state: initialState } });
  const beforeDigest = digestLifecycleState(initialState);

  const result = await runKernelOperation({
    operation: "start",
    arguments: { node_id: "n1" },
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

test("bare memory commit store is rejected (authority-store-required)", async () => {
  const { createMemoryStore } = require("./memory-store.js");
  const store = createMemoryStore({ state: pendingState() });
  await assert.rejects(
    () =>
      runKernelOperation({
        operation: "start",
        arguments: { node_id: "n1" },
        store,
        effectExecutor: async () => ({ ok: true }),
      }),
    (error) => error.code === "authority-store-required"
  );
});

test("mutation without runtime-minted permit fails; head unchanged", async () => {
  const store = createAuthorityStore({ initial: { state: pendingState() } });
  const before = await store.load();
  const result = await runKernelOperation({
    operation: "start",
    arguments: { node_id: "n1" },
    store,
    mintPermit: false,
    authorityToken: "opaque:t1",
    effectExecutor: async () => ({ ok: true }),
  });
  assert.equal(result.outcome, "blocked");
  assert.equal(result.code, "unauthorized");
  const after = await store.load();
  assert.equal(after.revision, before.revision);
});

test("mutation with fabricated permit bypassing ledger fails", async () => {
  const store = createAuthorityStore({ initial: { state: pendingState() } });
  const before = await store.load();
  const ledger = createPermitLedger();
  const fabricated = {
    schema_version: 1,
    kind: "operation-permit/v1",
    permit_id: "permit:forged:1",
    domain: "lifecycle",
    operation: "start",
    subject_id: "lifecycle:default",
    expected_revision: before.revision,
    arguments_digest: "sha256:a",
    scope_digest: "sha256:b",
    policy_digest: "sha256:c",
    budget_ref: "budget:none",
    single_use: true,
  };
  const result = await runKernelOperation({
    operation: "start",
    arguments: { node_id: "n1" },
    store,
    mintPermit: false,
    operationPermit: fabricated,
    permitLedger: ledger,
    effectExecutor: async () => ({ ok: true }),
  });
  assert.equal(result.outcome, "blocked");
  assert.equal(result.code, "permit-not-runtime-issued");
  assert.equal((await store.load()).revision, before.revision);
});

test("preseeded unknown journal fail-closes without mutating store", async () => {
  const initialState = pendingState();
  const { deriveOperationId, deriveEffectId } = require("./journal.js");
  const operationId = deriveOperationId({
    state: initialState,
    operation: "start",
    arguments: { node_id: "n1" },
  });
  const reduced = reduceLifecycle(initialState, withRuntimePermit({
    operation: "start",
    arguments: { node_id: "n1" },
  }));
  const effectId = deriveEffectId(operationId, reduced.effects[0]);
  const unknownJournal = [
    {
      schema_version: 1,
      kernel_version: 1,
      operation_id: operationId,
      effect_id: effectId,
      status: "unknown",
      result: { ok: false, error: "prior-ambiguous" },
    },
  ];

  const store = createAuthorityStore({
    initial: { state: initialState, journal: unknownJournal },
  });
  const beforeDigest = digestLifecycleState(initialState);
  const beforeJournal = JSON.stringify(store.snapshot().journal);

  const result = await runKernelOperation({
    operation: "start",
    arguments: { node_id: "n1" },
    store,
    effectExecutor: async () => ({ ok: true }),
  });

  assert.equal(result.outcome, "blocked");
  assert.equal(result.code, "reconciliation-required");
  assert.equal(digestLifecycleState(store.snapshot().state), beforeDigest);
  assert.equal(JSON.stringify(store.snapshot().journal), beforeJournal);
});

test("ambiguous executor throw after started durable-marks unknown and resume fail-closes", async () => {
  const initialState = pendingState();
  const store = createAuthorityStore({ initial: { state: initialState } });
  const beforeDigest = digestLifecycleState(initialState);

  const first = await runKernelOperation({
    operation: "start",
    arguments: { node_id: "n1" },
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

test("interrupt mid-executor with irreversible persists unknown; resume does not reinvoke", async () => {
  const initialState = pendingState();
  const store = createAuthorityStore({ initial: { state: initialState } });
  const beforeDigest = digestLifecycleState(initialState);

  let executions = 0;
  await assert.rejects(
    () =>
      runKernelOperation({
        operation: "start",
        arguments: { node_id: "n1" },
        store,
        effect_class: "irreversible",
        effectExecutor: async () => {
          executions += 1;
          throw interruptError("mid-executor");
        },
        clock: () => 0,
      }),
    (err) => err && err.code === "kernel-interrupt"
  );

  assert.equal(executions, 1);
  const afterInterrupt = store.snapshot();
  assert.equal(afterInterrupt.journal.length, 1);
  assert.equal(afterInterrupt.journal[0].status, "unknown");
  assert.notEqual(afterInterrupt.journal[0].result && afterInterrupt.journal[0].result.barrier, "pre-effect");
  assert.equal(afterInterrupt.journal[0].effect_class, "irreversible");

  let resumedExecutions = 0;
  const resume = await runKernelOperation({
    operation: "start",
    arguments: { node_id: "n1" },
    store,
    effect_class: "irreversible",
    effectExecutor: async () => {
      resumedExecutions += 1;
      return { ok: true };
    },
    clock: () => 0,
  });

  assert.equal(resume.outcome, "blocked");
  assert.equal(resume.code, "irreversible-ambiguous");
  assert.equal(resumedExecutions, 0);
  assert.equal(digestLifecycleState(store.snapshot().state), beforeDigest);
  assert.equal(store.snapshot().journal[0].status, "unknown");
});

test("CAS conflict after effects does not inflate budgets", async () => {
  const store = createAuthorityStore({
    initial: { state: pendingState() },
    budgets: { attempts: 3, corrections: 1 },
  });
  const loaded = await store.load();
  // Race: advance head out from under the in-flight operation by CAS with same R.
  const raced = await store.compareAndSwap(
    "lifecycle:default",
    loaded.revision,
    {
      schema_version: 1,
      status: "running",
      nodes: { n1: { id: "n1", phase: "started", attempt: 9 } },
    },
    []
  );
  assert.equal(raced.ok, true);

  // Restore pending state for the operation attempt but keep advanced revision via fresh store race:
  // Simulate conflict by minting against stale revision.
  const store2 = createAuthorityStore({
    initial: { state: pendingState() },
    budgets: { attempts: 3, corrections: 1 },
  });
  const head = await store2.load();
  const ledger = createPermitLedger();
  const stalePermit = mintOperationPermit({
    ledger,
    operation: "start",
    expected_revision: head.revision,
  });
  // Advance head first
  await store2.compareAndSwap(
    "lifecycle:default",
    head.revision,
    {
      schema_version: 1,
      status: "running",
      nodes: { n1: { id: "n1", phase: "started", attempt: 1 } },
    },
    []
  );
  const budgetsBefore = store2.getBudgets();
  const result = await runKernelOperation({
    operation: "start",
    arguments: { node_id: "n1" },
    store: store2,
    mintPermit: false,
    operationPermit: stalePermit,
    permitLedger: ledger,
    effectExecutor: async () => ({ ok: true }),
  });
  assert.equal(result.outcome, "blocked");
  assert.ok(result.code === "stale-permit" || result.code === "invalid-transition" || result.code === "cas-conflict");
  assert.deepEqual(store2.getBudgets(), budgetsBefore);
});
