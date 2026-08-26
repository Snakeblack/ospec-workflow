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
const { sha256Fingerprint } = require("./lib/canonical-json.js");
const { spawn } = require("node:child_process");
const {
  createClaudeHostAdapter,
  getClaudeProofMaterial,
  ADAPTER_ID,
} = require("./lib/host-adapters/claude.js");

const {
  makeSandboxedWorkerPrimitive,
  makeSandboxedIsolationPrimitive,
  makeRogueIsolationPrimitive,
  executeSandboxedCommand,
} = require("./lib/worker-sandbox.js");
const { buildExecutionOptionsFromMaterial } = require("./lib/test-support/k6a-worker-fixtures.js");

const makeRealWorkerCommandPrimitive = makeSandboxedWorkerPrimitive;

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
    capsule_inputs: overrides.capsule_inputs || ["src/app.js"],
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

const DEFAULT_WT_PORT_ID = "port-enforced-worker";

function workerTransportLiveFingerprint(adapterId, portId, probeDigest) {
  return sha256Fingerprint("worker-transport-live-identity/v1", {
    adapter_id: adapterId,
    port_id: portId,
    probe_digest: probeDigest,
  });
}

async function confinedTransportRun(opts) {
  return executeSandboxedCommand({
    command: opts.command,
    args: opts.args || [],
    cwd: opts.cwd,
    workspaceRoot: opts.workspace_root || opts.cwd,
    allowedPaths: opts.allowed_paths || ["**"],
    env: opts.env,
    signal: opts.signal,
    timeoutMs: opts.deadlineMs,
  });
}

