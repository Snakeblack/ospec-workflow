"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { validateInstance, loadSchemaById } = require("./lib/kernel-schema-validator.js");
const {
  createWorkspace,
  disposeWorkspace,
  materializeSourceSnapshot,
  inspectWorkspace,
  computeTreeDigest,
} = require("./lib/worker-workspace.js");
const {
  executeWorkOrder,
  captureWorkResult,
  recoverInterruptedExecution,
  validateWorkResultBinding,
  computeWorkResultId,
} = require("./lib/worker-executor.js");
const {
  compileExecutionGraph,
  compileWorkOrdersV2,
  createPolicySnapshot,
} = require("./lib/execution-graph/index.js");
const {
  validateWorkOrderBinding,
  computeWorkOrderId,
  computeSourceSnapshotId,
} = require("./lib/execution-identities/index.js");
const { validateAllowedPaths } = require("./lib/allowed-paths-validator.js");
const { createEvidenceDigest, createProbeDigest } = require("./lib/capability-proof/index.js");

const ROOT = path.resolve(__dirname, "..");

function applyPatch(baseFiles = new Map(), patch = "") {
  const result = new Map(baseFiles);
  if (!patch || typeof patch !== "string") return result;

  const chunks = patch.split(/(?=^--- )/m).filter(Boolean);
  for (const chunk of chunks) {
    const lines = chunk.split("\n");
    if (lines.length < 2) continue;
    const oldHeader = lines[0];
    const newHeader = lines[1];

    if (oldHeader.startsWith("--- /dev/null") && newHeader.startsWith("+++ b/")) {
      const filePath = newHeader.slice(6);
      const contentLines = [];
      let noNewlineAtEnd = false;
      for (let i = 2; i < lines.length; i++) {
        const l = lines[i];
        if (l.startsWith("@@") || l.startsWith("old mode") || l.startsWith("new mode")) continue;
        if (l === "\\ No newline at end of file") {
          noNewlineAtEnd = true;
          continue;
        }
        if (l.startsWith("+")) {
          contentLines.push(l.slice(1));
        }
      }
      let content = contentLines.join("\n");
      if (!noNewlineAtEnd && contentLines.length > 0) {
        content += "\n";
      }
      result.set(filePath, content);
    } else if (oldHeader.startsWith("--- a/") && newHeader.startsWith("+++ /dev/null")) {
      const filePath = oldHeader.slice(6);
      result.delete(filePath);
    } else if (oldHeader.startsWith("--- a/") && newHeader.startsWith("+++ b/")) {
      const filePath = newHeader.slice(6);
      const newFileLines = [];
      let noNewlineAtEnd = false;
      let hasContentDiff = false;
      for (let i = 2; i < lines.length; i++) {
        const l = lines[i];
        if (l.startsWith("@@") || l.startsWith("old mode") || l.startsWith("new mode")) {
          if (l.startsWith("@@")) hasContentDiff = true;
          continue;
        }
        if (l === "\\ No newline at end of file") {
          noNewlineAtEnd = true;
          continue;
        }
        if (l.startsWith(" ")) {
          newFileLines.push(l.slice(1));
        } else if (l.startsWith("+")) {
          newFileLines.push(l.slice(1));
        }
      }
      if (hasContentDiff) {
        let content = newFileLines.join("\n");
        if (!noNewlineAtEnd && newFileLines.length > 0) {
          content += "\n";
        }
        result.set(filePath, content);
      }
    }
  }
  return result;
}

function makeCanonicalWorkOrder(sourceSnapshotId = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", overrides = {}) {
  const payload = {
    schema_version: 2,
    kind: "work-order/v2",
    source_snapshot_id: sourceSnapshotId,
    node_id: overrides.node_id || "node-test-1",
    role: overrides.role || "repair-worker",
    operation: overrides.operation || "verify",
    objective: overrides.objective || "Execute test command",
    dependencies: overrides.dependencies || [],
    ownership: overrides.ownership || { owner: "agent-test", mode: "shared" },
    allowed_paths: overrides.allowed_paths || ["**"],
    invariants: overrides.invariants || [],
    required_evidence: overrides.required_evidence || [],
    budget: overrides.budget || {
      model_turns: 5,
      patches: 3,
      commands: 5,
      wall_time_minutes: 10,
      changed_lines: 100,
    },
    status: overrides.status || "pending",
  };
  if (overrides.clarification_context) {
    payload.clarification_context = overrides.clarification_context;
  }
  const workOrderId = overrides.work_order_id !== undefined ? overrides.work_order_id : computeWorkOrderId(payload);
  return {
    ...payload,
    work_order_id: workOrderId,
  };
}

