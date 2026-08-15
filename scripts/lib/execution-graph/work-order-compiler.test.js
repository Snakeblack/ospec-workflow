"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const { validateInstance, loadSchemaById } = require("../kernel-schema-validator.js");
const { computeSourceSnapshotId } = require("../execution-identities/index.js");
const {
  compileWorkOrders,
  compileWorkOrdersV1,
  compileWorkOrdersV2,
  DEFAULT_WORK_ORDER_BUDGET,
} = require("./work-order-compiler.js");

const ROOT = path.resolve(__dirname, "..", "..", "..");

function createValidatedSourceSnapshot() {
  const snapshot = {
    kind: "source-snapshot/v1",
    schema_version: 1,
    repository_id: "repo:work-order-compiler-test",
    base_tree_digest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    projection: "workspace",
    dependency_digests: [],
  };
  return { ...snapshot, source_snapshot_id: computeSourceSnapshotId(snapshot) };
}

const sampleSnapshot = createValidatedSourceSnapshot();
const sampleSnapshotId = sampleSnapshot.source_snapshot_id;

const sampleGraph = {
  schema_version: 1,
  graph_id: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
  contract_digest: "sha256:2222222222222222222222222222222222222222222222222222222222222222",
  policy_bundle_digest: "sha256:3333333333333333333333333333333333333333333333333333333333333333",
  source_snapshot_id: sampleSnapshotId,
  nodes: [
    {
      node_id: "repair-node-1",
      kind: "repair-action/v1",
      operation: "apply_repair_patch",
      objective: "Apply repair changes to src/auth",
      dependencies: [],
      ownership: {
        owner: "agent:repair",
        mode: "exclusive",
      },
      allowed_paths: ["src/auth/**"],
      invariants: ["inv-fail-closed"],
      required_evidence: ["ev:auth-tests"],
      budget_ref: "budget:default",
    },
    {
      node_id: "verify-node-1",
      kind: "repair-action/v1",
      operation: "verify_repair_conformance",
      objective: "Verify auth repair conformance",
      dependencies: ["repair-node-1"],
      ownership: {
        owner: "agent:verify",
        mode: "shared",
      },
      allowed_paths: ["src/auth/**", "tests/**"],
      invariants: ["inv-no-direct-mutation"],
      required_evidence: ["ev:verify-report"],
      budget_ref: "budget:default",
    },
  ],
  obligations: [
    { id: "req-1", criticality: "must", implemented_by: ["repair-node-1"], required_evidence: ["ev:auth-tests"] },
    { id: "req-2", criticality: "must", implemented_by: ["verify-node-1"], required_evidence: ["ev:verify-report"] },
  ],
};

test("WorkOrderCompiler: explicit legacy v1 surface preserves the frozen v1 shape", () => {
  const sourceSnapshotId = "sha256:4444444444444444444444444444444444444444444444444444444444444444";
  const workOrders = compileWorkOrdersV1(sampleGraph, { sourceSnapshotId });

  assert.equal(workOrders.length, 2);

  const schema = loadSchemaById("ospec://schemas/kernel/work-order/v1", { rootDir: ROOT });

  for (const wo of workOrders) {
    assert.equal(wo.schema_version, 1);
    assert.equal(wo.status, "pending");
    assert.equal(typeof wo.work_order_id, "string");
    assert.equal(wo.kind, undefined);
    assert.equal(wo.source_snapshot_id, undefined);
    assert.ok(wo.objective);
    assert.ok(wo.operation);
    assert.ok(wo.ownership);
    assert.ok(wo.budget);
    assert.deepEqual(wo.budget, DEFAULT_WORK_ORDER_BUDGET);

    const validation = validateInstance(schema, wo);
    assert.equal(validation.valid, true, `WorkOrder must satisfy schema: ${JSON.stringify(validation.errors)}`);
  }
});

test("WorkOrderCompiler: legacy v1 output does not acquire v2 provenance semantics", () => {
  const withoutContext = compileWorkOrdersV1(sampleGraph);
  const withV2Provenance = compileWorkOrdersV1(sampleGraph, {
    sourceSnapshotId: "sha256:4444444444444444444444444444444444444444444444444444444444444444",
  });

  assert.deepEqual(withV2Provenance, withoutContext);
});

test("WorkOrderCompiler: public v2 surface preserves valid provenance and semantic dependencies", () => {
  const sourceSnapshot = createValidatedSourceSnapshot();
  const sourceSnapshotId = sourceSnapshot.source_snapshot_id;
  const workOrders = compileWorkOrders(sampleGraph, { sourceSnapshot, sourceSnapshotId });
  const v2Orders = compileWorkOrdersV2(sampleGraph, { sourceSnapshot, sourceSnapshotId });
  const v1Orders = compileWorkOrdersV1(sampleGraph, { sourceSnapshotId });
  const schema = loadSchemaById("ospec://schemas/kernel/work-order/v2", { rootDir: ROOT });

  assert.deepEqual(workOrders, v2Orders);
  assert.notEqual(workOrders[0].work_order_id, v1Orders[0].work_order_id);
  for (const wo of workOrders) {
    assert.equal(wo.schema_version, 2);
    assert.equal(wo.kind, "work-order/v2");
    assert.equal(wo.source_snapshot_id, sourceSnapshotId);
    assert.equal(validateInstance(schema, wo).valid, true);
  }
  assert.deepEqual(workOrders[1].dependencies, ["repair-node-1"]);
});

