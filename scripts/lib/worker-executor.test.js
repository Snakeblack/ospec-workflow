"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { validateInstance, loadSchemaById } = require("./kernel-schema-validator.js");
const { createWorkspace, disposeWorkspace } = require("./worker-workspace.js");
const {
  executeWorkOrder,
  captureWorkResult,
  recoverInterruptedExecution,
  validateWorkResultBinding,
  computeWorkResultId,
} = require("./worker-executor.js");

const ROOT = path.resolve(__dirname, "..", "..");
const DUMMY_SNAPSHOT_ID = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const DUMMY_WORK_ORDER_ID = "sha256:1111111111111111111111111111111111111111111111111111111111111111";

test("executeWorkOrder: executes command in workspace and captures WorkResult telemetry", async (t) => {
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "k6a-exec-"));
  t.after(() => fs.rmSync(baseDir, { recursive: true, force: true }));

  const ws = await createWorkspace({ baseDir, source_snapshot_id: DUMMY_SNAPSHOT_ID });
  t.after(() => disposeWorkspace(ws));

  const workOrder = {
    work_order_id: DUMMY_WORK_ORDER_ID,
    source_snapshot_id: DUMMY_SNAPSHOT_ID,
    allowed_paths: ["output/**"],
  };

  const result = await executeWorkOrder({
    workOrder,
    workspace: ws,
    command: process.execPath,
    args: ["-e", "const fs = require('fs'); fs.mkdirSync('output', {recursive: true}); fs.writeFileSync('output/result.txt', 'hello'); console.log('done');"],
    isolationCapability: "enforced",
  });

  assert.equal(result.ok, true);
  assert.ok(result.workResult);
  assert.equal(result.workResult.exit_code, 0);
  assert.ok(result.workResult.logs.some((l) => l.includes("done")));
  assert.equal(result.workResult.work_order_id, DUMMY_WORK_ORDER_ID);
  assert.equal(result.workResult.source_snapshot_id, DUMMY_SNAPSHOT_ID);
  assert.ok(result.workResult.filesystem_inventory.some((f) => f.path === "output/result.txt"));
  assert.equal(result.workResult.candidate_id, undefined, "Zero CandidateId properties allowed");

  const schema = loadSchemaById("ospec://schemas/kernel/work-result-execution-payload/v1", { rootDir: ROOT });
  const validation = validateInstance(schema, result.workResult);
  assert.equal(validation.valid, true, `WorkResult must conform to schema: ${JSON.stringify(validation.errors)}`);
});

test("executeWorkOrder: captures non-zero exit code and error logs without throwing", async (t) => {
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "k6a-exec-fail-"));
  t.after(() => fs.rmSync(baseDir, { recursive: true, force: true }));

  const ws = await createWorkspace({ baseDir, source_snapshot_id: DUMMY_SNAPSHOT_ID });
  t.after(() => disposeWorkspace(ws));

  const workOrder = {
    work_order_id: DUMMY_WORK_ORDER_ID,
    source_snapshot_id: DUMMY_SNAPSHOT_ID,
    allowed_paths: ["**"],
  };

  const result = await executeWorkOrder({
    workOrder,
    workspace: ws,
    command: process.execPath,
    args: ["-e", "console.error('fatal error'); process.exit(2);"],
  });

  assert.equal(result.ok, false);
  assert.ok(result.workResult);
  assert.equal(result.workResult.exit_code, 2);
  assert.ok(result.workResult.logs.some((l) => l.includes("fatal error")));
});

test("executeWorkOrder: handles host capability fallback without silent promotion", async (t) => {
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "k6a-exec-fallback-"));
  t.after(() => fs.rmSync(baseDir, { recursive: true, force: true }));

  const ws = await createWorkspace({ baseDir, source_snapshot_id: DUMMY_SNAPSHOT_ID });
  t.after(() => disposeWorkspace(ws));

  const workOrder = {
    work_order_id: DUMMY_WORK_ORDER_ID,
    source_snapshot_id: DUMMY_SNAPSHOT_ID,
    allowed_paths: ["**"],
  };

  const result = await executeWorkOrder({
    workOrder,
    workspace: ws,
    command: process.execPath,
    args: ["-e", "console.log('fallback ok');"],
    isolationCapability: "unavailable",
  });

  assert.equal(result.ok, true);
  assert.equal(result.isolationReported, "unavailable");
  assert.notEqual(result.isolationReported, "enforced");
});

