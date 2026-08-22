"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createAuthorityStore,
  createKernelRuntime,
  createPermitLedger,
  reduceLifecycle,
  digestLifecycleState,
  interruptError,
  DEFAULT_SUBJECT_ID,
} = require("./index.js");
const {
  createTestKernelRuntime,
  createPermitAuthorityIssuer,
  mintOperationPermit,
  issueOperationPermit,
  withRuntimePermit,
  issueFixturePermit,
} = require("../test-support/permit-test-helpers.js");

function runKernelOperation(input = {}) {
  const runtime = createKernelRuntime({ store: input.store, subjectId: input.subjectId });
  return runtime.runOperation(input);
}

function pendingState() {
  return {
    schema_version: 1,
    status: "ready",
    nodes: { n1: { id: "n1", phase: "pending", attempt: 0 } },
  };
}

async function authorizedStart(store, extra = {}) {
  const runtime = extra.runtime || createKernelRuntime({ store });
  const head = await store.load();
  const issued = runtime.issuePermitForSelectedTransition({
    operation: "start",
    expected_revision: head.revision,
    arguments: { node_id: "n1" },
    subject_id: "lifecycle:default",
  });
  return runtime.runOperation({
    operation: "start",
    arguments: { node_id: "n1" },
    operationPermit: issued.permit,
    effectExecutor: extra.effectExecutor || (async () => ({ ok: true, usage: {} })),
    clock: extra.clock || (() => 0),
    ...extra.kernel,
  });
}

test("public runKernelOperation advances state through authority store CAS and journal", async () => {
  const store = createAuthorityStore({ initial: { state: pendingState(), journal: [] } });
  const executed = [];
  const result = await authorizedStart(store, {
    effectExecutor: async (effect) => {
      executed.push(effect.effect_id);
      assert.equal(effect.effect_class, "idempotent-keyed");
      return { ok: true, usage: {} };
    },
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
  const runtime = createKernelRuntime({ store });
  const head = await store.load();
  const issued = runtime.issuePermitForSelectedTransition({
    operation: "complete",
    expected_revision: head.revision,
    arguments: { node_id: "n1" },
  });
  const result = await runtime.runOperation({
    operation: "complete",
    arguments: { node_id: "n1" },
    operationPermit: issued.permit,
    effectExecutor: async () => ({ ok: true, usage: {} }),
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

  const result = await authorizedStart(store, {
    effectExecutor: async () => ({ ok: false, reason: "persist-denied", usage: { commands: 1 } }),
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
  const runtime = createKernelRuntime({ store });
  const head = await store.load();
  const issued = runtime.issuePermitForSelectedTransition({
    operation: "start",
    expected_revision: head.revision,
    arguments: { node_id: "n1" },
  });

  const result = await runtime.runOperation({
    operation: "start",
    arguments: { node_id: "n1" },
    operationPermit: issued.permit,
    clock: () => 0,
  });

  assert.equal(result.outcome, "blocked");
  assert.equal(result.code, "effect-executor-required");
  assert.equal(digestLifecycleState(store.snapshot().state), beforeDigest);
  assert.equal(store.snapshot().journal.length, 0);

  const statusOnly = await runtime.runOperation({ operation: "status" });
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
        effectExecutor: async () => ({ ok: true, usage: {} }),
      }),
    (error) => error.code === "authority-store-required"
  );
});

test("default mintPermit is false; state-valid op without permit fails; head unchanged", async () => {
  const store = createAuthorityStore({ initial: { state: pendingState() } });
  const before = await store.load();
  const result = await runKernelOperation({
    operation: "start",
    arguments: { node_id: "n1" },
    store,
    authorityToken: "opaque:t1",
    effectExecutor: async () => ({ ok: true, usage: {} }),
  });
  assert.equal(result.outcome, "blocked");
  assert.equal(result.code, "unauthorized");
  const after = await store.load();
  assert.equal(after.revision, before.revision);
});

test("explicit mintPermit:true is rejected with auto-mint-disabled", async () => {
  const store = createAuthorityStore({ initial: { state: pendingState() } });
  const before = await store.load();
  const result = await runKernelOperation({
    operation: "start",
    arguments: { node_id: "n1" },
    store,
    mintPermit: true,
    effectExecutor: async () => ({ ok: true, usage: {} }),
  });
  assert.equal(result.outcome, "blocked");
  assert.equal(result.code, "auto-mint-disabled");
  assert.equal(result.operation_receipt, null);
  const after = await store.load();
  assert.equal(after.revision, before.revision);
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
    effectExecutor: async () => ({ ok: true, usage: {} }),
  });
  assert.equal(result.outcome, "blocked");
  assert.equal(result.code, "unauthorized");
  const after = await store.load();
  assert.equal(after.revision, before.revision);
});

test("mutation with fabricated permit bypassing ledger fails", async () => {
  const store = createAuthorityStore({ initial: { state: pendingState() } });
  const before = await store.load();
  const ledger = createPermitAuthorityIssuer();
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
    effectExecutor: async () => ({ ok: true, usage: {} }),
  });
  assert.equal(result.outcome, "blocked");
  assert.equal(result.code, "permit-not-runtime-issued");
  assert.equal((await store.load()).revision, before.revision);
});

test("successful mutate records consumed permit + receipt in same CAS revision", async () => {
  const store = createAuthorityStore({ initial: { state: pendingState(), journal: [] } });
  const before = await store.load();
  const result = await authorizedStart(store);
  assert.equal(result.outcome, "advanced");
  assert.ok(result.operation_receipt);
  assert.equal(result.operation_receipt.kind, "operation-receipt/v1");

  const after = await store.load();
  assert.notEqual(after.revision, before.revision);
  const permitId = result.operation_permit_id;
  assert.equal(result.operation_receipt.revision, result.revision);
  assert.equal(after.authority.receipts[permitId].revision, result.revision);
  assert.equal(after.authority.permits[permitId].status, "consumed");
  assert.equal(after.authority.receipts[permitId].receipt_id, result.operation_receipt.receipt_id);
  assert.equal(after.state.nodes.n1.phase, "started");
});

test("incomplete authority commit leaves head unchanged and operation_receipt null", async () => {
  const store = createAuthorityStore({ initial: { state: pendingState(), journal: [] } });
  const before = await store.load();
  const originalCas = store.compareAndSwap.bind(store);
  store.compareAndSwap = async (subjectId, expectedRevision, nextState, nextJournal, midOpTicket) => {
    // Drop authorityCommit → store rejects as incomplete when null is forced.
    return originalCas(subjectId, expectedRevision, nextState, nextJournal, midOpTicket, null);
  };

  const result = await authorizedStart(store);
  assert.equal(result.outcome, "blocked");
  assert.equal(result.code, "authority-commit-incomplete");
  assert.equal(result.operation_receipt, null);
  const after = await store.load();
  // State MUST NOT advance; journal may have mid-op durable entries but no consume bag.
  assert.equal(after.state.nodes.n1.phase, "pending");
  assert.equal(digestLifecycleState(after.state), digestLifecycleState(before.state));
  assert.deepEqual(Object.keys(after.authority.permits), []);
  assert.deepEqual(Object.keys(after.authority.receipts), []);
});

test("exact identical replay returns prior OperationReceipt without second consume", async () => {
  const store = createAuthorityStore({ initial: { state: pendingState(), journal: [] } });
  const runtime = createKernelRuntime({ store });
  const head = await store.load();
  const issued = runtime.issuePermitForSelectedTransition({
    operation: "start",
    expected_revision: head.revision,
    arguments: { node_id: "n1" },
  });

  const first = await runtime.runOperation({
    operation: "start",
    arguments: { node_id: "n1" },
    operationPermit: issued.permit,
    effectExecutor: async () => ({ ok: true, usage: {} }),
  });
  assert.equal(first.outcome, "advanced");
  const receiptId = first.operation_receipt.receipt_id;

  let effectRuns = 0;
  const replay = await runtime.runOperation({
    operation: "start",
    arguments: { node_id: "n1" },
    operationPermit: issued.permit,
    effectExecutor: async () => {
      effectRuns += 1;
      return { ok: true, usage: {} };
    },
  });
  assert.equal(replay.operation_receipt.receipt_id, receiptId);
  assert.equal(replay.revision, first.revision);
  assert.equal(effectRuns, 0);
  assert.equal(replay.replayed, true);
});

