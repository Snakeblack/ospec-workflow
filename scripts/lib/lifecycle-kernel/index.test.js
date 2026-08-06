"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  runKernelOperation,
  createAuthorityStore,
  createKernelRuntime,
  createPermitLedger,
  issueOperationPermit,
  reduceLifecycle,
  digestLifecycleState,
  interruptError,
} = require("./index.js");
const { mintOperationPermit, _internalCreateIssuer: createPermitAuthorityIssuer } = require("./permits.js");
const { withRuntimePermit, issueFixturePermit } = require("./test-permit-helpers.js");

function pendingState() {
  return {
    schema_version: 1,
    status: "ready",
    nodes: { n1: { id: "n1", phase: "pending", attempt: 0 } },
  };
}

async function authorizedStart(store, extra = {}) {
  const head = await store.load();
  const issued = issueFixturePermit({
    ledger: extra.permitLedger || createPermitAuthorityIssuer(),
    operation: "start",
    headRevision: head.revision,
    arguments: { node_id: "n1" },
    subject_id: "lifecycle:default",
  });
  return runKernelOperation({
    operation: "start",
    arguments: { node_id: "n1" },
    store,
    operationPermit: issued.permit,
    permitLedger: issued.ledger,
    effectExecutor: extra.effectExecutor || (async () => ({ ok: true })),
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
      return { ok: true };
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
  const head = await store.load();
  const issued = issueFixturePermit({
    ledger: createPermitAuthorityIssuer(),
    operation: "complete",
    headRevision: head.revision,
    arguments: { node_id: "n1" },
  });
  const result = await runKernelOperation({
    operation: "complete",
    arguments: { node_id: "n1" },
    store,
    operationPermit: issued.permit,
    permitLedger: issued.ledger,
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

  const result = await authorizedStart(store, {
    effectExecutor: async () => ({ ok: false, reason: "persist-denied" }),
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
  const head = await store.load();
  const issued = issueFixturePermit({
    ledger: createPermitAuthorityIssuer(),
    operation: "start",
    headRevision: head.revision,
    arguments: { node_id: "n1" },
  });

  const result = await runKernelOperation({
    operation: "start",
    arguments: { node_id: "n1" },
    store,
    operationPermit: issued.permit,
    permitLedger: issued.ledger,
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

test("default mintPermit is false; state-valid op without permit fails; head unchanged", async () => {
  const store = createAuthorityStore({ initial: { state: pendingState() } });
  const before = await store.load();
  const result = await runKernelOperation({
    operation: "start",
    arguments: { node_id: "n1" },
    store,
    authorityToken: "opaque:t1",
    effectExecutor: async () => ({ ok: true }),
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
    effectExecutor: async () => ({ ok: true }),
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
    effectExecutor: async () => ({ ok: true }),
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
  const head = await store.load();
  const issued = issueFixturePermit({
    ledger: createPermitAuthorityIssuer(),
    operation: "start",
    headRevision: head.revision,
    arguments: { node_id: "n1" },
  });

  const first = await runKernelOperation({
    operation: "start",
    arguments: { node_id: "n1" },
    store,
    operationPermit: issued.permit,
    permitLedger: issued.ledger,
    effectExecutor: async () => ({ ok: true }),
  });
  assert.equal(first.outcome, "advanced");
  const receiptId = first.operation_receipt.receipt_id;

  let effectRuns = 0;
  const replay = await runKernelOperation({
    operation: "start",
    arguments: { node_id: "n1" },
    store,
    operationPermit: issued.permit,
    permitLedger: issued.ledger,
    effectExecutor: async () => {
      effectRuns += 1;
      return { ok: true };
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

test("issueOperationPermit is re-exported from kernel index", () => {
  assert.equal(typeof issueOperationPermit, "function");
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
      return { ok: true };
    },
  });

  assert.equal(result.outcome, "blocked");
  assert.equal(result.code, "permit-not-runtime-issued");
  assert.equal(effectRuns, 0);
  const after = await store.load();
  assert.equal(after.revision, before.revision);
  assert.equal(after.state.nodes.n1.phase, "pending");
});

test("CRITICAL: a reader ledger presented as permitLedger is rejected", async () => {
  const store = createAuthorityStore({ initial: { state: pendingState(), journal: [] } });
  const before = await store.load();
  const ledger = createPermitAuthorityIssuer();
  const issued = issueFixturePermit({
    ledger,
    operation: "start",
    headRevision: before.revision,
    arguments: { node_id: "n1" },
  });

  const result = await runKernelOperation({
    operation: "start",
    arguments: { node_id: "n1" },
    store,
    operationPermit: issued.permit,
    permitLedger: createPermitLedger(),
    effectExecutor: async () => ({ ok: true }),
  });
  assert.equal(result.outcome, "blocked");
  assert.equal(result.code, "issuer-capability-required");
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
      return { ok: true };
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
  assert.equal(typeof getPrivateIssuer, "undefined");
  const head = await restored.load();
  assert.equal(head.authority.permits[consumedId].status, "consumed");

  const issued = issueFixturePermit({
    ledger: createPermitAuthorityIssuer(),
    operation: "complete",
    headRevision: head.revision,
    arguments: { node_id: "n1" },
  });
  assert.notEqual(issued.permit.permit_id, consumedId);

  const next = await runKernelOperation({
    operation: "complete",
    arguments: { node_id: "n1" },
    store: restored,
    operationPermit: issued.permit,
    permitLedger: issued.ledger,
    effectExecutor: async () => ({ ok: true }),
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
  const head = await store.load();
  const issued = issueFixturePermit({
    ledger: createPermitAuthorityIssuer(),
    operation: "start",
    headRevision: head.revision,
    arguments: { node_id: "n1" },
  });

  const first = await runKernelOperation({
    operation: "start",
    arguments: { node_id: "n1" },
    store,
    operationPermit: issued.permit,
    permitLedger: issued.ledger,
    effectExecutor: async () => ({ ok: true }),
  });
  assert.equal(first.outcome, "advanced");

  const reuse = await runKernelOperation({
    operation: "start",
    arguments: { node_id: "n2" },
    store,
    operationPermit: issued.permit,
    permitLedger: issued.ledger,
    effectExecutor: async () => ({ ok: true }),
  });
  assert.equal(reuse.replayed, undefined);
  assert.equal(reuse.outcome, "blocked");
  assert.equal(reuse.code, "permit-reuse");
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
    effectExecutor: async () => ({ ok: true }),
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
      return { ok: true };
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
  const head = await store.load();
  const issued = issueFixturePermit({
    ledger: createPermitAuthorityIssuer(),
    operation: "start",
    headRevision: head.revision,
    arguments: { node_id: "n1" },
  });

  let executions = 0;
  await assert.rejects(
    () =>
      runKernelOperation({
        operation: "start",
        arguments: { node_id: "n1" },
        store,
        effect_class: "irreversible",
        operationPermit: issued.permit,
        permitLedger: issued.ledger,
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
  const head2 = await store.load();
  const issued2 = issueFixturePermit({
    ledger: createPermitAuthorityIssuer(),
    operation: "start",
    headRevision: head2.revision,
    arguments: { node_id: "n1" },
  });
  const resume = await runKernelOperation({
    operation: "start",
    arguments: { node_id: "n1" },
    store,
    effect_class: "irreversible",
    operationPermit: issued2.permit,
    permitLedger: issued2.ledger,
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
  const head = await store2.load();
  const ledger = createPermitAuthorityIssuer();
  const stalePermit = mintOperationPermit({
    ledger,
    operation: "start",
    expected_revision: head.revision,
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
