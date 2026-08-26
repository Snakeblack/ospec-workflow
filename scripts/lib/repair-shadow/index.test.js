"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const workerExecutor = require("../worker-executor.js");

test("Phase 1: repair-shadow package exports canonical API", () => {
  const repairShadow = require("./index.js");
  const orchestrator = require("./orchestrator.js");
  const patchIntegrator = require("./patch-integrator.js");
  const shadowComparator = require("./shadow-comparator.js");

  assert.equal(typeof repairShadow.orchestrateRepairShadow, "function", "repair-shadow must export orchestrateRepairShadow");
  assert.equal(typeof repairShadow.integrateWorkResultPatches, "function", "repair-shadow must export integrateWorkResultPatches");
  assert.equal(typeof repairShadow.compareShadowExecution, "function", "repair-shadow must export compareShadowExecution");
  assert.equal(typeof repairShadow.persistRepairShadowExecution, "function", "repair-shadow must export persistRepairShadowExecution");
  assert.equal(typeof repairShadow.loadRepairShadowExecution, "function", "repair-shadow must export loadRepairShadowExecution");

  assert.equal(typeof orchestrator.orchestrateRepairShadow, "function", "orchestrator must export orchestrateRepairShadow");
  assert.equal(typeof patchIntegrator.integrateWorkResultPatches, "function", "patch-integrator must export integrateWorkResultPatches");
  assert.equal(typeof shadowComparator.compareShadowExecution, "function", "shadow-comparator must export compareShadowExecution");
});

test("Phase 2.1: integrateWorkResultPatches fails closed when patch targets outside allowed_paths", async () => {
  const { integrateWorkResultPatches } = require("./patch-integrator.js");
  const { computeTreeDigest } = require("../worker-workspace.js");
  const { computeSourceSnapshotId } = require("../execution-identities/index.js");

  const files = {
    "src/app.js": "const a = 1;\n",
  };
  const baseTreeDigest = computeTreeDigest(files);
  const sourceSnapshot = {
    schema_version: 1,
    kind: "source-snapshot/v1",
    repository_id: "repo-test",
    base_tree_digest: baseTreeDigest,
    projection: "workspace",
    dependency_digests: [],
  };
  sourceSnapshot.source_snapshot_id = computeSourceSnapshotId(sourceSnapshot);

  // Patch modifying forbidden file "etc/secret.conf"
  const forbiddenPatch = `--- a/etc/secret.conf
+++ b/etc/secret.conf
@@ -1 +1 @@
-old
+new
`;

  const workResults = [
    {
      work_order_id: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
      source_snapshot_id: sourceSnapshot.source_snapshot_id,
      patch: forbiddenPatch,
      commands: [],
      logs: [],
      exit_code: 0,
      filesystem_inventory: [],
    },
  ];

  const result = await integrateWorkResultPatches(sourceSnapshot, workResults, {
    files,
    allowed_paths: ["src/**"],
  });

  assert.equal(result.ok, false, "Must fail when patch modifies path outside allowed_paths");
  assert.equal(result.reason_code, "CONTAINMENT_VIOLATION");
  assert.equal(result.candidate, undefined, "freezeCandidate must not be invoked on containment violation");
});

test("Phase 2.3 & 2.5: integrateWorkResultPatches applies diffs in-memory and freezes Candidate via K3", async () => {
  const { integrateWorkResultPatches } = require("./patch-integrator.js");
  const { computeTreeDigest } = require("../worker-workspace.js");
  const { computeSourceSnapshotId, computeCandidateId, validateCandidateV2 } = require("../execution-identities/index.js");

  const files = {
    "src/app.js": "const a = 1;\nconst b = 2;\n",
  };
  const baseTreeDigest = computeTreeDigest(files);
  const sourceSnapshot = {
    schema_version: 1,
    kind: "source-snapshot/v1",
    repository_id: "repo-test",
    base_tree_digest: baseTreeDigest,
    projection: "workspace",
    dependency_digests: [],
  };
  sourceSnapshot.source_snapshot_id = computeSourceSnapshotId(sourceSnapshot);

  const patch = `--- a/src/app.js
+++ b/src/app.js
@@ -1,2 +1,3 @@
 const a = 1;
+const added = 100;
 const b = 2;
`;

  const workResults = [
    {
      work_order_id: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
      source_snapshot_id: sourceSnapshot.source_snapshot_id,
      patch,
      commands: [],
      logs: [],
      exit_code: 0,
      filesystem_inventory: [],
    },
  ];

  const result1 = await integrateWorkResultPatches(sourceSnapshot, workResults, {
    files,
    allowed_paths: ["src/**"],
  });

  assert.equal(result1.ok, true, "Patch integration must succeed");
  assert.ok(result1.candidate, "Must produce a frozen candidate");
  assert.equal(result1.candidate.kind, "candidate/v2");
  assert.equal(result1.candidate.schema_version, 2);
  assert.equal(result1.candidate.base_tree, baseTreeDigest);
  assert.equal(validateCandidateV2(result1.candidate), true);
  assert.equal(result1.candidate.candidate_id, computeCandidateId(result1.candidate));

  // Check candidateFiles content
  assert.equal(
    result1.candidateFiles.get("src/app.js"),
    "const a = 1;\nconst added = 100;\nconst b = 2;\n"
  );

  // Determinism check (REQ-repair-shadow-003 scenario: identical inputs produce identical CandidateId)
  const result2 = await integrateWorkResultPatches(sourceSnapshot, workResults, {
    files,
    allowed_paths: ["src/**"],
  });
  assert.equal(result1.candidate.candidate_id, result2.candidate.candidate_id);
});

test("Phase 2.7: integrateWorkResultPatches triangulates new files, deletions and files without trailing newline", async () => {
  const { integrateWorkResultPatches } = require("./patch-integrator.js");
  const { computeTreeDigest } = require("../worker-workspace.js");
  const { computeSourceSnapshotId, validateCandidateV2 } = require("../execution-identities/index.js");

  const files = {
    "src/delete-me.js": "to be deleted\n",
    "src/no-newline.txt": "first line",
    "src/keep.js": "stay unchanged\n",
  };
  const baseTreeDigest = computeTreeDigest(files);
  const sourceSnapshot = {
    schema_version: 1,
    kind: "source-snapshot/v1",
    repository_id: "repo-test",
    base_tree_digest: baseTreeDigest,
    projection: "workspace",
    dependency_digests: [],
  };
  sourceSnapshot.source_snapshot_id = computeSourceSnapshotId(sourceSnapshot);

  const patchNewFile = `--- /dev/null
+++ b/src/brand-new.js
@@ -0,0 +1,2 @@
+const newFile = true;
+module.exports = newFile;
`;

  const patchDeleteFile = `--- a/src/delete-me.js
+++ /dev/null
@@ -1 +0,0 @@
-to be deleted
`;

  const patchNoNewline = `--- a/src/no-newline.txt
+++ b/src/no-newline.txt
@@ -1 +1,2 @@
-first line
\\ No newline at end of file
+first line updated
+second line
\\ No newline at end of file
`;

  const workResults = [
    {
      work_order_id: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
      source_snapshot_id: sourceSnapshot.source_snapshot_id,
      patch: patchNewFile + "\n" + patchDeleteFile,
      commands: [],
      logs: [],
      exit_code: 0,
      filesystem_inventory: [],
    },
    {
      work_order_id: "sha256:2222222222222222222222222222222222222222222222222222222222222222",
      source_snapshot_id: sourceSnapshot.source_snapshot_id,
      patch: patchNoNewline,
      commands: [],
      logs: [],
      exit_code: 0,
      filesystem_inventory: [],
    },
  ];

  const result = await integrateWorkResultPatches(sourceSnapshot, workResults, {
    files,
    allowed_paths: ["src/**"],
  });

  assert.equal(result.ok, true);
  assert.equal(validateCandidateV2(result.candidate), true);
  assert.equal(result.candidateFiles.has("src/delete-me.js"), false, "Deleted file must be removed");
  assert.equal(result.candidateFiles.has("src/brand-new.js"), true, "New file must be added");
  assert.equal(result.candidateFiles.get("src/brand-new.js"), "const newFile = true;\nmodule.exports = newFile;\n");
  assert.equal(result.candidateFiles.get("src/no-newline.txt"), "first line updated\nsecond line");
  assert.equal(result.candidateFiles.get("src/keep.js"), "stay unchanged\n");
});