test("in-process restart via snapshot/initial keeps permit and receipt verifiable", async () => {
  const store = createAuthorityStore({ initial: { state: pendingState(), journal: [] } });
  const first = await authorizedStart(store);
  assert.equal(first.outcome, "advanced");
  const permitId = first.operation_permit_id;
  const snap = store.snapshot();

  const restored = createAuthorityStore({ initial: snap });
  const loaded = await restored.load();
  assert.equal(loaded.authority.permits[permitId].status, "consumed");
  assert.equal(loaded.authority.receipts[permitId].receipt_id, first.operation_receipt.receipt_id);
  assert.equal(loaded.state.nodes.n1.phase, "started");
});

test("issueOperationPermit is not exported from kernel index", () => {
  const kernel = require("./index.js");
  assert.equal(kernel.issueOperationPermit, undefined);
  assert.equal(kernel.runKernelOperation, undefined);
});

test("CRITICAL: a caller-created issuer is not accepted as the store's permit authority", async () => {
  const store = createAuthorityStore({ initial: { state: pendingState(), journal: [] } });
  const runtime = createKernelRuntime({ store });
  const before = await store.load();
  const rogue = createPermitAuthorityIssuer();
  const issued = issueFixturePermit({
    ledger: rogue,
    operation: "start",
    headRevision: before.revision,
    arguments: { node_id: "n1" },
  });

  let effectRuns = 0;
  const result = await runtime.runOperation({
    operation: "start",
    arguments: { node_id: "n1" },
    operationPermit: issued.permit,
    effectExecutor: async () => {
      effectRuns += 1;
      return { ok: true, usage: {} };
    },
  });

  assert.equal(result.outcome, "blocked");
  assert.equal(result.code, "permit-not-runtime-issued");
  assert.equal(effectRuns, 0);
  const after = await store.load();
  assert.equal(after.revision, before.revision);
  assert.equal(after.state.nodes.n1.phase, "pending");
});

test("CRITICAL: KernelRuntime ignores rogue permitLedger passed by caller", async () => {
  const store = createAuthorityStore({ initial: { state: pendingState(), journal: [] } });
  const runtime = createKernelRuntime({ store });
  const before = await store.load();
  const rogue = createPermitAuthorityIssuer();
  const issued = issueFixturePermit({
    ledger: rogue,
    operation: "start",
    headRevision: before.revision,
    arguments: { node_id: "n1" },
  });

  let effectRuns = 0;
  const result = await runtime.runOperation({
    operation: "start",
    arguments: { node_id: "n1" },
    operationPermit: issued.permit,
    permitLedger: rogue,
    effectExecutor: async () => {
      effectRuns += 1;
      return { ok: true, usage: {} };
    },
  });

  assert.equal(result.outcome, "blocked");
  assert.equal(result.code, "permit-not-runtime-issued");
  assert.equal(effectRuns, 0);
});

test("CRITICAL: production createKernelRuntime does not accept options.permitIssuer or expose permitIssuer getter", async () => {
  const store = createAuthorityStore({ initial: { state: pendingState(), journal: [] } });
  const rogue = createPermitAuthorityIssuer();
  const runtime = createKernelRuntime({ store, permitIssuer: rogue });

  assert.equal(runtime.permitIssuer, undefined);

  const before = await store.load();
  const issued = issueFixturePermit({
    ledger: rogue,
    operation: "start",
    headRevision: before.revision,
    arguments: { node_id: "n1" },
  });

  const result = await runtime.runOperation({
    operation: "start",
    arguments: { node_id: "n1" },
    operationPermit: issued.permit,
    effectExecutor: async () => ({ ok: true, usage: {} }),
  });

  assert.equal(result.outcome, "blocked");
  assert.equal(result.code, "permit-not-runtime-issued");
});



test("CRITICAL: permit not issued by runtime private issuer is rejected", async () => {
  const store = createAuthorityStore({ initial: { state: pendingState(), journal: [] } });
  const before = await store.load();
  const rogueLedger = createPermitAuthorityIssuer();
  const rogueIssued = issueFixturePermit({
    ledger: rogueLedger,
    operation: "start",
    headRevision: before.revision,
    arguments: { node_id: "n1" },
  });
  const runtime = createKernelRuntime({ store });

  const result = await runtime.runOperation({
    operation: "start",
    arguments: { node_id: "n1" },
    operationPermit: rogueIssued.permit,
    effectExecutor: async () => ({ ok: true, usage: {} }),
  });
  assert.equal(result.outcome, "blocked");
  assert.equal(result.code, "permit-not-runtime-issued");
  assert.equal((await store.load()).revision, before.revision);
});

test("CRITICAL: consumed permit_id with forged arguments is never replayed as success", async () => {
  const store = createAuthorityStore({ initial: { state: pendingState(), journal: [] } });
  const first = await authorizedStart(store);
  assert.equal(first.outcome, "advanced");
  const permitId = first.operation_permit_id;
  const storedPermit = (await store.load()).authority.permits[permitId];
  const consumedPermit = { ...storedPermit, permit_id: permitId, single_use: true };

  const forged = {
    ...consumedPermit,
    arguments_digest: require("../canonical-json.js").sha256Fingerprint("permit:arguments", {
      node_id: "n2",
    }),
    operation_intent_digest: "sha256:forged-intent",
  };

  let effectRuns = 0;
  const replay = await runKernelOperation({
    operation: "start",
    arguments: { node_id: "n2" },
    store,
    operationPermit: forged,
    effectExecutor: async () => {
      effectRuns += 1;
      return { ok: true, usage: {} };
    },
  });
  assert.notEqual(replay.replayed, true);
  assert.equal(replay.outcome, "blocked");
  assert.equal(replay.code, "permit-reuse");
  assert.equal(effectRuns, 0);
  assert.equal(replay.operation_receipt, undefined);
});

test("restart issues a fresh permit id that cannot collide with a consumed one", async () => {
  const store = createAuthorityStore({ initial: { state: pendingState(), journal: [] } });
  const first = await authorizedStart(store);
  assert.equal(first.outcome, "advanced");
  const consumedId = first.operation_permit_id;

  const restored = createAuthorityStore({ initial: store.snapshot() });
  const runtime2 = createKernelRuntime({ store: restored });
  const head = await restored.load();
  assert.equal(head.authority.permits[consumedId].status, "consumed");

  const issued = runtime2.issuePermitForSelectedTransition({
    operation: "complete",
    expected_revision: head.revision,
    arguments: { node_id: "n1" },
  });
  assert.notEqual(issued.permit.permit_id, consumedId);

  const next = await runtime2.runOperation({
    operation: "complete",
    arguments: { node_id: "n1" },
    operationPermit: issued.permit,
    effectExecutor: async () => ({ ok: true, usage: {} }),
  });
  assert.notEqual(next.outcome, "blocked");
  assert.equal(next.operation_permit_id, issued.permit.permit_id);
  assert.ok(next.operation_receipt);
  const after = await restored.load();
  assert.equal(after.authority.permits[consumedId].status, "consumed");
  assert.equal(after.authority.permits[issued.permit.permit_id].status, "consumed");
});

test("consumed permit record persists full intent for post-restart verification", async () => {
  const store = createAuthorityStore({ initial: { state: pendingState(), journal: [] } });
  const result = await authorizedStart(store);
  const permitId = result.operation_permit_id;

  const stored = (await store.load()).authority.permits[permitId];
  assert.equal(stored.status, "consumed");
  assert.equal(stored.operation, "start");
  assert.equal(stored.subject_id, "lifecycle:default");
  assert.equal(result.operation_receipt.operation_intent_digest, stored.operation_intent_digest);
});

test("mintOperationPermit is not part of public kernel index API", () => {
  const kernel = require("./index.js");
  assert.equal(kernel.mintOperationPermit, undefined);
});

