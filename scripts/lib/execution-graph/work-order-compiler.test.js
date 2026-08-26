"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const { validateInstance, loadSchemaById } = require("../kernel-schema-validator.js");
const { computeSourceSnapshotId, computeWorkOrderId } = require("../execution-identities/index.js");
const { computeGraphId } = require("./compiler.js");
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

const sampleGraphNodes = [
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
];

const sampleGraphObligations = [
  { id: "req-1", criticality: "must", implemented_by: ["repair-node-1"], required_evidence: ["ev:auth-tests"] },
  { id: "req-2", criticality: "must", implemented_by: ["verify-node-1"], required_evidence: ["ev:verify-report"] },
];

const sampleContractDigest = "sha256:2222222222222222222222222222222222222222222222222222222222222222";
const samplePolicyBundleDigest = "sha256:3333333333333333333333333333333333333333333333333333333333333333";
const samplePolicySnapshotId = "sha256:5555555555555555555555555555555555555555555555555555555555555555";

const sampleGraph = {
  schema_version: 1,
  graph_id: computeGraphId(
    sampleContractDigest,
    samplePolicySnapshotId,
    samplePolicyBundleDigest,
    sampleSnapshotId,
    sampleGraphNodes,
    sampleGraphObligations
  ),
  contract_digest: sampleContractDigest,
  policy_bundle_digest: samplePolicyBundleDigest,
  policy_snapshot_id: samplePolicySnapshotId,
  source_snapshot_id: sampleSnapshotId,
  nodes: sampleGraphNodes,
  obligations: sampleGraphObligations,
};

const samplePathInventory = {
  source_snapshot_id: sampleSnapshotId,
  paths: [
    "src/auth/session.js",
    "src/auth/index.js",
    "tests/auth.test.js",
    "tests/conformance.test.js",
  ],
};

function v2Context(extra = {}) {
  return {
    sourceSnapshot: extra.sourceSnapshot || sampleSnapshot,
    sourceSnapshotId: extra.sourceSnapshotId || sampleSnapshotId,
    pathInventory: extra.pathInventory || samplePathInventory,
    ...extra,
  };
}

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

test("WorkOrderCompiler: public v2 surface preserves valid provenance and semantic dependencies as sha256 digests", () => {
  const sourceSnapshot = createValidatedSourceSnapshot();
  const sourceSnapshotId = sourceSnapshot.source_snapshot_id;
  const workOrders = compileWorkOrders(sampleGraph, v2Context());
  const v2Orders = compileWorkOrdersV2(sampleGraph, v2Context());
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
  assert.deepEqual(workOrders[1].dependencies, [workOrders[0].work_order_id]);
  assert.match(workOrders[1].dependencies[0], /^sha256:[a-f0-9]{64}$/);
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
  const workOrders = compileWorkOrders(sampleGraph, v2Context({
    sourceSnapshot,
    sourceSnapshotId: sourceSnapshot.source_snapshot_id,
  }));

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
  const microNodes = [
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
  ];
  const graphWithMicroNode = {
    ...sampleGraph,
    graph_id: computeGraphId(
      sampleContractDigest,
      samplePolicySnapshotId,
      samplePolicyBundleDigest,
      sampleSnapshotId,
      microNodes,
      sampleGraphObligations
    ),
    nodes: microNodes,
  };

  assert.throws(
    () => compileWorkOrders(graphWithMicroNode),
    (err) =>
      err.code === "microscopic-node-rejected" ||
      err.code === "invalid-graph-schema" ||
      err.message.includes("Microscopic") ||
      err.message.includes("schema validation")
  );
});

test("WorkOrderCompiler: atomic validation fails closed on incomplete obligation manifest with zero emitted orders", () => {
  const incompleteObligations = [
    { id: "req-unmapped", criticality: "must", implemented_by: [], required_evidence: ["ev:test"] },
  ];
  const graphWithIncompleteObligations = {
    ...sampleGraph,
    graph_id: computeGraphId(
      sampleContractDigest,
      samplePolicySnapshotId,
      samplePolicyBundleDigest,
      sampleSnapshotId,
      sampleGraph.nodes,
      incompleteObligations
    ),
    obligations: incompleteObligations,
  };

  assert.throws(
    () => compileWorkOrders(graphWithIncompleteObligations),
    (err) => err.code === "obligation-manifest-incomplete" || err.message.includes("Obligation manifest")
  );
});

