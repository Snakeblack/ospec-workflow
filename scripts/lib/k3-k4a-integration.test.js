"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");

const {
  validateInstance,
  loadSchemaById,
} = require("./kernel-schema-validator.js");

const {
  computeSourceSnapshotId,
  computeWorkOrderId,
  computeWorkResultId,
  validateWorkOrderBinding,
  validateWorkResultBinding,
} = require("./execution-identities/index.js");

const {
  compileExecutionGraph,
  createPolicySnapshot,
  compileWorkOrdersV2,
  applyClarifyEvent,
  replayExecutionGraph,
} = require("./execution-graph/index.js");

const ROOT = path.resolve(__dirname, "..", "..");

function createIntegrationSourceSnapshot() {
  const snapshot = {
    kind: "source-snapshot/v1",
    schema_version: 1,
    repository_id: "repo:k3-k4a-integration",
    base_tree_digest: "sha256:1111222233334444555566667777888899990000aaaabbbbccccddddeeeeffff",
    projection: "workspace",
    dependency_digests: [],
  };
  return {
    ...snapshot,
    source_snapshot_id: computeSourceSnapshotId(snapshot),
  };
}

function createIntegrationContract(sourceSnapshotId) {
  return {
    schema_version: 1,
    contract_id: "contract:k3-k4a-repair-001",
    family: "repair",
    version: 1,
    contract_digest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    source_snapshot_id: sourceSnapshotId,
    nodes: [
      {
        node_id: "patch-node",
        kind: "repair-action/v1",
        operation: "apply_repair_patch",
        objective: "Apply security patch to auth controller",
        dependencies: [],
        ownership: {
          owner: "agent:repair",
          mode: "exclusive",
        },
        allowed_paths: ["src/auth/**"],
        invariants: ["inv-fail-closed"],
        required_evidence: ["ev:patch-proof"],
        budget_ref: "budget:default",
      },
      {
        node_id: "verify-node",
        kind: "repair-action/v1",
        operation: "verify_repair_conformance",
        objective: "Execute verification suite against patched controller",
        dependencies: ["patch-node"],
        ownership: {
          owner: "agent:verify",
          mode: "shared",
        },
        allowed_paths: ["src/auth/**", "tests/**"],
        invariants: ["inv-no-direct-mutation"],
        required_evidence: ["ev:test-pass"],
        budget_ref: "budget:default",
      },
    ],
    obligations: [
      {
        id: "req-patch-001",
        criticality: "must",
        implemented_by: ["patch-node"],
        required_evidence: ["ev:patch-proof"],
      },
      {
        id: "req-verify-001",
        criticality: "must",
        implemented_by: ["verify-node"],
        required_evidence: ["ev:test-pass"],
      },
    ],
  };
}