function makeIsolationProof(adapterId = "adapter-test", containmentOverrides = {}, transport = {}) {
  const containment = {
    allowed_write: "PASS",
    undeclared_workspace_write: "BLOCKED",
    external_root_write: "BLOCKED",
    ...containmentOverrides,
  };
  const port_id = transport.port_id || DEFAULT_WT_PORT_ID;
  const fingerprint = transport.fingerprint || workerTransportLiveFingerprint(
    adapterId,
    port_id,
    transport.probe_digest || "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  );
  const attempts = [
    { id: "allowed_write", attempted: true, wrote: true },
    { id: "undeclared_workspace_write", attempted: true, wrote: false },
    { id: "external_root_write", attempted: true, wrote: false },
  ];
  const semantic_evidence = {
    surface: "worker-isolation",
    host_observed: true,
    containment,
    transport: { port_id, fingerprint },
    attempts,
  };
  const fixture = "fixtures/WorkerIsolation.json";
  const evidence_digest = createEvidenceDigest({
    capability_id: "WorkerIsolation",
    adapter_version: "1.0.0",
    host_version: "1.0.0",
    fixture,
    evidence: semantic_evidence,
  });
  const probe_digest = createProbeDigest({
    capability_id: "WorkerIsolation",
    adapter_id: adapterId,
    adapter_version: "1.0.0",
    host_version: "1.0.0",
    probe: { surface: "live", ok: true, host_observed: true, containment },
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
    declared_state: "enforced",
    capabilityProof,
    semantic_evidence,
    expectedAdapterId: adapterId,
    expectedAdapterVersion: "1.0.0",
    expectedHostRuntimeVersion: "1.0.0",
    expectedProbeDigest: probe_digest,
    expectedPortId: port_id,
    expectedFingerprint: fingerprint,
  };
}

function makeEnforcedProof(adapterId = "adapter-test", containmentOverrides = {}) {
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
    workerIsolation: makeIsolationProof(adapterId, containmentOverrides, {
      port_id: DEFAULT_WT_PORT_ID,
      probe_digest,
    }),
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
    pathInventory: {
      source_snapshot_id: canonicalSnapshot.source_snapshot_id,
      paths: Object.keys(files),
    },
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
    files,
  });
  assert.ok(/^sha256:[a-f0-9]{64}$/.test(capsule.fingerprint));
  assert.ok(fs.existsSync(path.join(workspace.root_path, "src", "calculator.js")));
  assert.equal(fs.existsSync(path.join(workspace.root_path, "unrelated", "leak.txt")), false);

  // 5. K6a Execute Work Order Commands via Enforced WorkerTransport
  const buildScript = "const fs = require('fs'); fs.mkdirSync('dist', { recursive: true }); fs.writeFileSync('dist/bundle.js', 'console.log(5);\\n');";
  const enforcedProof = makeEnforcedProof("adapter-e2e-sandbox");
  const workerTransport = {
    port_id: DEFAULT_WT_PORT_ID,
    adapter_id: "adapter-e2e-sandbox",
    probe_digest: enforcedProof.probe_digest,
    kind: "worker-transport",
    run: async (opts) => confinedTransportRun(opts),
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

  let hasGit = false;
  try {
    execSync("git --version", { stdio: "ignore" });
    hasGit = true;
  } catch {}

  if (!hasGit) {
    t.skip("Git CLI not available");
  } else {
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
    capsule_inputs: ["src/b.js"],
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
    capsule_inputs: ["src/main.js"],
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

  const enforcedProof = makeEnforcedProof("adapter-e2e-sandbox");
  const mockTransport = {
    port_id: DEFAULT_WT_PORT_ID,
    adapter_id: "adapter-e2e-sandbox",
    probe_digest: enforcedProof.probe_digest,
    kind: "worker-transport",
    run: async (opts) => confinedTransportRun(opts),
  };

  const result = await executeWorkOrder({
    workOrder,
    workspace,
    transports: { worker: mockTransport },
    ...enforcedProof,
    command: process.execPath,
    args: ["-e", "const fs = require('fs'); fs.mkdirSync('unauthorized', { recursive: true }); fs.writeFileSync('unauthorized/pwn.txt', 'evil');"],
  });

  assert.equal(result.ok, false);
  assert.ok(result.violation);
  assert.equal(result.violation.violation_type, "undeclared_write");
  const attemptedPwn = String(result.violation.attempted_path).replace(/\\/g, "/");
  assert.ok(
    attemptedPwn === "unauthorized" || attemptedPwn === "unauthorized/pwn.txt" || attemptedPwn.startsWith("unauthorized/"),
    `expected unauthorized path, got ${attemptedPwn}`
  );
  assert.equal(fs.existsSync(path.join(workspace.root_path, "unauthorized", "pwn.txt")), false);

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

  // With verified proof + verified WorkerIsolation containment proof
  const enforcedProof = makeEnforcedProof("claude");

  const mockWorkerTransport = {
    port_id: DEFAULT_WT_PORT_ID,
    kind: "worker-transport",
    adapter_id: "claude",
    probe_digest: enforcedProof.probe_digest,
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
    ...enforcedProof,
  });
  assert.equal(resWithProofAndTransport.isolationReported, "enforced");
  assert.equal(resWithProofAndTransport.ok, true);

  // Enforced WorkerTransport WITHOUT WorkerIsolation must fail closed
  const { workerIsolation: _omitted, ...transportOnly } = enforcedProof;
  const resMissingIsolation = await executeWorkOrder({
    workOrder,
    workspace,
    transports: { worker: mockWorkerTransport },
    command: "runner",
    ...transportOnly,
  });
  assert.equal(resMissingIsolation.ok, false, "Enforced transport without isolation proof must fail closed");
  assert.equal(resMissingIsolation.reason, "containment-proof-required");

  // Without active WorkerTransport, enforced isolation fails closed
  const resMissingTransport = await executeWorkOrder({
    workOrder,
    workspace,
    command: process.execPath,
    args: ["-e", "console.log('missing transport');"],
    ...enforcedProof,
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
    capsule_inputs: ["src/calculator.js"],
  });

  const workspace = await createWorkspace({ baseDir, source_snapshot_id: snapshot.source_snapshot_id });
  t.after(() => disposeWorkspace(workspace));

  await materializeSourceSnapshot(workspace, workOrder, snapshot, {
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
    files,
  });

  const enforcedProof = makeEnforcedProof("adapter-e2e-sandbox");
  const mockTransport = {
    port_id: DEFAULT_WT_PORT_ID,
    adapter_id: "adapter-e2e-sandbox",
    probe_digest: enforcedProof.probe_digest,
    kind: "worker-transport",
    run: async (opts) => confinedTransportRun(opts),
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
  const attemptedLeak = String(result.violation.attempted_path).replace(/\\/g, "/");
  assert.ok(
    attemptedLeak === "unauthorized" || attemptedLeak === "unauthorized/leak.txt" || attemptedLeak.startsWith("unauthorized/"),
    `expected unauthorized path, got ${attemptedLeak}`
  );
  assert.equal(fs.existsSync(path.join(workspace.root_path, "unauthorized", "leak.txt")), false);
});

test("K6a Adversarial E2E: Read-only work order attempting subprocess execution in unisolated fallback is rejected fail-closed", async (t) => {
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "k6a-e2e-ro-subp-"));
  t.after(() => {
    try { fs.rmSync(baseDir, { recursive: true, force: true }); } catch {}
  });

  const files = { "src/verify.js": "console.log('verify');\n" };
  const snapshot = {
    schema_version: 1,
    kind: "source-snapshot/v1",
    repository_id: "repo-ro-subp",
    base_tree_digest: computeTreeDigest(files),
    projection: "workspace",
    dependency_digests: [],
  };
  snapshot.source_snapshot_id = computeSourceSnapshotId(snapshot);

  const workOrder = makeCanonicalWorkOrder(snapshot.source_snapshot_id, {
    node_id: "ro-verify",
    operation: "verify",
    ownership: { owner: "agent-e2e", mode: "shared" },
    allowed_paths: ["**"],
  });

  const workspace = await createWorkspace({ baseDir, source_snapshot_id: snapshot.source_snapshot_id });
  t.after(() => disposeWorkspace(workspace));

  const result = await executeWorkOrder({
    workOrder,
    workspace,
    command: process.execPath,
    args: ["-e", "console.log('must be rejected without enforced isolation');"],
    isolationCapability: "unavailable",
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, "subprocess-requires-enforced-isolation");
});

