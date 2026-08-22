"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  DEFAULT_SUBJECT_ID,
  computeRevision,
  createAuthorityStore,
} = require("./index.js");
const permits = require("../lifecycle-kernel/permits.js");
const { digestLifecycleState } = require("../lifecycle-kernel/state-digest.js");

test("Phase 1: getPrivateIssuer and _createPermitAuthorityIssuerInternal must be undefined", () => {
  assert.equal(permits._internalCreateIssuer, undefined);
  assert.equal(permits._createPermitAuthorityIssuerInternal, undefined);
});


function pendingState() {
  return {
    schema_version: 1,
    status: "ready",
    nodes: { n1: { id: "n1", phase: "pending", attempt: 0 } },
  };
}

function startedState() {
  return {
    schema_version: 1,
    status: "running",
    nodes: { n1: { id: "n1", phase: "started", attempt: 1 } },
  };
}

test("load(subjectId) returns state, journal, and non-empty revision for default subject", async () => {
  const store = createAuthorityStore({ initial: { state: pendingState(), journal: [] } });
  const loaded = await store.load(DEFAULT_SUBJECT_ID);
  assert.equal(loaded.ok, true);
  assert.equal(loaded.state.nodes.n1.phase, "pending");
  assert.ok(Array.isArray(loaded.journal));
  assert.match(loaded.revision, /^sha256:[a-f0-9]{64}$/);
  assert.equal(
    loaded.revision,
    computeRevision(loaded.state, loaded.journal, loaded.authority)
  );
});

test("missing subject fails closed without fabricated revision", async () => {
  const store = createAuthorityStore({ initial: { state: pendingState() } });
  const missing = await store.load("lifecycle:unknown-subject");
  assert.equal(missing.ok, false);
  assert.equal(missing.code, "subject-not-found");
  assert.equal(missing.revision, null);
});

test("compareAndSwap matching revision persists head and advances revision", async () => {
  const store = createAuthorityStore({ initial: { state: pendingState(), journal: [] } });
  const before = await store.load();
  const next = startedState();
  const cas = await store.compareAndSwap(DEFAULT_SUBJECT_ID, before.revision, next, []);
  assert.equal(cas.ok, true);
  assert.notEqual(cas.revision, before.revision);
  const after = await store.load();
  assert.equal(after.state.nodes.n1.phase, "started");
  assert.equal(after.revision, cas.revision);
});

test("stale expected revision is rejected and head unchanged", async () => {
  const store = createAuthorityStore({ initial: { state: pendingState(), journal: [] } });
  const before = await store.load();
  await store.compareAndSwap(DEFAULT_SUBJECT_ID, before.revision, startedState(), []);
  const mid = await store.load();
  const stale = await store.compareAndSwap(
    DEFAULT_SUBJECT_ID,
    before.revision,
    pendingState(),
    []
  );
  assert.equal(stale.ok, false);
  assert.ok(stale.code === "cas-conflict" || stale.code === "stale-revision");
  const after = await store.load();
  assert.equal(after.revision, mid.revision);
  assert.equal(digestLifecycleState(after.state), digestLifecycleState(mid.state));
});

test("concurrent writers on same R: exactly one wins; loser cas-conflict; budgets unchanged", async () => {
  const store = createAuthorityStore({
    initial: { state: pendingState(), journal: [] },
    budgets: { attempts: 2, corrections: 1 },
  });
  const before = await store.load();
  const budgetsBefore = store.getBudgets();

  const writerA = startedState();
  const writerB = {
    schema_version: 1,
    status: "blocked",
    nodes: { n1: { id: "n1", phase: "failed", attempt: 1 } },
  };

  const first = await store.compareAndSwap(DEFAULT_SUBJECT_ID, before.revision, writerA, []);
  const second = await store.compareAndSwap(DEFAULT_SUBJECT_ID, before.revision, writerB, []);

  assert.equal(first.ok, true);
  assert.equal(second.ok, false);
  assert.equal(second.code, "cas-conflict");
  assert.equal(second.revision, first.revision);
  assert.deepEqual(store.getBudgets(), budgetsBefore);
  assert.deepEqual(second.budgets, budgetsBefore);

  const after = await store.load();
  assert.equal(after.state.nodes.n1.phase, "started");
});