test("K3-K4a Integration: End-to-end cryptographic pipeline and provenance coupling", () => {
  // 1. SourceSnapshot (K3 identity)
  const sourceSnapshot = createIntegrationSourceSnapshot();
  const sourceSnapshotId = sourceSnapshot.source_snapshot_id;
  assert.match(sourceSnapshotId, /^sha256:[a-f0-9]{64}$/);

  // 2. PolicySnapshot (K4a compiler parameter)
  const policySnapshot = createPolicySnapshot({
    effectiveRules: ["rule-strict-verification", "rule-fail-closed"],
  });
  assert.match(policySnapshot.snapshot_id, /^sha256:[a-f0-9]{64}$/);
  assert.match(policySnapshot.policy_bundle_digest, /^sha256:[a-f0-9]{64}$/);

  // 3. Change Contract
  const contract = createIntegrationContract(sourceSnapshotId);

  // 4. Execution Graph Compilation
  const graph = compileExecutionGraph({
    contract,
    policySnapshot,
    sourceSnapshotId,
    nodes: contract.nodes,
    obligations: contract.obligations,
  });

  assert.equal(graph.schema_version, 1);
  assert.match(graph.graph_id, /^sha256:[a-f0-9]{64}$/);
  assert.equal(graph.policy_snapshot_id, policySnapshot.snapshot_id);
  assert.equal(graph.source_snapshot_id, sourceSnapshotId);

  // Validate graph against schema
  const graphSchema = loadSchemaById("ospec://schemas/kernel/execution-graph/v1", { rootDir: ROOT });
  const graphValidation = validateInstance(graphSchema, graph);
  assert.equal(graphValidation.valid, true, `ExecutionGraph schema validation: ${JSON.stringify(graphValidation.errors)}`);

  // 5. WorkOrder v2 Compilation with Topological SHA-256 Dependency Resolution
  const workOrders = compileWorkOrdersV2(graph, { sourceSnapshot, sourceSnapshotId });
  assert.equal(workOrders.length, 2);

  const [patchOrder, verifyOrder] = workOrders;
  assert.equal(patchOrder.node_id, "patch-node");
  assert.deepEqual(patchOrder.dependencies, []);
  assert.equal(patchOrder.source_snapshot_id, sourceSnapshotId);
  assert.match(patchOrder.work_order_id, /^sha256:[a-f0-9]{64}$/);

  assert.equal(verifyOrder.node_id, "verify-node");
  assert.equal(verifyOrder.dependencies.length, 1);
  assert.equal(verifyOrder.dependencies[0], patchOrder.work_order_id);
  assert.match(verifyOrder.dependencies[0], /^sha256:[a-f0-9]{64}$/);

  // 6. Validate WorkOrder Binding (K3 <-> K4a contract)
  const wo1Binding = validateWorkOrderBinding(sourceSnapshot, patchOrder);
  assert.equal(wo1Binding.ok, true, `WorkOrder 1 binding failed: ${wo1Binding.error}`);

  const wo2Binding = validateWorkOrderBinding(sourceSnapshot, verifyOrder);
  assert.equal(wo2Binding.ok, true, `WorkOrder 2 binding failed: ${wo2Binding.error}`);

  // 7. WorkResult Formation & Binding Validation
  const patchResultPayload = {
    schema_version: 1,
    kind: "work-result/v1",
    work_order_id: patchOrder.work_order_id,
    source_snapshot_id: sourceSnapshotId,
    patch: "diff --git a/src/auth.js b/src/auth.js\n+patched",
    commands: [{ command: "npm test", exit_code: 0, duration_ms: 120 }],
    logs: ["Applied patch cleanly"],
    exit_code: 0,
    filesystem_inventory: [
      {
        path: "src/auth/controller.js",
        sha256: "sha256:9999888877776666555544443333222211110000aaaabbbbccccddddeeeeffff",
        mode: "100644",
      },
    ],
  };
  const patchResult = {
    ...patchResultPayload,
    work_result_id: computeWorkResultId(patchResultPayload),
  };

  const patchResultBinding = validateWorkResultBinding(patchOrder, patchResult);
  assert.equal(patchResultBinding.ok, true, `Patch WorkResult binding: ${patchResultBinding.error}`);

  const verifyResultPayload = {
    schema_version: 1,
    kind: "work-result/v1",
    work_order_id: verifyOrder.work_order_id,
    source_snapshot_id: sourceSnapshotId,
    patch: "",
    commands: [{ command: "node --test", exit_code: 0, duration_ms: 250 }],
    logs: ["All 25 tests passed"],
    exit_code: 0,
    filesystem_inventory: [],
  };
  const verifyResult = {
    ...verifyResultPayload,
    work_result_id: computeWorkResultId(verifyResultPayload),
  };

  const verifyResultBinding = validateWorkResultBinding(verifyOrder, verifyResult);
  assert.equal(verifyResultBinding.ok, true, `Verify WorkResult binding: ${verifyResultBinding.error}`);

  // 8. Replay Engine Evaluation
  const fixtureResults = {
    "patch-node": {
      ok: true,
      status: "completed",
      graph_id: graph.graph_id,
      work_order_id: patchOrder.work_order_id,
      evidence: {
        "ev:patch-proof": { digest: "sha256:evidence-patch-001" },
      },
      logs: patchResult.logs,
    },
    "verify-node": {
      ok: true,
      status: "completed",
      graph_id: graph.graph_id,
      work_order_id: verifyOrder.work_order_id,
      evidence: {
        "ev:test-pass": { digest: "sha256:evidence-verify-001" },
      },
      logs: verifyResult.logs,
    },
  };

  const replay1 = replayExecutionGraph(graph, fixtureResults);
  const replay2 = replayExecutionGraph(graph, fixtureResults);

  assert.equal(replay1.ok, true);
  assert.deepEqual(replay1.completedNodes.sort(), ["patch-node", "verify-node"]);
  assert.deepEqual(replay1.failedNodes, []);
  assert.deepEqual(replay1.blockedNodes, []);
  assert.equal(replay1.counterexample, null);
  assert.equal(replay1.finalStateDigest, replay2.finalStateDigest);

  // 9. Clarify Invalidation Propagation & Stale Fixture Rejection
  const clarifyEvent = {
    schema_version: 1,
    event_id: "evt-clarify-integration",
    question_id: "q-auth-strategy",
    answer: "Use token-based hashing rather than session cookies",
    timestamp: "2026-08-15T12:00:00Z",
    affected_nodes: ["patch-node"],
  };

  const clarifyResult = applyClarifyEvent(graph, clarifyEvent);
  assert.deepEqual(clarifyResult.invalidatedNodeIds.sort(), ["patch-node", "verify-node"]);
  assert.notEqual(clarifyResult.graph.graph_id, graph.graph_id);

  // Replay engine must reject stale fixtures for invalidated nodes
  assert.throws(
    () => replayExecutionGraph(clarifyResult.graph, fixtureResults, { invalidatedNodeIds: clarifyResult.invalidatedNodeIds }),
    (err) => err.code === "stale-fixture-rejected"
  );
});