test("K6a Adversarial E2E: Work order attempting write outside workspace root is blocked and fails closed", async (t) => {
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "k6a-e2e-adv-root-"));
  const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), "k6a-e2e-adv-root-out-"));
  t.after(() => {
    try {
      fs.rmSync(baseDir, { recursive: true, force: true });
      fs.rmSync(outsideDir, { recursive: true, force: true });
    } catch {}
  });

  const files = { "src/safe.js": "console.log('safe');\n" };
  const snapshot = {
    schema_version: 1,
    kind: "source-snapshot/v1",
    repository_id: "repo-adv-root",
    base_tree_digest: computeTreeDigest(files),
    projection: "workspace",
    dependency_digests: [],
  };
  snapshot.source_snapshot_id = computeSourceSnapshotId(snapshot);

  const outsideFile = path.join(outsideDir, "external-pwned.txt").replace(/\\/g, "/");

  const workOrder = makeCanonicalWorkOrder(snapshot.source_snapshot_id, {
    node_id: "adv-root-apply",
    operation: "apply_implementation",
    ownership: { owner: "agent-e2e", mode: "exclusive" },
    allowed_paths: ["src/**"],
  });

  const workspace = await createWorkspace({ baseDir, source_snapshot_id: snapshot.source_snapshot_id });
  t.after(() => disposeWorkspace(workspace));

  const result = await executeWorkOrder({
    workOrder,
    workspace,
    command: process.execPath,
    args: ["-e", `require('fs').writeFileSync('${outsideFile}', 'evil');`],
    isolationCapability: "unavailable",
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, "mutation-requires-enforced-isolation");
  assert.equal(fs.existsSync(outsideFile), false, "External root file must not be created");
});

test("K6a Adversarial E2E: WorkerTransport failing containment probe cannot achieve enforced isolation", async (t) => {
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "k6a-e2e-adv-probe-"));
  t.after(() => {
    try { fs.rmSync(baseDir, { recursive: true, force: true }); } catch {}
  });

  const files = { "src/probe.js": "console.log('probe');\n" };
  const snapshot = {
    schema_version: 1,
    kind: "source-snapshot/v1",
    repository_id: "repo-adv-probe",
    base_tree_digest: computeTreeDigest(files),
    projection: "workspace",
    dependency_digests: [],
  };
  snapshot.source_snapshot_id = computeSourceSnapshotId(snapshot);

  const workOrder = makeCanonicalWorkOrder(snapshot.source_snapshot_id, {
    node_id: "adv-probe-wo",
    operation: "apply_implementation",
    ownership: { owner: "agent-e2e", mode: "exclusive" },
    allowed_paths: ["src/**"],
  });

  const workspace = await createWorkspace({ baseDir, source_snapshot_id: snapshot.source_snapshot_id });
  t.after(() => disposeWorkspace(workspace));

  const brokenProof = makeEnforcedProof("adapter-broken-probe", {
    external_root_write: "LEAKED",
  });

  const mockTransport = {
    port_id: DEFAULT_WT_PORT_ID,
    adapter_id: "adapter-broken-probe",
    probe_digest: brokenProof.probe_digest,
    kind: "worker-transport",
    run: async () => ({ ok: true, exit_code: 0 }),
  };

  const result = await executeWorkOrder({
    workOrder,
    workspace,
    transports: { worker: mockTransport },
    command: "tool",
    ...brokenProof,
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, "containment-probe-unfulfilled");
});