test("WorkOrderCompiler: atomic validation fails closed on cyclic dependency with zero emitted orders", () => {
  const cyclicNodes = [
    {
      ...sampleGraph.nodes[0],
      dependencies: ["verify-node-1"],
    },
    sampleGraph.nodes[1],
  ];
  const graphWithCyclic = {
    ...sampleGraph,
    graph_id: computeGraphId(
      sampleContractDigest,
      samplePolicySnapshotId,
      samplePolicyBundleDigest,
      sampleSnapshotId,
      cyclicNodes,
      sampleGraphObligations
    ),
    nodes: cyclicNodes,
  };

  assert.throws(
    () => compileWorkOrders(graphWithCyclic),
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

test("WorkOrderCompiler: compiles WorkOrder v2 successfully from clarified graph with distinct work_order_id", () => {
  const unclarifiedOrders = compileWorkOrdersV2(sampleGraph, v2Context());

  const clarifiedNodes = structuredClone(sampleGraphNodes);
  clarifiedNodes[0].clarification_context = {
    event_id: "evt-clarify-001",
    question_id: "q-001",
    answer: "Apply security patch with HMAC-SHA256",
  };
  const clarifiedGraph = {
    ...sampleGraph,
    graph_id: computeGraphId(
      sampleContractDigest,
      samplePolicySnapshotId,
      samplePolicyBundleDigest,
      sampleSnapshotId,
      clarifiedNodes,
      sampleGraphObligations
    ),
    nodes: clarifiedNodes,
  };

  const workOrders = compileWorkOrdersV2(clarifiedGraph, v2Context());
  assert.equal(workOrders.length, 2);
  assert.equal(workOrders[0].node_id, "repair-node-1");
  assert.equal(workOrders[1].node_id, "verify-node-1");
  assert.equal(workOrders[1].dependencies[0], workOrders[0].work_order_id);

  // Assert affected node acquired clarification_context and distinct work_order_id
  assert.deepEqual(workOrders[0].clarification_context, clarifiedNodes[0].clarification_context);
  assert.notEqual(workOrders[0].work_order_id, unclarifiedOrders[0].work_order_id);

  // Assert dependent descendant node acquired new dependency WorkOrderId digest and therefore distinct work_order_id
  assert.notEqual(workOrders[1].work_order_id, unclarifiedOrders[1].work_order_id);
});

test("WorkOrderCompiler: rejects ExecutionGraph with duplicate node_id fail-closed", () => {
  const dupNodes = [
    { ...sampleGraphNodes[0], node_id: "duplicate-id" },
    { ...sampleGraphNodes[1], node_id: "duplicate-id", dependencies: [] },
  ];
  const graphWithDups = {
    ...sampleGraph,
    nodes: dupNodes,
    graph_id: computeGraphId(
      sampleContractDigest,
      samplePolicySnapshotId,
      samplePolicyBundleDigest,
      sampleSnapshotId,
      dupNodes,
      sampleGraphObligations
    ),
  };

  assert.throws(
    () => compileWorkOrdersV2(graphWithDups),
    (err) => err.code === "duplicate-node-id" || err.code === "DUPLICATE_NODE_ID"
  );
});

test("WorkOrderCompiler: rejects tampered ExecutionGraph with graph-id-mismatch", () => {
  const tamperedGraph = structuredClone(sampleGraph);
  tamperedGraph.nodes[0].objective = "tampered objective";

  assert.throws(
    () => compileWorkOrdersV2(tamperedGraph),
    (err) => err.code === "graph-id-mismatch"
  );
});

test("WorkOrderCompiler: rejects provenance mismatch between context and graph", () => {
  const otherSnapshot = {
    kind: "source-snapshot/v1",
    schema_version: 1,
    repository_id: "repo:other",
    base_tree_digest: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    projection: "workspace",
    dependency_digests: [],
  };
  const validOtherSnapshot = { ...otherSnapshot, source_snapshot_id: computeSourceSnapshotId(otherSnapshot) };

  assert.throws(
    () => compileWorkOrdersV2(sampleGraph, {
      sourceSnapshot: validOtherSnapshot,
      sourceSnapshotId: validOtherSnapshot.source_snapshot_id,
    }),
    (err) => err.code === "provenance-mismatch" || err.code === "SOURCE_SNAPSHOT_MISMATCH" || err.message.includes("Provenance mismatch")
  );
});

test("WorkOrderCompiler: rejects unlinked variable role in K4a", () => {
  assert.throws(
    () => compileWorkOrdersV2(sampleGraph, { role: "security-repair-worker" }),
    (err) => err.code === "unsupported-compilation-context"
  );
});

test("WorkOrderCompiler: rejects unlinked variable budgets or defaultBudget in K4a", () => {
  assert.throws(
    () => compileWorkOrdersV2(sampleGraph, { budgets: { "test-fix": { model_turns: 10 } } }),
    (err) => err.code === "unsupported-compilation-context"
  );
  assert.throws(
    () => compileWorkOrdersV2(sampleGraph, { defaultBudget: { model_turns: 10 } }),
    (err) => err.code === "unsupported-compilation-context"
  );
});

test("REQ-execution-graph-compiler-009: identical graphs emit byte-identical sorted capsule_inputs", () => {
  const first = compileWorkOrdersV2(sampleGraph, v2Context());
  const second = compileWorkOrdersV2(sampleGraph, v2Context());
  assert.equal(first.length, 2);
  for (let i = 0; i < first.length; i += 1) {
    assert.deepEqual(first[i].capsule_inputs, second[i].capsule_inputs);
    assert.deepEqual(first[i].capsule_inputs, [...first[i].capsule_inputs].sort());
    assert.equal(new Set(first[i].capsule_inputs).size, first[i].capsule_inputs.length);
    for (const input of first[i].capsule_inputs) {
      assert.equal(/[*?\[]/.test(input), false);
      assert.equal(input.includes(".."), false);
    }
  }
  assert.deepEqual(first[0].capsule_inputs, ["src/auth/index.js", "src/auth/session.js"]);
  assert.deepEqual(first[1].capsule_inputs, [
    "src/auth/index.js",
    "src/auth/session.js",
    "tests/auth.test.js",
    "tests/conformance.test.js",
  ]);
});

test("REQ-execution-graph-compiler-009: emitted WorkOrders validate against work-order/v2", () => {
  const schema = loadSchemaById("ospec://schemas/kernel/work-order/v2", { rootDir: ROOT });
  const workOrders = compileWorkOrdersV2(sampleGraph, v2Context());
  for (const wo of workOrders) {
    const result = validateInstance(schema, wo);
    assert.equal(result.valid, true, JSON.stringify(result.errors));
    assert.ok(Array.isArray(wo.capsule_inputs) && wo.capsule_inputs.length >= 1);
  }
});

test("REQ-execution-graph-compiler-009: empty or glob capsule_inputs fail atomically with zero WorkOrders", () => {
  const globOnlyNodes = [
    {
      ...sampleGraphNodes[0],
      allowed_paths: ["src/missing/**"],
    },
  ];
  const globOnlyObligations = [sampleGraphObligations[0]];
  const globGraph = {
    schema_version: 1,
    graph_id: computeGraphId(
      sampleContractDigest,
      samplePolicySnapshotId,
      samplePolicyBundleDigest,
      sampleSnapshotId,
      globOnlyNodes,
      globOnlyObligations
    ),
    contract_digest: sampleContractDigest,
    policy_bundle_digest: samplePolicyBundleDigest,
    policy_snapshot_id: samplePolicySnapshotId,
    source_snapshot_id: sampleSnapshotId,
    nodes: globOnlyNodes,
    obligations: globOnlyObligations,
  };

  let emitted = null;
  assert.throws(
    () => {
      emitted = compileWorkOrdersV2(globGraph, v2Context());
    },
    (err) => err.code === "empty-capsule-inputs" || err.code === "invalid-capsule-inputs"
  );
  assert.equal(emitted, null);

  const noInventoryEmitted = [];
  assert.throws(
    () => {
      const result = compileWorkOrdersV2(sampleGraph);
      noInventoryEmitted.push(...result);
    },
    (err) => err.code === "empty-capsule-inputs" || err.code === "invalid-capsule-inputs"
  );
  assert.equal(noInventoryEmitted.length, 0);
});

test("REQ-execution-graph-compiler-009: WorkOrderId includes capsule_inputs", () => {
  const base = {
    schema_version: 2,
    kind: "work-order/v2",
    source_snapshot_id: sampleSnapshotId,
    node_id: "repair-node-1",
    role: "repair-worker",
    operation: "apply_repair_patch",
    objective: "Apply repair changes to src/auth",
    dependencies: [],
    ownership: { owner: "agent:repair", mode: "exclusive" },
    allowed_paths: ["src/auth/**"],
    invariants: ["inv-fail-closed"],
    required_evidence: ["ev:auth-tests"],
    budget: { ...DEFAULT_WORK_ORDER_BUDGET },
  };
  const idA = computeWorkOrderId({ ...base, capsule_inputs: ["src/auth/session.js"] });
  const idB = computeWorkOrderId({ ...base, capsule_inputs: ["src/auth/index.js"] });
  assert.notEqual(idA, idB);

  const compiled = compileWorkOrdersV2(sampleGraph, v2Context());
  const recomputed = computeWorkOrderId(compiled[0]);
  assert.equal(compiled[0].work_order_id, recomputed);
});