test("Phase 3.1: orchestrateRepairShadow fails closed on invalid graph binding or DAG cycles", async () => {
  const { orchestrateRepairShadow } = require("./orchestrator.js");
  const { computeTreeDigest } = require("../worker-workspace.js");
  const { computeSourceSnapshotId } = require("../execution-identities/index.js");
  const { createPolicySnapshot } = require("../execution-graph/index.js");

  const files = { "src/app.js": "console.log('hi');\n" };
  const sourceSnapshot = {
    schema_version: 1,
    kind: "source-snapshot/v1",
    repository_id: "repo-test",
    base_tree_digest: computeTreeDigest(files),
    projection: "workspace",
    dependency_digests: [],
  };
  sourceSnapshot.source_snapshot_id = computeSourceSnapshotId(sourceSnapshot);

  // 1. Invalid graph binding (mismatched source_snapshot_id)
  const invalidGraph = {
    schema_version: 1,
    kind: "execution-graph/v1",
    graph_id: "sha256:0000000000000000000000000000000000000000000000000000000000000000",
    source_snapshot_id: "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
    nodes: [],
    obligations: [],
  };

  const res1 = await orchestrateRepairShadow(invalidGraph, { sourceSnapshot, files });
  assert.equal(res1.ok, false, "Must fail closed on graph binding mismatch");

  // 2. Cyclic graph
  const policySnapshot = createPolicySnapshot({ effectiveRules: ["rule-1"] });
  const cyclicNodes = [
    {
      node_id: "n1",
      kind: "repair-action/v1",
      operation: "task-1",
      objective: "do 1",
      ownership: { owner: "agent:repair", mode: "exclusive" },
      dependencies: ["n2"],
      allowed_paths: ["src/**"],
      invariants: [],
      budget_ref: "budget:default",
      required_evidence: ["ev1"],
    },
    {
      node_id: "n2",
      kind: "repair-action/v1",
      operation: "task-2",
      objective: "do 2",
      ownership: { owner: "agent:repair", mode: "exclusive" },
      dependencies: ["n1"],
      allowed_paths: ["src/**"],
      invariants: [],
      budget_ref: "budget:default",
      required_evidence: ["ev2"],
    },
  ];
  const cyclicGraph = {
    schema_version: 1,
    kind: "execution-graph/v1",
    graph_id: "sha256:1111222233334444555566667777888899990000aaaabbbbccccddddeeeeffff",
    source_snapshot_id: sourceSnapshot.source_snapshot_id,
    contract_digest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    policy_snapshot_id: policySnapshot.policy_snapshot_id,
    policy_bundle_digest: policySnapshot.policy_bundle_digest,
    nodes: cyclicNodes,
    obligations: [
      { id: "ob1", criticality: "must", implemented_by: ["n1"], required_evidence: ["ev1"] },
      { id: "ob2", criticality: "must", implemented_by: ["n2"], required_evidence: ["ev2"] },
    ],
  };

  const res2 = await orchestrateRepairShadow(cyclicGraph, { sourceSnapshot, files });
  assert.equal(res2.ok, false, "Must fail closed on cyclic graph");
  assert.equal(res2.reason_code, "CYCLIC_DEPENDENCY_DETECTED");
});

test("Phase 3.3: orchestrateRepairShadow fails closed when isolationCapability is not enforced", async () => {
  const { orchestrateRepairShadow } = require("./orchestrator.js");
  const { computeTreeDigest } = require("../worker-workspace.js");
  const { computeSourceSnapshotId } = require("../execution-identities/index.js");
  const { compileExecutionGraph, createPolicySnapshot } = require("../execution-graph/index.js");

  const files = { "src/app.js": "const a = 1;\n" };
  const sourceSnapshot = {
    schema_version: 1,
    kind: "source-snapshot/v1",
    repository_id: "repo-test",
    base_tree_digest: computeTreeDigest(files),
    projection: "workspace",
    dependency_digests: [],
  };
  sourceSnapshot.source_snapshot_id = computeSourceSnapshotId(sourceSnapshot);

  const nodes = [
    {
      node_id: "n1",
      kind: "repair-action/v1",
      operation: "patch-app",
      objective: "modify app",
      ownership: { owner: "agent:repair", mode: "exclusive" },
      dependencies: [],
      allowed_paths: ["src/**"],
      invariants: [],
      budget_ref: "budget:default",
      required_evidence: ["ev-app"],
    },
  ];
  const obligations = [
    { id: "ob1", criticality: "must", implemented_by: ["n1"], required_evidence: ["ev-app"] },
  ];
  const policySnapshot = createPolicySnapshot({ effectiveRules: ["rule-1"] });
  const contract = {
    schema_version: 1,
    contract_id: "contract:test",
    family: "repair",
    version: 1,
    contract_digest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    source_snapshot_id: sourceSnapshot.source_snapshot_id,
    obligations,
  };
  const graph = compileExecutionGraph({
    contract,
    policySnapshot,
    nodes,
    obligations,
  });

  const res = await orchestrateRepairShadow(graph, {
    sourceSnapshot,
    files,
    isolationCapability: "partial", // non-enforced isolation
  });

  assert.equal(res.ok, false, "Must fail closed when isolation is partial");
  assert.equal(res.reason_code, "ISOLATION_NOT_ENFORCED");
});

test("Phase 3.5, 3.7 & 3.9: orchestrateRepairShadow executes DAG in topological order with telemetry, full 4-identity lineage", async (t) => {
  const { orchestrateRepairShadow } = require("./orchestrator.js");
  const { computeTreeDigest } = require("../worker-workspace.js");
  const { computeSourceSnapshotId, computeWorkResultId } = require("../execution-identities/index.js");
  const { compileExecutionGraph, createPolicySnapshot } = require("../execution-graph/index.js");

  const files = { "src/app.js": "const a = 1;\n", "src/util.js": "const u = 1;\n" };
  const sourceSnapshot = {
    schema_version: 1,
    kind: "source-snapshot/v1",
    repository_id: "repo-test",
    base_tree_digest: computeTreeDigest(files),
    projection: "workspace",
    dependency_digests: [],
  };
  sourceSnapshot.source_snapshot_id = computeSourceSnapshotId(sourceSnapshot);

  const nodes = [
    {
      node_id: "n1",
      kind: "repair-action/v1",
      operation: "step-1",
      objective: "step 1",
      ownership: { owner: "agent:repair", mode: "exclusive" },
      dependencies: [],
      allowed_paths: ["src/app.js"],
      invariants: [],
      budget_ref: "budget:default",
      required_evidence: ["ev-1"],
    },
    {
      node_id: "n2",
      kind: "repair-action/v1",
      operation: "step-2",
      objective: "step 2",
      ownership: { owner: "agent:repair", mode: "exclusive" },
      dependencies: ["n1"],
      allowed_paths: ["src/util.js"],
      invariants: [],
      budget_ref: "budget:default",
      required_evidence: ["ev-2"],
    },
  ];
  const obligations = [
    { id: "ob1", criticality: "must", implemented_by: ["n1"], required_evidence: ["ev-1"] },
    { id: "ob2", criticality: "must", implemented_by: ["n2"], required_evidence: ["ev-2"] },
  ];
  const policySnapshot = createPolicySnapshot({ effectiveRules: ["rule-1"] });
  const contract = {
    schema_version: 1,
    contract_id: "contract:test",
    family: "repair",
    version: 1,
    contract_digest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    source_snapshot_id: sourceSnapshot.source_snapshot_id,
    obligations,
  };
  const graph = compileExecutionGraph({
    contract,
    policySnapshot,
    nodes,
    obligations,
  });

  // Mock transport / executor options producing valid work results
  const patchN1 = `--- a/src/app.js\n+++ b/src/app.js\n@@ -1 +1,2 @@\n const a = 1;\n+const extraA = 2;\n`;
  const patchN2 = `--- a/src/util.js\n+++ b/src/util.js\n@@ -1 +1,2 @@\n const u = 1;\n+const extraU = 2;\n`;

  const orderOfExecution = [];
  t.mock.method(workerExecutor, "executeWorkOrder", async (callOptions) => {
    assert.equal(typeof callOptions, "object");
    assert.ok(callOptions && callOptions.workOrder, "executeWorkOrder must use object signature");
    const workOrder = callOptions.workOrder;
    orderOfExecution.push(workOrder.node_id);
    const patch = workOrder.node_id === "n1" ? patchN1 : patchN2;
    const wr = {
      kind: "work-result/v1",
      schema_version: 1,
      work_order_id: workOrder.work_order_id,
      source_snapshot_id: sourceSnapshot.source_snapshot_id,
      patch,
      commands: [{ command: `run-${workOrder.node_id}`, exit_code: 0, duration_ms: 10 }],
      logs: ["stdout: ok"],
      exit_code: 0,
      filesystem_inventory: [],
    };
    wr.work_result_id = computeWorkResultId(wr);
    return {
      ok: true,
      isolationReported: "enforced",
      workResult: wr,
    };
  });

  const result = await orchestrateRepairShadow(graph, {
    sourceSnapshot,
    files,
    isolationCapability: "enforced",
    policySnapshot,
    store: makeTempFileStore(t),
  });

  assert.equal(result.ok, true, "Orchestration must succeed");
  assert.deepEqual(orderOfExecution, ["n1", "n2"], "Must execute in topological order (n1 before n2)");
  assert.equal(result.graph_telemetry.n1.status, "completed");
  assert.equal(result.graph_telemetry.n2.status, "completed");
  assert.ok(result.graph_telemetry.n1.duration_ms >= 0);
  assert.ok(result.candidate, "Must freeze candidate");
  assert.equal(result.lineage_verification.ok, true, "4-identity lineage must validate");
});