test("exact replay on same R converges without second advance", async () => {
  const store = createAuthorityStore({ initial: { state: pendingState(), journal: [] } });
  const before = await store.load();
  const next = startedState();
  const journal = [
    {
      schema_version: 1,
      kernel_version: 1,
      operation_id: "sha256:op1",
      effect_id: "sha256:e1",
      status: "completed",
      result: { ok: true },
    },
  ];
  const first = await store.compareAndSwap(DEFAULT_SUBJECT_ID, before.revision, next, journal);
  assert.equal(first.ok, true);
  const head = await store.load();

  // Replay identical content against current head revision (convergent no-op).
  const replay = await store.compareAndSwap(
    DEFAULT_SUBJECT_ID,
    head.revision,
    next,
    journal
  );
  assert.equal(replay.ok, true);
  assert.equal(replay.converged, true);
  assert.equal(replay.revision, head.revision);
  const after = await store.load();
  assert.equal(after.revision, head.revision);
});

test("authority store exposes no public bare commit", () => {
  const store = createAuthorityStore({ initial: { state: pendingState() } });
  assert.equal(typeof store.compareAndSwap, "function");
  assert.equal(typeof store.load, "function");
  assert.equal(store.commit, undefined);
});

test("foreign commitJournal blocks mid-op CAS with stale R and mismatched journal", async () => {
  const store = createAuthorityStore({ initial: { state: pendingState(), journal: [] } });
  const before = await store.load();
  const foreignJournal = [
    {
      schema_version: 1,
      kernel_version: 1,
      operation_id: "sha256:foreign-op",
      effect_id: "sha256:foreign-effect",
      status: "started",
      result: { barrier: "pre-effect" },
    },
  ];
  await store.commitJournal(foreignJournal);

  const stale = await store.compareAndSwap(
    DEFAULT_SUBJECT_ID,
    before.revision,
    startedState(),
    foreignJournal
  );
  assert.equal(stale.ok, false);
  assert.equal(stale.code, "cas-conflict");

  const after = await store.load();
  assert.notEqual(after.revision, before.revision);
  assert.equal(after.state.nodes.n1.phase, "pending");
  assert.equal(after.journal.length, 1);
});

test("mid-op journal-only OK: journal advanced, state CAS under R0 succeeds", async () => {
  const store = createAuthorityStore({ initial: { state: pendingState(), journal: [] } });
  const r0 = await store.load();
  const journal = [
    {
      schema_version: 1,
      kernel_version: 1,
      operation_id: "sha256:op1",
      effect_id: "sha256:e1",
      status: "completed",
      result: { ok: true },
    },
  ];
  const jr = await store.commitJournal(journal, DEFAULT_SUBJECT_ID, r0.revision);

  const afterJournal = await store.load();
  assert.notEqual(afterJournal.revision, r0.revision);
  assert.equal(afterJournal.journal.length, 1);
  assert.equal(
    digestLifecycleState(afterJournal.state),
    digestLifecycleState(r0.state)
  );

  const cas = await store.compareAndSwap(
    DEFAULT_SUBJECT_ID,
    r0.revision,
    startedState(),
    journal,
    jr.mid_op_ticket
  );
  assert.equal(cas.ok, true);
  assert.notEqual(cas.revision, r0.revision);

  const after = await store.load();
  assert.equal(after.state.nodes.n1.phase, "started");
  assert.equal(after.journal.length, 1);
});

