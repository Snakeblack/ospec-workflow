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
      evidence: {
        "ev:patch-proof": { digest: "sha256:evidence-patch-001" },
      },
      logs: patchResult.logs,
    },
    "verify-node": {
      ok: true,
      status: "completed",
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