test("executeWorkOrder: handles abort signal and returns recovery descriptor", async (t) => {
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "k6a-exec-abort-"));
  t.after(() => fs.rmSync(baseDir, { recursive: true, force: true }));

  const ws = await createWorkspace({ baseDir, source_snapshot_id: DUMMY_SNAPSHOT_ID });
  t.after(() => disposeWorkspace(ws));

  const workOrder = {
    work_order_id: DUMMY_WORK_ORDER_ID,
    source_snapshot_id: DUMMY_SNAPSHOT_ID,
    allowed_paths: ["**"],
  };

  const controller = new AbortController();
  controller.abort();

  const result = await executeWorkOrder({
    workOrder,
    workspace: ws,
    command: process.execPath,
    args: ["-e", "console.log('aborted immediately');"],
    signal: controller.signal,
  });

  assert.equal(result.ok, false);
  assert.equal(result.interrupted, true);
  assert.ok(result.recovery);
  assert.equal(result.recovery.status, "interrupted");
  assert.equal(ws.status, "interrupted");
});

test("executeWorkOrder: fails pre-flight if declaredTargets violates containment", async (t) => {
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "k6a-exec-preflight-"));
  t.after(() => fs.rmSync(baseDir, { recursive: true, force: true }));

  const ws = await createWorkspace({ baseDir, source_snapshot_id: DUMMY_SNAPSHOT_ID });
  t.after(() => disposeWorkspace(ws));

  const workOrder = {
    work_order_id: DUMMY_WORK_ORDER_ID,
    source_snapshot_id: DUMMY_SNAPSHOT_ID,
    allowed_paths: ["src/**"],
  };

  const result = await executeWorkOrder({
    workOrder,
    workspace: ws,
    command: process.execPath,
    declaredTargets: ["unauthorized/file.txt"],
  });

  assert.equal(result.ok, false);
  assert.ok(result.violation);
  assert.equal(result.violation.violation_type, "undeclared_write");
});

test("captureWorkResult: validates cryptographic binding against source WorkOrder", async () => {
  const workResult = await captureWorkResult({
    work_order_id: DUMMY_WORK_ORDER_ID,
    source_snapshot_id: DUMMY_SNAPSHOT_ID,
    patch: "--- a/src/app.js\n+++ b/src/app.js\n@@ -1 +1 @@\n-old\n+new\n",
    commands: [{ command: "node test.js", exit_code: 0, duration_ms: 50 }],
    logs: ["test passed"],
    exit_code: 0,
    filesystem_inventory: [{ path: "src/app.js", sha256: "sha256:4444444444444444444444444444444444444444444444444444444444444444", mode: 420 }],
    execution_usage: { wall_time_ms: 100 },
  });

  assert.ok(/^sha256:[a-f0-9]{64}$/.test(workResult.work_result_id));
  assert.equal(workResult.work_result_id, computeWorkResultId(workResult));

  const workOrder = {
    work_order_id: DUMMY_WORK_ORDER_ID,
    source_snapshot_id: DUMMY_SNAPSHOT_ID,
  };

  const binding = validateWorkResultBinding(workOrder, workResult);
  assert.equal(binding.ok, true);

  const mismatchedOrder = {
    work_order_id: "sha256:9999999999999999999999999999999999999999999999999999999999999999",
    source_snapshot_id: DUMMY_SNAPSHOT_ID,
  };
  const badBinding = validateWorkResultBinding(mismatchedOrder, workResult);
  assert.equal(badBinding.ok, false);

  const tamperedResult = { ...workResult, patch: "tampered diff" };
  const tamperedBinding = validateWorkResultBinding(workOrder, tamperedResult);
  assert.equal(tamperedBinding.ok, false);
});