test("mid-op CAS rejected when state_digest diverged from load baseline", async () => {
  const store = createAuthorityStore({ initial: { state: pendingState(), journal: [] } });
  const r0 = await store.load();
  const journal = [
    {
      schema_version: 1,
      kernel_version: 1,
      operation_id: "sha256:op1",
      effect_id: "sha256:e1",
      status: "completed",
      result: { ok: true },
    },
  ];
  const jr = await store.commitJournal(journal, DEFAULT_SUBJECT_ID, r0.revision);

  const head = await store.load();
  const bWin = await store.compareAndSwap(
    DEFAULT_SUBJECT_ID,
    head.revision,
    startedState(),
    journal
  );
  assert.equal(bWin.ok, true);

  const rejected = await store.compareAndSwap(
    DEFAULT_SUBJECT_ID,
    r0.revision,
    startedState(),
    journal,
    jr.mid_op_ticket
  );
  assert.equal(rejected.ok, false);
  assert.equal(rejected.code, "cas-conflict");
  assert.equal(rejected.revision, bWin.revision);

  const after = await store.load();
  assert.equal(after.revision, bWin.revision);
  assert.equal(digestLifecycleState(after.state), digestLifecycleState(startedState()));
});

test("S0→S1→S0 recycle: stale R0 mid-op CAS fails closed", async () => {
  const store = createAuthorityStore({ initial: { state: pendingState(), journal: [] } });
  const r0 = await store.load();
  const journal = [
    {
      schema_version: 1,
      kernel_version: 1,
      operation_id: "sha256:op1",
      effect_id: "sha256:e1",
      status: "completed",
      result: { ok: true },
    },
  ];
  const jr = await store.commitJournal(journal, DEFAULT_SUBJECT_ID, r0.revision);
  await store.compareAndSwap(DEFAULT_SUBJECT_ID, r0.revision, startedState(), journal, jr.mid_op_ticket);
  await store.compareAndSwap(
    DEFAULT_SUBJECT_ID,
    (await store.load()).revision,
    pendingState(),
    journal
  );
  const recycled = await store.compareAndSwap(
    DEFAULT_SUBJECT_ID,
    r0.revision,
    startedState(),
    journal,
    jr.mid_op_ticket
  );
  assert.equal(recycled.ok, false);
  assert.equal(recycled.code, "cas-conflict");
});

test("foreign commitJournal with copied journal but no ticket fails closed", async () => {
  const store = createAuthorityStore({ initial: { state: pendingState(), journal: [] } });
  const r0 = await store.load();
  const journal = [
    {
      schema_version: 1,
      kernel_version: 1,
      operation_id: "sha256:op1",
      effect_id: "sha256:e1",
      status: "completed",
      result: { ok: true },
    },
  ];
  await store.commitJournal(journal);
  const forged = await store.compareAndSwap(
    DEFAULT_SUBJECT_ID,
    r0.revision,
    startedState(),
    journal
  );
  assert.equal(forged.ok, false);
  assert.equal(forged.code, "cas-conflict");
});

function sampleReceipt(permitId, revision) {
  return {
    schema_version: 1,
    kind: "operation-receipt/v1",
    receipt_id: "sha256:receipt-sample-0001",
    permit_id: permitId,
    subject_id: DEFAULT_SUBJECT_ID,
    operation: "start",
    revision,
    outcome: "advanced",
    operation_intent_digest: "sha256:intent-sample-0001",
    arguments_digest: "sha256:arguments-sample-0001",
  };
}

function samplePermitRecord(permitId, overrides = {}) {
  return {
    permit_id: permitId,
    status: "consumed",
    operation_intent_digest: "sha256:intent-sample-0001",
    permit_digest: "sha256:permit-sample-0001",
    operation: "start",
    subject_id: DEFAULT_SUBJECT_ID,
    arguments_digest: "sha256:arguments-sample-0001",
    scope_digest: "sha256:scope-sample-0001",
    policy_digest: "sha256:policy-sample-0001",
    issuer_decision_id: "rule:sample",
    expected_revision: "sha256:expected-sample-0001",
    ...overrides,
  };
}

function sampleAuthorityCommit(permitId, receipt) {
  return {
    permit_id: permitId,
    receipt,
    status: "consumed",
    permit_record: samplePermitRecord(permitId),
  };
}