test("K3-K4a Integration: Adversarial tampering of each graph field is rejected by validateExecutionGraphBinding", () => {
  const { validateExecutionGraphBinding } = require("./execution-graph/index.js");

  const sourceSnapshot = createIntegrationSourceSnapshot();
  const policySnapshot = createPolicySnapshot({ effectiveRules: ["rule-1"] });
  const contract = createIntegrationContract(sourceSnapshot.source_snapshot_id);
  const graph = compileExecutionGraph({
    contract,
    policySnapshot,
    sourceSnapshotId: sourceSnapshot.source_snapshot_id,
    nodes: contract.nodes,
    obligations: contract.obligations,
  });

  // Valid baseline
  assert.equal(validateExecutionGraphBinding(graph).ok, true);

  // Tamper 1: graph_id
  const tamperedGraphId = { ...graph, graph_id: "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff" };
  assert.equal(validateExecutionGraphBinding(tamperedGraphId).reason_code, "GRAPH_ID_MISMATCH");

  // Tamper 2: policy_snapshot_id
  const tamperedPsId = { ...graph, policy_snapshot_id: "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff" };
  assert.equal(validateExecutionGraphBinding(tamperedPsId).reason_code, "GRAPH_ID_MISMATCH");

  // Tamper 3: policy_bundle_digest
  const tamperedBundle = { ...graph, policy_bundle_digest: "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff" };
  assert.equal(validateExecutionGraphBinding(tamperedBundle).reason_code, "GRAPH_ID_MISMATCH");

  // Tamper 4: source_snapshot_id
  const tamperedSrcId = { ...graph, source_snapshot_id: "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff" };
  assert.equal(validateExecutionGraphBinding(tamperedSrcId).reason_code, "GRAPH_ID_MISMATCH");

  // Tamper 5: contract_digest
  const tamperedContractDigest = { ...graph, contract_digest: "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff" };
  assert.equal(validateExecutionGraphBinding(tamperedContractDigest).reason_code, "GRAPH_ID_MISMATCH");

  // Tamper 6: nodes
  const tamperedNodes = structuredClone(graph);
  tamperedNodes.nodes[0].operation = "apply_different_patch";
  assert.equal(validateExecutionGraphBinding(tamperedNodes).reason_code, "GRAPH_ID_MISMATCH");

  // Tamper 7: obligations
  const tamperedObligations = structuredClone(graph);
  tamperedObligations.obligations[0].criticality = "should";
  assert.equal(validateExecutionGraphBinding(tamperedObligations).reason_code, "GRAPH_ID_MISMATCH");
});

