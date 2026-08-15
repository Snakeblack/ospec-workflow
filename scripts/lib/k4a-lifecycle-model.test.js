"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  K4A_EXECUTABLE_INVARIANTS,
  DEFERRED_INVARIANTS,
  checkInvariant,
  runAllInvariantCheckers,
} = require("./lifecycle-model.js");
const { compileWorkOrders } = require("./execution-graph/index.js");
const { createSampleExecutionGraph, createSampleSourceSnapshot } = require("./test-support/execution-graph-fixtures.js");

test("K4a Model Conformance: K4a manifest lists 7 executable invariants", async () => {
  assert.equal(K4A_EXECUTABLE_INVARIANTS.length, 7);

  const deferredIds = new Set(DEFERRED_INVARIANTS.map((d) => d.id));
  for (const inv of K4A_EXECUTABLE_INVARIANTS) {
    assert.equal(deferredIds.has(inv.id), false, `Invariant ${inv.id} must not be deferred`);
    assert.equal(inv.optional, false, `Invariant ${inv.id} must be non-optional`);

    const result = await checkInvariant(inv.id);
    assert.equal(result.ok, true, `Checker for ${inv.id} must pass: ${JSON.stringify(result)}`);
  }

  const all = await runAllInvariantCheckers();
  assert.equal(all.k4a_count, 7);
  assert.equal(all.ok, true);
});

test("K4a Invariant 1: Deterministic Graph ID binding to contract and policy", async () => {
  const result = await checkInvariant("inv-k4a-deterministic-graph-id");
  assert.equal(result.ok, true);
  assert.equal(result.invariant_id, "inv-k4a-deterministic-graph-id");
});

test("K4a Invariant 2: Graph ID and PolicySnapshot diverge upon policy rule changes", async () => {
  const result = await checkInvariant("inv-k4a-policy-divergence");
  assert.equal(result.ok, true);
  assert.equal(result.invariant_id, "inv-k4a-policy-divergence");
});

test("K4a Invariant 3: 100% MUST obligation manifest coverage with evidence", async () => {
  const result = await checkInvariant("inv-k4a-obligation-coverage");
  assert.equal(result.ok, true);
  assert.equal(result.invariant_id, "inv-k4a-obligation-coverage");
});

test("K4a Invariant 4: ClarifyEvent strictly invalidates DAG descendant closure", async () => {
  const result = await checkInvariant("inv-k4a-clarify-invalidation-boundary");
  assert.equal(result.ok, true);
  assert.equal(result.invariant_id, "inv-k4a-clarify-invalidation-boundary");
});

test("K4a Invariant 5: Deterministic fixture replay converges without live worker invocation", async () => {
  const result = await checkInvariant("inv-k4a-replay-convergence");
  assert.equal(result.ok, true);
  assert.equal(result.invariant_id, "inv-k4a-replay-convergence");
});

test("K4a Invariant 6: Shadow comparison guarantees zero active state mutation", async () => {
  const result = await checkInvariant("inv-k4a-shadow-non-interference");
  assert.equal(result.ok, true);
  assert.equal(result.invariant_id, "inv-k4a-shadow-non-interference");
});

test("K4a Invariant 7: Compilation and replay operate without issuing live worker authority", async () => {
  const result = await checkInvariant("inv-k4a-no-live-authority");
  assert.equal(result.ok, true);
  assert.equal(result.invariant_id, "inv-k4a-no-live-authority");
});

test("K4a lifecycle consumer: public compiler binds every order to the exact SourceSnapshot ID", () => {
  const sourceSnapshot = createSampleSourceSnapshot();
  const sourceSnapshotId = sourceSnapshot.source_snapshot_id;
  const workOrders = compileWorkOrders(createSampleExecutionGraph(), { sourceSnapshot, sourceSnapshotId });

  assert.ok(workOrders.length > 0);
  assert.ok(workOrders.every((workOrder) =>
    workOrder.kind === "work-order/v2" &&
    workOrder.source_snapshot_id === sourceSnapshotId
  ));
});
