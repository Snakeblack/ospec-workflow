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
} = require("./lib/worker-workspace.js");
const {
  executeWorkOrder,
  captureWorkResult,
  recoverInterruptedExecution,
  validateWorkResultBinding,
  computeWorkResultId,
} = require("./lib/worker-executor.js");
const { validateAllowedPaths } = require("./lib/allowed-paths-validator.js");

const ROOT = path.resolve(__dirname, "..");
const DUMMY_SNAPSHOT_ID = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const DUMMY_WORK_ORDER_ID = "sha256:1111111111111111111111111111111111111111111111111111111111111111";

test("K6a E2E Happy Path: Full workspace lifecycle, capsule materialization, execution, containment, and disposal", async (t) => {
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "k6a-e2e-happy-"));
  t.after(() => fs.rmSync(baseDir, { recursive: true, force: true }));

  // 1. Create Workspace
  const workspace = await createWorkspace({ baseDir, source_snapshot_id: DUMMY_SNAPSHOT_ID });
  assert.equal(workspace.status, "active");
  assert.ok(fs.existsSync(workspace.root_path));

  // 2. Materialize Capsule
  const snapshot = {
    source_snapshot_id: DUMMY_SNAPSHOT_ID,
    files: {
      "src/calculator.js": "function add(a, b) { return a + b; }\nmodule.exports = { add };\n",
      "test/calculator.test.js": "const assert = require('assert'); const { add } = require('../src/calculator.js'); assert.equal(add(2, 3), 5); console.log('All tests passed!');\n",
      "package.json": '{"name": "calc-app"}\n',
      "unrelated/leak.txt": "should not be materialized",
    },
  };

  const workOrder = {
    work_order_id: DUMMY_WORK_ORDER_ID,
    source_snapshot_id: DUMMY_SNAPSHOT_ID,
    dependencies: ["src/calculator.js", "test/calculator.test.js", "package.json"],
    allowed_paths: ["src/**", "test/**", "dist/**", "package.json"],
  };

  const capsule = await materializeSourceSnapshot(workspace, workOrder, snapshot);
  assert.ok(/^sha256:[a-f0-9]{64}$/.test(capsule.fingerprint));
  assert.ok(fs.existsSync(path.join(workspace.root_path, "src", "calculator.js")));
  assert.equal(fs.existsSync(path.join(workspace.root_path, "unrelated", "leak.txt")), false);

  // 3. Execute Work Order Commands
  const buildScript = "const fs = require('fs'); fs.mkdirSync('dist', { recursive: true }); fs.writeFileSync('dist/bundle.js', 'console.log(5);');";
  const execResult = await executeWorkOrder({
    workOrder,
    workspace,
    commands: [
      { command: process.execPath, args: ["-e", buildScript] },
      { command: process.execPath, args: [path.join(workspace.root_path, "test", "calculator.test.js")] },
    ],
    isolationCapability: "enforced",
  });

  assert.equal(execResult.ok, true);
  assert.ok(execResult.workResult);
  assert.equal(execResult.workResult.exit_code, 0);
  assert.ok(execResult.workResult.logs.some((l) => l.includes("All tests passed!")));
  assert.ok(execResult.workResult.filesystem_inventory.some((f) => f.path === "dist/bundle.js"));
  assert.equal(execResult.workResult.candidate_id, undefined, "Strict prohibition of CandidateId in WorkResult");

  // 4. Validate WorkResult schema & cryptographic binding
  const workResultSchema = loadSchemaById("ospec://schemas/kernel/work-result-execution-payload/v1", { rootDir: ROOT });
  const schemaRes = validateInstance(workResultSchema, execResult.workResult);
  assert.equal(schemaRes.valid, true, `WorkResult must pass schema validation: ${JSON.stringify(schemaRes.errors)}`);

  const binding = validateWorkResultBinding(workOrder, execResult.workResult);
  assert.equal(binding.ok, true, "WorkResult must be cryptographically bound to WorkOrder");

  // 5. Dispose Workspace
  const disposeResult = await disposeWorkspace(workspace);
  assert.equal(disposeResult.ok, true);
  assert.equal(disposeResult.status, "disposed");
  assert.equal(fs.existsSync(workspace.root_path), false, "Workspace directory must be deleted on teardown");
});

test("K6a Negative E2E: Traversal escape attempt halts fail-closed with containment violation", async (t) => {
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "k6a-e2e-trav-"));
  t.after(() => fs.rmSync(baseDir, { recursive: true, force: true }));

  const workspace = await createWorkspace({ baseDir, source_snapshot_id: DUMMY_SNAPSHOT_ID });
  t.after(() => disposeWorkspace(workspace));

  const workOrder = {
    work_order_id: DUMMY_WORK_ORDER_ID,
    source_snapshot_id: DUMMY_SNAPSHOT_ID,
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
  t.after(() => fs.rmSync(baseDir, { recursive: true, force: true }));

  const workspace = await createWorkspace({ baseDir, source_snapshot_id: DUMMY_SNAPSHOT_ID });
  t.after(() => disposeWorkspace(workspace));

  const workOrder = {
    work_order_id: DUMMY_WORK_ORDER_ID,
    source_snapshot_id: DUMMY_SNAPSHOT_ID,
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
    work_order_id: DUMMY_WORK_ORDER_ID,
    source_snapshot_id: DUMMY_SNAPSHOT_ID,
    patch: "--- a/src/app.js\n+++ b/src/app.js\n",
    commands: [],
    logs: ["completed"],
    exit_code: 0,
    filesystem_inventory: [],
    execution_usage: {},
  });

  const candidateSchema = loadSchemaById("ospec://schemas/kernel/candidate/v2", { rootDir: ROOT });
  const validation = validateInstance(candidateSchema, workResult);
  assert.equal(validation.valid, false, "WorkResult must fail Candidate v2 schema validation");
});

test("K6a Host Isolation Fallback: Reports truthful capability without silent promotion", async (t) => {
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "k6a-e2e-iso-"));
  t.after(() => fs.rmSync(baseDir, { recursive: true, force: true }));

  const workspace = await createWorkspace({ baseDir, source_snapshot_id: DUMMY_SNAPSHOT_ID });
  t.after(() => disposeWorkspace(workspace));

  const workOrder = {
    work_order_id: DUMMY_WORK_ORDER_ID,
    source_snapshot_id: DUMMY_SNAPSHOT_ID,
    allowed_paths: ["**"],
  };

  const capabilities = ["enforced", "partial", "instructional", "unavailable"];
  for (const cap of capabilities) {
    const result = await executeWorkOrder({
      workOrder,
      workspace,
      command: process.execPath,
      args: ["-e", "console.log('check capability');"],
      isolationCapability: cap,
    });
    assert.equal(result.ok, true);
    assert.equal(result.isolationReported, cap, `Must report exact capability '${cap}' without silent promotion`);
  }
});