test("load and snapshot expose authority bag with permits and receipts", async () => {
  const store = createAuthorityStore({
    initial: {
      state: pendingState(),
      journal: [],
      authority: { permits: {}, receipts: {} },
    },
  });
  const loaded = await store.load();
  assert.equal(loaded.ok, true);
  assert.ok(loaded.authority);
  assert.equal(typeof loaded.authority.permits, "object");
  assert.equal(typeof loaded.authority.receipts, "object");

  const snap = store.snapshot();
  assert.ok(snap.authority);
  assert.equal(typeof snap.authority.permits, "object");
  assert.equal(typeof snap.authority.receipts, "object");
});

test("permit-authorized CAS requires authorityCommit; incomplete fails with head unchanged", async () => {
  const store = createAuthorityStore({ initial: { state: pendingState(), journal: [] } });
  const before = await store.load();
  // Explicit null / partial payload = permit-authorized intent without complete bag write.
  const omitted = await store.compareAndSwap(
    DEFAULT_SUBJECT_ID,
    before.revision,
    startedState(),
    [],
    null,
    null
  );
  assert.equal(omitted.ok, false);
  assert.equal(omitted.code, "authority-commit-incomplete");

  const partial = await store.compareAndSwap(
    DEFAULT_SUBJECT_ID,
    before.revision,
    startedState(),
    [],
    null,
    { permit_id: "permit:runtime:partial", status: "consumed" }
  );
  assert.equal(partial.ok, false);
  assert.equal(partial.code, "authority-commit-incomplete");

  // Receipt present but the durable permit record (intent + digests) is missing.
  const withoutRecord = await store.compareAndSwap(
    DEFAULT_SUBJECT_ID,
    before.revision,
    startedState(),
    [],
    null,
    {
      permit_id: "permit:runtime:no-record",
      receipt: sampleReceipt("permit:runtime:no-record", "pending"),
      status: "consumed",
    }
  );
  assert.equal(withoutRecord.ok, false);
  assert.equal(withoutRecord.code, "authority-commit-incomplete");

  // Record present but missing the operation intent digest.
  const permitId = "permit:runtime:no-intent";
  const record = samplePermitRecord(permitId);
  delete record.operation_intent_digest;
  const withoutIntent = await store.compareAndSwap(
    DEFAULT_SUBJECT_ID,
    before.revision,
    startedState(),
    [],
    null,
    {
      permit_id: permitId,
      receipt: sampleReceipt(permitId, "pending"),
      status: "consumed",
      permit_record: record,
    }
  );
  assert.equal(withoutIntent.ok, false);
  assert.equal(withoutIntent.code, "authority-commit-incomplete");

  const after = await store.load();
  assert.equal(after.revision, before.revision);
  assert.equal(after.state.nodes.n1.phase, "pending");
});

test("winning CAS with authorityCommit atomically writes consumed permit and receipt", async () => {
  const store = createAuthorityStore({ initial: { state: pendingState(), journal: [] } });
  const before = await store.load();
  const permitId = "permit:runtime:0001";
  const receipt = sampleReceipt(permitId, "pending");
  const cas = await store.compareAndSwap(
    DEFAULT_SUBJECT_ID,
    before.revision,
    startedState(),
    [],
    null,
    sampleAuthorityCommit(permitId, receipt)
  );
  assert.equal(cas.ok, true);
  assert.notEqual(cas.revision, before.revision);

  const after = await store.load();
  assert.equal(after.state.nodes.n1.phase, "started");
  assert.equal(after.authority.permits[permitId].status, "consumed");
  assert.equal(after.authority.receipts[permitId].receipt_id, receipt.receipt_id);
  assert.equal(after.authority.receipts[permitId].kind, "operation-receipt/v1");

  // Durable intent travels with the consume so replay can be verified after restart.
  const stored = after.authority.permits[permitId];
  assert.equal(stored.operation_intent_digest, "sha256:intent-sample-0001");
  assert.equal(stored.permit_digest, "sha256:permit-sample-0001");
  assert.equal(stored.arguments_digest, "sha256:arguments-sample-0001");
  assert.equal(stored.operation, "start");
  assert.equal(stored.subject_id, DEFAULT_SUBJECT_ID);
  assert.equal(stored.issuer_decision_id, "rule:sample");
  assert.equal(stored.expected_revision, "sha256:expected-sample-0001");

  assert.equal(after.revision, computeRevision(after.state, after.journal, after.authority));
  assert.equal(after.revision, cas.revision);
});