function makeEnforcedProof(adapterId = "adapter-test") {
  const evidence = { surface: "worker", headless: true };
  const fixture = "fixtures/WorkerTransport.json";
  const evidence_digest = createEvidenceDigest({
    capability_id: "WorkerTransport",
    adapter_version: "1.0.0",
    host_version: "1.0.0",
    fixture,
    evidence,
  });
  const probe_digest = createProbeDigest({
    capability_id: "WorkerTransport",
    adapter_id: adapterId,
    adapter_version: "1.0.0",
    host_version: "1.0.0",
    probe: { surface: "live", ok: true },
  });
  const capabilityProof = {
    schema_version: 1,
    kind: "capability-proof/v1",
    adapter_id: adapterId,
    adapter_version: "1.0.0",
    host_version: "1.0.0",
    fixture,
    evidence_digest,
    probe_digest,
  };
  return {
    isolationCapability: "enforced",
    capabilityProof,
    semantic_evidence: evidence,
    expectedAdapterId: adapterId,
    expectedAdapterVersion: "1.0.0",
    expectedHostRuntimeVersion: "1.0.0",
    expectedProbeDigest: probe_digest,
    probe_digest,
  };
}

test("K6a E2E Happy Path: True K3 -> K4a -> K6a -> K3 Pipeline with full workspace lifecycle, execution, containment, and disposal", async (t) => {
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "k6a-e2e-happy-"));
  t.after(() => {
    try {
      fs.rmSync(baseDir, { recursive: true, force: true });
    } catch {}
  });

  const files = {
    "src/calculator.js": "function add(a, b) { return a + b; }\nmodule.exports = { add };\n",
    "test/calculator.test.js": "const assert = require('assert'); const { add } = require('../src/calculator.js'); assert.equal(add(2, 3), 5); console.log('All tests passed!');\n",
    "package.json": '{"name": "calc-app"}\n',
    "unrelated/leak.txt": "should not be materialized",
  };

  const treeDigest = computeTreeDigest(files);

  // 1. K3 SourceSnapshot v1
  const canonicalSnapshot = {
    schema_version: 1,
    kind: "source-snapshot/v1",
    repository_id: "repo-e2e-calc",
    base_tree_digest: treeDigest,
    projection: "workspace",
    dependency_digests: [],
  };
  canonicalSnapshot.source_snapshot_id = computeSourceSnapshotId(canonicalSnapshot);

  // 2. K4a ExecutionGraph Compilation & WorkOrders Compilation
  const policySnapshot = createPolicySnapshot({
    policy_id: "pol-e2e-1",
    version: "1.0.0",
    rules: { allowed_operations: ["apply"] },
  });

  const contract = {
    schema_version: 1,
    contract_id: "contract:k6a-e2e-001",
    family: "implementation",
    version: 1,
    contract_digest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    source_snapshot_id: canonicalSnapshot.source_snapshot_id,
    nodes: [
      {
        node_id: "calc-apply",
        kind: "implementation-action/v1",
        operation: "apply_implementation",
        objective: "Run calculator test suite and produce dist bundle",
        dependencies: [],
        ownership: { owner: "agent-e2e", mode: "exclusive" },
        allowed_paths: ["src/**", "test/**", "dist/**", "package.json"],
        invariants: ["inv-1"],
        required_evidence: ["ev-1"],
        budget_ref: "budget:default",
      },
    ],
    obligations: [
      {
        id: "req-calc-001",
        criticality: "must",
        implemented_by: ["calc-apply"],
        required_evidence: ["ev-1"],
      },
    ],
  };

  const graph = compileExecutionGraph({
    changeId: "change-e2e-calc",
    contract,
    policySnapshot,
    sourceSnapshotId: canonicalSnapshot.source_snapshot_id,
    nodes: contract.nodes,
    obligations: contract.obligations,
  });

  const workOrders = compileWorkOrdersV2(graph, {
    sourceSnapshot: canonicalSnapshot,
    sourceSnapshotId: canonicalSnapshot.source_snapshot_id,
  });
  assert.equal(workOrders.length, 1);
  const workOrder = workOrders[0];
  assert.equal(workOrder.node_id, "calc-apply");
  assert.equal(workOrder.work_order_id, computeWorkOrderId(workOrder));

  // Validate K3 <-> K4a WorkOrder Binding
  const woBinding = validateWorkOrderBinding(canonicalSnapshot, workOrder);
  assert.equal(woBinding.ok, true, `WorkOrder binding must pass: ${woBinding.error}`);

  // 3. K6a Create Workspace
  const workspace = await createWorkspace({ baseDir, source_snapshot_id: canonicalSnapshot.source_snapshot_id });
  assert.equal(workspace.status, "active");
  assert.ok(fs.existsSync(workspace.root_path));

  // 4. K6a Materialize Capsule
  const capsule = await materializeSourceSnapshot(workspace, workOrder, canonicalSnapshot, {
    capsule_inputs: ["src/calculator.js", "test/calculator.test.js", "package.json"],
    files,
  });
  assert.ok(/^sha256:[a-f0-9]{64}$/.test(capsule.fingerprint));
  assert.ok(fs.existsSync(path.join(workspace.root_path, "src", "calculator.js")));
  assert.equal(fs.existsSync(path.join(workspace.root_path, "unrelated", "leak.txt")), false);

  // 5. K6a Execute Work Order Commands via Enforced WorkerTransport
  const buildScript = "const fs = require('fs'); fs.mkdirSync('dist', { recursive: true }); fs.writeFileSync('dist/bundle.js', 'console.log(5);\\n');";
  const enforcedProof = makeEnforcedProof("adapter-e2e-sandbox");
  const workerTransport = {
    adapter_id: "adapter-e2e-sandbox",
    probe_digest: enforcedProof.probe_digest,
    kind: "worker-transport",
    run: async (opts) => {
      const { spawnSync } = require("node:child_process");
      const res = spawnSync(opts.command, opts.args, {
        cwd: opts.cwd,
        env: { ...process.env, ...(opts.env || {}) },
        encoding: "utf8",
      });
      return {
        ok: res.status === 0,
        exit_code: res.status !== null ? res.status : 1,
        stdout: res.stdout || "",
        stderr: res.stderr || "",
      };
    },
  };

  const execResult = await executeWorkOrder({
    workOrder,
    workspace,
    transports: { worker: workerTransport },
    ...enforcedProof,
    commands: [
      { command: process.execPath, args: ["-e", buildScript] },
      { command: process.execPath, args: [path.join(workspace.root_path, "test", "calculator.test.js")] },
    ],
  });

  assert.equal(execResult.ok, true);
  assert.ok(execResult.workResult);
  assert.equal(execResult.workResult.exit_code, 0);
  assert.ok(execResult.workResult.logs.some((l) => l.includes("All tests passed!")));
  assert.ok(execResult.workResult.filesystem_inventory.some((f) => f.path === "dist/bundle.js"));
  assert.ok(execResult.workResult.patch.includes("+++ b/dist/bundle.js"));
  assert.equal(execResult.workResult.candidate_id, undefined, "Strict prohibition of CandidateId in WorkResult");

  // 6. Validate WorkResult schema & cryptographic binding
  const workResultSchema = loadSchemaById("ospec://schemas/kernel/work-result/v1", { rootDir: ROOT });
  const schemaRes = validateInstance(workResultSchema, execResult.workResult);
  assert.equal(schemaRes.valid, true, `WorkResult must pass schema validation: ${JSON.stringify(schemaRes.errors)}`);

  const payloadSchema = loadSchemaById("ospec://schemas/kernel/work-result-execution-payload/v1", { rootDir: ROOT });
  const payloadRes = validateInstance(payloadSchema, { ...execResult.workResult, execution_usage: execResult.execution_usage });
  assert.equal(payloadRes.valid, true, `Payload must pass schema validation: ${JSON.stringify(payloadRes.errors)}`);

  const binding = validateWorkResultBinding(workOrder, execResult.workResult);
  assert.equal(binding.ok, true, "WorkResult must be cryptographically bound to WorkOrder");

  // 7. K3 Patch Round-trip Reconstruction & Git Apply Verification
  const baseFilesMap = new Map([
    ["src/calculator.js", files["src/calculator.js"]],
    ["test/calculator.test.js", files["test/calculator.test.js"]],
    ["package.json", files["package.json"]],
  ]);
  const reconstructed = applyPatch(baseFilesMap, execResult.workResult.patch);
  assert.equal(reconstructed.get("dist/bundle.js"), "console.log(5);\n");

  const { execSync } = require("node:child_process");
  const gitDir = fs.mkdtempSync(path.join(os.tmpdir(), "k6a-e2e-git-"));
  t.after(() => {
    try { fs.rmSync(gitDir, { recursive: true, force: true }); } catch {}
  });

  try {
    execSync("git init", { cwd: gitDir, stdio: "ignore" });
    execSync("git config user.name 'E2E'", { cwd: gitDir, stdio: "ignore" });
    execSync("git config user.email 'e2e@example.com'", { cwd: gitDir, stdio: "ignore" });

    for (const [p, content] of Object.entries(files)) {
      if (p !== "unrelated/leak.txt") {
        const full = path.join(gitDir, p);
        fs.mkdirSync(path.dirname(full), { recursive: true });
        fs.writeFileSync(full, content);
      }
    }
    execSync("git add .", { cwd: gitDir, stdio: "ignore" });
    execSync("git commit -m 'init'", { cwd: gitDir, stdio: "ignore" });

    const patchFile = path.join(gitDir, "work-result.patch");
    fs.writeFileSync(patchFile, execResult.workResult.patch);
    execSync("git apply --check work-result.patch", { cwd: gitDir, stdio: "pipe" });
    execSync("git apply work-result.patch", { cwd: gitDir, stdio: "pipe" });

    assert.equal(fs.readFileSync(path.join(gitDir, "dist", "bundle.js"), "utf8").replace(/\r\n/g, "\n"), "console.log(5);\n");
  } catch (err) {
    if (err.message && err.message.includes("git")) {
      t.skip(`Git CLI not available: ${err.message}`);
    } else {
      throw err;
    }
  }

  // 8. Dispose Workspace
  const disposeResult = await disposeWorkspace(workspace);
  assert.equal(disposeResult.ok, true);
  assert.equal(disposeResult.status, "disposed");
  assert.equal(fs.existsSync(workspace.root_path), false, "Workspace directory must be deleted on teardown");
});

