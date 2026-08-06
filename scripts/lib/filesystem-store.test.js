"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");

const { createFileSystemStore } = require("./filesystem-store.js");
const { createAuthorityStore, getPrivateIssuer } = require("./authority-store/index.js");
const { runKernelOperation } = require("./lifecycle-kernel/index.js");
const { issueFixturePermit } = require("./lifecycle-kernel/test-permit-helpers.js");

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
    const fsStore = createFileSystemStore({ filePath });
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
    const inner1 = createFileSystemStore({ filePath, initial: { state: pendingState() } });
    const store1 = createAuthorityStore({ store: inner1 });

    const head1 = await store1.load();
    const issued = issueFixturePermit({
      store: store1,
      operation: "start",
      headRevision: head1.revision,
      arguments: { node_id: "n1" },
    });

    const opResult = await runKernelOperation({
      operation: "start",
      arguments: { node_id: "n1" },
      store: store1,
      operationPermit: issued.permit,
      effectExecutor: async () => ({ ok: true }),
    });
    assert.equal(opResult.outcome, "advanced");
    assert.ok(opResult.operation_receipt);
    const permitId = issued.permit.permit_id;

    // Simulate process termination and fresh restart reading from disk ONLY (no snapshot() call!)
    const inner2 = createFileSystemStore({ filePath });
    const store2 = createAuthorityStore({ store: inner2 });

    const head2 = await store2.load();
    assert.equal(head2.state.nodes.n1.phase, "started");
    assert.ok(head2.authority.permits[permitId]);
    assert.equal(head2.authority.permits[permitId].status, "consumed");
    assert.ok(head2.authority.receipts[permitId]);
    assert.equal(head2.authority.receipts[permitId].receipt_id, opResult.operation_receipt.receipt_id);
    assert.equal(head2.revision, opResult.revision);

    // Verify replay on restarted store without re-executing effects
    let reExecuted = false;
    const replayResult = await runKernelOperation({
      operation: "start",
      arguments: { node_id: "n1" },
      store: store2,
      operationPermit: issued.permit,
      effectExecutor: async () => {
        reExecuted = true;
        return { ok: true };
      },
    });

    assert.equal(replayResult.replayed, true);
    assert.equal(reExecuted, false);
    assert.equal(replayResult.operation_receipt.receipt_id, opResult.operation_receipt.receipt_id);
  } finally {
    try { await fs.unlink(filePath); } catch (_) {}
  }
});

test("Crash before atomic rename retains old head intact; incomplete temp files ignored", async () => {
  const filePath = tmpFile();
  try {
    const inner1 = createFileSystemStore({ filePath, initial: { state: pendingState() } });
    const store1 = createAuthorityStore({ store: inner1 });

    const head1 = await store1.load();
    const issued = issueFixturePermit({
      store: store1,
      operation: "start",
      headRevision: head1.revision,
      arguments: { node_id: "n1" },
    });

    await runKernelOperation({
      operation: "start",
      arguments: { node_id: "n1" },
      store: store1,
      operationPermit: issued.permit,
      effectExecutor: async () => ({ ok: true }),
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
    const inner1 = createFileSystemStore({ filePath, initial: { state: pendingState() } });
    const store1 = createAuthorityStore({ store: inner1 });

    const head1 = await store1.load();
    const issued = issueFixturePermit({
      store: store1,
      operation: "start",
      headRevision: head1.revision,
      arguments: { node_id: "n1" },
    });

    const res = await runKernelOperation({
      operation: "start",
      arguments: { node_id: "n1" },
      store: store1,
      operationPermit: issued.permit,
      effectExecutor: async () => ({ ok: true }),
    });

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
    assert.ok(reloaded.authority.permits[issued.permit.permit_id]);
  } finally {
    try { await fs.unlink(filePath); } catch (_) {}
  }
});