test("Phase 3.7b: orchestrateRepairShadow marks downstream nodes as blocked when a node fails", async (t) => {
  const { orchestrateRepairShadow } = require("./orchestrator.js");
  const { computeTreeDigest } = require("../worker-workspace.js");
  const { computeSourceSnapshotId } = require("../execution-identities/index.js");
  const { compileExecutionGraph, createPolicySnapshot } = require("../execution-graph/index.js");

  const files = { "src/app.js": "const a = 1;\n" };
  const sourceSnapshot = {
    schema_version: 1,
    kind: "source-snapshot/v1",
    repository_id: "repo-test",
    base_tree_digest: computeTreeDigest(files),
    projection: "workspace",
    dependency_digests: [],
  };
  sourceSnapshot.source_snapshot_id = computeSourceSnapshotId(sourceSnapshot);

  const nodes = [
    {
      node_id: "n1",
      kind: "repair-action/v1",
      operation: "step-1",
      objective: "step 1",
      ownership: { owner: "agent:repair", mode: "exclusive" },
      dependencies: [],
      allowed_paths: ["src/**"],
      invariants: [],
      budget_ref: "budget:default",
      required_evidence: ["ev-1"],
    },
    {
      node_id: "n2",
      kind: "repair-action/v1",
      operation: "step-2",
      objective: "step 2",
      ownership: { owner: "agent:repair", mode: "exclusive" },
      dependencies: ["n1"],
      allowed_paths: ["src/**"],
      invariants: [],
      budget_ref: "budget:default",
      required_evidence: ["ev-2"],
    },
  ];
  const obligations = [
    { id: "ob1", criticality: "must", implemented_by: ["n1"], required_evidence: ["ev-1"] },
    { id: "ob2", criticality: "must", implemented_by: ["n2"], required_evidence: ["ev-2"] },
  ];
  const policySnapshot = createPolicySnapshot({ effectiveRules: ["rule-1"] });
  const contract = {
    schema_version: 1,
    contract_id: "contract:test",
    family: "repair",
    version: 1,
    contract_digest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    source_snapshot_id: sourceSnapshot.source_snapshot_id,
    obligations,
  };
  const graph = compileExecutionGraph({
    contract,
    policySnapshot,
    nodes,
    obligations,
  });

  t.mock.method(workerExecutor, "executeWorkOrder", async () => {
    return {
      ok: false,
      isolationReported: "enforced",
      workResult: { exit_code: 1, commands: [], logs: [] },
    };
  });

  const result = await orchestrateRepairShadow(graph, {
    sourceSnapshot,
    files,
    isolationCapability: "enforced",
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason_code, "NODE_EXECUTION_FAILED");
  assert.equal(result.failed_node_id, "n1");
  assert.equal(result.graph_telemetry.n1.status, "failed");
  assert.equal(result.graph_telemetry.n2.status, "blocked");
});

test("Phase 3.9b: orchestrateRepairShadow detects tampered WorkResultId and fails closed", async (t) => {
  const { orchestrateRepairShadow } = require("./orchestrator.js");
  const { computeTreeDigest } = require("../worker-workspace.js");
  const { computeSourceSnapshotId } = require("../execution-identities/index.js");
  const { compileExecutionGraph, createPolicySnapshot } = require("../execution-graph/index.js");

  const files = { "src/app.js": "const a = 1;\n" };
  const sourceSnapshot = {
    schema_version: 1,
    kind: "source-snapshot/v1",
    repository_id: "repo-test",
    base_tree_digest: computeTreeDigest(files),
    projection: "workspace",
    dependency_digests: [],
  };
  sourceSnapshot.source_snapshot_id = computeSourceSnapshotId(sourceSnapshot);

  const nodes = [
    {
      node_id: "n1",
      kind: "repair-action/v1",
      operation: "step-1",
      objective: "step 1",
      ownership: { owner: "agent:repair", mode: "exclusive" },
      dependencies: [],
      allowed_paths: ["src/**"],
      invariants: [],
      budget_ref: "budget:default",
      required_evidence: ["ev-1"],
    },
  ];
  const obligations = [
    { id: "ob1", criticality: "must", implemented_by: ["n1"], required_evidence: ["ev-1"] },
  ];
  const policySnapshot = createPolicySnapshot({ effectiveRules: ["rule-1"] });
  const contract = {
    schema_version: 1,
    contract_id: "contract:test",
    family: "repair",
    version: 1,
    contract_digest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    source_snapshot_id: sourceSnapshot.source_snapshot_id,
    obligations,
  };
  const graph = compileExecutionGraph({
    contract,
    policySnapshot,
    nodes,
    obligations,
  });

  t.mock.method(workerExecutor, "executeWorkOrder", async (callOptions) => {
    return {
      ok: true,
      isolationReported: "enforced",
      workResult: {
        kind: "work-result/v1",
        schema_version: 1,
        work_order_id: callOptions.workOrder.work_order_id,
        source_snapshot_id: sourceSnapshot.source_snapshot_id,
        work_result_id: "sha256:0000000000000000000000000000000000000000000000000000000000000000", // Tampered!
        patch: "",
        commands: [],
        logs: [],
        exit_code: 0,
        filesystem_inventory: [],
      },
    };
  });

  const result = await orchestrateRepairShadow(graph, {
    sourceSnapshot,
    files,
    isolationCapability: "enforced",
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason_code, "LINEAGE_VERIFICATION_FAILED");
});

test("Phase 4.1 & 4.2: compareShadowExecution reports full-match when shadow aligns with baseline", () => {
  const { compareShadowExecution } = require("./shadow-comparator.js");

  const shadowResult = {
    steps: ["patch-app", "verify-app"],
    diff_hash: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
    candidate: {
      candidate_id: "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
      diff_hash: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
      paths: ["src/app.js"],
    },
    obligations: ["ob1"],
    invariants: ["inv1"],
    inventory: ["src/app.js"],
  };

  const baselineResult = {
    steps: ["patch-app", "verify-app"],
    diff_hash: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
    candidate: {
      candidate_id: "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
      diff_hash: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
      paths: ["src/app.js"],
    },
    obligations: ["ob1"],
    invariants: ["inv1"],
    inventory: ["src/app.js"],
  };

  const comparison = compareShadowExecution(shadowResult, baselineResult);

  assert.equal(comparison.match, true, "Must match when dimensions are identical");
  assert.equal(comparison.discrepancy_classification, "full-match");
  assert.equal(comparison.telemetryDiff, null, "telemetryDiff must be null on match");
  assert.equal(comparison.dimension_match_rates.steps, 1);
  assert.equal(comparison.dimension_match_rates.diffs, 1);
  assert.equal(comparison.dimension_match_rates.obligations, 1);
  assert.equal(comparison.dimension_match_rates.invariants, 1);
  assert.equal(comparison.dimension_match_rates.inventory, 1);
});

test("F-2377c2ac33934a21: production graph_telemetry execution_metrics ignore wall-clock", () => {
  const { compareShadowExecution } = require("./shadow-comparator.js");
  const candidate = { candidate_id: "sha256:" + "c".repeat(64), diff_hash: "sha256:" + "1".repeat(64), paths: ["src/app.js"] };
  const workResults = [{ work_order_id: "wo-n1", work_result_id: "wr-n1" }];
  const tel = (c) => ({
    n1: {
      node_id: "n1", status: "completed", work_order_id: "wo-n1", work_result_id: "wr-n1",
      commands: [{ command: "node", exit_code: 0, duration_ms: c.cmd }], logs: ["ok"],
      started_at: c.start, finished_at: c.finish, duration_ms: c.dur,
    },
  });
  const comparison = compareShadowExecution(
    { candidate, workResults, graph_telemetry: tel({ start: "2026-08-25T10:00:00Z", finish: "2026-08-25T10:00:01Z", dur: 1000, cmd: 12 }) },
    { candidate, workResults, graph_telemetry: tel({ start: "2026-08-26T11:22:33Z", finish: "2026-08-26T11:22:35Z", dur: 2000, cmd: 88 }) }
  );
  assert.equal(comparison.dimension_match_rates.execution_metrics, 1);
  assert.equal(comparison.match, true);
  assert.equal(comparison.discrepancy_classification, "full-match");
});

test("Phase 4.3 & 4.4: compareShadowExecution classifies divergence and emits structured telemetryDiff without throwing", () => {
  const { compareShadowExecution } = require("./shadow-comparator.js");

  const shadowResult = {
    steps: ["patch-app-alt"],
    diff_hash: "sha256:2222222222222222222222222222222222222222222222222222222222222222",
    obligations: ["ob1"],
    invariants: ["inv1"],
    inventory: ["src/app-alt.js"],
  };

  const baselineResult = {
    steps: ["patch-app"],
    diff_hash: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
    obligations: ["ob1"],
    invariants: ["inv1"],
    inventory: ["src/app.js"],
  };

  const comparison = compareShadowExecution(shadowResult, baselineResult);

  assert.equal(comparison.match, false, "Must report match false when dimensions diverge");
  assert.ok(["diverged", "partial-match"].includes(comparison.discrepancy_classification));
  assert.ok(comparison.telemetryDiff !== null, "telemetryDiff must contain divergence details");
  assert.ok(Array.isArray(comparison.telemetryDiff.divergences));
  assert.ok(comparison.telemetryDiff.divergences.length >= 2, "Must capture steps and diff divergences");
});

test("Phase 4.5 & 4.6: compareShadowExecution preserves non-mutation invariant", () => {
  const { compareShadowExecution } = require("./shadow-comparator.js");

  const shadowOriginal = {
    steps: ["step1"],
    diff_hash: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
    obligations: ["ob1"],
    invariants: ["inv1"],
  };
  const baselineOriginal = {
    steps: ["step2"],
    diff_hash: "sha256:2222222222222222222222222222222222222222222222222222222222222222",
    obligations: ["ob1"],
    invariants: ["inv1"],
  };

  const shadowJsonBefore = JSON.stringify(shadowOriginal);
  const baselineJsonBefore = JSON.stringify(baselineOriginal);

  compareShadowExecution(shadowOriginal, baselineOriginal);

  assert.equal(JSON.stringify(shadowOriginal), shadowJsonBefore, "shadowResult must not be mutated");
  assert.equal(JSON.stringify(baselineOriginal), baselineJsonBefore, "baselineResult must not be mutated");
});

const FORBIDDEN_EXECUTOR_OPTION_KEYS = Object.freeze([
  "budget",
  "environment",
  "baselineInventory",
  "baselineContents",
  "transports",
  "workerTransport",
  "transport",
  "isolationCapability",
  "workerIsolation",
  "capabilityProof",
  "capabilityId",
  "workOrder",
  "workspace",
  "files",
  "executorFn",
]);

function makePhase1Snapshot(files) {
  const { computeTreeDigest } = require("../worker-workspace.js");
  const { computeSourceSnapshotId } = require("../execution-identities/index.js");
  const sourceSnapshot = {
    schema_version: 1,
    kind: "source-snapshot/v1",
    repository_id: "repo-k4b-phase1",
    base_tree_digest: computeTreeDigest(files),
    projection: "workspace",
    dependency_digests: [],
  };
  sourceSnapshot.source_snapshot_id = computeSourceSnapshotId(sourceSnapshot);
  return sourceSnapshot;
}

function makePhase1Graph(sourceSnapshot) {
  const { compileExecutionGraph, createPolicySnapshot } = require("../execution-graph/index.js");
  const nodes = [
    {
      node_id: "n1",
      kind: "repair-action/v1",
      operation: "step-1",
      objective: "step 1",
      ownership: { owner: "agent:repair", mode: "exclusive" },
      dependencies: [],
      allowed_paths: ["src/**"],
      invariants: [],
      budget_ref: "budget:default",
      required_evidence: ["ev-1"],
    },
  ];
  const obligations = [
    { id: "ob1", criticality: "must", implemented_by: ["n1"], required_evidence: ["ev-1"] },
  ];
  const policySnapshot = createPolicySnapshot({ effectiveRules: ["rule-1"] });
  const contract = {
    schema_version: 1,
    contract_id: "contract:k4b-phase1",
    family: "repair",
    version: 1,
    contract_digest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    source_snapshot_id: sourceSnapshot.source_snapshot_id,
    obligations,
  };
  return {
    graph: compileExecutionGraph({ contract, policySnapshot, nodes, obligations }),
    policySnapshot,
  };
}

function makePhase1WorkOrder(sourceSnapshot, overrides = {}) {
  const { computeWorkOrderId } = require("../execution-identities/index.js");
  const workOrder = {
    schema_version: 2,
    kind: "work-order/v2",
    node_id: "n1",
    role: "executor",
    status: "pending",
    operation: "apply",
    objective: "Phase 1 materialization",
    source_snapshot_id: sourceSnapshot.source_snapshot_id,
    dependencies: [],
    ownership: { owner: "agent-test", mode: "exclusive" },
    allowed_paths: ["src/**"],
    invariants: ["inv-1"],
    required_evidence: ["ev-1"],
    budget: { model_turns: 5, patches: 2, commands: 5, wall_time_minutes: 5, changed_lines: 100 },
    ...overrides,
  };
  workOrder.work_order_id = computeWorkOrderId(workOrder);
  return workOrder;
}

test("Phase 1.1: executorOptionsByNode rejects each forbidden key with UNSAFE_EXECUTOR_OPTION before dispatch", async () => {
  const { orchestrateRepairShadow, pickAllowedNodeExecutionInputs } = require("./orchestrator.js");
  const files = { "src/app.js": "const a = 1;\n" };
  const sourceSnapshot = makePhase1Snapshot(files);
  const { graph } = makePhase1Graph(sourceSnapshot);

  for (const forbiddenKey of FORBIDDEN_EXECUTOR_OPTION_KEYS) {
    assert.throws(
      () => pickAllowedNodeExecutionInputs({ [forbiddenKey]: forbiddenKey === "executorFn" ? () => {} : { hijack: true } }),
      (err) => err && err.code === "UNSAFE_EXECUTOR_OPTION",
      `pickAllowedNodeExecutionInputs must reject ${forbiddenKey}`
    );

    const result = await orchestrateRepairShadow(graph, {
      sourceSnapshot,
      files,
      isolationCapability: "enforced",
      executorOptionsByNode: {
        n1: { [forbiddenKey]: forbiddenKey === "files" ? files : { hijack: true } },
      },
    });
    assert.equal(result.ok, false, `Must fail closed for forbidden key ${forbiddenKey}`);
    assert.equal(result.reason_code, "UNSAFE_EXECUTOR_OPTION", `reason_code for ${forbiddenKey}`);
  }

  assert.throws(
    () => pickAllowedNodeExecutionInputs({ command: () => "node" }),
    (err) => err && err.code === "UNSAFE_EXECUTOR_OPTION",
    "function values are forbidden even on allowlisted keys"
  );
});

test("Phase 1.4: caller-supplied executorFn is never invoked and executeWorkOrder uses object signature", async (t) => {
  const { orchestrateRepairShadow } = require("./orchestrator.js");
  const { computeWorkResultId } = require("../execution-identities/index.js");
  const files = { "src/app.js": "const a = 1;\n" };
  const sourceSnapshot = makePhase1Snapshot(files);
  const { graph, policySnapshot } = makePhase1Graph(sourceSnapshot);

  let executorFnCalls = 0;
  const executorFn = async () => {
    executorFnCalls += 1;
    throw new Error("executorFn must not be invoked");
  };

  const executeCalls = [];
  t.mock.method(workerExecutor, "executeWorkOrder", async (callOptions, ...rest) => {
    executeCalls.push({ callOptions, rest });
    const wr = {
      kind: "work-result/v1",
      schema_version: 1,
      work_order_id: callOptions.workOrder.work_order_id,
      source_snapshot_id: sourceSnapshot.source_snapshot_id,
      patch: "",
      commands: [],
      logs: [],
      exit_code: 0,
      filesystem_inventory: [],
    };
    wr.work_result_id = computeWorkResultId(wr);
    return { ok: true, isolationReported: "enforced", workResult: wr };
  });

  const result = await orchestrateRepairShadow(graph, {
    sourceSnapshot,
    files,
    isolationCapability: "enforced",
    executorFn,
    policySnapshot,
    store: makeTempFileStore(t),
  });

  assert.equal(result.ok, true);
  assert.equal(executorFnCalls, 0, "executorFn must be ignored");
  assert.equal(executeCalls.length, 1);
  assert.equal(executeCalls[0].rest.length, 0, "executeWorkOrder must not receive positional extras");
  assert.equal(typeof executeCalls[0].callOptions, "object");
  assert.ok(executeCalls[0].callOptions.workOrder);
  assert.ok(executeCalls[0].callOptions.workspace);
  assert.equal(executeCalls[0].callOptions.isolationCapability, "enforced");
  assert.deepEqual(executeCalls[0].callOptions.transports, { worker: undefined });
});

test("Phase 1.5: materializeSourceSnapshot fails when effectiveBase digest does not match bytes", async (t) => {
  const {
    createWorkspace,
    disposeWorkspace,
    materializeSourceSnapshot,
    computeTreeDigest,
  } = require("../worker-workspace.js");

  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "k4b-effective-base-"));
  t.after(() => fs.rmSync(baseDir, { recursive: true, force: true }));

  const originalFiles = { "src/app.js": "const a = 1;\n" };
  const derivedFiles = { "src/app.js": "const a = 2;\nfunction multiply(x, y) { return x * y; }\n" };
  const sourceSnapshot = makePhase1Snapshot(originalFiles);
  const ws = await createWorkspace({ baseDir, source_snapshot_id: sourceSnapshot.source_snapshot_id });
  t.after(() => disposeWorkspace(ws));
  const workOrder = makePhase1WorkOrder(sourceSnapshot);

  const effectiveBase = {
    kind: "effective-shadow-base/v1",
    source_snapshot_id: sourceSnapshot.source_snapshot_id,
    predecessor_node_ids: ["n1"],
    tree_digest: "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
    files: derivedFiles,
  };

  await assert.rejects(
    () => materializeSourceSnapshot(ws, workOrder, sourceSnapshot, { effectiveBase }),
    (err) => /tree_digest mismatch/i.test(err.message)
  );

  const matchingBase = {
    kind: "effective-shadow-base/v1",
    source_snapshot_id: sourceSnapshot.source_snapshot_id,
    predecessor_node_ids: ["n1"],
    tree_digest: computeTreeDigest(derivedFiles),
    files: derivedFiles,
  };
  const capsule = await materializeSourceSnapshot(ws, workOrder, sourceSnapshot, { effectiveBase: matchingBase });
  assert.equal(capsule.source_snapshot_id, sourceSnapshot.source_snapshot_id);
  assert.equal(fs.readFileSync(path.join(ws.root_path, "src", "app.js"), "utf8"), derivedFiles["src/app.js"]);
});