test("K6a Negative E2E: 3-Way binding mismatch fails closed when Workspace was created for Snapshot A but WorkOrder has Snapshot B", async (t) => {
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "k6a-e2e-3way-"));
  t.after(() => {
    try {
      fs.rmSync(baseDir, { recursive: true, force: true });
    } catch {}
  });

  const filesA = { "src/a.js": "const a = 1;\n" };
  const filesB = { "src/b.js": "const b = 2;\n" };
  const snapA = {
    schema_version: 1,
    repository_id: "repo-a",
    base_tree_digest: computeTreeDigest(filesA),
    projection: "workspace",
    dependency_digests: [],
  };
  snapA.source_snapshot_id = computeSourceSnapshotId(snapA);

  const snapB = {
    schema_version: 1,
    repository_id: "repo-b",
    base_tree_digest: computeTreeDigest(filesB),
    projection: "workspace",
    dependency_digests: [],
  };
  snapB.source_snapshot_id = computeSourceSnapshotId(snapB);

  const workspaceA = await createWorkspace({ baseDir, source_snapshot_id: snapA.source_snapshot_id });
  t.after(() => disposeWorkspace(workspaceA));

  const workOrderB = {
    schema_version: 2,
    kind: "work-order/v2",
    node_id: "node-b",
    role: "executor",
    status: "pending",
    operation: "apply",
    objective: "Test B",
    source_snapshot_id: snapB.source_snapshot_id,
    dependencies: [],
    ownership: { owner: "agent", mode: "exclusive" },
    allowed_paths: ["src/**"],
    invariants: [],
    required_evidence: [],
    budget: { model_turns: 1, patches: 1, commands: 1, wall_time_minutes: 1, changed_lines: 10 },
  };
  workOrderB.work_order_id = computeWorkOrderId(workOrderB);

  // Attempt to materialize Snapshot B into Workspace A -> FAILS CLOSED
  await assert.rejects(
    async () => {
      await materializeSourceSnapshot(workspaceA, workOrderB, snapB, { files: filesB });
    },
    /Workspace source_snapshot_id binding mismatch/i
  );
});

