"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");

const { createFileSystemStore } = require("./filesystem-store.js");
const { createAuthorityStore } = require("./authority-store/index.js");
const { createKernelRuntime } = require("./lifecycle-kernel/index.js");
const { runKernelOperation } = require("./minimal-kernel-harness.js");
const { issueFixturePermit } = require("./test-support/permit-test-helpers.js");

function tmpFile() {
  return path.join(os.tmpdir(), `fs-store-test-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
}

function pendingState() {
  return {
    schema_version: 1,
    status: "ready",
    nodes: { n1: { id: "n1", phase: "pending", attempt: 0 } },
  };
}

test("FileSystemStore saves and loads full 4-tuple record atomic CAS unit", async () => {
  const filePath = tmpFile();
  try {
    const fsStore = createFileSystemStore({ filePath, initializeIfMissing: true });
    const loadedInit = await fsStore.load();
    assert.deepEqual(loadedInit.state, { schema_version: 1, status: "ready", nodes: {} });
    assert.deepEqual(loadedInit.journal, []);
    assert.deepEqual(loadedInit.authority, { permits: {}, receipts: {} });

    const nextState = { schema_version: 1, status: "running", nodes: { n1: { phase: "started" } } };
    const nextJournal = [{ effect_id: "e1", status: "completed" }];
    const nextAuthority = { permits: { p1: { status: "consumed" } }, receipts: { p1: { receipt_id: "r1" } } };
    const nextBudgets = { attempts: 1, corrections: 0 };

    await fsStore.commit({
      state: nextState,
      journal: nextJournal,
      authority: nextAuthority,
      budgets: nextBudgets,
    });

    const fileRaw = await fs.readFile(filePath, "utf8");
    const json = JSON.parse(fileRaw);
    assert.deepEqual(json.state, nextState);
    assert.deepEqual(json.journal, nextJournal);
    assert.deepEqual(json.authority, nextAuthority);
    assert.deepEqual(json.budgets, nextBudgets);

    const reloaded = await fsStore.load();
    assert.deepEqual(reloaded.state, nextState);
    assert.deepEqual(reloaded.journal, nextJournal);
    assert.deepEqual(reloaded.authority, nextAuthority);
    assert.deepEqual(reloaded.budgets, nextBudgets);
  } finally {
    try { await fs.unlink(filePath); } catch (_) {}
  }
});

test("Real process restart reading from FileSystemStore preserves authority bag without manual snapshot()", async () => {
  const filePath = tmpFile();
  try {
    const inner1 = createFileSystemStore({ filePath, initial: { state: pendingState() }, initializeIfMissing: true });
    const store1 = createAuthorityStore({ store: inner1 });
    const runtime1 = createKernelRuntime({ store: store1 });

    const head1 = await store1.load();
    const issued = runtime1.issuePermitForSelectedTransition({
      operation: "start",
      expected_revision: head1.revision,
      arguments: { node_id: "n1" },
    });
    assert.ok(issued.ok);

    const opResult = await runtime1.runOperation({
      operation: "start",
      arguments: { node_id: "n1" },
      operationPermit: issued.permit,
      effectExecutor: async () => ({ ok: true, usage: {} }),
    });
    assert.equal(opResult.outcome, "advanced");
    assert.ok(opResult.operation_receipt);
    const permitId = issued.permit.permit_id;

    // Simulate process termination and fresh restart reading from disk ONLY (no snapshot() call!)
    const inner2 = createFileSystemStore({ filePath });
    const store2 = createAuthorityStore({ store: inner2 });

    const head2 = await store2.load();
    assert.equal(head2.state.nodes.n1.phase, "started");
    assert.ok(head2.authority?.permits?.[permitId]);
    assert.equal(head2.authority.permits[permitId].status, "consumed");
    assert.ok(head2.authority?.receipts?.[permitId]);
  } finally {
    try { await fs.unlink(filePath); } catch (_) {}
  }
});

test("Crash before atomic rename retains old head intact; incomplete temp files ignored", async () => {
  const filePath = tmpFile();
  try {
    const inner1 = createFileSystemStore({ filePath, initial: { state: pendingState() }, initializeIfMissing: true });
    const store1 = createAuthorityStore({ store: inner1 });
    const runtime1 = createKernelRuntime({ store: store1 });

    const head1 = await store1.load();
    const issued = runtime1.issuePermitForSelectedTransition({
      operation: "start",
      expected_revision: head1.revision,
      arguments: { node_id: "n1" },
    });
    assert.ok(issued.ok);

    await runtime1.runOperation({
      operation: "start",
      arguments: { node_id: "n1" },
      operationPermit: issued.permit,
      effectExecutor: async () => ({ ok: true, usage: {} }),
    });

    const headBefore = await store1.load();

    // Create an orphaned temp file simulating a crashed write in progress
    const tempPath = `${filePath}.tmp.crashed-uuid`;
    await fs.writeFile(tempPath, `{"state": "corrupted torn JSON write`, "utf8");

    // Instantiating a fresh store from disk must load the intact head.json, ignoring temp file
    const inner2 = createFileSystemStore({ filePath });
    const store2 = createAuthorityStore({ store: inner2 });
    const headAfter = await store2.load();

    assert.equal(headAfter.revision, headBefore.revision);
    assert.equal(headAfter.state.nodes.n1.phase, "started");
    assert.deepEqual(headAfter.authority, headBefore.authority);
  } finally {
    try { await fs.unlink(filePath); } catch (_) {}
    try { await fs.unlink(`${filePath}.tmp.crashed-uuid`); } catch (_) {}
  }
});