test("K3-K4a Integration: Contract MUST obligation downgrade attempts are rejected", () => {
  const sourceSnapshot = createIntegrationSourceSnapshot();
  const policySnapshot = createPolicySnapshot();
  const contract = createIntegrationContract(sourceSnapshot.source_snapshot_id);

  const downgradedObligations = [
    {
      id: "req-patch-001",
      criticality: "should", // attempted downgrade
      implemented_by: ["patch-node"],
      required_evidence: ["ev:patch-proof"],
    },
    {
      id: "req-verify-001",
      criticality: "may", // attempted downgrade
      implemented_by: ["verify-node"],
      required_evidence: ["ev:test-pass"],
    },
  ];

  const graph = compileExecutionGraph({
    contract,
    policySnapshot,
    sourceSnapshotId: sourceSnapshot.source_snapshot_id,
    nodes: contract.nodes,
    obligations: downgradedObligations,
  });

  // MUST criticality must be preserved from authoritative contract
  assert.equal(graph.obligations[0].criticality, "must");
  assert.equal(graph.obligations[1].criticality, "must");
});

test("K3-K4a Integration: End-to-end Clarify -> WorkOrder -> K3 execution pipeline", () => {
  const sourceSnapshot = createIntegrationSourceSnapshot();
  const policySnapshot = createPolicySnapshot({ effectiveRules: ["rule-repair"] });
  const contract = createIntegrationContract(sourceSnapshot.source_snapshot_id);

  // 1. Initial Compilation
  const graph = compileExecutionGraph({
    contract,
    policySnapshot,
    sourceSnapshotId: sourceSnapshot.source_snapshot_id,
    nodes: contract.nodes,
    obligations: contract.obligations,
  });

  // 2. Apply Clarify Event
  const clarifyEvent = {
    schema_version: 1,
    event_id: "evt-e2e-001",
    question_id: "q-e2e-001",
    answer: "Use Argon2id key derivation",
    timestamp: "2026-08-16T00:00:00Z",
    affected_nodes: ["patch-node"],
  };
  const clarifyResult = applyClarifyEvent(graph, clarifyEvent);

  // 3. Compile WorkOrders from Clarified Graph
  const workOrders = compileWorkOrdersV2(clarifyResult.graph, {
    sourceSnapshot,
    sourceSnapshotId: sourceSnapshot.source_snapshot_id,
  });

  assert.equal(workOrders.length, 2);
  const [wo1, wo2] = workOrders;

  // 4. Validate K3 WorkOrder Bindings
  assert.equal(validateWorkOrderBinding(sourceSnapshot, wo1).ok, true);
  assert.equal(validateWorkOrderBinding(sourceSnapshot, wo2).ok, true);

  // 5. Simulate WorkResults and Validate K3 WorkResult Bindings
  const res1 = {
    schema_version: 1,
    kind: "work-result/v1",
    work_order_id: wo1.work_order_id,
    source_snapshot_id: sourceSnapshot.source_snapshot_id,
    patch: "diff Argon2id",
    commands: [],
    logs: ["completed"],
    exit_code: 0,
    filesystem_inventory: [],
  };
  res1.work_result_id = computeWorkResultId(res1);
  assert.equal(validateWorkResultBinding(wo1, res1).ok, true);

  const res2 = {
    schema_version: 1,
    kind: "work-result/v1",
    work_order_id: wo2.work_order_id,
    source_snapshot_id: sourceSnapshot.source_snapshot_id,
    patch: "",
    commands: [],
    logs: ["verified"],
    exit_code: 0,
    filesystem_inventory: [],
  };
  res2.work_result_id = computeWorkResultId(res2);
  assert.equal(validateWorkResultBinding(wo2, res2).ok, true);

  // 6. Replay Engine Verification with Node Required Evidence and Provenance
  const replayRes = replayExecutionGraph(clarifyResult.graph, {
    "patch-node": {
      ok: true,
      status: "completed",
      graph_id: clarifyResult.graph.graph_id,
      work_order_id: wo1.work_order_id,
      evidence: { "ev:patch-proof": { signature: "sig1" } },
    },
    "verify-node": {
      ok: true,
      status: "completed",
      graph_id: clarifyResult.graph.graph_id,
      work_order_id: wo2.work_order_id,
      evidence: { "ev:test-pass": { tests: 10, passed: 10 } },
    },
  });

  assert.equal(replayRes.ok, true);
  assert.deepEqual(replayRes.completedNodes.sort(), ["patch-node", "verify-node"]);
});