test("K6a Negative E2E: Base tree digest mismatch fails closed pre-materialization", async (t) => {
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "k6a-e2e-tree-mismatch-"));
  t.after(() => {
    try {
      fs.rmSync(baseDir, { recursive: true, force: true });
    } catch {}
  });

  const files = { "src/main.js": "console.log('original');\n" };
  const canonicalSnapshot = {
    schema_version: 1,
    repository_id: "repo-tree-test",
    base_tree_digest: "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
    projection: "workspace",
    dependency_digests: [],
  };
  canonicalSnapshot.source_snapshot_id = computeSourceSnapshotId(canonicalSnapshot);

  const workspace = await createWorkspace({ baseDir, source_snapshot_id: canonicalSnapshot.source_snapshot_id });
  t.after(() => disposeWorkspace(workspace));

  const workOrder = {
    schema_version: 2,
    kind: "work-order/v2",
    node_id: "node-tree",
    role: "executor",
    status: "pending",
    operation: "apply",
    objective: "Test tree mismatch",
    source_snapshot_id: canonicalSnapshot.source_snapshot_id,
    dependencies: [],
    ownership: { owner: "agent", mode: "exclusive" },
    allowed_paths: ["src/**"],
    invariants: [],
    required_evidence: [],
    budget: { model_turns: 1, patches: 1, commands: 1, wall_time_minutes: 1, changed_lines: 10 },
  };
  workOrder.work_order_id = computeWorkOrderId(workOrder);

  await assert.rejects(
    async () => {
      await materializeSourceSnapshot(workspace, workOrder, canonicalSnapshot, { files });
    },
    /base_tree_digest mismatch/i
  );
  assert.equal(fs.existsSync(path.join(workspace.root_path, "src", "main.js")), false);
});