// ---------------------------------------------------------------------------
// E2E real K2a → K6a: adapter Claude de referencia sin mocks intermedios.
// Ningún test de este bloque inyecta manualmente adapter_id, probe_digest ni
// containment: todo el material proviene de createClaudeHostAdapter() y
// getClaudeProofMaterial().
// ---------------------------------------------------------------------------

test("K2a→K6a Real E2E: adapter Claude real ejecuta mutación contenida vía executeWorkOrder", async (t) => {
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "k6a-k2a-real-"));
  t.after(() => {
    try { fs.rmSync(baseDir, { recursive: true, force: true }); } catch {}
  });

  const files = { "src/app.js": "console.log('app');\n" };
  const snapshot = {
    schema_version: 1,
    kind: "source-snapshot/v1",
    repository_id: "repo-k2a-k6a-real",
    base_tree_digest: computeTreeDigest(files),
    projection: "workspace",
    dependency_digests: [],
  };
  snapshot.source_snapshot_id = computeSourceSnapshotId(snapshot);

  const workOrder = makeCanonicalWorkOrder(snapshot.source_snapshot_id, {
    node_id: "k2a-real-apply",
    operation: "apply_implementation",
    ownership: { owner: "agent-k2a", mode: "exclusive" },
    allowed_paths: ["dist/**"],
  });

  const workspace = await createWorkspace({ baseDir, source_snapshot_id: snapshot.source_snapshot_id });
  t.after(() => disposeWorkspace(workspace));

  await materializeSourceSnapshot(workspace, workOrder, snapshot, {
    files,
  });

  // Adapter real con primitivas reales: worker subprocess + sandbox de aislamiento.
  const primitives = {
    worker: makeRealWorkerCommandPrimitive(),
    workerIsolation: makeSandboxedIsolationPrimitive(),
  };
  const adapter = await createClaudeHostAdapter({ primitives });
  assert.equal(adapter.capabilities.WorkerTransport, "enforced");
  assert.equal(adapter.capabilities.WorkerIsolation, "enforced");

  // El transport real del adapter lleva identidad canónica decorada.
  const material = await getClaudeProofMaterial({ primitives });
  assert.equal(adapter.transports.WorkerTransport.adapter_id, ADAPTER_ID);
  assert.equal(
    adapter.transports.WorkerTransport.probe_digest,
    material.WorkerTransport.proof.probe_digest
  );

  const result = await executeWorkOrder({
    workOrder,
    workspace,
    transports: { worker: adapter.transports.WorkerTransport },
    command: process.execPath,
    args: ["-e", "require('node:fs').mkdirSync('dist', { recursive: true }); require('node:fs').writeFileSync('dist/generated.txt', 'contained');"],
    ...buildExecutionOptionsFromMaterial(material),
  });

  assert.equal(result.ok, true, `execution must succeed: ${result.reason || result.error || ""}`);
  assert.equal(result.isolationReported, "enforced");

  // La mutación contenida existe dentro del workspace.
  const generated = path.join(workspace.root_path, "dist", "generated.txt");
  assert.ok(fs.existsSync(generated), "generated file must exist inside allowed_paths");
});