test("Crash after atomic rename retains new head intact with zero torn state", async () => {
  const filePath = tmpFile();
  try {
    const inner1 = createFileSystemStore({ filePath, initial: { state: pendingState() }, initializeIfMissing: true });
    const store1 = createAuthorityStore({ store: inner1 });
    const runtime1 = createKernelRuntime({ store: store1 });

    const head1 = await store1.load();
    const issued = runtime1.issuePermitForSelectedTransition({
      operation: "start",
      expected_revision: head1.revision,
      arguments: { node_id: "n1" },
    });
    assert.ok(issued.ok);

    const res = await runtime1.runOperation({
      operation: "start",
      arguments: { node_id: "n1" },
      operationPermit: issued.permit,
      effectExecutor: async () => ({ ok: true, usage: {} }),
    });
    assert.equal(res.outcome, "advanced");

    // Directly inspect file on disk after atomic rename completes
    const raw = await fs.readFile(filePath, "utf8");
    const record = JSON.parse(raw);

    assert.equal(record.state.nodes.n1.phase, "started");
    assert.ok(record.authority.permits[issued.permit.permit_id]);
    assert.ok(record.authority.receipts[issued.permit.permit_id]);
    assert.equal(record.authority.permits[issued.permit.permit_id].status, "consumed");

    // Reload from disk to verify complete integrity
    const inner2 = createFileSystemStore({ filePath });
    const store2 = createAuthorityStore({ store: inner2 });
    const reloaded = await store2.load();

    assert.equal(reloaded.revision, res.revision);
    assert.equal(reloaded.state.nodes.n1.phase, "started");
    assert.ok(record.authority.permits[issued.permit.permit_id]);
  } finally {
    try { await fs.unlink(filePath); } catch (_) {}
  }
});

test("Phase 3: Multi-instance FileSystemStore CAS conflict on same R0 head", async () => {
  const filePath = tmpFile();
  try {
    const fs1 = createFileSystemStore({ filePath, initial: { state: pendingState() }, initializeIfMissing: true });
    await fs1.commit({});
    const fs2 = createFileSystemStore({ filePath });

    const store1 = createAuthorityStore({ store: fs1 });
    const store2 = createAuthorityStore({ store: fs2 });

    const head1 = await store1.load();
    const head2 = await store2.load();
    assert.equal(head1.revision, head2.revision);

    const winnerState = { schema_version: 1, status: "running", nodes: { n1: { phase: "started" } } };
    const loserState = { schema_version: 1, status: "blocked", nodes: { n1: { phase: "failed" } } };

    const win = await store1.compareAndSwap("lifecycle:default", head1.revision, winnerState, []);
    const lose = await store2.compareAndSwap("lifecycle:default", head2.revision, loserState, []);

    assert.equal(win.ok, true);
    assert.equal(lose.ok, false);
    assert.equal(lose.code, "cas-conflict");
    assert.equal(lose.revision, win.revision);
  } finally {
    try { await fs.unlink(filePath); } catch (_) {}
    try { await fs.unlink(`${filePath}.lock`); } catch (_) {}
  }
});

