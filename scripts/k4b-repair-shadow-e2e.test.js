"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { orchestrateRepairShadow, compareShadowExecution } = require("./lib/repair-shadow/index.js");
const { compileExecutionGraph, createPolicySnapshot } = require("./lib/execution-graph/index.js");
const { computeTreeDigest } = require("./lib/worker-workspace.js");
const { computeSourceSnapshotId, computeCandidateId, validateCandidateV2, computeWorkResultId } = require("./lib/execution-identities/index.js");

test("E2E: Complete vertical pipeline (K4a -> K4b -> K6a -> K3 -> Shadow Compare)", async () => {
  const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), "k4b-e2e-"));

  try {
    const baseFiles = {
      "src/helper.js": "function add(a, b) { return a + b; }\nmodule.exports = { add };\n",
      "src/index.js": "const { add } = require('./helper.js');\nconsole.log(add(1, 2));\n",
      "src/config.json": '{"version": "1.0.0"}\n',
    };
    const baseTreeDigest = computeTreeDigest(baseFiles);
    const sourceSnapshot = {
      schema_version: 1,
      kind: "source-snapshot/v1",
      repository_id: "e2e-repo",
      base_tree_digest: baseTreeDigest,
      projection: "workspace",
      dependency_digests: [],
    };
    sourceSnapshot.source_snapshot_id = computeSourceSnapshotId(sourceSnapshot);

    const nodes = [
      {
        node_id: "n1-helper",
        kind: "repair-action/v1",
        operation: "repair_helper",
        objective: "Add multiply function to helper.js",
        ownership: { owner: "agent:repair", mode: "exclusive" },
        dependencies: [],
        allowed_paths: ["src/helper.js"],
        invariants: ["inv-pure-math"],
        budget_ref: "budget:default",
        required_evidence: ["ev:helper-test"],
      },
      {
        node_id: "n2-index",
        kind: "repair-action/v1",
        operation: "repair_index",
        objective: "Use multiply function in index.js",
        ownership: { owner: "agent:repair", mode: "exclusive" },
        dependencies: ["n1-helper"],
        allowed_paths: ["src/index.js"],
        invariants: ["inv-log-output"],
        budget_ref: "budget:default",
        required_evidence: ["ev:index-test"],
      },
    ];

    const obligations = [
      { id: "ob1", criticality: "must", implemented_by: ["n1-helper"], required_evidence: ["ev:helper-test"] },
      { id: "ob2", criticality: "must", implemented_by: ["n2-index"], required_evidence: ["ev:index-test"] },
    ];

    const policySnapshot = createPolicySnapshot({ effectiveRules: ["rule-fail-closed"] });
    const contract = {
      schema_version: 1,
      contract_id: "contract:e2e-repair-001",
      family: "repair",
      version: 1,
      contract_digest: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
      source_snapshot_id: sourceSnapshot.source_snapshot_id,
      obligations,
    };

    const graph = compileExecutionGraph({
      contract,
      policySnapshot,
      nodes,
      obligations,
    });

    const patchHelper = `--- a/src/helper.js
+++ b/src/helper.js
@@ -1,2 +1,3 @@
 function add(a, b) { return a + b; }
-module.exports = { add };
+function multiply(a, b) { return a * b; }
+module.exports = { add, multiply };
`;

    const patchIndex = `--- a/src/index.js
+++ b/src/index.js
@@ -1,2 +1,3 @@
-const { add } = require('./helper.js');
+const { add, multiply } = require('./helper.js');
 console.log(add(1, 2));
+console.log(multiply(2, 3));
`;

    const executedOrder = [];
    const mockExecutor = async (workOrder, workspaceDescriptor) => {
      executedOrder.push(workOrder.node_id);
      const patch = workOrder.node_id === "n1-helper" ? patchHelper : patchIndex;
      const wr = {
        kind: "work-result/v1",
        schema_version: 1,
        work_order_id: workOrder.work_order_id,
        source_snapshot_id: sourceSnapshot.source_snapshot_id,
        patch,
        commands: [{ command: `test-${workOrder.node_id}`, exit_code: 0, duration_ms: 15 }],
        logs: [`executed ${workOrder.node_id} successfully`],
        exit_code: 0,
        filesystem_inventory: [],
      };
      wr.work_result_id = computeWorkResultId(wr);
      return {
        ok: true,
        isolationReported: "enforced",
        workResult: wr,
      };
    };

    const fixedBaseline = {
      steps: ["n1-helper", "n2-index"],
      diff_hash: "sha256:dummy",
      obligations: ["ob1", "ob2"],
      invariants: ["inv-log-output", "inv-pure-math"],
      inventory: ["src/helper.js", "src/index.js"],
    };

    const result = await orchestrateRepairShadow(graph, {
      sourceSnapshot,
      files: baseFiles,
      baseDir: tmpBase,
      isolationCapability: "enforced",
      executorFn: mockExecutor,
      baselineResult: fixedBaseline,
    });

    assert.equal(result.ok, true, "E2E orchestration must succeed");
    assert.deepEqual(executedOrder, ["n1-helper", "n2-index"], "Nodes must execute in topological sequence");

    // Lineage verification
    assert.equal(result.lineage_verification.ok, true, "Lineage verification must succeed");
    assert.equal(result.lineage_verification.lineage.length, 6, "Lineage must contain SourceSnapshot, 2 WorkOrders, 2 WorkResults, and Candidate");

    // Candidate validation
    assert.ok(result.candidate);
    assert.equal(validateCandidateV2(result.candidate), true);
    assert.equal(result.candidate.candidate_id, computeCandidateId(result.candidate));
    assert.equal(result.candidate.base_tree, baseTreeDigest);

    // Telemetry validation
    assert.equal(result.graph_telemetry["n1-helper"].status, "completed");
    assert.equal(result.graph_telemetry["n2-index"].status, "completed");

    // Shadow comparison validation
    assert.ok(result.shadow_comparison);
    assert.equal(typeof result.shadow_comparison.match, "boolean");
  } finally {
    fs.rmSync(tmpBase, { recursive: true, force: true });
  }
});