test("authority bag is part of the revision: same state and journal, different head", async () => {
  const state = startedState();
  const journal = [];
  const plain = createAuthorityStore({ initial: { state, journal } });
  const withBag = createAuthorityStore({
    initial: {
      state,
      journal,
      authority: {
        permits: { "permit:runtime:seeded": samplePermitRecord("permit:runtime:seeded") },
        receipts: { "permit:runtime:seeded": sampleReceipt("permit:runtime:seeded", "sha256:x") },
      },
    },
  });

  const plainHead = await plain.load();
  const bagHead = await withBag.load();
  assert.equal(
    digestLifecycleState(plainHead.state),
    digestLifecycleState(bagHead.state)
  );
  assert.deepEqual(plainHead.journal, bagHead.journal);
  assert.notEqual(plainHead.revision, bagHead.revision);

  // Consuming a permit advances the head even when state and journal are untouched.
  const permitId = "permit:runtime:bag-only";
  const healed = await plain.compareAndSwap(
    DEFAULT_SUBJECT_ID,
    plainHead.revision,
    startedState(),
    [],
    null,
    sampleAuthorityCommit(permitId, sampleReceipt(permitId, "pending"))
  );
  assert.equal(healed.ok, true);
  assert.notEqual(healed.revision, plainHead.revision);
  const afterHeal = await plain.load();
  assert.equal(afterHeal.revision, healed.revision);
});

test("exact replay of permit-authorized CAS returns stored receipt without second advance", async () => {
  const store = createAuthorityStore({ initial: { state: pendingState(), journal: [] } });
  const before = await store.load();
  const permitId = "permit:runtime:replay-1";
  const journal = [
    {
      schema_version: 1,
      kernel_version: 1,
      operation_id: "sha256:op-replay",
      effect_id: "sha256:e-replay",
      status: "completed",
      result: { ok: true },
    },
  ];
  const receipt = sampleReceipt(permitId, "pending");
  const first = await store.compareAndSwap(
    DEFAULT_SUBJECT_ID,
    before.revision,
    startedState(),
    journal,
    null,
    sampleAuthorityCommit(permitId, receipt)
  );
  assert.equal(first.ok, true);
  const head = await store.load();
  const storedReceipt = head.authority.receipts[permitId];

  const replay = await store.compareAndSwap(
    DEFAULT_SUBJECT_ID,
    head.revision,
    startedState(),
    journal,
    null,
    sampleAuthorityCommit(permitId, receipt)
  );
  assert.equal(replay.ok, true);
  assert.equal(replay.converged, true);
  assert.equal(replay.revision, head.revision);
  assert.deepEqual(replay.operation_receipt, storedReceipt);

  const after = await store.load();
  assert.equal(after.revision, head.revision);
  assert.equal(after.authority.receipts[permitId].receipt_id, storedReceipt.receipt_id);
});

test("in-process restart via snapshot/initial preserves authority bag", async () => {
  const store = createAuthorityStore({ initial: { state: pendingState(), journal: [] } });
  const before = await store.load();
  const permitId = "permit:runtime:restart-1";
  const receipt = sampleReceipt(permitId, "pending");
  await store.compareAndSwap(
    DEFAULT_SUBJECT_ID,
    before.revision,
    startedState(),
    [],
    null,
    sampleAuthorityCommit(permitId, receipt)
  );
  const snap = store.snapshot();
  assert.ok(snap.authority.permits[permitId]);
  assert.ok(snap.authority.receipts[permitId]);

  const restored = createAuthorityStore({ initial: snap });
  const loaded = await restored.load();
  assert.equal(loaded.authority.permits[permitId].status, "consumed");
  assert.equal(loaded.authority.receipts[permitId].receipt_id, receipt.receipt_id);
  assert.equal(loaded.state.nodes.n1.phase, "started");
});

