"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  deriveOperationId,
  deriveEffectId,
  createJournalRecord,
  reconcileEffect,
  mergeJournalEntries,
} = require("./journal.js");
const { digestLifecycleState, KERNEL_VERSION } = require("./state-digest.js");

const state = {
  schema_version: 1,
  status: "ready",
  nodes: { n1: { id: "n1", phase: "pending", attempt: 0 } },
};

test("deriveOperationId is stable for identical inputs", () => {
  const a = deriveOperationId({
    state,
    operation: "start",
    arguments: { node_id: "n1" },
  });
  const b = deriveOperationId({
    state: {
      nodes: { n1: { attempt: 0, id: "n1", phase: "pending" } },
      status: "ready",
      schema_version: 1,
    },
    operation: "start",
    arguments: { node_id: "n1" },
  });
  assert.equal(a, b);
  assert.match(a, /^sha256:[a-f0-9]{64}$/);
  assert.ok(a.includes ? true : true);
});

test("deriveOperationId changes when state or arguments change", () => {
  const base = deriveOperationId({
    state,
    operation: "start",
    arguments: { node_id: "n1" },
  });
  const otherNode = deriveOperationId({
    state,
    operation: "start",
    arguments: { node_id: "n2" },
  });
  const otherState = deriveOperationId({
    state: { ...state, status: "blocked" },
    operation: "start",
    arguments: { node_id: "n1" },
  });
  assert.notEqual(base, otherNode);
  assert.notEqual(base, otherState);
});

test("deriveEffectId is a stable child of operation id", () => {
  const operationId = deriveOperationId({
    state,
    operation: "start",
    arguments: { node_id: "n1" },
  });
  const effectA = deriveEffectId(operationId, {
    kind: "persist-node",
    payload: { node_id: "n1", phase: "started" },
  });
  const effectB = deriveEffectId(operationId, {
    payload: { phase: "started", node_id: "n1" },
    kind: "persist-node",
  });
  assert.equal(effectA, effectB);
  assert.notEqual(effectA, operationId);
});

test("createJournalRecord shapes planned/started/completed/failed", () => {
  const operationId = deriveOperationId({
    state,
    operation: "start",
    arguments: { node_id: "n1" },
  });
  const planned = createJournalRecord({
    operation_id: operationId,
    effect_id: deriveEffectId(operationId, { kind: "persist-node", payload: {} }),
    status: "planned",
    kernel_version: KERNEL_VERSION,
  });
  assert.equal(planned.status, "planned");
  assert.equal(planned.kernel_version, KERNEL_VERSION);
  assert.equal(planned.operation_id, operationId);

  for (const status of ["planned", "started", "completed", "failed"]) {
    const record = createJournalRecord({
      operation_id: operationId,
      effect_id: "sha256:abc",
      status,
    });
    assert.equal(record.status, status);
  }
});

test("reconcileEffect does not re-execute completed effects", () => {
  const decision = reconcileEffect({
    record: { status: "completed", effect_id: "e1" },
    journal: [{ status: "completed", effect_id: "e1" }],
  });
  assert.equal(decision.action, "skip");
  assert.equal(decision.reason, "already-completed");
});

test("mergeJournalEntries keeps completed evidence absorbing and retains peer effects", () => {
  const completed = { effect_id: "eff-1", status: "completed", result: { ok: true, usage: { turns: 1 } } };
  const merged = mergeJournalEntries([completed], [
    { effect_id: "eff-1", status: "started", result: { barrier: "executing" } },
    { effect_id: "eff-2", status: "completed", result: { ok: true, usage: {} } },
  ]);
  assert.equal(merged.length, 2);
  assert.deepEqual(merged.find((entry) => entry.effect_id === "eff-1"), completed);
});

test("reconcileEffect executes pending; started emits retry-execute or fail-closed", () => {
  assert.equal(
    reconcileEffect({ record: { status: "planned", effect_id: "e1" } }).action,
    "execute"
  );
  const safeRetry = reconcileEffect({
    record: {
      status: "started",
      effect_id: "e1",
      result: { barrier: "pre-effect" },
    },
  });
  assert.equal(safeRetry.action, "retry-execute");
  assert.equal(safeRetry.reason, "started-pre-effect-safe-retry");

  const ambiguousStarted = reconcileEffect({
    record: { status: "started", effect_id: "e1", result: { barrier: "executing" } },
  });
  assert.equal(ambiguousStarted.action, "fail-closed");
  assert.equal(ambiguousStarted.code, "reconciliation-required");

  const unknown = reconcileEffect({ record: { status: "unknown", effect_id: "e1" } });
  assert.equal(unknown.action, "fail-closed");
  assert.equal(unknown.code, "reconciliation-required");
});