test("E2E Fault Injection: Interrupted node halts downstream and cleans up workspaces fail-closed", async () => {
  const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), "k4b-fault-"));

  try {
    const baseFiles = { "src/app.js": "const x = 1;\n" };
    const sourceSnapshot = {
      schema_version: 1,
      kind: "source-snapshot/v1",
      repository_id: "fault-repo",
      base_tree_digest: computeTreeDigest(baseFiles),
      projection: "workspace",
      dependency_digests: [],
    };
    sourceSnapshot.source_snapshot_id = computeSourceSnapshotId(sourceSnapshot);

    const nodes = [
      {
        node_id: "n1-root",
        kind: "repair-action/v1",
        operation: "root_op",
        objective: "root task",
        ownership: { owner: "agent:repair", mode: "exclusive" },
        dependencies: [],
        allowed_paths: ["src/app.js"],
        invariants: [],
        budget_ref: "budget:default",
        required_evidence: ["ev1"],
      },
      {
        node_id: "n2-child",
        kind: "repair-action/v1",
        operation: "child_op",
        objective: "child task",
        ownership: { owner: "agent:repair", mode: "exclusive" },
        dependencies: ["n1-root"],
        allowed_paths: ["src/app.js"],
        invariants: [],
        budget_ref: "budget:default",
        required_evidence: ["ev2"],
      },
      {
        node_id: "n3-grandchild",
        kind: "repair-action/v1",
        operation: "grandchild_op",
        objective: "grandchild task",
        ownership: { owner: "agent:repair", mode: "exclusive" },
        dependencies: ["n2-child"],
        allowed_paths: ["src/app.js"],
        invariants: [],
        budget_ref: "budget:default",
        required_evidence: ["ev3"],
      },
    ];

    const obligations = [
      { id: "ob1", criticality: "must", implemented_by: ["n1-root"], required_evidence: ["ev1"] },
      { id: "ob2", criticality: "must", implemented_by: ["n2-child"], required_evidence: ["ev2"] },
      { id: "ob3", criticality: "must", implemented_by: ["n3-grandchild"], required_evidence: ["ev3"] },
    ];

    const policySnapshot = createPolicySnapshot({ effectiveRules: ["rule-fail-closed"] });
    const contract = {
      schema_version: 1,
      contract_id: "contract:fault-001",
      family: "repair",
      version: 1,
      contract_digest: "sha256:2222222222222222222222222222222222222222222222222222222222222222",
      source_snapshot_id: sourceSnapshot.source_snapshot_id,
      obligations,
    };

    const graph = compileExecutionGraph({
      contract,
      policySnapshot,
      nodes,
      obligations,
    });

    const mockFailingAtN2 = async (workOrder, workspaceDescriptor) => {
      if (workOrder.node_id === "n1-root") {
        const wr = {
          kind: "work-result/v1",
          schema_version: 1,
          work_order_id: workOrder.work_order_id,
          source_snapshot_id: sourceSnapshot.source_snapshot_id,
          patch: "",
          commands: [],
          logs: ["n1 ok"],
          exit_code: 0,
          filesystem_inventory: [],
        };
        wr.work_result_id = computeWorkResultId(wr);
        return { ok: true, isolationReported: "enforced", workResult: wr };
      }
      if (workOrder.node_id === "n2-child") {
        return {
          ok: false,
          isolationReported: "enforced",
          workResult: { exit_code: 127, commands: [], logs: ["command failed"] },
        };
      }
      throw new Error("n3-grandchild must not be executed!");
    };

    const result = await orchestrateRepairShadow(graph, {
      sourceSnapshot,
      files: baseFiles,
      baseDir: tmpBase,
      isolationCapability: "enforced",
      executorFn: mockFailingAtN2,
    });

    assert.equal(result.ok, false, "Pipeline must fail closed when node fails");
    assert.equal(result.reason_code, "NODE_EXECUTION_FAILED");
    assert.equal(result.failed_node_id, "n2-child");
    assert.equal(result.graph_telemetry["n1-root"].status, "completed");
    assert.equal(result.graph_telemetry["n2-child"].status, "failed");
    assert.equal(result.graph_telemetry["n3-grandchild"].status, "blocked");
    assert.equal(result.graph_telemetry["n3-grandchild"].blocked_by, "n2-child");
  } finally {
    fs.rmSync(tmpBase, { recursive: true, force: true });
  }
});