test("Concurrent AuthorityStore compareAndSwap race via Promise.all over FileSystemStore: exactly 1 winner and 1 cas-conflict", async () => {
  const filePath = tmpFile();
  try {
    const fs1 = createFileSystemStore({ filePath, initializeIfMissing: true });
    const store1 = createAuthorityStore({ store: fs1 });
    const head1 = await store1.load();
    const initRes = await store1.compareAndSwap(
      "lifecycle:default",
      head1.revision,
      { ...head1.state, version: 1 },
      [{ action: "init" }]
    );
    assert.equal(initRes.ok, true);
    const r0 = initRes.revision;

    const fs2 = createFileSystemStore({ filePath });
    const store2 = createAuthorityStore({ store: fs2 });

    const [rec1, rec2] = await Promise.all([store1.load(), store2.load()]);
    assert.equal(rec1.revision, r0);
    assert.equal(rec2.revision, r0);

    const winnerState = { schema_version: 1, status: "running", nodes: { n1: { phase: "started" } } };
    const loserState = { schema_version: 1, status: "blocked", nodes: { n1: { phase: "failed" } } };

    const [res1, res2] = await Promise.all([
      store1.compareAndSwap("lifecycle:default", r0, winnerState, [{ action: "w1" }]),
      store2.compareAndSwap("lifecycle:default", r0, loserState, [{ action: "l1" }]),
    ]);

    const results = [res1, res2];
    const winners = results.filter((r) => r.ok === true);
    const conflicts = results.filter((r) => r.ok === false && r.code === "cas-conflict");

    assert.equal(winners.length, 1, "Exactly one AuthorityStore CAS commit must succeed");
    assert.equal(conflicts.length, 1, "Exactly one AuthorityStore CAS commit must fail with cas-conflict");
  } finally {
    try { await fs.unlink(filePath); } catch (_) {}
    try { await fs.unlink(`${filePath}.lock`); } catch (_) {}
  }
});


test("Phase 3: Resilient .bak recovery on load() when primary filePath returns ENOENT", async () => {
  const filePath = tmpFile();
  const bakPath = `${filePath}.bak`;
  try {
    const fsStore = createFileSystemStore({ filePath, initial: { state: pendingState() }, initializeIfMissing: true });
    await fsStore.commit({
      state: { schema_version: 1, status: "running", nodes: { n1: { phase: "started" } } },
      journal: [{ effect_id: "e1", status: "completed" }],
      authority: { permits: { p1: { status: "consumed" } }, receipts: {} },
      budgets: { attempts: 1, corrections: 0 },
    });

    // Simulate crash after rename step 1: target -> target.bak (target is ENOENT, bak exists)
    await fs.rename(filePath, bakPath);

    // Call load() on a fresh store instance
    const freshStore = createFileSystemStore({ filePath });
    const loaded = await freshStore.load();

    assert.equal(loaded.state.status, "running");
    assert.equal(loaded.state.nodes.n1.phase, "started");
    assert.equal(loaded.journal[0].effect_id, "e1");

    // Verify target file was restored on disk
    const targetExists = await fs.stat(filePath).then(() => true, () => false);
    assert.equal(targetExists, true);
  } finally {
    try { await fs.unlink(filePath); } catch (_) {}
    try { await fs.unlink(bakPath); } catch (_) {}
  }
});

test("FileSystemStore.load() fails closed with authority-head-not-found when primary and .bak are missing without initializeIfMissing", async () => {
  const filePath = tmpFile();
  const fsStore = createFileSystemStore({ filePath, initializeIfMissing: false });
  await assert.rejects(
    () => fsStore.load(),
    (err) => err && err.code === "authority-head-not-found"
  );

  const fsStoreInit = createFileSystemStore({ filePath, initializeIfMissing: true });
  const loaded = await fsStoreInit.load();
  assert.equal(loaded.state.status, "ready");
});