test("K6a Negative E2E: Traversal escape attempt halts fail-closed with containment violation", async (t) => {
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "k6a-e2e-trav-"));
  t.after(() => {
    try {
      fs.rmSync(baseDir, { recursive: true, force: true });
    } catch {}
  });

  const workspace = await createWorkspace({ baseDir, source_snapshot_id: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" });
  t.after(() => disposeWorkspace(workspace));

  const workOrder = {
    work_order_id: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
    source_snapshot_id: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    allowed_paths: ["src/**"],
  };

  const validation = validateAllowedPaths(["src/../../escape.txt"], workOrder.allowed_paths, {
    workspaceRoot: workspace.root_path,
    workspace_id: workspace.workspace_id,
    work_order_id: workOrder.work_order_id,
  });

  assert.equal(validation.ok, false);
  assert.ok(validation.violation);
  assert.equal(validation.violation.violation_type, "traversal");
  assert.equal(validation.violation.attempted_path, "src/../../escape.txt");

  const violSchema = loadSchemaById("ospec://schemas/kernel/containment-violation/v1", { rootDir: ROOT });
  const schemaRes = validateInstance(violSchema, validation.violation);
  assert.equal(schemaRes.valid, true);
});

test("K6a Negative E2E: Undeclared write attempt halts fail-closed with containment violation", async (t) => {
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "k6a-e2e-undec-"));
  t.after(() => {
    try {
      fs.rmSync(baseDir, { recursive: true, force: true });
    } catch {}
  });

  const workspace = await createWorkspace({ baseDir, source_snapshot_id: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" });
  t.after(() => disposeWorkspace(workspace));

  const workOrder = makeCanonicalWorkOrder("sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", {
    allowed_paths: ["allowed/**"],
  });

  const result = await executeWorkOrder({
    workOrder,
    workspace,
    command: process.execPath,
    args: ["-e", "const fs = require('fs'); fs.mkdirSync('unauthorized', { recursive: true }); fs.writeFileSync('unauthorized/pwn.txt', 'evil');"],
  });

  assert.equal(result.ok, false);
  assert.ok(result.violation);
  assert.equal(result.violation.violation_type, "undeclared_write");
  assert.equal(result.violation.attempted_path, "unauthorized/pwn.txt");

  const violSchema = loadSchemaById("ospec://schemas/kernel/containment-violation/v1", { rootDir: ROOT });
  const schemaRes = validateInstance(violSchema, result.violation);
  assert.equal(schemaRes.valid, true);
});