test("convergent permit-authorized CAS without bag receipt co-writes or fails closed", async () => {
  const store = createAuthorityStore({ initial: { state: startedState(), journal: [] } });
  const head = await store.load();
  const permitId = "permit:runtime:converge-heal";
  const receipt = sampleReceipt(permitId, head.revision);

  // State+journal already match next → convergent path; bag lacks consume+receipt.
  const cas = await store.compareAndSwap(
    DEFAULT_SUBJECT_ID,
    head.revision,
    startedState(),
    [],
    null,
    sampleAuthorityCommit(permitId, receipt)
  );
  assert.equal(cas.ok, true);
  assert.equal(cas.converged, true);
  assert.ok(cas.operation_receipt);
  assert.equal(cas.operation_receipt.receipt_id, receipt.receipt_id);

  const after = await store.load();
  assert.equal(after.authority.permits[permitId].status, "consumed");
  assert.equal(after.authority.receipts[permitId].receipt_id, receipt.receipt_id);
});

test("convergent permit-authorized CAS persists updated authority bag to inner store via inner.commit", async () => {
  let committed = false;
  const innerStore = {
    async load() {
      return { state: startedState(), journal: [], authority: { permits: {}, receipts: {} } };
    },
    async commit(record) {
      committed = true;
      assert.ok(record.authority.permits["permit:runtime:converge-persist"]);
    },
    snapshot() {
      return { state: startedState(), journal: [], authority: { permits: {}, receipts: {} } };
    },
  };
  const store = createAuthorityStore({ store: innerStore });
  const head = await store.load();
  const permitId = "permit:runtime:converge-persist";
  const receipt = sampleReceipt(permitId, head.revision);

  const cas = await store.compareAndSwap(
    DEFAULT_SUBJECT_ID,
    head.revision,
    startedState(),
    [],
    null,
    sampleAuthorityCommit(permitId, receipt)
  );
  assert.equal(cas.ok, true);
  assert.equal(cas.converged, true);
  assert.equal(committed, true);
});

test("permit-authorized CAS never exposes advanced head without matching consume+receipt", async () => {
  const { createMemoryStore } = require("../lifecycle-kernel/memory-store.js");
  const observations = [];
  const pendingLoads = [];
  const inner = createMemoryStore({ state: pendingState(), journal: [] });
  const origCommit = inner.commit.bind(inner);
  let store;

  inner.commit = async (payload) => {
    const result = await origCommit(payload);
    // Yield so concurrent readers get a chance to observe mid-CAS. The load is
    // started (not awaited) here: the subject mutex must queue it behind the CAS.
    await new Promise((resolve) => {
      queueMicrotask(() => {
        pendingLoads.push(store.load());
        observations.push(store.snapshot());
        resolve();
      });
    });
    return result;
  };

  store = createAuthorityStore({ store: inner, initial: { state: pendingState(), journal: [] } });
  const before = await store.load();
  const permitId = "permit:runtime:atomic-obs";
  const receipt = sampleReceipt(permitId, "pending");
  const cas = await store.compareAndSwap(
    DEFAULT_SUBJECT_ID,
    before.revision,
    startedState(),
    [],
    null,
    sampleAuthorityCommit(permitId, receipt)
  );
  assert.equal(cas.ok, true);
  observations.push(...(await Promise.all(pendingLoads)));
  assert.ok(observations.length >= 2);

  for (const mid of observations) {
    const advanced =
      mid.state && mid.state.nodes && mid.state.nodes.n1 && mid.state.nodes.n1.phase === "started";
    if (!advanced) continue;
    assert.equal(mid.authority.permits[permitId].status, "consumed");
    assert.ok(mid.authority.receipts[permitId]);
    assert.equal(mid.authority.receipts[permitId].receipt_id, receipt.receipt_id);
  }
});

