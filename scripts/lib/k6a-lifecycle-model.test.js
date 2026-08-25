"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  K6A_EXECUTABLE_INVARIANTS,
  DEFERRED_INVARIANTS,
  checkInvariant,
  runAllInvariantCheckers,
} = require("./lifecycle-model.js");

test("REQ-lifecycle-model-conformance-012: K6a manifest lists 10 executable invariants", async () => {
  assert.ok(Array.isArray(K6A_EXECUTABLE_INVARIANTS), "K6A_EXECUTABLE_INVARIANTS must be exported");
  assert.equal(K6A_EXECUTABLE_INVARIANTS.length, 10);

  const deferredIds = new Set(DEFERRED_INVARIANTS.map((d) => d.id));
  for (const inv of K6A_EXECUTABLE_INVARIANTS) {
    assert.equal(deferredIds.has(inv.id), false, `Invariant ${inv.id} must not be deferred`);
    assert.equal(inv.optional, false, `Invariant ${inv.id} must be non-optional`);

    const result = await checkInvariant(inv.id);
    assert.equal(result.ok, true, `Checker for ${inv.id} must pass: ${JSON.stringify(result)}`);
    assert.equal(result.runtime_composed, true, `Checker for ${inv.id} must use runtime composition`);
  }

  const all = await runAllInvariantCheckers();
  assert.equal(all.k6a_count, 10);
  assert.equal(all.ok, true);
});

test("K6a Invariant 1: Workspace is tracked with status active and cleanly disposed with status disposed without leaks", async () => {
  const result = await checkInvariant("inv-k6a-workspace-lifecycle");
  assert.equal(result.ok, true);
  assert.equal(result.invariant_id, "inv-k6a-workspace-lifecycle");
});

test("K6a Invariant 2: Identical source snapshot and dependency inputs produce byte-identical capsule fingerprints", async () => {
  const result = await checkInvariant("inv-k6a-capsule-determinism");
  assert.equal(result.ok, true);
  assert.equal(result.invariant_id, "inv-k6a-capsule-determinism");
});

test("K6a Invariant 3: File operation targeting path outside allowed_paths halts execution fail-closed with containment-violation/v1", async () => {
  const result = await checkInvariant("inv-k6a-containment-fail-closed");
  assert.equal(result.ok, true);
  assert.equal(result.invariant_id, "inv-k6a-containment-fail-closed");
});

test("K6a Invariant 4: CaptureWorkResult produces canonical WorkResult bound to WorkOrderId/SourceSnapshotId without CandidateId", async () => {
  const result = await checkInvariant("inv-k6a-work-result-binding");
  assert.equal(result.ok, true);
  assert.equal(result.invariant_id, "inv-k6a-work-result-binding");
});

test("K6a Invariant 5: Execution timeouts or abort signals preserve partial logs and modified file inventory with status interrupted", async () => {
  const result = await checkInvariant("inv-k6a-interrupted-recovery-preservation");
  assert.equal(result.ok, true);
  assert.equal(result.invariant_id, "inv-k6a-interrupted-recovery-preservation");
});

test("K6a Invariant 6: Command execution without enforced isolation fails closed", async () => {
  const result = await checkInvariant("inv-k6a-host-isolation-fallback");
  assert.equal(result.ok, true);
  assert.equal(result.invariant_id, "inv-k6a-host-isolation-fallback");
});

test("K6a Invariant 7: Captured sandbox policy is immutable", async () => {
  const result = await checkInvariant("inv-k6a-sandbox-policy-immutability");
  assert.equal(result.ok, true);
  assert.equal(result.invariant_id, "inv-k6a-sandbox-policy-immutability");
});

test("K6a Invariant 8: WorkerIsolation binds executing transport", async () => {
  const result = await checkInvariant("inv-k6a-transport-binding");
  assert.equal(result.ok, true);
  assert.equal(result.invariant_id, "inv-k6a-transport-binding");
});

test("K6a Invariant 9: Three-way containment probe is real", async () => {
  const result = await checkInvariant("inv-k6a-real-containment-probe");
  assert.equal(result.ok, true);
  assert.equal(result.invariant_id, "inv-k6a-real-containment-probe");
});

test("K6a Invariant 10: Mutating fs wrap is exhaustive", async () => {
  const result = await checkInvariant("inv-k6a-mutating-fs-surface");
  assert.equal(result.ok, true);
  assert.equal(result.invariant_id, "inv-k6a-mutating-fs-surface");
});