test("K3-K4a Integration: Rejection of forged PolicySnapshot in graph compilation", () => {
  const sourceSnapshot = createIntegrationSourceSnapshot();
  const contract = createIntegrationContract(sourceSnapshot.source_snapshot_id);

  const forgedPolicySnapshot = createPolicySnapshot({ effectiveRules: ["rule-alpha"] });
  forgedPolicySnapshot.snapshot_id = "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";

  assert.throws(
    () => {
      compileExecutionGraph({
        contract,
        policySnapshot: forgedPolicySnapshot,
        sourceSnapshotId: sourceSnapshot.source_snapshot_id,
        nodes: contract.nodes,
        obligations: contract.obligations,
      });
    },
    (err) => err.code === "policy-snapshot-mismatch"
  );
});

test("K3-K4a Integration: Fail-closed rejection of empty sourceSnapshotId in graph compilation", () => {
  const policySnapshot = createPolicySnapshot();
  const contract = {
    ...createIntegrationContract("sha256:1111222233334444555566667777888899990000aaaabbbbccccddddeeeeffff"),
    source_snapshot_id: "",
  };

  assert.throws(
    () => {
      compileExecutionGraph({
        contract,
        policySnapshot,
        sourceSnapshotId: "",
        nodes: contract.nodes,
        obligations: contract.obligations,
      });
    },
    (err) => err.code === "invalid-source-snapshot-id"
  );
});

test("K3-K4a Integration: Missing node evidence during replay generates counterexamples", () => {
  const sourceSnapshot = createIntegrationSourceSnapshot();
  const policySnapshot = createPolicySnapshot();
  const contract = createIntegrationContract(sourceSnapshot.source_snapshot_id);

  const graph = compileExecutionGraph({
    contract,
    policySnapshot,
    sourceSnapshotId: sourceSnapshot.source_snapshot_id,
    nodes: contract.nodes,
    obligations: contract.obligations,
  });

  const workOrders = compileWorkOrdersV2(graph, { sourceSnapshot, sourceSnapshotId: sourceSnapshot.source_snapshot_id });
  const [patchOrder, verifyOrder] = workOrders;

  // Replay without patch-node required evidence
  const fixturesWithoutEvidence = {
    "patch-node": {
      ok: true,
      status: "completed",
      graph_id: graph.graph_id,
      work_order_id: patchOrder.work_order_id,
      evidence: {}, // Missing ev:patch-proof
    },
    "verify-node": {
      ok: true,
      status: "completed",
      graph_id: graph.graph_id,
      work_order_id: verifyOrder.work_order_id,
      evidence: { "ev:test-pass": { passed: true } },
    },
  };

  const replayResult = replayExecutionGraph(graph, fixturesWithoutEvidence);
  assert.equal(replayResult.ok, false);
  assert.deepEqual(replayResult.failedNodes, ["patch-node"]);
  assert.deepEqual(replayResult.blockedNodes, ["verify-node"]);
  assert.ok(replayResult.counterexample);
  assert.equal(replayResult.counterexample.failed_node, "patch-node");
  assert.ok(replayResult.counterexample.reason.includes("missing required evidence"));
  assert.ok(Array.isArray(replayResult.counterexample.trace));
});