test("E2E Isolation Gate: Non-enforced isolation halts orchestration immediately", async () => {
  const baseFiles = { "src/app.js": "const x = 1;\n" };
  const sourceSnapshot = {
    schema_version: 1,
    kind: "source-snapshot/v1",
    repository_id: "iso-repo",
    base_tree_digest: computeTreeDigest(baseFiles),
    projection: "workspace",
    dependency_digests: [],
  };
  sourceSnapshot.source_snapshot_id = computeSourceSnapshotId(sourceSnapshot);

  const nodes = [
    {
      node_id: "n1",
      kind: "repair-action/v1",
      operation: "test_op",
      objective: "test task",
      ownership: { owner: "agent:repair", mode: "exclusive" },
      dependencies: [],
      allowed_paths: ["src/app.js"],
      invariants: [],
      budget_ref: "budget:default",
      required_evidence: ["ev1"],
    },
  ];
  const obligations = [
    { id: "ob1", criticality: "must", implemented_by: ["n1"], required_evidence: ["ev1"] },
  ];
  const policySnapshot = createPolicySnapshot({ effectiveRules: ["rule-fail-closed"] });
  const contract = {
    schema_version: 1,
    contract_id: "contract:iso-001",
    family: "repair",
    version: 1,
    contract_digest: "sha256:3333333333333333333333333333333333333333333333333333333333333333",
    source_snapshot_id: sourceSnapshot.source_snapshot_id,
    obligations,
  };
  const graph = compileExecutionGraph({
    contract,
    policySnapshot,
    nodes,
    obligations,
  });

  const result = await orchestrateRepairShadow(graph, {
    sourceSnapshot,
    files: baseFiles,
    isolationCapability: "unavailable",
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason_code, "ISOLATION_NOT_ENFORCED");
});