test("K2a→K6a Real E2E adversarial: worker sin sandbox nunca alcanza enforced y no ejecuta nada", async (t) => {
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "k6a-k2a-rogue-"));
  const externalDir = fs.mkdtempSync(path.join(os.tmpdir(), "k6a-k2a-rogue-outside-"));
  const externalTarget = path.join(externalDir, "escape.txt");
  t.after(() => {
    try { fs.rmSync(baseDir, { recursive: true, force: true }); } catch {}
    try { fs.rmSync(externalDir, { recursive: true, force: true }); } catch {}
  });

  const files = { "src/app.js": "console.log('app');\n" };
  const snapshot = {
    schema_version: 1,
    kind: "source-snapshot/v1",
    repository_id: "repo-k2a-rogue",
    base_tree_digest: computeTreeDigest(files),
    projection: "workspace",
    dependency_digests: [],
  };
  snapshot.source_snapshot_id = computeSourceSnapshotId(snapshot);

  const workOrder = makeCanonicalWorkOrder(snapshot.source_snapshot_id, {
    node_id: "k2a-rogue-apply",
    operation: "apply_implementation",
    ownership: { owner: "agent-k2a", mode: "exclusive" },
    allowed_paths: ["dist/**"],
  });

  const workspace = await createWorkspace({ baseDir, source_snapshot_id: snapshot.source_snapshot_id });
  t.after(() => disposeWorkspace(workspace));

  await materializeSourceSnapshot(workspace, workOrder, snapshot, {
    files,
  });

  // Worker real + primitiva de aislamiento ADVERSARIAL sin sandbox: el probe
  // del adapter detecta la fuga física y la capability queda en partial.
  const primitives = {
    worker: makeRealWorkerCommandPrimitive(),
    workerIsolation: makeRogueIsolationPrimitive(),
  };
  const adapter = await createClaudeHostAdapter({ primitives });
  assert.notEqual(adapter.capabilities.WorkerIsolation, "enforced");
  assert.equal(adapter.capabilities.WorkerIsolation, "partial");

  const material = await getClaudeProofMaterial({ primitives });
  assert.equal(material.WorkerIsolation.expectedProbeDigest, undefined);

  // Intento de escritura fuera del workspace root. Sin prueba canónica de
  // aislamiento, executeWorkOrder debe fallar ANTES de ejecutar cualquier cosa.
  const options = buildExecutionOptionsFromMaterial({
    WorkerTransport: material.WorkerTransport,
    // Sin material verificado de WorkerIsolation (probe adversarial falló).
    WorkerIsolation: null,
  });

  const result = await executeWorkOrder({
    workOrder,
    workspace,
    transports: { worker: adapter.transports.WorkerTransport },
    command: process.execPath,
    args: ["-e", `require('node:fs').writeFileSync(${JSON.stringify(externalTarget)}, 'escaped');`],
    ...options,
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, "containment-proof-required");
  assert.equal(result.isolationReported, "unavailable");
  assert.equal(fs.existsSync(externalTarget), false, "external write must never be attempted without isolation proof");
});

test("K2a→K6a Real E2E adversarial: execution attempt outside workspace with valid enforced isolation is physically prevented from existing on host disk", async (t) => {
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "k6a-k2a-adv-ext-"));
  const externalDir = fs.mkdtempSync(path.join(os.tmpdir(), "k6a-k2a-adv-ext-out-"));
  const externalTarget = path.join(externalDir, "k6a-escape.txt");
  t.after(() => {
    try { fs.rmSync(baseDir, { recursive: true, force: true }); } catch {}
    try { fs.rmSync(externalDir, { recursive: true, force: true }); } catch {}
  });

  const files = { "src/app.js": "console.log('app');\n" };
  const snapshot = {
    schema_version: 1,
    kind: "source-snapshot/v1",
    repository_id: "repo-k2a-adv-ext",
    base_tree_digest: computeTreeDigest(files),
    projection: "workspace",
    dependency_digests: [],
  };
  snapshot.source_snapshot_id = computeSourceSnapshotId(snapshot);

  const workOrder = makeCanonicalWorkOrder(snapshot.source_snapshot_id, {
    node_id: "k2a-adv-ext-apply",
    operation: "apply_implementation",
    ownership: { owner: "agent-k2a", mode: "exclusive" },
    allowed_paths: ["dist/**"],
  });

  const workspace = await createWorkspace({ baseDir, source_snapshot_id: snapshot.source_snapshot_id });
  t.after(() => disposeWorkspace(workspace));

  await materializeSourceSnapshot(workspace, workOrder, snapshot, {
    files,
  });

  // MISMAS primitivas sandboxed válidas que en el happy path
  const primitives = {
    worker: makeSandboxedWorkerPrimitive(),
    workerIsolation: makeSandboxedIsolationPrimitive(),
  };
  const adapter = await createClaudeHostAdapter({ primitives });
  assert.equal(adapter.capabilities.WorkerTransport, "enforced");
  assert.equal(adapter.capabilities.WorkerIsolation, "enforced");

  const material = await getClaudeProofMaterial({ primitives });

  const result = await executeWorkOrder({
    workOrder,
    workspace,
    transports: { worker: adapter.transports.WorkerTransport },
    command: process.execPath,
    args: ["-e", `require('node:fs').writeFileSync(${JSON.stringify(externalTarget)}, 'escaped');`],
    ...buildExecutionOptionsFromMaterial(material),
  });

  // La ejecución debe fallar (proceso abortado por sandbox EACCES)
  assert.equal(result.ok, false, "Execution attempting external write must fail");
  // Y el fichero externo NUNCA debe haber llegado a existir en el host
  assert.equal(fs.existsSync(externalTarget), false, "External target file MUST NOT exist on host filesystem");
});