test("concurrent load during a slow commit is serialized behind the CAS", async () => {
  const { createMemoryStore } = require("../lifecycle-kernel/memory-store.js");
  const inner = createMemoryStore({ state: pendingState(), journal: [] });
  const origCommit = inner.commit.bind(inner);
  let releaseCommit;
  const commitGate = new Promise((resolve) => {
    releaseCommit = resolve;
  });
  let commitEntered = false;

  inner.commit = async (payload) => {
    const result = await origCommit(payload);
    commitEntered = true;
    await commitGate;
    return result;
  };

  const store = createAuthorityStore({
    store: inner,
    initial: { state: pendingState(), journal: [] },
  });
  const before = await store.load();
  const permitId = "permit:runtime:slow-commit";
  const receipt = sampleReceipt(permitId, "pending");

  const casPromise = store.compareAndSwap(
    DEFAULT_SUBJECT_ID,
    before.revision,
    startedState(),
    [],
    null,
    sampleAuthorityCommit(permitId, receipt)
  );

  // Give the CAS time to reach the blocked commit, then race a reader against it.
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(commitEntered, true);
  const loadPromise = store.load();
  let loadSettled = false;
  loadPromise.then(() => {
    loadSettled = true;
  });
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(loadSettled, false, "load must not resolve while a CAS holds the subject");

  releaseCommit();
  const cas = await casPromise;
  const loaded = await loadPromise;
  assert.equal(cas.ok, true);
  assert.equal(loaded.state.nodes.n1.phase, "started");
  assert.equal(loaded.authority.permits[permitId].status, "consumed");
  assert.equal(loaded.authority.receipts[permitId].receipt_id, receipt.receipt_id);
  assert.equal(loaded.revision, cas.revision);
});

test("failure during authority bag materialization does not leave orphan head", async () => {
  const store = createAuthorityStore({ initial: { state: pendingState(), journal: [] } });
  const before = await store.load();
  const permitId = "permit:runtime:bag-boom";
  const receipt = sampleReceipt(permitId, "pending");
  Object.defineProperty(receipt, "poison", {
    enumerable: true,
    get() {
      throw new Error("bag-materialization-failed");
    },
  });

  await assert.rejects(
    () =>
      store.compareAndSwap(
        DEFAULT_SUBJECT_ID,
        before.revision,
        startedState(),
        [],
        null,
        sampleAuthorityCommit(permitId, receipt)
      ),
    /bag-materialization-failed/
  );

  const after = await store.load();
  assert.equal(after.revision, before.revision);
  assert.equal(after.state.nodes.n1.phase, "pending");
  assert.deepEqual(Object.keys(after.authority.permits), []);
  assert.deepEqual(Object.keys(after.authority.receipts), []);
});

test("Task 1.2 & 3.1: store.getPermitIssuer is undefined on public store interface", () => {
  const store = createAuthorityStore({ initial: { state: pendingState() } });
  assert.equal(store.getPermitIssuer, undefined);
});

test("REQ-authority-store-003 / REQ-authority-store-011: concurrent commitJournal calls issue isolated mid-op tickets via Map and CAS deletes matched ticket", async () => {
  const store = createAuthorityStore({ initial: { state: pendingState(), journal: [] } });
  const r0 = await store.load();

  const journal1 = [
    {
      schema_version: 1,
      kernel_version: 1,
      operation_id: "sha256:op-w1",
      effect_id: "sha256:e-w1",
      status: "completed",
      result: { ok: true },
    },
  ];
  const journal2 = [
    {
      schema_version: 1,
      kernel_version: 1,
      operation_id: "sha256:op-w2",
      effect_id: "sha256:e-w2",
      status: "completed",
      result: { ok: true },
    },
  ];

  // Writer 1 and Writer 2 both commitJournal against baseline R0
  const jr1 = await store.commitJournal(journal1, DEFAULT_SUBJECT_ID, r0.revision);
  assert.ok(jr1.ok);
  assert.ok(jr1.mid_op_ticket);

  const jr2 = await store.commitJournal(journal2, DEFAULT_SUBJECT_ID, r0.revision);
  assert.ok(jr2.ok);
  assert.ok(jr2.mid_op_ticket);
  assert.notEqual(jr1.mid_op_ticket, jr2.mid_op_ticket);

  // Writer 1 executes CAS using ticket T1 against baseline R0
  // Under scalar midOpTicket, W2's commitJournal overwrote T1, causing W1 to fail!
  const cas1 = await store.compareAndSwap(
    DEFAULT_SUBJECT_ID,
    r0.revision,
    startedState(),
    journal1,
    jr1.mid_op_ticket
  );
  assert.equal(cas1.ok, true, "Writer 1 CAS with ticket T1 must succeed despite concurrent W2 commitJournal");

  const afterW1 = await store.load();
  assert.equal(afterW1.state.nodes.n1.phase, "started");
});