test("Concurrent race test with synchronization barrier: exactly 1 winner and 1 cas-conflict", async () => {
  const filePath = tmpFile();
  const { computeRevision } = require("./authority-store/index.js");
  try {
    const fs1 = createFileSystemStore({ filePath, initializeIfMissing: true });
    const initRecord = await fs1.load();
    const r0 = computeRevision(initRecord.state, initRecord.journal, initRecord.authority);
    await fs1.commit({ state: initRecord.state, expectedRevision: r0 });

    const fs2 = createFileSystemStore({ filePath });

    // Synchronization barrier/latch: both read R0 head before issuing concurrent commit
    const [rec1, rec2] = await Promise.all([fs1.load(), fs2.load()]);
    const r0Read = computeRevision(rec1.state, rec1.journal, rec1.authority);
    assert.equal(r0Read, computeRevision(rec2.state, rec2.journal, rec2.authority));

    const commit1Promise = fs1.commit({
      state: { schema_version: 1, status: "running", nodes: { n1: { phase: "started" } } },
      expectedRevision: r0Read,
    });
    const commit2Promise = fs2.commit({
      state: { schema_version: 1, status: "blocked", nodes: { n1: { phase: "failed" } } },
      expectedRevision: r0Read,
    });

    const [res1, res2] = await Promise.all([commit1Promise, commit2Promise]);

    const successes = [res1, res2].filter((r) => r.state !== undefined || r.ok === true);
    const conflicts = [res1, res2].filter((r) => r.code === "cas-conflict");

    assert.equal(successes.length, 1);
    assert.equal(conflicts.length, 1);
    assert.equal(conflicts[0].ok, false);
  } finally {
    try { await fs.unlink(filePath); } catch (_) {}
  }
});

test("Lockfile owner token safety: teardown unlinks only matching ownerToken", async () => {
  const { withFileLock } = require("./filesystem-store.js");
  const filePath = tmpFile();
  const lockPath = `${filePath}.lock`;

  try {
    // Normal teardown: matching token deletes lockfile
    await withFileLock(filePath, async () => {
      const lockRaw = await fs.readFile(lockPath, "utf8");
      const lockData = JSON.parse(lockRaw);
      assert.ok(lockData.ownerToken);
      assert.equal(lockData.pid, process.pid);
    });

    const lockExistsAfterNormal = await fs.stat(lockPath).then(() => true, () => false);
    assert.equal(lockExistsAfterNormal, false);

    // Mismatched token teardown: altered token prevents deletion
    await assert.rejects(async () => {
      await withFileLock(filePath, async () => {
        // Simulate another process taking over the lockfile with a new ownerToken
        const forgedPayload = JSON.stringify({
          ownerToken: "other-process-token",
          pid: 999999,
          timestamp: Date.now(),
        });
        await fs.writeFile(lockPath, forgedPayload, "utf8");
        throw new Error("simulated failure inside lock");
      });
    }, /simulated failure inside lock/);

    // Lockfile should STILL exist on disk because ownerToken was changed!
    const lockExistsAfterMismatched = await fs.stat(lockPath).then(() => true, () => false);
    assert.equal(lockExistsAfterMismatched, true);
  } finally {
    try { await fs.unlink(filePath); } catch (_) {}
    try { await fs.unlink(lockPath); } catch (_) {}
  }
});

test("FileSystemStore withFileLock enforces strict single-writer mutual exclusion", async () => {
  const { withFileLock } = require("./filesystem-store.js");
  const filePath = tmpFile();

  let active = 0;
  let maximumActive = 0;

  const worker = async () => {
    return withFileLock(filePath, async () => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise((resolve) => setTimeout(resolve, 30));
      active -= 1;
    });
  };

  await Promise.all([worker(), worker(), worker()]);
  assert.equal(maximumActive, 1, "maximum active processes in critical section must be strictly 1");

  try { await fs.unlink(filePath); } catch (_) {}
  try { await fs.unlink(`${filePath}.lock`); } catch (_) {}
});