test("K2a→K6a Real E2E adversarial: multi-target execution with valid isolation physically enforces boundaries (dist/ok.txt EXISTS, unauthorized/leak.txt NOT EXISTS, external-leak.txt NOT EXISTS)", async (t) => {
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "k6a-k2a-adv-multi-"));
  const externalDir = fs.mkdtempSync(path.join(os.tmpdir(), "k6a-k2a-adv-multi-out-"));
  const externalTarget = path.join(externalDir, "external-leak.txt");
  t.after(() => {
    try { fs.rmSync(baseDir, { recursive: true, force: true }); } catch {}
    try { fs.rmSync(externalDir, { recursive: true, force: true }); } catch {}
  });

  const files = { "src/app.js": "console.log('app');\n" };
  const snapshot = {
    schema_version: 1,
    kind: "source-snapshot/v1",
    repository_id: "repo-k2a-adv-multi",
    base_tree_digest: computeTreeDigest(files),
    projection: "workspace",
    dependency_digests: [],
  };
  snapshot.source_snapshot_id = computeSourceSnapshotId(snapshot);

  const workOrder = makeCanonicalWorkOrder(snapshot.source_snapshot_id, {
    node_id: "k2a-adv-multi-apply",
    operation: "apply_implementation",
    ownership: { owner: "agent-k2a", mode: "exclusive" },
    allowed_paths: ["dist/**"],
  });

  const workspace = await createWorkspace({ baseDir, source_snapshot_id: snapshot.source_snapshot_id });
  t.after(() => disposeWorkspace(workspace));

  await materializeSourceSnapshot(workspace, workOrder, snapshot, {
    files,
  });

  // MISMAS primitivas sandboxed válidas que en el happy path
  const primitives = {
    worker: makeSandboxedWorkerPrimitive(),
    workerIsolation: makeSandboxedIsolationPrimitive(),
  };
  const adapter = await createClaudeHostAdapter({ primitives });
  assert.equal(adapter.capabilities.WorkerTransport, "enforced");
  assert.equal(adapter.capabilities.WorkerIsolation, "enforced");

  const material = await getClaudeProofMaterial({ primitives });

  const multiScript = `
    const fs = require('node:fs');
    fs.mkdirSync('dist', { recursive: true });
    fs.writeFileSync('dist/ok.txt', 'ok');
    try {
      fs.mkdirSync('unauthorized', { recursive: true });
      fs.writeFileSync('unauthorized/leak.txt', 'leak');
    } catch (e) {}
    try {
      fs.writeFileSync(${JSON.stringify(externalTarget)}, 'external leak');
    } catch (e) {}
  `;

  const result = await executeWorkOrder({
    workOrder,
    workspace,
    transports: { worker: adapter.transports.WorkerTransport },
    command: process.execPath,
    args: ["-e", multiScript],
    ...buildExecutionOptionsFromMaterial(material),
  });

  // 1. dist/ok.txt dentro de allowed_paths DEBE existir
  const okFile = path.join(workspace.root_path, "dist", "ok.txt");
  assert.ok(fs.existsSync(okFile), "dist/ok.txt must exist inside allowed_paths");

  // 2. unauthorized/leak.txt fuera de allowed_paths NO DEBE existir
  const leakFile = path.join(workspace.root_path, "unauthorized", "leak.txt");
  assert.equal(fs.existsSync(leakFile), false, "unauthorized/leak.txt must NOT exist on disk");

  // 3. external-leak.txt fuera del workspace NO DEBE existir
  assert.equal(fs.existsSync(externalTarget), false, "external-leak.txt must NOT exist on host filesystem");

  // El resultado general de executeWorkOrder debe ser exitoso porque el script manejó las excepciones
  // y solo dist/ok.txt quedó mutado según allowed_paths
  assert.equal(result.ok, true, `execution must succeed for contained mutations: ${result.reason || result.error || ""}`);
});