test("WorkOrderCompiler: public v2 path rejects a missing, empty, uppercase, or malformed SourceSnapshotId", () => {
  const sourceSnapshot = createValidatedSourceSnapshot();
  const invalidSourceSnapshotIds = [
    undefined,
    "",
    "sha256:not-a-valid-digest",
    "sha256:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
  ];

  for (const sourceSnapshotId of invalidSourceSnapshotIds) {
    assert.throws(
      () => compileWorkOrders(sampleGraph, { sourceSnapshot, sourceSnapshotId }),
      /sourceSnapshotId must be a valid SHA-256 digest/,
    );
  }
});

test("WorkOrderCompiler: public v2 path rejects a syntactically valid ID not linked to its SourceSnapshot", () => {
  const sourceSnapshot = createValidatedSourceSnapshot();
  const unlinkedSourceSnapshotId =
    "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";

  assert.throws(
    () => compileWorkOrders(sampleGraph, { sourceSnapshotId: sourceSnapshot.source_snapshot_id }),
    /sourceSnapshot must be a valid source-snapshot\/v1/,
  );
  assert.throws(
    () => compileWorkOrders(sampleGraph, {
      sourceSnapshot: { ...sourceSnapshot, source_snapshot_id: unlinkedSourceSnapshotId },
      sourceSnapshotId: unlinkedSourceSnapshotId,
    }),
    /sourceSnapshot must declare its canonical SourceSnapshot identity/,
  );
  assert.throws(
    () => compileWorkOrders(sampleGraph, { sourceSnapshot, sourceSnapshotId: unlinkedSourceSnapshotId }),
    /sourceSnapshotId must match the validated SourceSnapshot identity/,
  );
});

test("WorkOrder v1 schema has no v2 provenance field", () => {
  const sourceSnapshotId = "sha256:4444444444444444444444444444444444444444444444444444444444444444";
  const schema = loadSchemaById("ospec://schemas/kernel/work-order/v1", { rootDir: ROOT });
  const [workOrder] = compileWorkOrdersV1(sampleGraph, { sourceSnapshotId });

  assert.equal(schema.required.includes("source_snapshot_id"), false);
  assert.equal(schema.properties.source_snapshot_id, undefined);
  assert.equal(validateInstance(schema, workOrder).valid, true);
});

test("WorkOrderCompiler: zero execution authority and zero worker process invocation", () => {
  const sourceSnapshot = createValidatedSourceSnapshot();
  const workOrders = compileWorkOrders(sampleGraph, {
    sourceSnapshot,
    sourceSnapshotId: sourceSnapshot.source_snapshot_id,
  });

  for (const wo of workOrders) {
    // Assert strictly no permit, execution token, or secret
    assert.equal(wo.operation_permit, undefined);
    assert.equal(wo.permit, undefined);
    assert.equal(wo.authority_token, undefined);
    assert.equal(wo.token, undefined);
    assert.equal(wo.credentials, undefined);
  }
});

test("WorkOrderCompiler: atomic validation fails closed on provenance mismatch with zero emitted orders", () => {
  const otherSnapshot = {
    kind: "source-snapshot/v1",
    schema_version: 1,
    repository_id: "repo:work-order-compiler-test",
    base_tree_digest: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    projection: "workspace",
    dependency_digests: [],
  };
  const validOtherSnapshot = { ...otherSnapshot, source_snapshot_id: computeSourceSnapshotId(otherSnapshot) };
  assert.throws(
    () => compileWorkOrders(sampleGraph, { sourceSnapshot: validOtherSnapshot, sourceSnapshotId: validOtherSnapshot.source_snapshot_id }),
    (err) => err.code === "provenance-mismatch" || err.message.includes("Provenance mismatch")
  );
});

test("WorkOrderCompiler: atomic validation fails closed on microscopic node with zero emitted orders", () => {
  const graphWithMicroNode = {
    ...sampleGraph,
    nodes: [
      ...sampleGraph.nodes,
      {
        node_id: "micro-node",
        kind: "microscopic",
        operation: "file_edit",
        objective: "Micro edit",
        dependencies: [],
        ownership: { owner: "agent:repair", mode: "exclusive" },
        allowed_paths: ["src/**"],
        invariants: ["inv-fail-closed"],
        required_evidence: ["ev:proof"],
        budget_ref: "budget:default",
      },
    ],
  };

  assert.throws(
    () => compileWorkOrders(graphWithMicroNode),
    (err) => err.code === "microscopic-node-rejected" || err.message.includes("Microscopic")
  );
});

test("WorkOrderCompiler: atomic validation fails closed on incomplete obligation manifest with zero emitted orders", () => {
  const graphWithIncompleteObligations = {
    ...sampleGraph,
    obligations: [
      { id: "req-unmapped", criticality: "must", implemented_by: [], required_evidence: ["ev:test"] },
    ],
  };

  assert.throws(
    () => compileWorkOrders(graphWithIncompleteObligations),
    (err) => err.code === "obligation-manifest-incomplete" || err.message.includes("Obligation manifest")
  );
});

test("WorkOrderCompiler: atomic validation fails closed on cyclic dependency with zero emitted orders", () => {
  const cyclicGraph = {
    ...sampleGraph,
    nodes: [
      {
        ...sampleGraph.nodes[0],
        dependencies: ["verify-node-1"],
      },
      sampleGraph.nodes[1],
    ],
  };

  assert.throws(
    () => compileWorkOrders(cyclicGraph),
    (err) => err.code === "cyclic-dependency-detected" || err.message.includes("cycle")
  );
});

test("WorkOrderCompiler: atomic validation fails closed on missing/malformed graph source_snapshot_id", () => {
  const graphWithMalformedSnapshot = {
    ...sampleGraph,
    source_snapshot_id: "sha256:INVALID-HEX",
  };

  assert.throws(
    () => compileWorkOrders(graphWithMalformedSnapshot),
    (err) => err.code === "invalid-source-snapshot-id" || err.message.includes("source_snapshot_id")
  );
});
