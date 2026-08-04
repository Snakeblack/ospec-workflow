"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  DEFAULT_SUBJECT_ID,
  computeRevision,
  createAuthorityStore,
} = require("./index.js");
const { digestLifecycleState } = require("../lifecycle-kernel/state-digest.js");

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
    computeRevision(loaded.state, loaded.journal)
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