test("recoverInterruptedExecution: preserves partial logs, modifies workspace status to interrupted", async (t) => {
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "k6a-exec-interrupt-"));
  t.after(() => fs.rmSync(baseDir, { recursive: true, force: true }));

  const ws = await createWorkspace({ baseDir, source_snapshot_id: DUMMY_SNAPSHOT_ID });
  t.after(() => disposeWorkspace(ws));

  fs.mkdirSync(path.join(ws.root_path, "partial"), { recursive: true });
  fs.writeFileSync(path.join(ws.root_path, "partial", "temp.txt"), "in-flight data");

  const workOrder = {
    work_order_id: DUMMY_WORK_ORDER_ID,
    source_snapshot_id: DUMMY_SNAPSHOT_ID,
  };

  const recovery = await recoverInterruptedExecution({
    workspace: ws,
    workOrder,
    partialLogs: ["stderr: Timeout exceeded after 5000ms"],
    reason: "timeout",
  });

  assert.equal(recovery.status, "interrupted");
  assert.equal(recovery.reason, "timeout");
  assert.equal(ws.status, "interrupted");
  assert.ok(recovery.partial_logs.some((l) => l.includes("Timeout exceeded")));
  assert.ok(recovery.modified_inventory.some((f) => f.path === "partial/temp.txt"));
});

test("executeWorkOrder: halts fail-closed on post-flight containment violation", async (t) => {
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "k6a-exec-viol-"));
  t.after(() => fs.rmSync(baseDir, { recursive: true, force: true }));

  const ws = await createWorkspace({ baseDir, source_snapshot_id: DUMMY_SNAPSHOT_ID });
  t.after(() => disposeWorkspace(ws));

  const workOrder = {
    work_order_id: DUMMY_WORK_ORDER_ID,
    source_snapshot_id: DUMMY_SNAPSHOT_ID,
    allowed_paths: ["src/**"], // Only src/** is allowed
  };

  const result = await executeWorkOrder({
    workOrder,
    workspace: ws,
    command: process.execPath,
    args: ["-e", "const fs = require('fs'); fs.mkdirSync('unauthorized', {recursive: true}); fs.writeFileSync('unauthorized/leak.txt', 'evil');"],
  });

  assert.equal(result.ok, false);
  assert.ok(result.violation, "Must emit containment violation");
  assert.equal(result.violation.violation_type, "undeclared_write");
  assert.equal(result.violation.attempted_path, "unauthorized/leak.txt");
});

test("executeWorkOrder: captures timeout when budget.wall_time_ms is exceeded", async (t) => {
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "k6a-exec-timeout-"));
  t.after(() => fs.rmSync(baseDir, { recursive: true, force: true }));

  const ws = await createWorkspace({ baseDir, source_snapshot_id: DUMMY_SNAPSHOT_ID });
  t.after(() => disposeWorkspace(ws));

  const workOrder = {
    work_order_id: DUMMY_WORK_ORDER_ID,
    source_snapshot_id: DUMMY_SNAPSHOT_ID,
    allowed_paths: ["**"],
  };

  const result = await executeWorkOrder({
    workOrder,
    workspace: ws,
    command: process.execPath,
    args: ["-e", "const start = Date.now(); while (Date.now() - start < 2000) {}"],
    budget: { wall_time_ms: 100 },
  });

  assert.equal(result.ok, false);
  assert.equal(result.interrupted, true);
  assert.ok(result.recovery);
  assert.equal(result.recovery.reason, "timeout");
  assert.equal(ws.status, "interrupted");
});

test("executeWorkOrder: logs spawn error when binary does not exist", async (t) => {
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "k6a-exec-enoent-"));
  t.after(() => fs.rmSync(baseDir, { recursive: true, force: true }));

  const ws = await createWorkspace({ baseDir, source_snapshot_id: DUMMY_SNAPSHOT_ID });
  t.after(() => disposeWorkspace(ws));

  const workOrder = {
    work_order_id: DUMMY_WORK_ORDER_ID,
    source_snapshot_id: DUMMY_SNAPSHOT_ID,
    allowed_paths: ["**"],
  };

  const result = await executeWorkOrder({
    workOrder,
    workspace: ws,
    command: "non_existent_binary_xyz_123",
    args: [],
  });

  assert.equal(result.ok, false);
  assert.ok(result.workResult);
  assert.equal(result.workResult.exit_code, 1);
  assert.ok(result.workResult.logs.some((l) => l.includes("error:") || l.includes("non_existent")));
});