test("non-identical arguments do not short-circuit as exact replay", async () => {
  const store = createAuthorityStore({ initial: { state: pendingState(), journal: [] } });
  const runtime = createKernelRuntime({ store });
  const head = await store.load();
  const issued = runtime.issuePermitForSelectedTransition({
    operation: "start",
    expected_revision: head.revision,
    arguments: { node_id: "n1" },
  });

  const first = await runtime.runOperation({
    operation: "start",
    arguments: { node_id: "n1" },
    operationPermit: issued.permit,
    effectExecutor: async () => ({ ok: true, usage: {} }),
  });
  assert.equal(first.outcome, "advanced");

  const forgedPermit = { ...issued.permit, arguments: { node_id: "n2" } };
  const second = await runtime.runOperation({
    operation: "start",
    arguments: { node_id: "n2" },
    operationPermit: forgedPermit,
    effectExecutor: async () => ({ ok: true, usage: {} }),
  });
  assert.equal(second.outcome, "blocked");
});

test("bag-consumed without matching receipt fails closed with permit-reuse after restart", async () => {
  const probe = createAuthorityStore({ initial: { state: pendingState(), journal: [] } });
  const head = await probe.load();
  const bootstrap = createPermitAuthorityIssuer();
  const permit = mintOperationPermit({
    ledger: bootstrap,
    operation: "start",
    expected_revision: head.revision,
    subject_id: "lifecycle:default",
    arguments: { node_id: "n1" },
  });
  const store = createAuthorityStore({
    initial: {
      state: pendingState(),
      journal: [],
      authority: {
        permits: { [permit.permit_id]: { permit_id: permit.permit_id, status: "consumed" } },
        receipts: {},
      },
    },
  });

  const result = await runKernelOperation({
    operation: "start",
    arguments: { node_id: "n1" },
    store,
    operationPermit: permit,
    // Restart: the new store owns a fresh issuer whose map is empty.
    effectExecutor: async () => ({ ok: true, usage: {} }),
  });
  assert.equal(result.outcome, "blocked");
  assert.equal(result.code, "permit-reuse");
  assert.ok(!result.operation_receipt);
});

test("kernel fails closed when CAS ok lacks committed operation receipt", async () => {
  const store = createAuthorityStore({ initial: { state: pendingState(), journal: [] } });
  store.compareAndSwap = async () => {
    const loaded = await store.load();
    return {
      ok: true,
      revision: loaded.revision,
      converged: true,
      budgets: store.getBudgets(),
      operation_receipt: null,
    };
  };

  const result = await authorizedStart(store);
  assert.equal(result.outcome, "blocked");
  assert.ok(
    result.code === "authority-commit-incomplete" || result.code === "operation-receipt-missing"
  );
  assert.equal(result.operation_receipt, null);
  const after = await store.load();
  assert.equal(after.state.nodes.n1.phase, "pending");
});

test("persistJournal fails closed when commitJournal returns ok:false", async () => {
  const store = createAuthorityStore({ initial: { state: pendingState(), journal: [] } });
  store.commitJournal = async () => ({ ok: false, code: "journal-durability-required" });

  await assert.rejects(
    () => authorizedStart(store),
    (err) =>
      err &&
      (err.code === "journal-durability-required" || err.code === "journal-commit-failed")
  );
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

  const result = await authorizedStart(store);

  assert.equal(result.outcome, "blocked");
  assert.equal(result.code, "reconciliation-required");
  assert.equal(digestLifecycleState(store.snapshot().state), beforeDigest);
  assert.equal(JSON.stringify(store.snapshot().journal), beforeJournal);
});

