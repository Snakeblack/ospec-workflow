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
const { computeWorkOrderId, computeSourceSnapshotId } = require("./lib/execution-identities/index.js");
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
        if (l.startsWith("@@")) continue;
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
      for (let i = 2; i < lines.length; i++) {
        const l = lines[i];
        if (l.startsWith("@@")) continue;
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
      let content = newFileLines.join("\n");
      if (!noNewlineAtEnd && newFileLines.length > 0) {
        content += "\n";
      }
      result.set(filePath, content);
    }
  }
  return result;
}

test("K6a E2E Happy Path: Full workspace lifecycle, capsule materialization, execution, containment, and disposal", async (t) => {
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

  // 1. Canonical SourceSnapshot v1 and WorkOrder v2
  const canonicalSnapshot = {
    schema_version: 1,
    repository_id: "repo-e2e-calc",
    base_tree_digest: treeDigest,
    projection: "workspace",
    dependency_digests: [],
  };
  canonicalSnapshot.source_snapshot_id = computeSourceSnapshotId(canonicalSnapshot);

  // 2. Create Workspace
  const workspace = await createWorkspace({ baseDir, source_snapshot_id: canonicalSnapshot.source_snapshot_id });
  assert.equal(workspace.status, "active");
  assert.ok(fs.existsSync(workspace.root_path));

  const workOrder = {
    schema_version: 2,
    kind: "work-order/v2",
    node_id: "node-e2e-1",
    role: "executor",
    status: "pending",
    operation: "apply",
    objective: "Run calculator test suite",
    source_snapshot_id: canonicalSnapshot.source_snapshot_id,
    dependencies: ["sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"],
    ownership: { owner: "agent-e2e", mode: "exclusive" },
    allowed_paths: ["src/**", "test/**", "dist/**", "package.json"],
    invariants: ["inv-1"],
    required_evidence: ["ev-1"],
    budget: { model_turns: 5, patches: 2, commands: 5, wall_time_minutes: 5, changed_lines: 100 },
  };
  workOrder.work_order_id = computeWorkOrderId(workOrder);

  const capsule = await materializeSourceSnapshot(workspace, workOrder, canonicalSnapshot, {
    capsule_inputs: ["src/calculator.js", "test/calculator.test.js", "package.json"],
    files,
  });
  assert.ok(/^sha256:[a-f0-9]{64}$/.test(capsule.fingerprint));
  assert.ok(fs.existsSync(path.join(workspace.root_path, "src", "calculator.js")));
  assert.equal(fs.existsSync(path.join(workspace.root_path, "unrelated", "leak.txt")), false);

  // 3. Execute Work Order Commands
  const buildScript = "const fs = require('fs'); fs.mkdirSync('dist', { recursive: true }); fs.writeFileSync('dist/bundle.js', 'console.log(5);\\n');";
  const execResult = await executeWorkOrder({
    workOrder,
    workspace,
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

  // 4. Validate WorkResult schema & cryptographic binding
  const workResultSchema = loadSchemaById("ospec://schemas/kernel/work-result/v1", { rootDir: ROOT });
  const schemaRes = validateInstance(workResultSchema, execResult.workResult);
  assert.equal(schemaRes.valid, true, `WorkResult must pass schema validation: ${JSON.stringify(schemaRes.errors)}`);

  const payloadSchema = loadSchemaById("ospec://schemas/kernel/work-result-execution-payload/v1", { rootDir: ROOT });
  const payloadRes = validateInstance(payloadSchema, { ...execResult.workResult, execution_usage: execResult.execution_usage });
  assert.equal(payloadRes.valid, true, `Payload must pass schema validation: ${JSON.stringify(payloadRes.errors)}`);

  const binding = validateWorkResultBinding(workOrder, execResult.workResult);
  assert.equal(binding.ok, true, "WorkResult must be cryptographically bound to WorkOrder");

  // 5. Validate Patch Round-trip Reconstruction (K3 validation)
  const baseFilesMap = new Map([
    ["src/calculator.js", files["src/calculator.js"]],
    ["test/calculator.test.js", files["test/calculator.test.js"]],
    ["package.json", files["package.json"]],
  ]);
  const reconstructed = applyPatch(baseFilesMap, execResult.workResult.patch);
  assert.equal(reconstructed.get("dist/bundle.js"), "console.log(5);\n");

  // 6. Dispose Workspace
  const disposeResult = await disposeWorkspace(workspace);
  assert.equal(disposeResult.ok, true);
  assert.equal(disposeResult.status, "disposed");
  assert.equal(fs.existsSync(workspace.root_path), false, "Workspace directory must be deleted on teardown");
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
    work_order_id: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
    source_snapshot_id: canonicalSnapshot.source_snapshot_id,
    dependencies: [],
    capsule_inputs: ["src/main.js"],
    allowed_paths: ["src/**"],
  };

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

  const workOrder = {
    work_order_id: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
    source_snapshot_id: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    allowed_paths: ["allowed/**"],
  };

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

  const workOrder = {
    work_order_id: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
    source_snapshot_id: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    allowed_paths: ["**"],
  };

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