test("K2a→K6a Real E2E adversarial: enforced + non-Node/shell command is rejected fail-closed without external write", async (t) => {
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "k6a-k2a-adv-shell-"));
  const externalDir = fs.mkdtempSync(path.join(os.tmpdir(), "k6a-k2a-adv-shell-out-"));
  const externalTarget = path.join(externalDir, "shell-escape.txt");
  t.after(() => {
    try { fs.rmSync(baseDir, { recursive: true, force: true }); } catch {}
    try { fs.rmSync(externalDir, { recursive: true, force: true }); } catch {}
  });

  const files = { "src/app.js": "console.log('app');\n" };
  const snapshot = {
    schema_version: 1,
    kind: "source-snapshot/v1",
    repository_id: "repo-k2a-adv-shell",
    base_tree_digest: computeTreeDigest(files),
    projection: "workspace",
    dependency_digests: [],
  };
  snapshot.source_snapshot_id = computeSourceSnapshotId(snapshot);

  const workOrder = makeCanonicalWorkOrder(snapshot.source_snapshot_id, {
    node_id: "k2a-adv-shell-apply",
    operation: "apply_implementation",
    ownership: { owner: "agent-k2a", mode: "exclusive" },
    allowed_paths: ["dist/**"],
  });

  const workspace = await createWorkspace({ baseDir, source_snapshot_id: snapshot.source_snapshot_id });
  t.after(() => disposeWorkspace(workspace));

  await materializeSourceSnapshot(workspace, workOrder, snapshot, {
    files,
  });

  const primitives = {
    worker: makeSandboxedWorkerPrimitive(),
    workerIsolation: makeSandboxedIsolationPrimitive(),
  };
  const adapter = await createClaudeHostAdapter({ primitives });
  const material = await getClaudeProofMaterial({ primitives });

  const shellCommand = process.platform === "win32" ? "cmd.exe" : "/bin/sh";
  const shellArgs = process.platform === "win32" ? ["/c", `echo escaped > "${externalTarget}"`] : ["-c", `echo escaped > "${externalTarget}"`];

  const result = await executeWorkOrder({
    workOrder,
    workspace,
    transports: { worker: adapter.transports.WorkerTransport },
    command: shellCommand,
    args: shellArgs,
    ...buildExecutionOptionsFromMaterial(material),
  });

  // Ejecución no-Node sin sandbox nativo debe ser rechazada fail-closed
  assert.equal(result.ok, false, "Non-Node unconfined execution must fail closed");
  // Y el fichero externo nunca debe llegar a existir
  assert.equal(fs.existsSync(externalTarget), false, "External target file MUST NOT exist after shell attempt");
});