test("Phase 1.7: persistRepairShadowExecution / loadRepairShadowExecution skeleton fail-closed on incomplete bindings", async () => {
  const {
    persistRepairShadowExecution,
    loadRepairShadowExecution,
  } = require("./execution-record-store.js");

  assert.equal(typeof persistRepairShadowExecution, "function");
  assert.equal(typeof loadRepairShadowExecution, "function");

  const incomplete = await persistRepairShadowExecution({}, {
    kind: "repair-shadow-execution/v1",
    schema_version: 1,
  });
  assert.equal(incomplete.ok, false);
  assert.equal(incomplete.reason_code, "INCOMPLETE_BINDINGS");

  const missingGraph = await persistRepairShadowExecution({}, {
    kind: "repair-shadow-execution/v1",
    schema_version: 1,
    candidate_id: "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
    policy_snapshot: { policy_snapshot_id: "sha256:pppp" },
  });
  assert.equal(missingGraph.ok, false);
  assert.equal(missingGraph.reason_code, "INCOMPLETE_BINDINGS");

  const missingCandidateObject = await persistRepairShadowExecution({}, {
    kind: "repair-shadow-execution/v1",
    schema_version: 1,
    candidate_id: "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
    source_snapshot_id: "sha256:ssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssss",
    execution_graph: { graph_id: "sha256:gggg" },
    policy_snapshot: { policy_snapshot_id: "sha256:pppp" },
  });
  assert.equal(missingCandidateObject.ok, false);

  const loaded = await loadRepairShadowExecution({}, "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc");
  assert.equal(typeof loaded.ok, "boolean");
  assert.equal(loaded.ok, false);
});