test("K3-K4a Integration Adversarial Vector 1: oldUnboundFixture + clarifiedGraph => stale-fixture-rejected", () => {
  const sourceSnapshot = createIntegrationSourceSnapshot();
  const policySnapshot = createPolicySnapshot();
  const contract = createIntegrationContract(sourceSnapshot.source_snapshot_id);
  const graph = compileExecutionGraph({
    contract,
    policySnapshot,
    sourceSnapshotId: sourceSnapshot.source_snapshot_id,
    nodes: contract.nodes,
    obligations: contract.obligations,
  });

  const oldUnboundFixture = {
    ok: true,
    status: "completed",
    evidence: {
      "ev:patch-proof": { digest: "sha256:old-evidence" },
    },
  };

  const clarifyEvent = {
    schema_version: 1,
    event_id: "evt-clarify-adversarial-1",
    question_id: "q-auth",
    answer: "Argon2id hashing",
    timestamp: "2026-08-16T12:00:00Z",
    affected_nodes: ["patch-node"],
  };
  const clarified = applyClarifyEvent(graph, clarifyEvent);

  assert.throws(
    () =>
      replayExecutionGraph(clarified.graph, {
        "patch-node": oldUnboundFixture,
        "verify-node": oldUnboundFixture,
      }),
    (err) => err.code === "stale-fixture-rejected"
  );
});

test("K3-K4a Integration Adversarial Vector 2: unknownExternalObligation => unknown-obligation-id", () => {
  const sourceSnapshot = createIntegrationSourceSnapshot();
  const policySnapshot = createPolicySnapshot();
  const contract = createIntegrationContract(sourceSnapshot.source_snapshot_id);

  const unknownExternalObligation = [
    {
      id: "req-patch-001",
      criticality: "must",
      implemented_by: ["patch-node"],
      required_evidence: ["ev:patch-proof"],
    },
    {
      id: "UNAUTHORIZED-EXTERNAL-OBLIGATION-999",
      criticality: "should",
      implemented_by: ["patch-node"],
      required_evidence: ["ev:patch-proof"],
    },
  ];

  assert.throws(
    () =>
      compileExecutionGraph({
        contract,
        policySnapshot,
        sourceSnapshotId: sourceSnapshot.source_snapshot_id,
        nodes: contract.nodes,
        obligations: unknownExternalObligation,
      }),
    (err) => err.code === "unknown-obligation-id" && err.obligation_id === "UNAUTHORIZED-EXTERNAL-OBLIGATION-999"
  );
});

test("K3-K4a Integration Adversarial Vector 3: baselineMissingOwnership => match: false & discrepancy_classification: partial-match", () => {
  const { compareShadowExecution } = require("./execution-graph/index.js");
  const sourceSnapshot = createIntegrationSourceSnapshot();
  const policySnapshot = createPolicySnapshot();
  const contract = createIntegrationContract(sourceSnapshot.source_snapshot_id);
  const graph = compileExecutionGraph({
    contract,
    policySnapshot,
    sourceSnapshotId: sourceSnapshot.source_snapshot_id,
    nodes: contract.nodes,
    obligations: contract.obligations,
  });

  const baselineMissingOwnership = () => ({
    route: "repair",
    steps: ["apply_repair_patch", "verify_repair_conformance"],
    allowed_paths: ["src/auth/**", "tests/**"],
    invariants: ["inv-fail-closed", "inv-no-direct-mutation"],
    obligations: ["req-patch-001", "req-verify-001"],
    dependencies: [
      { node_id: "patch-node", dependencies: [] },
      { node_id: "verify-node", dependencies: ["patch-node"] },
    ],
    // ownership is intentionally omitted
  });

  const comparison = compareShadowExecution({
    contractInput: {},
    fixedBaselineFn: baselineMissingOwnership,
    compiledGraph: graph,
  });

  assert.equal(comparison.match, false);
  assert.equal(comparison.discrepancy_classification, "partial-match");
  assert.deepEqual(comparison.skipped_dimensions, ["ownership"]);
  assert.ok(comparison.telemetryDiff !== null);
  assert.deepEqual(comparison.telemetryDiff.skipped_dimensions, ["ownership"]);
});