test("REQ-authority-store-003 / REQ-authority-store-011: commitJournal performs merge-safe upsert by effect_id", async () => {
  const store = createAuthorityStore({ initial: { state: pendingState(), journal: [] } });
  const r0 = await store.load();

  const j1 = [
    { effect_id: "eff-101", status: "started", result: { barrier: "pre-effect" } },
    { effect_id: "eff-102", status: "started", result: { barrier: "pre-effect" } },
  ];
  await store.commitJournal(j1, DEFAULT_SUBJECT_ID, r0.revision);

  const after1 = await store.load();
  assert.equal(after1.journal.length, 2);

  // Second commitJournal updates eff-101 and adds eff-103
  const j2 = [
    { effect_id: "eff-101", status: "completed", result: { ok: true } },
    { effect_id: "eff-103", status: "completed", result: { ok: true } },
  ];
  await store.commitJournal(j2, DEFAULT_SUBJECT_ID, after1.revision);

  const after2 = await store.load();
  assert.equal(after2.journal.length, 3, "Journal entries must be merged/upserted by effect_id");
  const eff101 = after2.journal.find((e) => e.effect_id === "eff-101");
  const eff102 = after2.journal.find((e) => e.effect_id === "eff-102");
  const eff103 = after2.journal.find((e) => e.effect_id === "eff-103");
  assert.equal(eff101.status, "completed");
  assert.equal(eff102.status, "started");
  assert.equal(eff103.status, "completed");
});

test("REQ-authority-store-003 / REQ-authority-store-011: winning CAS deletes only winning midOpTicket, preserving peer midOpTickets", async () => {
  const store = createAuthorityStore({ initial: { state: pendingState(), journal: [] } });
  const r0 = await store.load();

  const j1 = [{ effect_id: "eff-w1", status: "completed", result: { ok: true } }];
  const j2 = [{ effect_id: "eff-w2", status: "completed", result: { ok: true } }];

  const jr1 = await store.commitJournal(j1, DEFAULT_SUBJECT_ID, r0.revision);
  const jr2 = await store.commitJournal(j2, DEFAULT_SUBJECT_ID, r0.revision);

  assert.ok(jr1.mid_op_ticket);
  assert.ok(jr2.mid_op_ticket);

  // Writer 1 commits CAS successfully, advancing state to started
  const cas1 = await store.compareAndSwap(
    DEFAULT_SUBJECT_ID,
    r0.revision,
    startedState(),
    j1,
    jr1.mid_op_ticket
  );
  assert.equal(cas1.ok, true);

  // Calling CAS with deleted jr1 ticket fails
  const casReplayT1 = await store.compareAndSwap(
    DEFAULT_SUBJECT_ID,
    r0.revision,
    startedState(),
    j1,
    jr1.mid_op_ticket
  );
  assert.equal(casReplayT1.ok, false);

  // Writer 2's ticket jr2 was preserved: calling CAS with jr2 against R0 detects state drift
  // and returns cas-conflict (not missing ticket)
  const casW2 = await store.compareAndSwap(
    DEFAULT_SUBJECT_ID,
    r0.revision,
    { schema_version: 1, status: "running", nodes: { n1: { phase: "started", attempt: 2 } } },
    j2,
    jr2.mid_op_ticket
  );
  assert.equal(casW2.ok, false);
  assert.equal(casW2.code, "cas-conflict");
});