test("Stale lock recovery fails closed with stale-lock-recovery-required", async () => {
  const { withFileLock } = require("./filesystem-store.js");
  const filePath = tmpFile();
  const lockPath = `${filePath}.lock`;

  try {
    // Write a stale lockfile with a dead PID (PID 99999999 is dead)
    const deadLockPayload = JSON.stringify({
      ownerToken: "dead-owner-token",
      pid: 99999999,
      timestamp: Date.now() - 10000,
    });
    await fs.writeFile(lockPath, deadLockPayload, "utf8");

    await assert.rejects(
      async () => {
        await withFileLock(filePath, async () => {}, { staleTimeout: 100 });
      },
      (err) => err && err.code === "stale-lock-recovery-required"
    );
  } finally {
    try { await fs.unlink(filePath); } catch (_) {}
    try { await fs.unlink(lockPath); } catch (_) {}
  }
});

test("REQ-authority-store-003 / REQ-authority-store-011: FileSystemStore commitJournal and commit merge-safe upsert by effect_id", async () => {
  const filePath = tmpFile();
  try {
    const store = createFileSystemStore({ filePath, initializeIfMissing: true });
    await store.commitJournal([
      { effect_id: "eff-1", status: "started", result: { barrier: "pre-effect" } },
      { effect_id: "eff-2", status: "started", result: { barrier: "pre-effect" } },
    ]);

    const loaded1 = await store.load();
    assert.equal(loaded1.journal.length, 2);

    // commitJournal with updated eff-1 and new eff-3
    await store.commitJournal([
      { effect_id: "eff-1", status: "completed", result: { ok: true } },
      { effect_id: "eff-3", status: "completed", result: { ok: true } },
    ]);

    const loaded2 = await store.load();
    assert.equal(loaded2.journal.length, 3);
    const e1 = loaded2.journal.find((e) => e.effect_id === "eff-1");
    const e2 = loaded2.journal.find((e) => e.effect_id === "eff-2");
    const e3 = loaded2.journal.find((e) => e.effect_id === "eff-3");
    assert.equal(e1.status, "completed");
    assert.equal(e2.status, "started");
    assert.equal(e3.status, "completed");

    // commit with updated eff-2 and new eff-4
    await store.commit({
      state: { schema_version: 1, status: "running", nodes: {} },
      journal: [
        { effect_id: "eff-2", status: "completed", result: { ok: true } },
        { effect_id: "eff-4", status: "completed", result: { ok: true } },
      ],
    });

    const loaded3 = await store.load();
    assert.equal(loaded3.journal.length, 4);
    const e2After = loaded3.journal.find((e) => e.effect_id === "eff-2");
    const e4After = loaded3.journal.find((e) => e.effect_id === "eff-4");
    assert.equal(e2After.status, "completed");
    assert.equal(e4After.status, "completed");
  } finally {
    try { await fs.unlink(filePath); } catch (_) {}
    try { await fs.unlink(`${filePath}.lock`); } catch (_) {}
  }
});

test("K5: FileSystemStore preserves completed journal evidence against stale status", async () => {
  const filePath = tmpFile();
  try {
    const store = createFileSystemStore({ filePath, initializeIfMissing: true });
    const completed = { effect_id: "eff-complete", status: "completed", result: { ok: true, usage: {} } };
    await store.commitJournal([completed]);
    await store.commitJournal([{ effect_id: "eff-complete", status: "failed", result: { ok: false } }]);
    const entry = (await store.load()).journal.find((item) => item.effect_id === "eff-complete");
    assert.equal(entry.status, "completed");
    assert.deepEqual(entry.result, completed.result);
  } finally {
    try { await fs.unlink(filePath); } catch (_) {}
    try { await fs.unlink(`${filePath}.lock`); } catch (_) {}
  }
});