test("K3-K4a Integration Adversarial Vector 4: compileExecutionGraph(node_id: '') => reject", () => {
  const sourceSnapshot = createIntegrationSourceSnapshot();
  const policySnapshot = createPolicySnapshot();
  const contract = createIntegrationContract(sourceSnapshot.source_snapshot_id);

  const emptyNodeIdNodes = [
    {
      ...contract.nodes[0],
      node_id: "",
    },
  ];

  assert.throws(
    () =>
      compileExecutionGraph({
        contract,
        policySnapshot,
        sourceSnapshotId: sourceSnapshot.source_snapshot_id,
        nodes: emptyNodeIdNodes,
        obligations: contract.obligations,
      }),
    (err) => err.code === "missing-required-node-field" && err.field === "node_id"
  );
});

test("K3-K4a Integration: Replay accepts every canonical WorkOrder emitted by supported K4a compilation", () => {
  const sourceSnapshot = createIntegrationSourceSnapshot();
  const policySnapshot = createPolicySnapshot();
  const contract = createIntegrationContract(sourceSnapshot.source_snapshot_id);

  const graph = compileExecutionGraph({
    contract,
    policySnapshot,
    sourceSnapshotId: sourceSnapshot.source_snapshot_id,
    nodes: contract.nodes,
    obligations: contract.obligations,
  });

  const workOrders = compileWorkOrdersV2(graph, {
    sourceSnapshot,
    sourceSnapshotId: sourceSnapshot.source_snapshot_id,
  });

  const fixtures = {};
  for (const wo of workOrders) {
    fixtures[wo.node_id] = {
      graph_id: graph.graph_id,
      work_order_id: wo.work_order_id,
      status: "completed",
      evidence: { [wo.required_evidence[0]]: { verified: true, signature: "sig-k4a" } },
    };
  }

  const replayResult = replayExecutionGraph(graph, fixtures);
  assert.equal(replayResult.ok, true);
  assert.deepEqual(replayResult.completedNodes.sort(), ["patch-node", "verify-node"]);
});

test("K3-K4a Integration: compileWorkOrdersV2 rejects unlinked role or budgets overrides in K4a", () => {
  const sourceSnapshot = createIntegrationSourceSnapshot();
  const policySnapshot = createPolicySnapshot();
  const contract = createIntegrationContract(sourceSnapshot.source_snapshot_id);

  const graph = compileExecutionGraph({
    contract,
    policySnapshot,
    sourceSnapshotId: sourceSnapshot.source_snapshot_id,
    nodes: contract.nodes,
    obligations: contract.obligations,
  });

  assert.throws(
    () =>
      compileWorkOrdersV2(graph, {
        sourceSnapshot,
        sourceSnapshotId: sourceSnapshot.source_snapshot_id,
        role: "specialized-repair-worker",
      }),
    (err) => err.code === "unsupported-compilation-context"
  );

  assert.throws(
    () =>
      compileWorkOrdersV2(graph, {
        sourceSnapshot,
        sourceSnapshotId: sourceSnapshot.source_snapshot_id,
        budgets: { "patch-node": { model_turns: 12 } },
      }),
    (err) => err.code === "unsupported-compilation-context"
  );
});