const PHASE2_WO_ID = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

function makePhase2WorkResult(sourceSnapshot, patch, overrides = {}) {
  return {
    work_order_id: PHASE2_WO_ID,
    source_snapshot_id: sourceSnapshot.source_snapshot_id,
    patch,
    commands: [],
    logs: [],
    exit_code: 0,
    filesystem_inventory: [],
    ...overrides,
  };
}

test("Phase 2.1: mismatched hunk context lines fail closed before freeze", async () => {
  const { integrateWorkResultPatches } = require("./patch-integrator.js");
  const files = { "src/app.js": "const a = 1;\nconst b = 2;\n" };
  const sourceSnapshot = makePhase1Snapshot(files);
  const patch = `--- a/src/app.js
+++ b/src/app.js
@@ -1,2 +1,2 @@
 const a = WRONG;
 const b = 2;
`;
  const result = await integrateWorkResultPatches(sourceSnapshot, [makePhase2WorkResult(sourceSnapshot, patch)], {
    files,
    workOrders: [{ work_order_id: PHASE2_WO_ID, allowed_paths: ["src/**"] }],
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason_code, "HUNK_CONTEXT_MISMATCH");
  assert.equal(result.candidate, undefined, "freezeCandidate must not be invoked");
});

test("Phase 2.1: mismatched hunk deletion lines fail closed before freeze", async () => {
  const { integrateWorkResultPatches } = require("./patch-integrator.js");
  const files = { "src/app.js": "const a = 1;\nconst b = 2;\n" };
  const sourceSnapshot = makePhase1Snapshot(files);
  const patch = `--- a/src/app.js
+++ b/src/app.js
@@ -1,1 +0,0 @@
-not the actual content
`;
  const result = await integrateWorkResultPatches(sourceSnapshot, [makePhase2WorkResult(sourceSnapshot, patch)], {
    files,
    workOrders: [{ work_order_id: PHASE2_WO_ID, allowed_paths: ["src/**"] }],
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason_code, "HUNK_DELETION_MISMATCH");
  assert.equal(result.candidate, undefined);
});

test("Phase 2.1: invalid unified-diff file mode fails closed before freeze", async () => {
  const { integrateWorkResultPatches } = require("./patch-integrator.js");
  const files = { "src/app.js": "const a = 1;\n" };
  const sourceSnapshot = makePhase1Snapshot(files);
  const patch = `diff --git a/src/app.js b/src/app.js
old mode 100644
new mode 199999
--- a/src/app.js
+++ b/src/app.js
@@ -1 +1 @@
-const a = 1;
+const a = 2;
`;
  const result = await integrateWorkResultPatches(sourceSnapshot, [makePhase2WorkResult(sourceSnapshot, patch)], {
    files,
    workOrders: [{ work_order_id: PHASE2_WO_ID, allowed_paths: ["src/**"] }],
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason_code, "INVALID_FILE_MODE");
  assert.equal(result.candidate, undefined);
});

test("Phase 2.1: path outside WorkOrder.allowed_paths bound via work_order_id fails closed", async () => {
  const { integrateWorkResultPatches } = require("./patch-integrator.js");
  const files = { "src/app.js": "const a = 1;\n", "etc/secret.conf": "old\n" };
  const sourceSnapshot = makePhase1Snapshot(files);
  const patch = `--- a/etc/secret.conf
+++ b/etc/secret.conf
@@ -1 +1 @@
-old
+new
`;
  const result = await integrateWorkResultPatches(sourceSnapshot, [makePhase2WorkResult(sourceSnapshot, patch)], {
    files,
    allowed_paths: ["etc/**"],
    workOrders: [{ work_order_id: PHASE2_WO_ID, allowed_paths: ["src/**"] }],
  });
  assert.equal(result.ok, false, "WorkOrder.allowed_paths must win over options.allowed_paths");
  assert.equal(result.reason_code, "CONTAINMENT_VIOLATION");
  assert.equal(result.candidate, undefined);
});

test("Phase 2.2: hunk count mismatch and overlapping hunks fail closed", async () => {
  const { integrateWorkResultPatches } = require("./patch-integrator.js");
  const files = { "src/app.js": "const a = 1;\nconst b = 2;\nconst c = 3;\n" };
  const sourceSnapshot = makePhase1Snapshot(files);
  const countPatch = `--- a/src/app.js
+++ b/src/app.js
@@ -1,5 +1,1 @@
 const a = 1;
`;
  const countResult = await integrateWorkResultPatches(
    sourceSnapshot,
    [makePhase2WorkResult(sourceSnapshot, countPatch)],
    { files, workOrders: [{ work_order_id: PHASE2_WO_ID, allowed_paths: ["src/**"] }] }
  );
  assert.equal(countResult.ok, false);
  assert.equal(countResult.reason_code, "HUNK_COUNT_MISMATCH");
  assert.equal(countResult.candidate, undefined);

  const overlapPatch = `--- a/src/app.js
+++ b/src/app.js
@@ -1,2 +1,2 @@
-const a = 1;
-const b = 2;
+const a = 10;
+const b = 20;
@@ -1,1 +1,1 @@
-const a = 1;
+const a = 99;
`;
  const overlapResult = await integrateWorkResultPatches(
    sourceSnapshot,
    [makePhase2WorkResult(sourceSnapshot, overlapPatch)],
    { files, workOrders: [{ work_order_id: PHASE2_WO_ID, allowed_paths: ["src/**"] }] }
  );
  assert.equal(overlapResult.ok, false);
  assert.equal(overlapResult.reason_code, "HUNK_OVERLAP");
  assert.equal(overlapResult.candidate, undefined);
});

test("Phase 2.3: identical WorkResults differing only by file mode produce distinct CandidateId", async () => {
  const { integrateWorkResultPatches } = require("./patch-integrator.js");
  const files = { "src/app.js": "const a = 1;\n" };
  const sourceSnapshot = makePhase1Snapshot(files);
  const patch644 = `diff --git a/src/app.js b/src/app.js
old mode 100644
new mode 100644
`;
  const patch755 = `diff --git a/src/app.js b/src/app.js
old mode 100644
new mode 100755
`;
  const opts = {
    files,
    workOrders: [{ work_order_id: PHASE2_WO_ID, allowed_paths: ["src/**"] }],
  };
  const result644 = await integrateWorkResultPatches(sourceSnapshot, [makePhase2WorkResult(sourceSnapshot, patch644)], opts);
  const result755 = await integrateWorkResultPatches(sourceSnapshot, [makePhase2WorkResult(sourceSnapshot, patch755)], opts);
  assert.equal(result644.ok, true);
  assert.equal(result755.ok, true);
  assert.equal(result644.candidate.base_tree, sourceSnapshot.base_tree_digest);
  assert.equal(result755.candidate.base_tree, sourceSnapshot.base_tree_digest);
  assert.notEqual(
    result644.candidate.changed_paths_modes_digest,
    result755.candidate.changed_paths_modes_digest,
    "file modes must be forwarded to freezeCandidate"
  );
  assert.notEqual(result644.candidate.candidate_id, result755.candidate.candidate_id);
});

test("Phase 2.5: empty dependencies and execution_metrics are evaluated and cannot be skipped for full-match", () => {
  const { compareShadowExecution, ALL_EVALUATED_DIMENSIONS } = require("./shadow-comparator.js");
  const REQUIRED = [
    "steps",
    "dependencies",
    "diffs",
    "inventory",
    "obligations",
    "invariants",
    "execution_metrics",
  ];
  assert.deepEqual([...ALL_EVALUATED_DIMENSIONS], REQUIRED);

  const shadowResult = {
    steps: [],
    dependencies: [],
    obligations: [],
    invariants: [],
    inventory: [],
    execution_metrics: [],
  };
  const baselineResult = {
    steps: [],
    dependencies: [],
    obligations: [],
    invariants: [],
    inventory: [],
    execution_metrics: [],
  };
  const comparison = compareShadowExecution(shadowResult, baselineResult);

  for (const dim of REQUIRED) {
    assert.ok(comparison.evaluated_dimensions.includes(dim), `${dim} must be evaluated when empty`);
    assert.equal(comparison.skipped_dimensions.includes(dim), false, `${dim} must not be skipped when empty`);
    assert.equal(comparison.dimension_match_rates[dim], 1);
  }
  assert.deepEqual(comparison.skipped_dimensions, []);
  assert.equal(comparison.match, true);
  assert.equal(comparison.discrepancy_classification, "full-match");
});

test("Phase 2.7: integrator and orchestrator share deterministic EffectiveShadowBase helpers", async () => {
  const { integrateWorkResultPatches } = require("./patch-integrator.js");
  const { buildEffectiveShadowBase } = require("./effective-shadow-base.js");
  const { computeTreeDigest } = require("../worker-workspace.js");

  const files = { "src/app.js": "const a = 1;\n" };
  const sourceSnapshot = makePhase1Snapshot(files);
  const patch = `--- a/src/app.js
+++ b/src/app.js
@@ -1 +1 @@
-const a = 1;
+const a = 2;
`;
  const result = await integrateWorkResultPatches(sourceSnapshot, [makePhase2WorkResult(sourceSnapshot, patch)], {
    files,
    workOrders: [{ work_order_id: PHASE2_WO_ID, allowed_paths: ["src/**"] }],
  });
  assert.equal(result.ok, true);
  assert.equal(result.effectiveBase.kind, "effective-shadow-base/v1");
  assert.equal(result.effectiveBase.source_snapshot_id, sourceSnapshot.source_snapshot_id);
  assert.equal(result.effectiveBase.tree_digest, computeTreeDigest(result.candidateFiles));

  const rebuilt = buildEffectiveShadowBase({
    sourceSnapshot,
    files: result.candidateFiles,
    file_modes: result.fileModes,
  });
  assert.equal(rebuilt.tree_digest, result.effectiveBase.tree_digest);
  assert.equal(result.candidate.base_tree, sourceSnapshot.base_tree_digest);
});

function makeRepairNode(nodeId, dependencies, allowedPaths, evidence) {
  return {
    node_id: nodeId,
    kind: "repair-action/v1",
    operation: `step-${nodeId}`,
    objective: `step ${nodeId}`,
    ownership: { owner: "agent:repair", mode: "exclusive" },
    dependencies,
    allowed_paths: allowedPaths,
    invariants: [],
    budget_ref: "budget:default",
    required_evidence: [evidence],
  };
}

function compileRepairGraph(sourceSnapshot, nodes, policySnapshot) {
  const { compileExecutionGraph } = require("../execution-graph/index.js");
  const obligations = nodes.map((node) => ({
    id: `ob-${node.node_id}`,
    criticality: "must",
    implemented_by: [node.node_id],
    required_evidence: node.required_evidence,
  }));
  const contract = {
    schema_version: 1,
    contract_id: "contract:k4b-phase3",
    family: "repair",
    version: 1,
    contract_digest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    source_snapshot_id: sourceSnapshot.source_snapshot_id,
    obligations,
  };
  return compileExecutionGraph({ contract, policySnapshot, nodes, obligations });
}

function mockSuccessfulExecute(t, sourceSnapshot, patchesByNode) {
  const { computeWorkResultId } = require("../execution-identities/index.js");
  const executed = [];
  t.mock.method(workerExecutor, "executeWorkOrder", async (callOptions) => {
    const nodeId = callOptions.workOrder.node_id;
    executed.push({
      nodeId,
      workspaceId: callOptions.workspace && callOptions.workspace.workspace_id,
    });
    const wr = {
      kind: "work-result/v1",
      schema_version: 1,
      work_order_id: callOptions.workOrder.work_order_id,
      source_snapshot_id: sourceSnapshot.source_snapshot_id,
      patch: patchesByNode[nodeId] || "",
      commands: [{ command: `run-${nodeId}`, exit_code: 0, duration_ms: 5 }],
      logs: ["stdout: ok"],
      exit_code: 0,
      filesystem_inventory: [],
    };
    wr.work_result_id = computeWorkResultId(wr);
    return { ok: true, isolationReported: "enforced", workResult: wr };
  });
  return executed;
}

function makeTempFileStore(t) {
  const { createFileSystemStore } = require("../filesystem-store.js");
  const filePath = path.join(os.tmpdir(), `k4b-exec-${Date.now()}-${Math.random().toString(16).slice(2)}.json`);
  t.after(() => {
    for (const extra of ["", ".lock", ".bak"]) {
      try { fs.unlinkSync(filePath + extra); } catch { /* ignore */ }
    }
  });
  return createFileSystemStore({ filePath, initializeIfMissing: true });
}

test("Phase 3.1: multi-predecessor incompatible diffs on the same context abort before N3 executes", async (t) => {
  const { orchestrateRepairShadow } = require("./orchestrator.js");
  const { createPolicySnapshot } = require("../execution-graph/index.js");

  const files = { "src/app.js": "const a = 1;\nconst b = 2;\n" };
  const sourceSnapshot = makePhase1Snapshot(files);
  const policySnapshot = createPolicySnapshot({ effectiveRules: ["rule-1"] });
  const graph = compileRepairGraph(sourceSnapshot, [
    makeRepairNode("n1", [], ["src/app.js"], "ev-1"),
    makeRepairNode("n2", [], ["src/app.js"], "ev-2"),
    makeRepairNode("n3", ["n1", "n2"], ["src/app.js"], "ev-3"),
  ], policySnapshot);

  const patchN1 = `--- a/src/app.js
+++ b/src/app.js
@@ -1,2 +1,2 @@
-const a = 1;
+const a = 10;
 const b = 2;
`;
  const patchN2 = `--- a/src/app.js
+++ b/src/app.js
@@ -1,2 +1,2 @@
-const a = 1;
+const a = 20;
 const b = 2;
`;
  const executed = mockSuccessfulExecute(t, sourceSnapshot, {
    n1: patchN1,
    n2: patchN2,
    n3: `--- a/src/app.js
+++ b/src/app.js
@@ -2 +2,2 @@
 const b = 2;
+const c = 3;
`,
  });

  const result = await orchestrateRepairShadow(graph, {
    sourceSnapshot,
    files,
    isolationCapability: "enforced",
    policySnapshot,
  });

  assert.equal(result.ok, false, "incompatible predecessor diffs must fail closed");
  assert.ok(
    result.reason_code === "PREDECESSOR_CONTEXT_CONFLICT" || result.reason_code === "HUNK_CONTEXT_MISMATCH",
    `expected predecessor conflict, got ${result.reason_code}`
  );
  assert.equal(result.candidate, undefined, "freezeCandidate must not run after predecessor conflict");
  assert.equal(executed.some((entry) => entry.nodeId === "n3"), false, "N3 must not execute");
});

test("Phase 3.3: N2 materializes derived shadow base from N1 in a fresh workspace; freeze stays on S0", async (t) => {
  const { orchestrateRepairShadow } = require("./orchestrator.js");
  const { createPolicySnapshot } = require("../execution-graph/index.js");
  const workerWorkspace = require("../worker-workspace.js");
  const { computeTreeDigest } = require("../worker-workspace.js");

  const files = { "src/app.js": "const a = 1;\n" };
  const sourceSnapshot = makePhase1Snapshot(files);
  const policySnapshot = createPolicySnapshot({ effectiveRules: ["rule-1"] });
  const graph = compileRepairGraph(sourceSnapshot, [
    makeRepairNode("n1", [], ["src/**"], "ev-1"),
    makeRepairNode("n2", ["n1"], ["src/**"], "ev-2"),
  ], policySnapshot);

  const patchN1 = `--- a/src/app.js
+++ b/src/app.js
@@ -1 +1,2 @@
 const a = 1;
+function multiply(x, y) { return x * y; }
`;
  const patchN2 = `--- a/src/app.js
+++ b/src/app.js
@@ -2 +2,2 @@
 function multiply(x, y) { return x * y; }
+module.exports = { multiply };
`;

  const executed = mockSuccessfulExecute(t, sourceSnapshot, { n1: patchN1, n2: patchN2 });
  const materializeCalls = [];
  const originalMaterialize = workerWorkspace.materializeSourceSnapshot;
  t.mock.method(workerWorkspace, "materializeSourceSnapshot", async function mockedMaterialize(...args) {
    materializeCalls.push(args);
    return originalMaterialize.apply(this, args);
  });

  const result = await orchestrateRepairShadow(graph, {
    sourceSnapshot,
    files,
    isolationCapability: "enforced",
    policySnapshot,
    store: makeTempFileStore(t),
  });

  assert.equal(result.ok, true, result.error);
  assert.deepEqual(executed.map((entry) => entry.nodeId), ["n1", "n2"]);
  assert.notEqual(executed[0].workspaceId, executed[1].workspaceId, "N1 and N2 must use distinct workspaces");
  assert.equal(materializeCalls.length, 2);
  const n2Options = materializeCalls[1][3] || {};
  assert.ok(n2Options.effectiveBase, "N2 must materialize a derived effectiveBase");
  assert.equal(n2Options.effectiveBase.source_snapshot_id, sourceSnapshot.source_snapshot_id);
  assert.match(n2Options.effectiveBase.files.get("src/app.js"), /function multiply/);
  assert.equal(n2Options.effectiveBase.tree_digest, computeTreeDigest(n2Options.effectiveBase.files));
  assert.equal(result.candidate.base_tree, sourceSnapshot.base_tree_digest);
  assert.match(result.candidateFiles ? result.candidateFiles.get("src/app.js") : "", /module\.exports/);
});

test("Phase 3.3b: identical predecessors yield a byte-identical derived-base digest", async (t) => {
  const { orchestrateRepairShadow } = require("./orchestrator.js");
  const { createPolicySnapshot } = require("../execution-graph/index.js");
  const workerWorkspace = require("../worker-workspace.js");

  const files = { "src/app.js": "const a = 1;\n" };
  const sourceSnapshot = makePhase1Snapshot(files);
  const policySnapshot = createPolicySnapshot({ effectiveRules: ["rule-1"] });
  const nodes = [
    makeRepairNode("n1", [], ["src/**"], "ev-1"),
    makeRepairNode("n2", ["n1"], ["src/**"], "ev-2"),
  ];
  const graph = compileRepairGraph(sourceSnapshot, nodes, policySnapshot);
  const patchN1 = `--- a/src/app.js
+++ b/src/app.js
@@ -1 +1,2 @@
 const a = 1;
+const extra = true;
`;

  mockSuccessfulExecute(t, sourceSnapshot, { n1: patchN1, n2: "" });
  const digests = [];
  const originalMaterialize = workerWorkspace.materializeSourceSnapshot;
  t.mock.method(workerWorkspace, "materializeSourceSnapshot", async function mockedMaterialize(...args) {
    const options = args[3] || {};
    if (options.effectiveBase) digests.push(options.effectiveBase.tree_digest);
    return originalMaterialize.apply(this, args);
  });

  const first = await orchestrateRepairShadow(graph, {
    sourceSnapshot,
    files,
    isolationCapability: "enforced",
    policySnapshot,
    store: makeTempFileStore(t),
  });
  const second = await orchestrateRepairShadow(graph, {
    sourceSnapshot,
    files,
    isolationCapability: "enforced",
    policySnapshot,
    store: makeTempFileStore(t),
  });
  assert.equal(first.ok, true, first.error);
  assert.equal(second.ok, true, second.error);
  assert.equal(digests.length, 2);
  assert.equal(digests[0], digests[1]);
});

test("Phase 3.4: persistRepairShadowExecution CAS, incomplete bindings, and byte-identical retry", async (t) => {
  const {
    persistRepairShadowExecution,
    loadRepairShadowExecution,
  } = require("./execution-record-store.js");
  const { freezeCandidate } = require("../execution-identities/index.js");
  const { createPolicySnapshot } = require("../execution-graph/index.js");

  const files = { "src/app.js": "const a = 1;\n" };
  const sourceSnapshot = makePhase1Snapshot(files);
  const policySnapshot = createPolicySnapshot({ effectiveRules: ["rule-store"] });
  const graph = compileRepairGraph(sourceSnapshot, [makeRepairNode("n1", [], ["src/**"], "ev-1")], policySnapshot);
  const candidate = freezeCandidate({
    repository_id: sourceSnapshot.repository_id,
    projection: "workspace",
    base_tree: sourceSnapshot.base_tree_digest,
    candidate_tree: sourceSnapshot.base_tree_digest,
    diffText: "",
    paths: [],
  });

  const record = {
    kind: "repair-shadow-execution/v1",
    schema_version: 1,
    candidate_id: candidate.candidate_id,
    candidate,
    source_snapshot_id: sourceSnapshot.source_snapshot_id,
    execution_graph: graph,
    policy_snapshot: policySnapshot,
    work_order_ids: ["wo-1"],
    work_result_ids: ["wr-1"],
    graph_telemetry: { n1: { status: "completed" } },
    created_at: "2026-08-25T00:00:00.000Z",
  };

  const incomplete = await persistRepairShadowExecution(makeTempFileStore(t), {
    kind: "repair-shadow-execution/v1",
    schema_version: 1,
    candidate_id: candidate.candidate_id,
  });
  assert.equal(incomplete.ok, false);
  assert.equal(incomplete.reason_code, "INCOMPLETE_BINDINGS");

  const store = makeTempFileStore(t);
  const first = await persistRepairShadowExecution(store, record);
  assert.equal(first.ok, true, first.error);

  const replay = await persistRepairShadowExecution(store, record);
  assert.equal(replay.ok, true, replay.error);
  assert.equal(replay.idempotent, true);

  const divergent = await persistRepairShadowExecution(store, {
    ...record,
    graph_telemetry: { n1: { status: "failed" } },
  });
  assert.equal(divergent.ok, false);
  assert.equal(divergent.reason_code, "CAS_CONFLICT");

  const loaded = await loadRepairShadowExecution(store, candidate.candidate_id);
  assert.equal(loaded.ok, true);
  assert.equal(loaded.record.candidate_id, candidate.candidate_id);
  assert.equal(loaded.record.execution_graph.graph_id, graph.graph_id);
  assert.equal(loaded.record.policy_snapshot.snapshot_id, policySnapshot.snapshot_id);
  loaded.record.graph_telemetry.n1.status = "mutated";
  const reloaded = await loadRepairShadowExecution(store, candidate.candidate_id);
  assert.equal(reloaded.record.graph_telemetry.n1.status, "completed", "load must return a defensive copy");
});

const DIVERGENT_BINDING_ID = `sha256:${"0".repeat(64)}`;

function makeOtherwiseValidExecutionRecord() {
  const { freezeCandidate } = require("../execution-identities/index.js");
  const { createPolicySnapshot } = require("../execution-graph/index.js");
  const files = { "src/app.js": "const a = 1;\n" };
  const sourceSnapshot = makePhase1Snapshot(files);
  const policySnapshot = createPolicySnapshot({ effectiveRules: ["rule-binding-mismatch"] });
  const graph = compileRepairGraph(sourceSnapshot, [makeRepairNode("n1", [], ["src/**"], "ev-1")], policySnapshot);
  const candidate = freezeCandidate({
    repository_id: sourceSnapshot.repository_id, projection: "workspace",
    base_tree: sourceSnapshot.base_tree_digest, candidate_tree: sourceSnapshot.base_tree_digest,
    diffText: "", paths: [],
  });
  return {
    kind: "repair-shadow-execution/v1", schema_version: 1, candidate_id: candidate.candidate_id,
    candidate, source_snapshot_id: sourceSnapshot.source_snapshot_id,
    execution_graph: graph, policy_snapshot: policySnapshot,
  };
}

async function persistDivergentBinding(t, mutate) {
  const { persistRepairShadowExecution, loadRepairShadowExecution } = require("./execution-record-store.js");
  const record = makeOtherwiseValidExecutionRecord();
  const originalId = record.candidate_id;
  mutate(record);
  const store = makeTempFileStore(t);
  let commits = 0;
  const orig = store.commit.bind(store);
  store.commit = async (payload) => { commits += 1; return orig(payload); };
  const result = await persistRepairShadowExecution(store, record);
  return { result, commits, loaded: await loadRepairShadowExecution(store, originalId), store };
}

test("F-b15e4b7f34049858: persistRepairShadowExecution BINDING_MISMATCH when graph.graph_id diverges", async (t) => {
  const { result, commits, loaded } = await persistDivergentBinding(t, (record) => {
    record.execution_graph = { ...record.execution_graph, graph_id: DIVERGENT_BINDING_ID };
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason_code, "BINDING_MISMATCH");
  assert.equal(result.mismatched_identity, "graph_id");
  assert.equal(commits, 0);
  assert.equal(loaded.ok, false);
});

test("F-b15e4b7f34049858: persistRepairShadowExecution BINDING_MISMATCH when policy.snapshot_id diverges", async (t) => {
  const { result, commits, loaded } = await persistDivergentBinding(t, (record) => {
    record.policy_snapshot = { ...record.policy_snapshot, snapshot_id: DIVERGENT_BINDING_ID };
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason_code, "BINDING_MISMATCH");
  assert.equal(result.mismatched_identity, "snapshot_id");
  assert.equal(commits, 0);
  assert.equal(loaded.ok, false);
});

test("F-b15e4b7f34049858: persistRepairShadowExecution BINDING_MISMATCH when candidate_id diverges", async (t) => {
  const { loadRepairShadowExecution } = require("./execution-record-store.js");
  const { result, commits, loaded, store } = await persistDivergentBinding(t, (record) => {
    record.candidate_id = DIVERGENT_BINDING_ID;
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason_code, "BINDING_MISMATCH");
  assert.equal(result.mismatched_identity, "candidate_id");
  assert.equal(commits, 0);
  assert.equal(loaded.ok, false);
  assert.equal((await loadRepairShadowExecution(store, DIVERGENT_BINDING_ID)).ok, false);
});

test("Phase 3.6: orchestrateRepairShadow persists a queryable v1 record with CandidateId/graph/policy bindings", async (t) => {
  const { orchestrateRepairShadow } = require("./orchestrator.js");
  const { loadRepairShadowExecution } = require("./execution-record-store.js");
  const { createPolicySnapshot } = require("../execution-graph/index.js");

  const files = { "src/app.js": "const a = 1;\n" };
  const sourceSnapshot = makePhase1Snapshot(files);
  const policySnapshot = createPolicySnapshot({ effectiveRules: ["rule-1"] });
  const graph = compileRepairGraph(sourceSnapshot, [makeRepairNode("n1", [], ["src/**"], "ev-1")], policySnapshot);
  mockSuccessfulExecute(t, sourceSnapshot, {
    n1: `--- a/src/app.js
+++ b/src/app.js
@@ -1 +1 @@
-const a = 1;
+const a = 2;
`,
  });

  const store = makeTempFileStore(t);
  const result = await orchestrateRepairShadow(graph, {
    sourceSnapshot,
    files,
    isolationCapability: "enforced",
    policySnapshot,
    store,
  });

  assert.equal(result.ok, true, result.error);
  assert.equal(result.promoted, false);
  const loaded = await loadRepairShadowExecution(store, result.candidate.candidate_id);
  assert.equal(loaded.ok, true);
  assert.equal(loaded.record.kind, "repair-shadow-execution/v1");
  assert.equal(loaded.record.candidate_id, result.candidate.candidate_id);
  assert.equal(loaded.record.execution_graph.graph_id, graph.graph_id);
  assert.equal(loaded.record.policy_snapshot.snapshot_id, policySnapshot.snapshot_id);
  assert.equal(loaded.record.source_snapshot_id, sourceSnapshot.source_snapshot_id);
  assert.deepEqual(loaded.record.graph_telemetry.n1.status, "completed");
});

test("Phase 3.8: missing store after freeze fails closed with MISSING_EXECUTION_STORE and does not promote", async (t) => {
  const { orchestrateRepairShadow } = require("./orchestrator.js");
  const { createPolicySnapshot } = require("../execution-graph/index.js");

  const files = { "src/app.js": "const a = 1;\n" };
  const sourceSnapshot = makePhase1Snapshot(files);
  const policySnapshot = createPolicySnapshot({ effectiveRules: ["rule-1"] });
  const graph = compileRepairGraph(sourceSnapshot, [makeRepairNode("n1", [], ["src/**"], "ev-1")], policySnapshot);
  mockSuccessfulExecute(t, sourceSnapshot, {
    n1: `--- a/src/app.js
+++ b/src/app.js
@@ -1 +1 @@
-const a = 1;
+const a = 2;
`,
  });

  const result = await orchestrateRepairShadow(graph, {
    sourceSnapshot,
    files,
    isolationCapability: "enforced",
    policySnapshot,
  });

  assert.equal(result.ok, false, "successful freeze without a store must not complete K4b execution");
  assert.equal(result.promoted, false, "candidate must not be promoted when persist is skipped");
  assert.equal(result.reason_code, "MISSING_EXECUTION_STORE");
  assert.ok(result.candidate, "candidate may freeze before persist fail-closed");
});

test("Phase 3.8: persist failure after freeze fails closed and does not promote", async (t) => {
  const { orchestrateRepairShadow } = require("./orchestrator.js");
  const { createPolicySnapshot } = require("../execution-graph/index.js");

  const files = { "src/app.js": "const a = 1;\n" };
  const sourceSnapshot = makePhase1Snapshot(files);
  const policySnapshot = createPolicySnapshot({ effectiveRules: ["rule-1"] });
  const graph = compileRepairGraph(sourceSnapshot, [makeRepairNode("n1", [], ["src/**"], "ev-1")], policySnapshot);
  mockSuccessfulExecute(t, sourceSnapshot, {
    n1: `--- a/src/app.js
+++ b/src/app.js
@@ -1 +1 @@
-const a = 1;
+const a = 2;
`,
  });

  const result = await orchestrateRepairShadow(graph, {
    sourceSnapshot,
    files,
    isolationCapability: "enforced",
    policySnapshot,
    store: {},
  });

  assert.equal(result.ok, false, "persist failure must fail closed");
  assert.equal(result.promoted, false, "candidate must not be promoted when persist fails");
  assert.equal(result.reason_code, "STORE_UNAVAILABLE");
});

test("Phase 3.7: node failure skips N2, disposes N1 workspace, and reports failed_node_id", async (t) => {
  const { orchestrateRepairShadow } = require("./orchestrator.js");
  const { createPolicySnapshot } = require("../execution-graph/index.js");
  const workerWorkspace = require("../worker-workspace.js");

  const files = { "src/app.js": "const a = 1;\n" };
  const sourceSnapshot = makePhase1Snapshot(files);
  const policySnapshot = createPolicySnapshot({ effectiveRules: ["rule-1"] });
  const graph = compileRepairGraph(sourceSnapshot, [
    makeRepairNode("n1", [], ["src/**"], "ev-1"),
    makeRepairNode("n2", ["n1"], ["src/**"], "ev-2"),
  ], policySnapshot);

  const executed = [];
  t.mock.method(workerExecutor, "executeWorkOrder", async (callOptions) => {
    executed.push(callOptions.workOrder.node_id);
    return {
      ok: false,
      isolationReported: "enforced",
      workResult: { exit_code: 1, commands: [], logs: [] },
    };
  });

  const created = [];
  const disposed = [];
  const originalCreate = workerWorkspace.createWorkspace;
  const originalDispose = workerWorkspace.disposeWorkspace;
  t.mock.method(workerWorkspace, "createWorkspace", async function mockedCreate(...args) {
    const ws = await originalCreate.apply(this, args);
    created.push(ws.workspace_id);
    return ws;
  });
  t.mock.method(workerWorkspace, "disposeWorkspace", async function mockedDispose(descriptor) {
    disposed.push(descriptor && descriptor.workspace_id);
    return originalDispose.apply(this, arguments);
  });

  const result = await orchestrateRepairShadow(graph, {
    sourceSnapshot,
    files,
    isolationCapability: "enforced",
    policySnapshot,
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason_code, "NODE_EXECUTION_FAILED");
  assert.equal(result.failed_node_id, "n1");
  assert.deepEqual(executed, ["n1"]);
  assert.equal(result.graph_telemetry.n2.status, "blocked");
  assert.equal(created.length, 1);
  assert.deepEqual(disposed, created);
});