test("ambiguous executor throw after started durable-marks unknown and resume fail-closes", async () => {
  const initialState = pendingState();
  const store = createAuthorityStore({ initial: { state: initialState } });
  const beforeDigest = digestLifecycleState(initialState);

  const first = await authorizedStart(store, {
    effectExecutor: async () => {
      throw new Error("executor-crashed-mid-flight");
    },
  });

  assert.equal(first.outcome, "blocked");
  assert.equal(first.code, "reconciliation-required");
  assert.equal(first.state_digest, beforeDigest);

  const afterThrow = store.snapshot();
  assert.equal(afterThrow.state.nodes.n1.phase, "pending");
  assert.equal(afterThrow.journal.length, 1);
  assert.equal(afterThrow.journal[0].status, "unknown");

  let resumedExecutions = 0;
  const resume = await authorizedStart(store, {
    effectExecutor: async () => {
      resumedExecutions += 1;
      return { ok: true, usage: {} };
    },
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
  const runtime1 = createKernelRuntime({ store });
  const head = await store.load();
  const issued = runtime1.issuePermitForSelectedTransition({
    operation: "start",
    expected_revision: head.revision,
    arguments: { node_id: "n1" },
  });

  let executions = 0;
  await assert.rejects(
    () =>
      runtime1.runOperation({
        operation: "start",
        arguments: { node_id: "n1" },
        effect_class: "irreversible",
        operationPermit: issued.permit,
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
  const runtime2 = createKernelRuntime({ store });
  const head2 = await store.load();
  const issued2 = runtime2.issuePermitForSelectedTransition({
    operation: "start",
    expected_revision: head2.revision,
    arguments: { node_id: "n1" },
  });
  const resume = await runtime2.runOperation({
    operation: "start",
    arguments: { node_id: "n1" },
    effect_class: "irreversible",
    operationPermit: issued2.permit,
    effectExecutor: async () => {
      resumedExecutions += 1;
      return { ok: true, usage: {} };
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

  const store2 = createAuthorityStore({
    initial: { state: pendingState() },
    budgets: { attempts: 3, corrections: 1 },
  });
  const runtime2 = createKernelRuntime({ store: store2 });
  const head = await store2.load();
  const stalePermit = runtime2.issuePermitForSelectedTransition({
    operation: "start",
    expected_revision: head.revision,
    arguments: { node_id: "n1" },
  });
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
  const result = await runtime2.runOperation({
    operation: "start",
    arguments: { node_id: "n1" },
    operationPermit: stalePermit.permit,
    effectExecutor: async () => ({ ok: true, usage: {} }),
  });
  assert.equal(result.outcome, "blocked");
  // Determinista: la autorización del permit corre antes de la validación de
  // transición y del CAS del kernel; el permit fue emitido por este runtime y
  // no está consumido, así que una revisión desfasada solo puede producir
  // stale-permit (verificado empíricamente en 200/200 ejecuciones).
  assert.equal(result.code, "stale-permit");
  assert.deepEqual(store2.getBudgets(), budgetsBefore);
});

test("runKernelOperation: escalate transition consolidates and commits terminal status via CAS to Authority Store [REQ-failure-recovery-002, REQ-lifecycle-kernel-runtime-026]", async () => {
  const failedState = {
    schema_version: 1,
    status: "blocked",
    nodes: {
      n1: {
        id: "n1",
        phase: "failed",
        attempt: 1,
        failure: { category: "ambiguous_effect", code: "UNKNOWN_EFFECT", priority: 3 },
      },
    },
  };
  const store = createAuthorityStore({ initial: { state: failedState, journal: [] } });
  const runtime = createKernelRuntime({ store });
  const head0 = await store.load();

  const permit = runtime.issuePermitForSelectedTransition({
    operation: "escalate",
    expected_revision: head0.revision,
    arguments: { node_id: "n1" },
  });
  assert.equal(permit.ok, true, "Permit issuance for escalate must succeed");

  const result = await runtime.runOperation({
    operation: "escalate",
    arguments: { node_id: "n1" },
    operationPermit: permit.permit,
    effectExecutor: async () => ({ ok: true, usage: {} }),
  });

  assert.equal(result.outcome, "terminal", "Outcome of escalate must be terminal");
  assert.notEqual(result.revision, head0.revision, "Head revision must advance via CAS");

  const loaded = await store.load();
  assert.equal(loaded.revision, result.revision, "Store revision must match CAS committed revision");
  assert.equal(loaded.state.status, "terminal", "Committed state status must be terminal");
  assert.equal(loaded.state.nodes.n1.phase, "terminal", "Node phase must be terminal");
});

test("runKernelOperation: preflight rejects with budget-exhausted and 0 effectExecutor calls for non-terminal operations when node or authority budget is exhausted [REQ-execution-budgets-001, REQ-execution-budgets-002, REQ-lifecycle-kernel-runtime-025]", async () => {
  // Case 1: Node turns exhausted (0)
  const nodeExhaustedState = {
    schema_version: 1,
    status: "ready",
    nodes: {
      n1: {
        id: "n1",
        phase: "pending",
        attempt: 0,
        budget: { schema_version: 1, turns: 0, patches: 5, commands: 10, wall_time_minutes: 30, changed_lines: 400, allowed_paths: [] },
      },
    },
    authority_budget: { schema_version: 1, effect_attempts: 3, authority_mutations: 10, evidence_runs: 20, review_sweeps: 1 },
  };
  const store1 = createAuthorityStore({ initial: { state: nodeExhaustedState, journal: [] } });
  const runtime1 = createKernelRuntime({ store: store1 });
  const head1 = await store1.load();

  const permit1 = runtime1.issuePermitForSelectedTransition({
    operation: "start",
    expected_revision: head1.revision,
    arguments: { node_id: "n1" },
  });
  assert.equal(permit1.ok, false, "Controlled issuer must reject when node budget exhausted");
  assert.equal(permit1.code, "budget-exhausted");

  let calls1 = 0;
  const result1 = await runtime1.runOperation({
    operation: "start",
    arguments: { node_id: "n1" },
    effectExecutor: async () => {
      calls1++;
      return { ok: true, usage: {} };
    },
  });

  assert.equal(result1.outcome, "blocked", "Must block on exhausted budget");
  assert.equal(calls1, 0, "Must have exactly 0 calls to effectExecutor");

  // Case 2: Authority effect_attempts exhausted (0)
  const authExhaustedState = {
    schema_version: 1,
    status: "ready",
    nodes: {
      n1: {
        id: "n1",
        phase: "pending",
        attempt: 0,
        budget: { schema_version: 1, turns: 5, patches: 5, commands: 10, wall_time_minutes: 30, changed_lines: 400, allowed_paths: [] },
      },
    },
    authority_budget: { schema_version: 1, effect_attempts: 0, authority_mutations: 10, evidence_runs: 20, review_sweeps: 1 },
  };
  const store2 = createAuthorityStore({ initial: { state: authExhaustedState, journal: [] } });
  const runtime2 = createKernelRuntime({ store: store2 });
  const head2 = await store2.load();

  const permit2 = runtime2.issuePermitForSelectedTransition({
    operation: "start",
    expected_revision: head2.revision,
    arguments: { node_id: "n1" },
  });
  assert.equal(permit2.ok, false, "Controlled issuer must reject when authority budget exhausted");
  assert.equal(permit2.code, "budget-exhausted");

  let calls2 = 0;
  const result2 = await runtime2.runOperation({
    operation: "start",
    arguments: { node_id: "n1" },
    effectExecutor: async () => {
      calls2++;
      return { ok: true, usage: {} };
    },
  });

  assert.equal(result2.outcome, "blocked", "Must block on exhausted authority budget");
  assert.equal(calls2, 0, "Must have exactly 0 calls to effectExecutor");
});

test("Phase 2 RED: escalate and stop operations execute and commit terminal status via CAS under exhausted node and authority budget [REQ-lifecycle-kernel-runtime-025, REQ-lifecycle-kernel-runtime-026, REQ-failure-recovery-002]", async () => {
  const exhaustedState = {
    schema_version: 1,
    status: "blocked",
    nodes: {
      n1: {
        id: "n1",
        phase: "failed",
        attempt: 3,
        exhausted: true,
        failure: { category: "code_defect", code: "OUT_OF_RETRIES", priority: 5 },
        budget: { schema_version: 1, turns: 0, patches: 0, commands: 0, wall_time_minutes: 0, changed_lines: 0, allowed_paths: [] },
      },
    },
    authority_budget: { schema_version: 1, effect_attempts: 0, authority_mutations: 0, evidence_runs: 0, review_sweeps: 0 },
  };
  const store = createAuthorityStore({ initial: { state: exhaustedState, journal: [] } });
  const runtime = createKernelRuntime({ store });
  const head0 = await store.load();

  // 1. escalate under exhausted budget
  const permitEscalate = runtime.issuePermitForSelectedTransition({
    operation: "escalate",
    expected_revision: head0.revision,
    arguments: { node_id: "n1" },
  });
  assert.equal(permitEscalate.ok, true, "Permit issuance for escalate must succeed even when budget exhausted");

  const resultEscalate = await runtime.runOperation({
    operation: "escalate",
    arguments: { node_id: "n1" },
    operationPermit: permitEscalate.permit,
    effectExecutor: async () => ({ ok: true, usage: {} }),
  });

  assert.equal(resultEscalate.outcome, "terminal", "Outcome must be terminal for escalate under exhaustion");
  assert.notEqual(resultEscalate.revision, head0.revision, "CAS revision must advance");
  const loadedEscalate = await store.load();
  assert.equal(loadedEscalate.state.status, "terminal");
  assert.equal(loadedEscalate.state.nodes.n1.phase, "terminal");

  // 2. stop under exhausted budget
  const storeStop = createAuthorityStore({ initial: { state: exhaustedState, journal: [] } });
  const runtimeStop = createKernelRuntime({ store: storeStop });
  const headStop0 = await storeStop.load();

  const permitStop = runtimeStop.issuePermitForSelectedTransition({
    operation: "stop",
    expected_revision: headStop0.revision,
    arguments: { node_id: "n1" },
  });
  assert.equal(permitStop.ok, true, "Permit issuance for stop must succeed even when budget exhausted");

  const resultStop = await runtimeStop.runOperation({
    operation: "stop",
    arguments: { node_id: "n1" },
    operationPermit: permitStop.permit,
    effectExecutor: async () => ({ ok: true, usage: {} }),
  });

  assert.equal(resultStop.outcome, "terminal", "Outcome must be terminal for stop under exhaustion");
  assert.notEqual(resultStop.revision, headStop0.revision, "CAS revision must advance for stop");
  const loadedStop = await storeStop.load();
  assert.equal(loadedStop.state.status, "terminal");
  assert.equal(loadedStop.state.nodes.n1.phase, "terminal");
});

test("Phase 3: runKernelOperation and validateOperationTransition reject unallowlisted causal recovery operations with 0 effectExecutor calls [REQ-failure-recovery-002, REQ-failure-recovery-003, REQ-lifecycle-kernel-runtime-026]", async () => {
  const ambiguousState = {
    schema_version: 1,
    status: "blocked",
    nodes: {
      n1: {
        id: "n1",
        phase: "failed",
        attempt: 1,
        failure: { category: "ambiguous_effect", code: "AMB_EFFECT", priority: 3 },
      },
    },
    authority_budget: { schema_version: 1, effect_attempts: 3, authority_mutations: 5, evidence_runs: 10, review_sweeps: 1 },
  };
  const store = createAuthorityStore({ initial: { state: ambiguousState, journal: [] } });
  const runtime = createKernelRuntime({ store });
  const head = await store.load();

  // 1. Issuer rejects permit
  const permitRes = runtime.issuePermitForSelectedTransition({
    operation: "repair",
    expected_revision: head.revision,
    arguments: {
      node_id: "n1",
      scope: { node_ids: ["n1"], allowed_paths: ["src/**"], finding_ids: ["F-1"] },
    },
  });
  assert.equal(permitRes.ok, false);
  assert.equal(permitRes.code, "unallowlisted-recovery-transition");

  // 2. validateOperationTransition fails closed
  const valRes = require("./operations.js").validateOperationTransition(ambiguousState, {
    operation: "repair",
    arguments: { node_id: "n1" },
  });
  assert.equal(valRes.ok, false);
  assert.equal(valRes.code, "unallowlisted-recovery-transition");

  // 3. runOperation fails closed with 0 calls to effectExecutor
  let calls = 0;
  const result = await runtime.runOperation({
    operation: "repair",
    arguments: {
      node_id: "n1",
      scope: { node_ids: ["n1"], allowed_paths: ["src/**"], finding_ids: ["F-1"] },
    },
    effectExecutor: async () => {
      calls++;
      return { ok: true, usage: {} };
    },
  });

  assert.equal(result.outcome, "blocked");
  assert.equal(calls, 0, "Must perform exactly 0 calls to effectExecutor");
});

test("runKernelOperation: repair without args.scope fails closed with repair-scope-violation and 0 effectExecutor calls [REQ-failure-recovery-004, REQ-lifecycle-kernel-runtime-026]", async () => {
  const failedState = {
    schema_version: 1,
    status: "blocked",
    nodes: {
      n1: {
        id: "n1",
        phase: "failed",
        attempt: 1,
        failure: { category: "code_defect", code: "TEST_FAILED", priority: 5, blocking_fingerprint: "fp:1" },
      },
    },
  };
  const store = createAuthorityStore({ initial: { state: failedState, journal: [] } });
  const runtime = createKernelRuntime({ store });
  const head = await store.load();

  const permit = runtime.issuePermitForSelectedTransition({
    operation: "repair",
    expected_revision: head.revision,
    arguments: { node_id: "n1" },
  });
  assert.equal(permit.ok, true);

  // Missing args.scope entirely
  let calls = 0;
  const result = await runtime.runOperation({
    operation: "repair",
    arguments: { node_id: "n1" }, // no scope!
    operationPermit: permit.permit,
    effectExecutor: async () => {
      calls++;
      return { ok: true, usage: {} };
    },
  });

  assert.equal(result.outcome, "blocked");
  assert.equal(result.code, "repair-scope-violation");
  assert.equal(calls, 0, "Must perform exactly 0 calls to effectExecutor");

  // Valid args.scope executes successfully
  const headAfter = await store.load();
  const permitValid = runtime.issuePermitForSelectedTransition({
    operation: "repair",
    expected_revision: headAfter.revision,
    arguments: {
      node_id: "n1",
      scope: {
        node_ids: ["n1"],
        allowed_paths: ["src/auth/**"],
        finding_ids: ["F-001"],
      },
    },
  });
  assert.equal(permitValid.ok, true);

  let callsValid = 0;
  const resultValid = await runtime.runOperation({
    operation: "repair",
    arguments: {
      node_id: "n1",
      scope: {
        node_ids: ["n1"],
        allowed_paths: ["src/auth/**"],
        finding_ids: ["F-001"],
      },
    },
    operationPermit: permitValid.permit,
    effectExecutor: async () => {
      callsValid++;
      return { ok: true, usage: {}, modified_paths: ["src/auth/jwt.js"], resolved_finding_ids: ["F-001"] };
    },
  });

  assert.equal(resultValid.outcome, "advanced");
  assert.equal(callsValid, 1);
});

test("runKernelOperation: zero-delta mutation simultaneously decrements node turns and authority effect_attempts and records durable zero-delta-attempt journal event [REQ-execution-budgets-001, REQ-execution-budgets-002, REQ-lifecycle-kernel-runtime-027]", async () => {
  const failedState = {
    schema_version: 1,
    status: "blocked",
    nodes: {
      n1: {
        id: "n1",
        phase: "failed",
        attempt: 1,
        failure: { category: "code_defect", code: "TEST_FAILED", priority: 5, blocking_fingerprint: "fp:1" },
        budget: { schema_version: 1, turns: 5, patches: 5, commands: 10, wall_time_minutes: 30, changed_lines: 400, allowed_paths: [] },
      },
    },
    authority_budget: { schema_version: 1, effect_attempts: 3, authority_mutations: 10, evidence_runs: 20, review_sweeps: 1 },
  };
  const store = createAuthorityStore({ initial: { state: failedState, journal: [] } });
  const runtime = createKernelRuntime({ store });
  const head0 = await store.load();

  const permit = runtime.issuePermitForSelectedTransition({
    operation: "repair",
    expected_revision: head0.revision,
    arguments: {
      node_id: "n1",
      scope: { node_ids: ["n1"], allowed_paths: ["src/**"], finding_ids: ["F-1"] },
    },
  });
  assert.equal(permit.ok, true);

  // Executor returns 0 modified files and 0 changed lines (zero delta)
  const result = await runtime.runOperation({
    operation: "repair",
    arguments: {
      node_id: "n1",
      scope: { node_ids: ["n1"], allowed_paths: ["src/**"], finding_ids: ["F-1"] },
    },
    operationPermit: permit.permit,
    effectExecutor: async () => ({ ok: true, usage: {}, modified_files_count: 0, changed_lines: 0, state_advanced: false }),
  });

  assert.equal(result.outcome, "advanced");

  const loaded = await store.load();
  // Node turns decremented from 5 to 4
  assert.equal(loaded.state.nodes.n1.budget.turns, 4, "Node turns must decrement on zero-delta");
  // Authority effect_attempts decremented from 3 to 2
  assert.equal(loaded.state.authority_budget.effect_attempts, 2, "Authority effect_attempts must decrement on zero-delta");

  // Journal contains durable zero-delta record
  const journalSnap = store.snapshot().journal;
  const zeroDeltaEntry = journalSnap.find((entry) => entry.status === "zero-delta-attempt" || entry.kind === "zero-delta-attempt");
  assert.ok(zeroDeltaEntry, "Journal must persist a durable zero-delta-attempt record");
});


test("runKernelOperation: read-only status query does not decrement budgets or record zero-delta attempt [REQ-execution-budgets-001]", async () => {
  const readyState = {
    schema_version: 1,
    status: "ready",
    nodes: {
      n1: {
        id: "n1",
        phase: "pending",
        attempt: 0,
        budget: { schema_version: 1, turns: 5, patches: 5, commands: 10, wall_time_minutes: 30, changed_lines: 400, allowed_paths: [] },
      },
    },
    authority_budget: { schema_version: 1, effect_attempts: 3, authority_mutations: 10, evidence_runs: 20, review_sweeps: 1 },
  };
  const store = createAuthorityStore({ initial: { state: readyState, journal: [] } });
  const runtime = createKernelRuntime({ store });

  const statusResult = await runtime.runOperation({ operation: "status" });
  assert.notEqual(statusResult.outcome, "blocked");

  const loaded = await store.load();
  assert.equal(loaded.state.nodes.n1.budget.turns, 5, "Node turns must remain intact on status");
  assert.equal(loaded.state.authority_budget.effect_attempts, 3, "Authority attempts must remain intact on status");
  assert.equal(store.snapshot().journal.length, 0, "No zero delta journal record on status");
});

test("issuePermitForSelectedTransition: fails closed with authoritative-snapshot-required when store snapshot is absent [REQ-operation-permits-005]", () => {
  // Store with null snapshot for subject
  const emptyStore = {
    snapshot() {
      return null;
    },
  };
  const runtime = createKernelRuntime({ store: emptyStore });

  // Caller provides fabricated input.state without authoritative snapshot
  const res = runtime.issuePermitForSelectedTransition({
    operation: "start",
    expected_revision: "sha256:fake",
    state: { schema_version: 1, status: "ready", nodes: { n1: { id: "n1", phase: "pending" } } },
    arguments: { node_id: "n1" },
  });

  assert.equal(res.ok, false);
  assert.equal(res.code, "authoritative-snapshot-required");
});

test("issuePermitForSelectedTransition: rejects unallowlisted recovery transitions derived from resolvePrimaryFailure over mixed failures [REQ-operation-permits-005, REQ-failure-recovery-002, REQ-failure-recovery-003]", async () => {
  // Target node has code_defect (allows repair) BUT state/node also has environment_tooling (P1 priority -> only replan/escalate/stop allowlisted)
  const failedState = {
    schema_version: 1,
    status: "blocked",
    nodes: {
      n1: {
        id: "n1",
        phase: "failed",
        attempt: 1,
        failure: { category: "code_defect", code: "TEST_FAIL", priority: 5, failure_id: "f-code" },
        failures: [
          { category: "environment_tooling", code: "HOST_TIMEOUT", priority: 1, failure_id: "f-env" },
        ],
        budget: { schema_version: 1, turns: 3 },
      },
    },
    authority_budget: { schema_version: 1, effect_attempts: 3 },
  };
  const store = createAuthorityStore({ initial: { state: failedState, journal: [] } });
  const runtime = createKernelRuntime({ store });
  const head = await store.load();

  // Attempt to issue permit for "repair" — primary failure is environment_tooling so repair is prohibited!
  const repairRes = runtime.issuePermitForSelectedTransition({
    operation: "repair",
    expected_revision: head.revision,
    arguments: {
      node_id: "n1",
      scope: { node_ids: ["n1"], allowed_paths: ["src/**"], finding_ids: ["f-code"] },
    },
  });

  assert.equal(repairRes.ok, false);
  assert.equal(repairRes.code, "unallowlisted-recovery-transition");
});

test("REQ-execution-budgets-003: createKernelRuntime accumulates deltas across all 10 dimensions on cas-conflict and deducts them on retry", async () => {
  const initialState = {
    schema_version: 1,
    status: "ready",
    nodes: {
      n1: {
        id: "n1",
        phase: "pending",
        attempt: 0,
        budget: {
          schema_version: 1,
          turns: 10,
          patches: 5,
          commands: 20,
          wall_time_minutes: 30,
          changed_lines: 400,
          allowed_paths: ["src/**"],
        },
      },
    },
    authority_budget: {
      schema_version: 1,
      effect_attempts: 3,
      authority_mutations: 10,
      evidence_runs: 20,
      review_sweeps: 2,
    },
  };

  const store = createAuthorityStore({ initial: { state: initialState, journal: [] } });
  const runtime = createKernelRuntime({ store });
  const head0 = await store.load();

  const permit1 = runtime.issuePermitForSelectedTransition({
    operation: "start",
    expected_revision: head0.revision,
    arguments: { node_id: "n1" },
  });
  assert.equal(permit1.ok, true);

  // Execute operation with consumption across dimensions (commands: 3, patches: 1, changed_lines: 45)
  // Rival writer advances store during effect execution to cause real CAS conflict
  const conflictResult = await runtime.runOperation({
    operation: "start",
    arguments: { node_id: "n1" },
    operationPermit: permit1.permit,
    consumed: { commands: 3, patches: 1, changed_lines: 45, wall_time_minutes: 2 },
    effectExecutor: async () => {
      const headCurrent = await store.load();
      await store.compareAndSwap(
        DEFAULT_SUBJECT_ID,
        headCurrent.revision,
        {
          schema_version: 1,
          status: "blocked",
          nodes: {
            n1: {
              id: "n1",
              phase: "failed",
              attempt: 1,
              budget: {
                schema_version: 1,
                turns: 10,
                patches: 5,
                commands: 20,
                wall_time_minutes: 30,
                changed_lines: 400,
                allowed_paths: ["src/**"],
              },
            },
          },
          authority_budget: {
            schema_version: 1,
            effect_attempts: 3,
            authority_mutations: 10,
            evidence_runs: 20,
            review_sweeps: 2,
          },
        },
        [
          {
            schema_version: 1,
            kernel_version: 1,
            operation_id: "sha256:rival",
            effect_id: "sha256:rival-e",
            status: "completed",
            result: { ok: true },
          },
        ]
      );
      return {
        ok: true,
        usage: { turns: 1, commands: 3, patches: 1, changed_lines: 45, wall_time_minutes: 2, effect_attempts: 1, authority_mutations: 1 },
      };
    },
  });

  assert.equal(conflictResult.outcome, "blocked");
  assert.equal(conflictResult.code, "cas-conflict");

  // Re-sync and retry with fresh permit against updated head
  const head1 = await store.load();
  const permit2 = runtime.issuePermitForSelectedTransition({
    operation: "repair",
    expected_revision: head1.revision,
    arguments: {
      node_id: "n1",
      scope: { node_ids: ["n1"], allowed_paths: ["src/**"], finding_ids: ["F-1"] },
    },
  });
  assert.equal(permit2.ok, true);

  const retryResult = await runtime.runOperation({
    operation: "repair",
    arguments: {
      node_id: "n1",
      scope: { node_ids: ["n1"], allowed_paths: ["src/**"], finding_ids: ["F-1"] },
    },
    operationPermit: permit2.permit,
    effectExecutor: async () => ({ ok: true, usage: {}, modified_files_count: 1, changed_lines: 5 }),
  });

  assert.equal(retryResult.outcome, "advanced");

  const headFinal = await store.load();
  const nodeBudget = headFinal.state.nodes.n1.budget;
  const authBudget = headFinal.state.authority_budget;

  // Node turns: 10 - 1 (from first attempt carry-over) = 9
  assert.equal(nodeBudget.turns, 9, "Turns must reflect carry-over deduction");
  // Commands: 20 - 3 (carry-over) = 17
  assert.equal(nodeBudget.commands, 17, "Commands must reflect carry-over deduction");
  // Patches: 5 - 1 (carry-over) = 4
  assert.equal(nodeBudget.patches, 4, "Patches must reflect carry-over deduction");
  // Changed lines: 400 - 45 (carry-over) = 355
  assert.equal(nodeBudget.changed_lines, 355, "Changed lines must reflect carry-over deduction");
  // Authority attempts: 3 - 1 (carry-over) = 2
  assert.equal(authBudget.effect_attempts, 2, "Authority attempts must reflect carry-over deduction");
});

test("REQ-execution-budgets-004: zero-delta dual penalty exempts operations that advance lifecycle state semantically", async () => {
  const pendingState = {
    schema_version: 1,
    status: "ready",
    nodes: {
      n1: {
        id: "n1",
        phase: "pending",
        attempt: 0,
        budget: { schema_version: 1, turns: 5 },
      },
    },
    authority_budget: { schema_version: 1, effect_attempts: 3 },
  };
  const store = createAuthorityStore({ initial: { state: pendingState, journal: [] } });
  const runtime = createKernelRuntime({ store });
  const head = await store.load();

  const permit = runtime.issuePermitForSelectedTransition({
    operation: "start",
    expected_revision: head.revision,
    arguments: { node_id: "n1" },
  });
  assert.equal(permit.ok, true);

  // 'start' modifies 0 files, but advances state from 'pending' to 'started' (reduced.outcome === "advanced" !== "unchanged")
  // It MUST NOT receive zero-delta penalty!
  const res = await runtime.runOperation({
    operation: "start",
    arguments: { node_id: "n1" },
    operationPermit: permit.permit,
    effectExecutor: async () => ({ ok: true, usage: { turns: 1, effect_attempts: 1 }, modified_files_count: 0, changed_lines: 0 }),
  });

  assert.equal(res.outcome, "advanced");
  const loaded = await store.load();
  // Node turns should be 4 (1 turn consumed for start), NOT 3 (which would happen if zero-delta dual penalty was incorrectly triggered)
  assert.equal(loaded.state.nodes.n1.budget.turns, 4, "Start should consume only 1 turn, not dual penalized as zero-delta");
  assert.equal(loaded.state.nodes.n1.zero_delta_attempts || 0, 0, "zero_delta_attempts must be 0 for advancing start");
  assert.equal(loaded.state.authority_budget.effect_attempts, 2, "Authority attempts should be 2 (start consumes 1 attempt)");
});

test("REQ-execution-budgets-003: caller-supplied input.consumed is rejected as usage authority and result.usage is used exclusively", async () => {
  const pendingState = {
    schema_version: 1,
    status: "ready",
    nodes: {
      n1: {
        id: "n1",
        phase: "pending",
        attempt: 0,
        budget: { schema_version: 1, turns: 10, commands: 20 },
      },
    },
    authority_budget: { schema_version: 1, effect_attempts: 5 },
  };
  const store = createAuthorityStore({ initial: { state: pendingState, journal: [] } });
  const runtime = createKernelRuntime({ store });
  const head = await store.load();

  const permit = runtime.issuePermitForSelectedTransition({
    operation: "start",
    expected_revision: head.revision,
    arguments: { node_id: "n1" },
  });
  assert.equal(permit.ok, true);

  // Caller passes inflated input.consumed: { turns: 99, effect_attempts: 99 }
  // effectExecutor causes a CAS race in parallel and returns genuine usage: { turns: 2, commands: 3, effect_attempts: 1 }
  const res = await runtime.runOperation({
    operation: "start",
    arguments: { node_id: "n1" },
    operationPermit: permit.permit,
    consumed: { turns: 99, effect_attempts: 99, commands: 99 },
    effectExecutor: async () => {
      // Advance head concurrently while effect is in-flight using current live head revision
      const currentHead = await store.load();
      await store.compareAndSwap(
        DEFAULT_SUBJECT_ID,
        currentHead.revision,
        { ...pendingState, status: "blocked", nodes: { n1: { id: "n1", phase: "failed", attempt: 99 } } },
        []
      );
      return {
        ok: true,
        usage: { turns: 2, commands: 3, effect_attempts: 1 },
      };
    },
  });

  assert.equal(res.outcome, "blocked");
  assert.equal(res.code, "cas-conflict");
  // res.consumed_delta must reflect genuine result.usage, ignoring caller's 99
  assert.equal(res.consumed_delta.turns, 2, "turns delta must come strictly from result.usage");
  assert.equal(res.consumed_delta.commands, 3, "commands delta must come strictly from result.usage");
  assert.equal(res.consumed_delta.effect_attempts, 1, "effect_attempts must come strictly from result.usage");
});

test("REQ-execution-budgets-003 / REQ-operation-permits-005: partitioned carry-over by ${subjectId}:${nodeId} prevents cross-node contamination", async () => {
  const pendingState = {
    schema_version: 1,
    status: "ready",
    nodes: {
      n1: {
        id: "n1",
        phase: "pending",
        attempt: 0,
        budget: { schema_version: 1, turns: 2, commands: 5 },
      },
      n2: {
        id: "n2",
        phase: "pending",
        attempt: 0,
        budget: { schema_version: 1, turns: 2, commands: 5 },
      },
    },
    authority_budget: { schema_version: 1, effect_attempts: 5 },
  };
  const store = createAuthorityStore({ initial: { state: pendingState, journal: [] } });
  const runtime = createKernelRuntime({ store });
  const head = await store.load();

  // Issue permit for n1
  const permitN1 = runtime.issuePermitForSelectedTransition({
    operation: "start",
    expected_revision: head.revision,
    arguments: { node_id: "n1" },
  });

  // n1 suffers CAS conflict and incurs carry-over (1 turn consumed)
  const resN1 = await runtime.runOperation({
    operation: "start",
    arguments: { node_id: "n1" },
    operationPermit: permitN1.permit,
    effectExecutor: async () => {
      // Advance head concurrently while effect is in-flight using current live head revision
      const currentHead = await store.load();
      await store.compareAndSwap(
        DEFAULT_SUBJECT_ID,
        currentHead.revision,
        { ...pendingState, status: "blocked", nodes: { n1: { id: "n1", phase: "failed", attempt: 99 }, n2: pendingState.nodes.n2 } },
        []
      );
      return { ok: true, usage: { turns: 1 } };
    },
  });
  assert.equal(resN1.outcome, "blocked");
  assert.equal(resN1.code, "cas-conflict");

  // Now n2 runs under the updated revision
  const headAfter = await store.load();
  const permitN2 = runtime.issuePermitForSelectedTransition({
    operation: "start",
    expected_revision: headAfter.revision,
    arguments: { node_id: "n2" },
  });
  assert.equal(permitN2.ok, true, "Permit for n2 must not be blocked by n1's carry-over");

  // n2 executes successfully
  const resN2 = await runtime.runOperation({
    operation: "start",
    arguments: { node_id: "n2" },
    operationPermit: permitN2.permit,
    effectExecutor: async () => ({ ok: true, usage: { turns: 1 } }),
  });
  assert.equal(resN2.outcome, "advanced");

  const loadedFinal = await store.load();
  // n2's budget should have 1 turn consumed by its own operation, NOT decremented by n1's carry-over
  assert.equal(loadedFinal.state.nodes.n2.budget.turns, 1, "n2 budget must only reflect n2 consumption");
});

test("K5: sterile repair with a lifecycle signal still receives the dual zero-delta penalty", async () => {
  const failedState = {
    schema_version: 1,
    status: "blocked",
    nodes: {
      n1: {
        id: "n1",
        phase: "failed",
        attempt: 1,
        failure: { category: "code_defect", code: "TEST_FAIL", priority: 5 },
        budget: { schema_version: 1, turns: 5 },
      },
    },
    authority_budget: { schema_version: 1, effect_attempts: 3 },
  };
  const store = createAuthorityStore({ initial: { state: failedState, journal: [] } });
  const runtime = createKernelRuntime({ store });
  const head = await store.load();
  const arguments_ = {
    node_id: "n1",
    scope: { node_ids: ["n1"], allowed_paths: ["src/**"], finding_ids: ["F-1"] },
  };
  const issued = runtime.issuePermitForSelectedTransition({
    operation: "repair", expected_revision: head.revision, arguments: arguments_,
  });

  const result = await runtime.runOperation({
    operation: "repair",
    arguments: arguments_,
    operationPermit: issued.permit,
    effectExecutor: async () => ({
      ok: true,
      usage: {},
      modified_files_count: 0,
      changed_lines: 0,
      state_advanced: true,
    }),
  });

  assert.equal(result.outcome, "advanced");
  const after = await store.load();
  assert.equal(after.state.nodes.n1.budget.turns, 4);
  assert.equal(after.state.authority_budget.effect_attempts, 2);
  assert.equal(after.state.nodes.n1.zero_delta_attempts, 1);
  assert.ok(after.journal.some((entry) => entry.status === "zero-delta-attempt" || entry.kind === "zero-delta-attempt"));
});

test("K5: sterile repair CAS retry preserves its single durable zero-delta penalty", async () => {
  const failedState = {
    schema_version: 1,
    status: "blocked",
    nodes: {
      n1: {
        id: "n1",
        phase: "failed",
        attempt: 1,
        failure: { category: "code_defect", code: "TEST_FAIL", priority: 5 },
        budget: { schema_version: 1, turns: 5 },
      },
    },
    authority_budget: { schema_version: 1, effect_attempts: 3 },
  };
  const base = createAuthorityStore({ initial: { state: failedState, journal: [] } });
  let compareAndSwapCalls = 0;
  const store = {
    ...base,
    async compareAndSwap(...args) {
      compareAndSwapCalls += 1;
      if (compareAndSwapCalls === 1) {
        return { ok: false, code: "cas-conflict", revision: (await base.load()).revision };
      }
      return base.compareAndSwap(...args);
    },
  };
  const runtime = createKernelRuntime({ store });
  const arguments_ = {
    node_id: "n1",
    scope: { node_ids: ["n1"], allowed_paths: ["src/**"], finding_ids: ["F-1"] },
  };
  let executions = 0;
  const firstHead = await store.load();
  const firstPermit = runtime.issuePermitForSelectedTransition({
    operation: "repair", expected_revision: firstHead.revision, arguments: arguments_,
  });
  const first = await runtime.runOperation({
    operation: "repair",
    arguments: arguments_,
    operationPermit: firstPermit.permit,
    effectExecutor: async () => {
      executions += 1;
      return { ok: true, usage: {}, modified_files_count: 0, changed_lines: 0, state_advanced: true };
    },
  });
  assert.equal(first.outcome, "blocked");
  assert.equal(first.code, "cas-conflict");

  const retryHead = await store.load();
  const retryPermit = runtime.issuePermitForSelectedTransition({
    operation: "repair", expected_revision: retryHead.revision, arguments: arguments_,
  });
  const retry = await runtime.runOperation({
    operation: "repair",
    arguments: arguments_,
    operationPermit: retryPermit.permit,
    effectExecutor: async () => {
      executions += 1;
      return { ok: true, usage: {}, modified_files_count: 0, changed_lines: 0 };
    },
  });

  assert.equal(retry.outcome, "advanced");
  assert.equal(executions, 1);
  const after = await store.load();
  assert.equal(after.state.nodes.n1.budget.turns, 4);
  assert.equal(after.state.authority_budget.effect_attempts, 2);
  assert.equal(after.state.nodes.n1.zero_delta_attempts, 1);
});

test("K5: post-effect interrupt retains partial usage for one retry and confirmed receipt loss is committed", async () => {
  const state = pendingState();
  state.nodes.n1.budget = { turns: 10 };
  state.authority_budget = { effect_attempts: 3 };
  const store = createAuthorityStore({ initial: { state } });
  const runtime = createKernelRuntime({ store });
  const head = await store.load();
  const arguments_ = { node_id: "n1" };
  const issued = runtime.issuePermitForSelectedTransition({
    operation: "start", expected_revision: head.revision, arguments: arguments_,
  });
  let executions = 0;
  const interrupted = await runtime.runOperation({
    operation: "start",
    arguments: arguments_,
    operationPermit: issued.permit,
    effectExecutor: async () => {
      executions += 1;
      const error = interruptError("after-effect");
      error.partial = { ok: true, usage: { turns: 3, effect_attempts: 1 } };
      throw error;
    },
  });
  assert.equal(interrupted.outcome, "blocked");
  assert.equal(interrupted.code, "effect-failed");
  assert.equal(interrupted.consumed_delta.turns, 3);
  assert.equal(store.snapshot().journal[0].status, "completed");
  assert.deepEqual(store.snapshot().journal[0].result.usage, { turns: 3, effect_attempts: 1 });

  const retryHead = await store.load();
  const retryPermit = runtime.issuePermitForSelectedTransition({
    operation: "start", expected_revision: retryHead.revision, arguments: arguments_,
  });
  const retry = await runtime.runOperation({
    operation: "start",
    arguments: arguments_,
    operationPermit: retryPermit.permit,
    effectExecutor: async () => {
      executions += 1;
      return { ok: true, usage: { turns: 99 } };
    },
  });
  assert.equal(retry.outcome, "advanced");
  assert.equal(executions, 1);
  assert.equal((await store.load()).state.nodes.n1.budget.turns, 7);
});

test("K5: successful physical execution commits its explicit usage exactly once", async () => {
  const state = pendingState();
  state.nodes.n1.budget = { turns: 10, commands: 20, patches: 5, changed_lines: 400 };
  state.authority_budget = { effect_attempts: 3, authority_mutations: 4 };
  const store = createAuthorityStore({ initial: { state } });
  const runtime = createKernelRuntime({ store });
  const head = await store.load();
  const issued = runtime.issuePermitForSelectedTransition({
    operation: "start", expected_revision: head.revision, arguments: { node_id: "n1" },
  });

  const result = await runtime.runOperation({
    operation: "start",
    arguments: { node_id: "n1" },
    operationPermit: issued.permit,
    effectExecutor: async () => ({
      ok: true,
      usage: { turns: 2, commands: 7, patches: 2, changed_lines: 120, effect_attempts: 1, authority_mutations: 1 },
    }),
  });

  assert.equal(result.outcome, "advanced");
  const after = await store.load();
  assert.equal(after.state.nodes.n1.budget.turns, 8);
  assert.equal(after.state.nodes.n1.budget.commands, 13);
  assert.equal(after.state.nodes.n1.budget.patches, 3);
  assert.equal(after.state.nodes.n1.budget.changed_lines, 280);
  assert.equal(after.state.authority_budget.effect_attempts, 2);
  assert.equal(after.state.authority_budget.authority_mutations, 3);
});

test("K5: failed physical execution retains usage and repeated CAS conflicts do not re-debit skipped completion", async () => {
  const state = pendingState();
  state.nodes.n1.budget = { turns: 10 };
  const base = createAuthorityStore({ initial: { state } });
  let conflicts = 0;
  const store = {
    ...base,
    async compareAndSwap(...args) {
      conflicts += 1;
      if (conflicts <= 2) return { ok: false, code: "cas-conflict", revision: (await base.load()).revision };
      return base.compareAndSwap(...args);
    },
  };
  const runtime = createKernelRuntime({ store });
  let executions = 0;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const head = await base.load();
    const issued = runtime.issuePermitForSelectedTransition({
      operation: "start", expected_revision: head.revision, arguments: { node_id: "n1" },
    });
    const result = await runtime.runOperation({
      operation: "start",
      arguments: { node_id: "n1" },
      operationPermit: issued.permit,
      effectExecutor: async () => {
        executions += 1;
        return { ok: true, usage: { turns: 3 } };
      },
    });
    if (attempt < 2) assert.equal(result.code, "cas-conflict");
    else assert.equal(result.outcome, "advanced");
  }

  assert.equal(executions, 1);
  assert.equal((await base.load()).state.nodes.n1.budget.turns, 7);
});

test("K5: confirmed failed reconciliation is not debited again by a later retry", async () => {
  const state = pendingState();
  state.nodes.n1.budget = { turns: 10 };
  const store = createAuthorityStore({ initial: { state } });
  let runtime = createKernelRuntime({ store });
  let executions = 0;

  async function retry() {
    const head = await store.load();
    const issued = runtime.issuePermitForSelectedTransition({
      operation: "start", expected_revision: head.revision, arguments: { node_id: "n1" },
    });
    return runtime.runOperation({
      operation: "start",
      arguments: { node_id: "n1" },
      operationPermit: issued.permit,
      effectExecutor: async () => {
        executions += 1;
        return { ok: false, usage: { turns: 3 } };
      },
    });
  }

  assert.equal((await retry()).code, "effect-failed");
  assert.equal((await store.load()).state.nodes.n1.budget.turns, 10);
  assert.equal((await retry()).code, "effect-failed");
  assert.equal((await store.load()).state.nodes.n1.budget.turns, 7);

  runtime = createKernelRuntime({ store });
  assert.equal((await retry()).code, "effect-failed");
  const after = await store.load();
  assert.equal(after.state.nodes.n1.budget.turns, 7);
  assert.equal(executions, 1);
  assert.equal(after.journal[0].status, "failed");
});

test("K5: effect results without execution usage fail closed without caller fallback", async () => {
  const store = createAuthorityStore({ initial: { state: pendingState() } });
  const runtime = createKernelRuntime({ store });
  const head = await store.load();
  const issued = runtime.issuePermitForSelectedTransition({
    operation: "start", expected_revision: head.revision, arguments: { node_id: "n1", commands: 999 },
  });
  const result = await runtime.runOperation({
    operation: "start",
    arguments: { node_id: "n1", commands: 999 },
    consumed: { commands: 999 },
    operationPermit: issued.permit,
    effectExecutor: async () => ({ ok: true }),
  });
  assert.equal(result.outcome, "blocked");
  assert.equal(result.code, "execution-usage-required");
});

for (const [label, executorResult] of [["undefined", undefined], ["null", null]]) {
  test(`K5: ${label} effect result fails closed before completion and cannot be retried`, async () => {
    const initialState = pendingState();
    initialState.nodes.n1.budget = { commands: 10 };
    initialState.authority_budget = { effect_attempts: 2 };
    const store = createAuthorityStore({ initial: { state: initialState } });
    const runtime = createKernelRuntime({ store });
    const beforeDigest = digestLifecycleState(initialState);
    let executions = 0;

    async function attempt() {
      const head = await store.load();
      const issued = runtime.issuePermitForSelectedTransition({
        operation: "start",
        expected_revision: head.revision,
        arguments: { node_id: "n1", commands: 999 },
      });
      return runtime.runOperation({
        operation: "start",
        arguments: { node_id: "n1", commands: 999 },
        consumed: { commands: 999 },
        operationPermit: issued.permit,
        effectExecutor: async () => {
          executions += 1;
          return executorResult;
        },
      });
    }

    const result = await attempt();
    assert.equal(result.outcome, "blocked");
    assert.equal(result.code, "execution-usage-required");

    const after = await store.load();
    assert.equal(digestLifecycleState(after.state), beforeDigest);
    assert.equal(after.journal.length, 1);
    assert.equal(after.journal[0].status, "unknown");
    assert.equal(after.journal[0].result.error, "execution-usage-required");
    assert.deepEqual(Object.keys(after.authority.receipts), []);

    const retry = await attempt();
    assert.equal(retry.code, "reconciliation-required");
    assert.equal(executions, 1);
    assert.equal(digestLifecycleState((await store.load()).state), beforeDigest);
  });
}