test("K2a→K6a Real E2E adversarial: enforced Node command attempting child_process shell escape is blocked without external write", async (t) => {
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "k6a-k2a-adv-cp-"));
  const externalDir = fs.mkdtempSync(path.join(os.tmpdir(), "k6a-k2a-adv-cp-out-"));
  const externalTarget = path.join(externalDir, "cp-escape.txt");
  t.after(() => {
    try { fs.rmSync(baseDir, { recursive: true, force: true }); } catch {}
    try { fs.rmSync(externalDir, { recursive: true, force: true }); } catch {}
  });

  const files = { "src/app.js": "console.log('app');\n" };
  const snapshot = {
    schema_version: 1,
    kind: "source-snapshot/v1",
    repository_id: "repo-k2a-adv-cp",
    base_tree_digest: computeTreeDigest(files),
    projection: "workspace",
    dependency_digests: [],
  };
  snapshot.source_snapshot_id = computeSourceSnapshotId(snapshot);

  const workOrder = makeCanonicalWorkOrder(snapshot.source_snapshot_id, {
    node_id: "k2a-adv-cp-apply",
    operation: "apply_implementation",
    ownership: { owner: "agent-k2a", mode: "exclusive" },
    allowed_paths: ["dist/**"],
  });

  const workspace = await createWorkspace({ baseDir, source_snapshot_id: snapshot.source_snapshot_id });
  t.after(() => disposeWorkspace(workspace));

  await materializeSourceSnapshot(workspace, workOrder, snapshot, {
    files,
  });

  const primitives = {
    worker: makeSandboxedWorkerPrimitive(),
    workerIsolation: makeSandboxedIsolationPrimitive(),
  };
  const adapter = await createClaudeHostAdapter({ primitives });
  const material = await getClaudeProofMaterial({ primitives });

  const escapeScript = `
    const cp = require('node:child_process');
    const shell = process.platform === 'win32' ? 'cmd.exe' : '/bin/sh';
    const arg = process.platform === 'win32' ? ['/c', 'echo leak > "${externalTarget.replace(/\\/g, "/")}"'] : ['-c', 'echo leak > "${externalTarget}"'];
    cp.execFileSync(shell, arg);
  `;

  const result = await executeWorkOrder({
    workOrder,
    workspace,
    transports: { worker: adapter.transports.WorkerTransport },
    command: process.execPath,
    args: ["-e", escapeScript],
    ...buildExecutionOptionsFromMaterial(material),
  });

  // Ejecución que intenta child_process shell escape debe fallar
  assert.equal(result.ok, false, "child_process escape attempt must fail");
  // Y el fichero externo nunca debe llegar a existir
  assert.equal(fs.existsSync(externalTarget), false, "External target file MUST NOT exist after child_process attempt");
});

test("K2a→K6a Real E2E adversarial: allowed path symlink pointing outside is blocked from writing external target", async (t) => {
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "k6a-k2a-adv-sym-"));
  const externalDir = fs.mkdtempSync(path.join(os.tmpdir(), "k6a-k2a-adv-sym-out-"));
  const externalTarget = path.join(externalDir, "sym-escape.txt");
  t.after(() => {
    try { fs.rmSync(baseDir, { recursive: true, force: true }); } catch {}
    try { fs.rmSync(externalDir, { recursive: true, force: true }); } catch {}
  });

  const files = { "src/app.js": "console.log('app');\n" };
  const snapshot = {
    schema_version: 1,
    kind: "source-snapshot/v1",
    repository_id: "repo-k2a-adv-sym",
    base_tree_digest: computeTreeDigest(files),
    projection: "workspace",
    dependency_digests: [],
  };
  snapshot.source_snapshot_id = computeSourceSnapshotId(snapshot);

  const workOrder = makeCanonicalWorkOrder(snapshot.source_snapshot_id, {
    node_id: "k2a-adv-sym-apply",
    operation: "apply_implementation",
    ownership: { owner: "agent-k2a", mode: "exclusive" },
    allowed_paths: ["dist/**"],
  });

  const workspace = await createWorkspace({ baseDir, source_snapshot_id: snapshot.source_snapshot_id });
  t.after(() => disposeWorkspace(workspace));

  await materializeSourceSnapshot(workspace, workOrder, snapshot, {
    files,
  });

  const primitives = {
    worker: makeSandboxedWorkerPrimitive(),
    workerIsolation: makeSandboxedIsolationPrimitive(),
  };
  const adapter = await createClaudeHostAdapter({ primitives });
  const material = await getClaudeProofMaterial({ primitives });

  const symlinkScript = `
    const fs = require('node:fs');
    fs.mkdirSync('dist', { recursive: true });
    try {
      fs.symlinkSync(${JSON.stringify(externalDir)}, 'dist/leak_link', 'dir');
    } catch (e) {
      // Bloqueado en creación de symlink
    }
    // Si la creación fue ignorada o simulada, la escritura a través del enlace DEBE ser bloqueada
    try {
      fs.writeFileSync('dist/leak_link/sym-escape.txt', 'leak');
    } catch (e) {}
  `;

  const result = await executeWorkOrder({
    workOrder,
    workspace,
    transports: { worker: adapter.transports.WorkerTransport },
    command: process.execPath,
    args: ["-e", symlinkScript],
    ...buildExecutionOptionsFromMaterial(material),
  });

  // El fichero externo NUNCA debe haber llegado a existir
  assert.equal(fs.existsSync(externalTarget), false, "External target file MUST NOT exist via symlink escape");
});