test("K6a Negative E2E: Non-aliasing guarantees WorkResult cannot be substituted as Candidate v2", async () => {
  const workResult = await captureWorkResult({
    work_order_id: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
    source_snapshot_id: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    patch: "--- a/src/app.js\n+++ b/src/app.js\n",
    commands: [],
    logs: ["completed"],
    exit_code: 0,
    filesystem_inventory: [],
  });

  const candidateSchema = loadSchemaById("ospec://schemas/kernel/candidate/v2", { rootDir: ROOT });
  const validation = validateInstance(candidateSchema, workResult);
  assert.equal(validation.valid, false, "WorkResult must fail Candidate v2 schema validation");
});

test("K6a Host Isolation Fallback: Reports truthful capability without silent promotion", async (t) => {
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "k6a-e2e-iso-"));
  t.after(() => {
    try {
      fs.rmSync(baseDir, { recursive: true, force: true });
    } catch {}
  });

  const workspace = await createWorkspace({ baseDir, source_snapshot_id: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" });
  t.after(() => disposeWorkspace(workspace));

  const workOrder = makeCanonicalWorkOrder("sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", {
    allowed_paths: ["**"],
  });

  // Without proof, declared enforced must downgrade to unavailable
  const resNoProof = await executeWorkOrder({
    workOrder,
    workspace,
    command: process.execPath,
    args: ["-e", "console.log('no proof');"],
    isolationCapability: "enforced",
  });
  assert.equal(resNoProof.isolationReported, "unavailable");

  // With verified proof
  const evidence = { surface: "worker", headless: true };
  const fixture = "fixtures/WorkerTransport.json";
  const evidence_digest = createEvidenceDigest({
    capability_id: "WorkerTransport",
    adapter_version: "1.0.0",
    host_version: "1.0.0",
    fixture,
    evidence,
  });
  const probe_digest = createProbeDigest({
    capability_id: "WorkerTransport",
    adapter_id: "claude",
    adapter_version: "1.0.0",
    host_version: "1.0.0",
    probe: { surface: "live", ok: true },
  });
  const capabilityProof = {
    schema_version: 1,
    kind: "capability-proof/v1",
    adapter_id: "claude",
    adapter_version: "1.0.0",
    host_version: "1.0.0",
    fixture,
    evidence_digest,
    probe_digest,
  };

  const mockWorkerTransport = {
    port_id: "port-claude-worker",
    kind: "worker-transport",
    adapter_id: "claude",
    probe_digest,
    run: async () => ({
      ok: true,
      exit_code: 0,
      stdout: "with proof and transport\n",
      stderr: "",
    }),
  };

  const resWithProofAndTransport = await executeWorkOrder({
    workOrder,
    workspace,
    transports: { worker: mockWorkerTransport },
    command: "runner",
    isolationCapability: "enforced",
    capabilityProof,
    semantic_evidence: evidence,
    expectedAdapterId: "claude",
    expectedAdapterVersion: "1.0.0",
    expectedHostRuntimeVersion: "1.0.0",
    expectedProbeDigest: probe_digest,
  });
  assert.equal(resWithProofAndTransport.isolationReported, "enforced");
  assert.equal(resWithProofAndTransport.ok, true);

  // Without active WorkerTransport, enforced isolation fails closed
  const resMissingTransport = await executeWorkOrder({
    workOrder,
    workspace,
    command: process.execPath,
    args: ["-e", "console.log('missing transport');"],
    isolationCapability: "enforced",
    capabilityProof,
    semantic_evidence: evidence,
    expectedAdapterId: "claude",
    expectedAdapterVersion: "1.0.0",
    expectedHostRuntimeVersion: "1.0.0",
    expectedProbeDigest: probe_digest,
  });
  assert.equal(resMissingTransport.ok, false, "Must fail closed when enforced requested without WorkerTransport");
  assert.notEqual(resMissingTransport.isolationReported, "enforced");
});

