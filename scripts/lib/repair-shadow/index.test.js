"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

test("Phase 1: repair-shadow package exports canonical API", () => {
  const repairShadow = require("./index.js");
  const orchestrator = require("./orchestrator.js");
  const patchIntegrator = require("./patch-integrator.js");
  const shadowComparator = require("./shadow-comparator.js");

  assert.equal(typeof repairShadow.orchestrateRepairShadow, "function", "repair-shadow must export orchestrateRepairShadow");
  assert.equal(typeof repairShadow.integrateWorkResultPatches, "function", "repair-shadow must export integrateWorkResultPatches");
  assert.equal(typeof repairShadow.compareShadowExecution, "function", "repair-shadow must export compareShadowExecution");

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

test("Phase 3.5, 3.7 & 3.9: orchestrateRepairShadow executes DAG in topological order with telemetry, full 4-identity lineage", async () => {
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
  const mockExecutor = async (workOrder, workspace) => {
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
  };

  const result = await orchestrateRepairShadow(graph, {
    sourceSnapshot,
    files,
    isolationCapability: "enforced",
    executorFn: mockExecutor,
  });

  assert.equal(result.ok, true, "Orchestration must succeed");
  assert.deepEqual(orderOfExecution, ["n1", "n2"], "Must execute in topological order (n1 before n2)");
  assert.equal(result.graph_telemetry.n1.status, "completed");
  assert.equal(result.graph_telemetry.n2.status, "completed");
  assert.ok(result.graph_telemetry.n1.duration_ms >= 0);
  assert.ok(result.candidate, "Must freeze candidate");
  assert.equal(result.lineage_verification.ok, true, "4-identity lineage must validate");
});

test("Phase 3.7b: orchestrateRepairShadow marks downstream nodes as blocked when a node fails", async () => {
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

  const mockFailingExecutor = async (workOrder) => {
    return {
      ok: false,
      isolationReported: "enforced",
      workResult: { exit_code: 1, commands: [], logs: [] },
    };
  };

  const result = await orchestrateRepairShadow(graph, {
    sourceSnapshot,
    files,
    isolationCapability: "enforced",
    executorFn: mockFailingExecutor,
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason_code, "NODE_EXECUTION_FAILED");
  assert.equal(result.failed_node_id, "n1");
  assert.equal(result.graph_telemetry.n1.status, "failed");
  assert.equal(result.graph_telemetry.n2.status, "blocked");
});

test("Phase 3.9b: orchestrateRepairShadow detects tampered WorkResultId and fails closed", async () => {
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

  const mockTamperedExecutor = async (workOrder) => {
    return {
      ok: true,
      isolationReported: "enforced",
      workResult: {
        kind: "work-result/v1",
        schema_version: 1,
        work_order_id: workOrder.work_order_id,
        source_snapshot_id: sourceSnapshot.source_snapshot_id,
        work_result_id: "sha256:0000000000000000000000000000000000000000000000000000000000000000", // Tampered!
        patch: "",
        commands: [],
        logs: [],
        exit_code: 0,
        filesystem_inventory: [],
      },
    };
  };

  const result = await orchestrateRepairShadow(graph, {
    sourceSnapshot,
    files,
    isolationCapability: "enforced",
    executorFn: mockTamperedExecutor,
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