test("REQ-authority-store-018: restart load restores authority.receipts and runner_receipts without snapshot()", async () => {
  const filePath = tmpFile();
  try {
    const inner1 = createFileSystemStore({
      filePath,
      initial: { state: pendingState() },
      initializeIfMissing: true,
    });
    const store1 = createAuthorityStore({ store: inner1 });
    const runtime1 = createKernelRuntime({ store: store1 });

    const head1 = await store1.load();
    const issued = runtime1.issuePermitForSelectedTransition({
      operation: "start",
      expected_revision: head1.revision,
      arguments: { node_id: "n1" },
    });
    assert.ok(issued.ok);
    const opResult = await runtime1.runOperation({
      operation: "start",
      arguments: { node_id: "n1" },
      operationPermit: issued.permit,
      effectExecutor: async () => ({ ok: true, usage: {} }),
    });
    assert.equal(opResult.outcome, "advanced");
    const permitId = issued.permit.permit_id;

    const receiptId = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const runnerReceipt = {
      schema_version: 1,
      kind: "runner-receipt/v1",
      receipt_id: receiptId,
      candidate_id: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      evidence_id: "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
      node_id: "n1",
      role: "acceptance",
      satisfied_tokens: ["ev:test-pass"],
      outcome: "passed",
      issuer_id: "node-test",
      transport: "tool-execution-transport",
    };
    const persisted = await store1.commitRunnerReceipts({ [receiptId]: runnerReceipt });
    assert.equal(persisted.ok, true, persisted.code);

    const inner2 = createFileSystemStore({ filePath });
    const store2 = createAuthorityStore({ store: inner2 });
    const head2 = await store2.load();

    assert.equal(head2.state.nodes.n1.phase, "started");
    assert.ok(head2.authority.receipts[permitId]);
    assert.equal(head2.authority.receipts[permitId].kind, "operation-receipt/v1");
    assert.equal(head2.runner_receipts[receiptId].kind, "runner-receipt/v1");
    assert.equal(head2.authority.receipts[receiptId], undefined);
    assert.notEqual(head2.authority.receipts[permitId].kind, "runner-receipt/v1");
  } finally {
    try { await fs.unlink(filePath); } catch (_) {}
  }
});

test("REQ-authority-store-018: array-shaped runner_receipts cannot CAS-match an empty-bag head", async () => {
  const filePath = tmpFile();
  const { computeRevision } = require("./authority-store/index.js");
  const receipt = { kind: "runner-receipt/v1", receipt_id: "sha256:aa" };
  try {
    const store = createFileSystemStore({ filePath, initializeIfMissing: true });
    const loaded = await store.load();
    const emptyRevision = computeRevision(loaded.state, loaded.journal, loaded.authority, {});
    await store.commit({
      state: loaded.state,
      journal: loaded.journal,
      authority: loaded.authority,
      budgets: loaded.budgets,
      runner_receipts: {},
      expectedRevision: emptyRevision,
    });
    assert.equal(
      computeRevision(loaded.state, loaded.journal, loaded.authority, [receipt]),
      emptyRevision
    );
    const committed = await store.commit({
      state: loaded.state,
      journal: loaded.journal,
      authority: loaded.authority,
      budgets: loaded.budgets,
      runner_receipts: [receipt],
      expectedRevision: emptyRevision,
    });
    assert.equal(committed.ok, false);
    assert.equal(committed.code, "receipt-kind-mismatch");
    const after = await store.load();
    assert.deepEqual(after.runner_receipts, {});
    const onDisk = JSON.parse(await fs.readFile(filePath, "utf8"));
    assert.ok(!Array.isArray(onDisk.runner_receipts));
    const mapped = await store.commit({
      state: loaded.state,
      journal: loaded.journal,
      authority: loaded.authority,
      budgets: loaded.budgets,
      runner_receipts: { [receipt.receipt_id]: receipt },
      expectedRevision: emptyRevision,
    });
    assert.notEqual(mapped.ok, false, mapped.code);
    assert.notEqual(
      computeRevision(mapped.state, mapped.journal, mapped.authority, mapped.runner_receipts),
      emptyRevision
    );
  } finally {
    try { await fs.unlink(filePath); } catch (_) {}
    try { await fs.unlink(`${filePath}.lock`); } catch (_) {}
  }
});

test("REQ-authority-store-018: load normalizes array-shaped runner_receipts on disk to empty map", async () => {
  const filePath = tmpFile();
  try {
    await fs.writeFile(filePath, JSON.stringify({
      state: pendingState(),
      journal: [],
      authority: { permits: {}, receipts: {} },
      budgets: { attempts: 0, corrections: 0 },
      runner_receipts: [{ kind: "runner-receipt/v1", receipt_id: "sha256:aa" }],
    }), "utf8");
    const loaded = await createFileSystemStore({ filePath }).load();
    assert.deepEqual(loaded.runner_receipts, {});
  } finally {
    try { await fs.unlink(filePath); } catch (_) {}
  }
});