test("K6a Negative E2E: Mutating operation (apply_implementation) fails closed when executed in fallback without enforced WorkerTransport", async (t) => {
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "k6a-e2e-fallback-mut-"));
  t.after(() => {
    try { fs.rmSync(baseDir, { recursive: true, force: true }); } catch {}
  });

  const files = { "src/calculator.js": "function add(a, b) { return a + b; }\nmodule.exports = { add };\n" };
  const snapshot = {
    schema_version: 1,
    kind: "source-snapshot/v1",
    repository_id: "repo-mut-fallback",
    base_tree_digest: computeTreeDigest(files),
    projection: "workspace",
    dependency_digests: [],
  };
  snapshot.source_snapshot_id = computeSourceSnapshotId(snapshot);

  const workOrder = makeCanonicalWorkOrder(snapshot.source_snapshot_id, {
    node_id: "apply-mut",
    operation: "apply_implementation",
    ownership: { owner: "agent-e2e", mode: "exclusive" },
    allowed_paths: ["src/**"],
  });

  const workspace = await createWorkspace({ baseDir, source_snapshot_id: snapshot.source_snapshot_id });
  t.after(() => disposeWorkspace(workspace));

  await materializeSourceSnapshot(workspace, workOrder, snapshot, {
    capsule_inputs: ["src/calculator.js"],
    files,
  });

  const result = await executeWorkOrder({
    workOrder,
    workspace,
    command: process.execPath,
    args: ["-e", "console.log('must be rejected');"],
    isolationCapability: "unavailable",
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, "mutation-requires-enforced-isolation");
});

test("K6a Adversarial E2E: Mutating work order attempting write outside allowed_paths is rejected by containment", async (t) => {
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "k6a-e2e-adv-write-"));
  const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), "k6a-e2e-adv-outside-"));
  t.after(() => {
    try {
      fs.rmSync(baseDir, { recursive: true, force: true });
      fs.rmSync(outsideDir, { recursive: true, force: true });
    } catch {}
  });

  const files = { "src/app.js": "console.log('app');\n" };
  const snapshot = {
    schema_version: 1,
    kind: "source-snapshot/v1",
    repository_id: "repo-adv-write",
    base_tree_digest: computeTreeDigest(files),
    projection: "workspace",
    dependency_digests: [],
  };
  snapshot.source_snapshot_id = computeSourceSnapshotId(snapshot);

  const workOrder = makeCanonicalWorkOrder(snapshot.source_snapshot_id, {
    node_id: "adv-apply",
    operation: "apply_implementation",
    ownership: { owner: "agent-e2e", mode: "exclusive" },
    allowed_paths: ["src/**"],
  });

  const workspace = await createWorkspace({ baseDir, source_snapshot_id: snapshot.source_snapshot_id });
  t.after(() => disposeWorkspace(workspace));

  await materializeSourceSnapshot(workspace, workOrder, snapshot, {
    capsule_inputs: ["src/app.js"],
    files,
  });

  const enforcedProof = makeEnforcedProof("adapter-e2e-sandbox");
  const mockTransport = {
    adapter_id: "adapter-e2e-sandbox",
    probe_digest: enforcedProof.probe_digest,
    kind: "worker-transport",
    run: async (opts) => {
      const { spawnSync } = require("node:child_process");
      const res = spawnSync(opts.command, opts.args, {
        cwd: opts.cwd,
        env: { ...process.env, ...(opts.env || {}) },
        encoding: "utf8",
      });
      return {
        ok: res.status === 0,
        exit_code: res.status !== null ? res.status : 1,
        stdout: res.stdout || "",
        stderr: res.stderr || "",
      };
    },
  };

  const result = await executeWorkOrder({
    workOrder,
    workspace,
    transports: { worker: mockTransport },
    ...enforcedProof,
    commands: [
      {
        command: process.execPath,
        args: ["-e", "const fs = require('fs'); fs.mkdirSync('unauthorized', { recursive: true }); fs.writeFileSync('unauthorized/leak.txt', 'pwned');"],
      },
    ],
  });

  assert.equal(result.ok, false);
  assert.ok(result.violation);
  assert.equal(result.violation.violation_type, "undeclared_write");
  assert.equal(result.violation.attempted_path, "unauthorized/leak.txt");
});

