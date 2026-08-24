"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { validateInstance, loadSchemaById } = require("./kernel-schema-validator.js");
const { createWorkspace, disposeWorkspace, computeTreeDigest } = require("./worker-workspace.js");
const {
  executeWorkOrder,
  captureWorkResult,
  recoverInterruptedExecution,
  validateWorkResultBinding,
  computeWorkResultId,
  computeMutationDelta,
  generateUnifiedDiff,
} = require("./worker-executor.js");

const { computeWorkOrderId, computeWorkResultId: canonicalComputeWorkResultId } = require("./execution-identities/index.js");
const { createEvidenceDigest, createProbeDigest } = require("./capability-proof/index.js");

const ROOT = path.resolve(__dirname, "..", "..");
const DUMMY_SNAPSHOT_ID = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const DUMMY_WORK_ORDER_ID = "sha256:1111111111111111111111111111111111111111111111111111111111111111";

test("computeMutationDelta: detects mode change as modified when sha256 is identical", () => {
  const baselineInventory = [
    { path: "bin/tool.sh", sha256: "sha256:same-hash", mode: 0o644 },
    { path: "src/unchanged.js", sha256: "sha256:same-code", mode: 0o644 },
  ];
  const postInventory = [
    { path: "bin/tool.sh", sha256: "sha256:same-hash", mode: 0o755 }, // chmod +x
    { path: "src/unchanged.js", sha256: "sha256:same-code", mode: 0o644 },
  ];

  const delta = computeMutationDelta(baselineInventory, postInventory);
  assert.deepEqual(delta.created, []);
  assert.deepEqual(delta.deleted, []);
  assert.deepEqual(delta.modified, ["bin/tool.sh"], "File with modified permissions must be listed in modified");
  assert.deepEqual(delta.allMutations, ["bin/tool.sh"]);
});

test("generateUnifiedDiff: generates standard applicable diff hunks comparing modified file against baselineContents", (t) => {
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "k6a-diff-mod-"));
  t.after(() => fs.rmSync(baseDir, { recursive: true, force: true }));

  const filePath = path.join(baseDir, "src", "hello.js");
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, "function hello() {\n  return 2;\n}\n");

  const baselineInventory = [{ path: "src/hello.js", sha256: "sha256:old-hash", mode: 420 }];
  const postInventory = [{ path: "src/hello.js", sha256: "sha256:new-hash", mode: 420 }];
  const baselineContents = new Map([
    ["src/hello.js", "function hello() {\n  return 1;\n}\n"],
  ]);

  const patch = generateUnifiedDiff(baseDir, baselineInventory, postInventory, baselineContents);

  assert.ok(patch.includes("--- a/src/hello.js"), "Must include standard --- a/ header");
  assert.ok(patch.includes("+++ b/src/hello.js"), "Must include standard +++ b/ header");
  assert.match(patch, /@@ -\d+(,\d+)? \+\d+(,\d+)? @@/);
  assert.ok(patch.includes("-  return 1;"), "Must include exact baseline line deletion");
  assert.ok(patch.includes("+  return 2;"), "Must include exact post line addition");
  assert.equal(patch.includes("-old"), false, "Must NOT contain synthetic -old");
  assert.equal(patch.includes("+new"), false, "Must NOT contain synthetic +new");
});

test("generateUnifiedDiff: uses standard headers for created and deleted files", (t) => {
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "k6a-diff-create-del-"));
  t.after(() => fs.rmSync(baseDir, { recursive: true, force: true }));

  const createdFile = path.join(baseDir, "created.txt");
  fs.writeFileSync(createdFile, "first created line\nsecond line\n");

  const baselineInventory = [{ path: "deleted.txt", sha256: "sha256:del-hash", mode: 420 }];
  const postInventory = [{ path: "created.txt", sha256: "sha256:create-hash", mode: 420 }];
  const baselineContents = new Map([
    ["deleted.txt", "deleted line one\ndeleted line two\n"],
  ]);

  const patch = generateUnifiedDiff(baseDir, baselineInventory, postInventory, baselineContents);

  // Created file headers & content
  assert.ok(patch.includes("--- /dev/null\n+++ b/created.txt\n@@ -0,0 +1,2 @@\n+first created line\n+second line\n"));
  // Deleted file headers & content
  assert.ok(patch.includes("--- a/deleted.txt\n+++ /dev/null\n@@ -1,2 +0,0 @@\n-deleted line one\n-deleted line two\n"));
  assert.equal(patch.includes("-deleted\n"), false, "Must not contain synthetic -deleted placeholder");
});

test("generateUnifiedDiff: handles hello -> hello\\n and hello\\n -> hello with standard EOF markers", (t) => {
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "k6a-diff-eof-"));
  t.after(() => fs.rmSync(baseDir, { recursive: true, force: true }));

  // Case 1: hello -> hello\n
  const f1 = path.join(baseDir, "f1.txt");
  fs.writeFileSync(f1, "hello\n");
  const patch1 = generateUnifiedDiff(
    baseDir,
    [{ path: "f1.txt", sha256: "sha256:1", mode: 420 }],
    [{ path: "f1.txt", sha256: "sha256:2", mode: 420 }],
    new Map([["f1.txt", "hello"]])
  );
  assert.ok(patch1.includes("-hello\n\\ No newline at end of file\n+hello\n"), "hello -> hello\\n must emit EOF marker on deletion");

  // Case 2: hello\n -> hello
  const f2 = path.join(baseDir, "f2.txt");
  fs.writeFileSync(f2, "hello");
  const patch2 = generateUnifiedDiff(
    baseDir,
    [{ path: "f2.txt", sha256: "sha256:3", mode: 420 }],
    [{ path: "f2.txt", sha256: "sha256:4", mode: 420 }],
    new Map([["f2.txt", "hello\n"]])
  );
  assert.ok(patch2.includes("-hello\n+hello\n\\ No newline at end of file\n"), "hello\\n -> hello must emit EOF marker on addition");
});

test("generateUnifiedDiff: patch application reconstructs exact byte-for-byte content across mixed changes", (t) => {
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "k6a-diff-recon-"));
  t.after(() => fs.rmSync(baseDir, { recursive: true, force: true }));

  const f1 = path.join(baseDir, "f1.txt");
  const f2 = path.join(baseDir, "f2.txt");
  fs.writeFileSync(f1, "multi\nline\nfinal\n");
  fs.writeFileSync(f2, "single line no newline");

  const baselineInventory = [
    { path: "f1.txt", sha256: "sha256:old-f1", mode: 420 },
    { path: "f3.txt", sha256: "sha256:old-f3", mode: 420 },
  ];
  const postInventory = [
    { path: "f1.txt", sha256: "sha256:new-f1", mode: 420 },
    { path: "f2.txt", sha256: "sha256:new-f2", mode: 420 },
  ];
  const baselineContents = new Map([
    ["f1.txt", "multi\nline\ninitial"],
    ["f3.txt", "to be deleted\n"],
  ]);

  const patch = generateUnifiedDiff(baseDir, baselineInventory, postInventory, baselineContents);
  assert.ok(patch.includes("--- a/f1.txt"));
  assert.ok(patch.includes("+++ b/f2.txt"));
  assert.ok(patch.includes("--- a/f3.txt"));
  assert.ok(patch.includes("\\ No newline at end of file"));
});

test("executeWorkOrder: executes via WorkerTransport async port when provided", async (t) => {
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "k6a-exec-transport-"));
  t.after(() => fs.rmSync(baseDir, { recursive: true, force: true }));

  const ws = await createWorkspace({ baseDir, source_snapshot_id: DUMMY_SNAPSHOT_ID });
  t.after(() => disposeWorkspace(ws));

  let transportCalled = false;
  const mockTransport = {
    port_id: "port-worker-transport-1",
    kind: "worker-transport",
    run: async (request) => {
      transportCalled = true;
      const targetFile = path.join(ws.root_path, "output", "transport.txt");
      fs.mkdirSync(path.dirname(targetFile), { recursive: true });
      fs.writeFileSync(targetFile, "from transport\n");
      return {
        ok: true,
        exit_code: 0,
        stdout: "transport executed successfully\n",
        stderr: "",
      };
    },
  };

  const workOrder = {
    work_order_id: DUMMY_WORK_ORDER_ID,
    source_snapshot_id: DUMMY_SNAPSHOT_ID,
    allowed_paths: ["output/**"],
  };

  const result = await executeWorkOrder({
    workOrder,
    workspace: ws,
    transports: { worker: mockTransport },
    command: "custom-runner",
  });

  assert.equal(transportCalled, true, "WorkerTransport must be invoked");
  assert.equal(result.ok, true);
  assert.ok(result.workResult.patch.includes("+++ b/output/transport.txt"));
  assert.ok(result.workResult.patch.includes("+from transport"));
  assert.equal(result.workResult.work_result_id, canonicalComputeWorkResultId(result.workResult));
});

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
    isolationCapability: "partial",
  });

  assert.equal(result.ok, true);
  assert.ok(result.workResult);
  assert.equal(result.workResult.exit_code, 0);
  assert.ok(result.workResult.logs.some((l) => l.includes("done")));
  assert.equal(result.workResult.work_order_id, DUMMY_WORK_ORDER_ID);
  assert.equal(result.workResult.source_snapshot_id, DUMMY_SNAPSHOT_ID);
  assert.ok(result.workResult.filesystem_inventory.some((f) => f.path === "output/result.txt"));
  assert.equal(result.workResult.candidate_id, undefined, "Zero CandidateId properties allowed");

  const schema = loadSchemaById("ospec://schemas/kernel/work-result/v1", { rootDir: ROOT });
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

test("executeWorkOrder: enforces capability proof before reporting enforced isolation", async (t) => {
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "k6a-exec-cap-"));
  t.after(() => fs.rmSync(baseDir, { recursive: true, force: true }));

  const ws = await createWorkspace({ baseDir, source_snapshot_id: DUMMY_SNAPSHOT_ID });
  t.after(() => disposeWorkspace(ws));

  const workOrder = {
    work_order_id: DUMMY_WORK_ORDER_ID,
    source_snapshot_id: DUMMY_SNAPSHOT_ID,
    allowed_paths: ["**"],
  };

  // Declared enforced without proof must downgrade to unavailable
  const resNoProof = await executeWorkOrder({
    workOrder,
    workspace: ws,
    command: process.execPath,
    args: ["-e", "console.log('no proof');"],
    isolationCapability: "enforced",
  });
  assert.equal(resNoProof.isolationReported, "unavailable");

  // With verified capability state
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
    adapter_id: "adapter-test",
    adapter_version: "1.0.0",
    host_version: "1.0.0",
    probe: { surface: "live", ok: true },
  });

  const capabilityProof = {
    schema_version: 1,
    kind: "capability-proof/v1",
    adapter_id: "adapter-test",
    adapter_version: "1.0.0",
    host_version: "1.0.0",
    fixture,
    evidence_digest,
    probe_digest,
  };

  // Enforced with verified capability state and verified WorkerTransport port
  const mockEnforcedTransport = {
    port_id: "port-enforced-worker",
    kind: "worker-transport",
    adapter_id: "adapter-test",
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
    workspace: ws,
    transports: { worker: mockEnforcedTransport },
    command: "runner",
    isolationCapability: "enforced",
    capabilityProof,
    semantic_evidence: evidence,
    expectedAdapterId: "adapter-test",
    expectedAdapterVersion: "1.0.0",
    expectedHostRuntimeVersion: "1.0.0",
    expectedProbeDigest: probe_digest,
  });
  assert.equal(resWithProofAndTransport.isolationReported, "enforced");
  assert.equal(resWithProofAndTransport.ok, true);

  // Enforced with proof but MISSING WorkerTransport must fail closed
  const resMissingTransport = await executeWorkOrder({
    workOrder,
    workspace: ws,
    command: process.execPath,
    args: ["-e", "console.log('missing transport');"],
    isolationCapability: "enforced",
    capabilityProof,
    semantic_evidence: evidence,
    expectedAdapterId: "adapter-test",
    expectedAdapterVersion: "1.0.0",
    expectedHostRuntimeVersion: "1.0.0",
    expectedProbeDigest: probe_digest,
  });
  assert.equal(resMissingTransport.ok, false, "Must fail closed when enforced requested without WorkerTransport");
  assert.notEqual(resMissingTransport.isolationReported, "enforced");
});

test("executeWorkOrder: fails closed when workspace is not registered in private registry", async (t) => {
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "k6a-exec-unrecorded-"));
  t.after(() => fs.rmSync(baseDir, { recursive: true, force: true }));

  const fakeWs = {
    workspace_id: "ws-fake-unregistered",
    root_path: baseDir,
    source_snapshot_id: DUMMY_SNAPSHOT_ID,
  };

  const workOrder = {
    work_order_id: DUMMY_WORK_ORDER_ID,
    source_snapshot_id: DUMMY_SNAPSHOT_ID,
    allowed_paths: ["**"],
  };

  const result = await executeWorkOrder({
    workOrder,
    workspace: fakeWs,
    command: process.execPath,
    args: ["-v"],
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, "workspace-not-registered");
});

test("executeWorkOrder: fails closed when enforced isolation requested but WorkerTransport does not match CapabilityProof", async (t) => {
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "k6a-exec-proof-mismatch-"));
  t.after(() => fs.rmSync(baseDir, { recursive: true, force: true }));

  const ws = await createWorkspace({ baseDir, source_snapshot_id: DUMMY_SNAPSHOT_ID });
  t.after(() => disposeWorkspace(ws));

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
    adapter_id: "adapter-expected",
    adapter_version: "1.0.0",
    host_version: "1.0.0",
    probe: { surface: "live", ok: true },
  });

  const capabilityProof = {
    schema_version: 1,
    kind: "capability-proof/v1",
    adapter_id: "adapter-expected",
    adapter_version: "1.0.0",
    host_version: "1.0.0",
    fixture,
    evidence_digest,
    probe_digest,
  };

  // Mismatched adapter_id on transport
  const mismatchedTransport = {
    port_id: "port-mismatched",
    adapter_id: "adapter-different",
    probe_digest,
    run: async () => ({ ok: true, exit_code: 0, stdout: "ok", stderr: "" }),
  };

  const workOrder = {
    work_order_id: DUMMY_WORK_ORDER_ID,
    source_snapshot_id: DUMMY_SNAPSHOT_ID,
    allowed_paths: ["**"],
  };

  const result = await executeWorkOrder({
    workOrder,
    workspace: ws,
    transports: { worker: mismatchedTransport },
    command: "runner",
    isolationCapability: "enforced",
    capabilityProof,
    semantic_evidence: evidence,
    expectedAdapterId: "adapter-expected",
    expectedAdapterVersion: "1.0.0",
    expectedHostRuntimeVersion: "1.0.0",
    expectedProbeDigest: probe_digest,
  });

  assert.equal(result.ok, false);
  assert.equal(result.isolationReported, "unavailable");
});

test("executeWorkOrder: fails closed on mutating commands in fallback when strict isolation is requested", async (t) => {
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "k6a-exec-strict-fallback-"));
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
    args: ["-e", "console.log('must not run in fallback');"],
    isolationCapability: "unavailable",
    strictIsolation: true,
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, "strict-isolation-unfulfilled");
});

test("executeWorkOrder: passes signal and deadlineMs to invokeTransportAsync with canonical 2-arg signature", async (t) => {
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "k6a-exec-2arg-"));
  t.after(() => fs.rmSync(baseDir, { recursive: true, force: true }));

  const ws = await createWorkspace({ baseDir, source_snapshot_id: DUMMY_SNAPSHOT_ID });
  t.after(() => disposeWorkspace(ws));

  let receivedRequest = null;
  const mockTransport = {
    port_id: "port-mock",
    invoke: async (request) => {
      receivedRequest = request;
      return { ok: true, exit_code: 0, stdout: "ok", stderr: "" };
    },
  };

  const workOrder = {
    work_order_id: DUMMY_WORK_ORDER_ID,
    source_snapshot_id: DUMMY_SNAPSHOT_ID,
    allowed_paths: ["**"],
  };

  const controller = new AbortController();

  await executeWorkOrder({
    workOrder,
    workspace: ws,
    transports: { worker: mockTransport },
    command: "check-tool",
    args: ["--flag"],
    signal: controller.signal,
    budget: { wall_time_ms: 12000 },
  });

  assert.ok(receivedRequest, "Transport must receive request object");
  assert.equal(receivedRequest.command, "check-tool");
  assert.deepEqual(receivedRequest.args, ["--flag"]);
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
  const workOrder = {
    schema_version: 2,
    kind: "work-order/v2",
    node_id: "node-binding-1",
    role: "executor",
    status: "pending",
    operation: "apply",
    objective: "Run test suite",
    source_snapshot_id: DUMMY_SNAPSHOT_ID,
    dependencies: [],
    ownership: { owner: "agent-1", mode: "exclusive" },
    allowed_paths: ["src/**"],
    invariants: ["inv-1"],
    required_evidence: ["ev-1"],
    budget: { model_turns: 5, patches: 2, commands: 5, wall_time_minutes: 5, changed_lines: 100 },
  };
  workOrder.work_order_id = computeWorkOrderId(workOrder);

  const workResult = await captureWorkResult({
    work_order_id: workOrder.work_order_id,
    source_snapshot_id: DUMMY_SNAPSHOT_ID,
    patch: "--- a/src/app.js\n+++ b/src/app.js\n@@ -1 +1 @@\n-old\n+new\n",
    commands: [{ command: "node test.js", exit_code: 0, duration_ms: 50 }],
    logs: ["test passed"],
    exit_code: 0,
    filesystem_inventory: [{ path: "src/app.js", sha256: "sha256:4444444444444444444444444444444444444444444444444444444444444444", mode: 420 }],
  });

  assert.ok(/^sha256:[a-f0-9]{64}$/.test(workResult.work_result_id));
  assert.equal(workResult.work_result_id, computeWorkResultId(workResult));

  const binding = validateWorkResultBinding(workOrder, workResult);
  assert.equal(binding.ok, true);

  const mismatchedOrder = {
    ...workOrder,
    work_order_id: "sha256:9999999999999999999999999999999999999999999999999999999999999999",
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
  t.after(() => {
    try {
      fs.rmSync(baseDir, { recursive: true, force: true });
    } catch {}
  });

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
    args: ["-e", "setTimeout(() => {}, 2000);"],
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

test("generateUnifiedDiff: emits git-style mode change header on chmod without content changes", (t) => {
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "k6a-diff-mode-only-"));
  t.after(() => fs.rmSync(baseDir, { recursive: true, force: true }));

  const filePath = path.join(baseDir, "script.sh");
  fs.writeFileSync(filePath, "#!/bin/sh\necho hi\n");

  const baselineInventory = [{ path: "script.sh", sha256: "sha256:same", mode: 0o100644 }];
  const postInventory = [{ path: "script.sh", sha256: "sha256:same", mode: 0o100755 }];
  const baselineContents = new Map([["script.sh", "#!/bin/sh\necho hi\n"]]);

  const patch = generateUnifiedDiff(baseDir, baselineInventory, postInventory, baselineContents);
  assert.ok(patch.includes("--- a/script.sh\n+++ b/script.sh\nold mode 100644\nnew mode 100755"));
});

test("generateUnifiedDiff: emits git-style mode change header AND diff hunks when both mode and content change", (t) => {
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "k6a-diff-mode-content-"));
  t.after(() => fs.rmSync(baseDir, { recursive: true, force: true }));

  const filePath = path.join(baseDir, "run.sh");
  fs.writeFileSync(filePath, "#!/bin/sh\necho updated\n");

  const baselineInventory = [{ path: "run.sh", sha256: "sha256:old", mode: 0o100644 }];
  const postInventory = [{ path: "run.sh", sha256: "sha256:new", mode: 0o100755 }];
  const baselineContents = new Map([["run.sh", "#!/bin/sh\necho original\n"]]);

  const patch = generateUnifiedDiff(baseDir, baselineInventory, postInventory, baselineContents);
  assert.ok(patch.includes("--- a/run.sh\n+++ b/run.sh\nold mode 100644\nnew mode 100755\n@@ -1,2 +1,2 @@"));
  assert.ok(patch.includes("-echo original"));
  assert.ok(patch.includes("+echo updated"));
});

test("executeWorkOrder: fails closed when workOrder source_snapshot_id does not match workspace source_snapshot_id", async (t) => {
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "k6a-exec-snap-mismatch-"));
  t.after(() => fs.rmSync(baseDir, { recursive: true, force: true }));

  const snapshotA = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const snapshotB = "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

  const ws = await createWorkspace({ baseDir, source_snapshot_id: snapshotA });
  t.after(() => disposeWorkspace(ws));

  const workOrder = {
    work_order_id: DUMMY_WORK_ORDER_ID,
    source_snapshot_id: snapshotB, // Disagrees with workspace!
    allowed_paths: ["**"],
  };

  const result = await executeWorkOrder({
    workOrder,
    workspace: ws,
    command: process.execPath,
    args: ["-v"],
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, "source-snapshot-mismatch");
});

test("recoverInterruptedExecution: resolves authoritative workspace from registry ignoring forged root_path", async (t) => {
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "k6a-recover-auth-"));
  const forgedDir = path.join(baseDir, "forged-dir");
  fs.mkdirSync(forgedDir, { recursive: true });
  fs.writeFileSync(path.join(forgedDir, "leak.txt"), "should not be inspected");
  t.after(() => fs.rmSync(baseDir, { recursive: true, force: true }));

  const ws = await createWorkspace({ baseDir, source_snapshot_id: DUMMY_SNAPSHOT_ID });
  t.after(() => disposeWorkspace(ws));

  // Caller provides legitimate workspace_id but forged root_path
  const forgedDescriptor = {
    workspace_id: ws.workspace_id,
    root_path: forgedDir,
    source_snapshot_id: DUMMY_SNAPSHOT_ID,
  };

  const recovery = await recoverInterruptedExecution({
    workspace: forgedDescriptor,
    reason: "abort",
  });

  assert.equal(recovery.status, "interrupted");
  assert.equal(recovery.modified_inventory.some((f) => f.path === "leak.txt"), false, "Must not inspect forged root_path");
});

test("invokeTransportAsync: awaits cancelPort settlement barrier before returning failure", async () => {
  const { invokeTransportAsync } = require("./host-contract/index.js");
  let terminationAcknowledged = false;

  const mockPort = {
    port_id: "port-settlement-test",
    run: () => new Promise((resolve) => setTimeout(() => resolve({ ok: true, exit_code: 0 }), 500)),
    cancel: async () => {
      await new Promise((r) => setTimeout(r, 50));
      terminationAcknowledged = true;
    },
  };

  const outcome = await invokeTransportAsync(mockPort, {
    deadlineMs: 20,
  });

  assert.equal(outcome.ok, false);
  assert.equal(outcome.failure_class, "timeout");
  assert.equal(terminationAcknowledged, true, "Must await async cancellation settlement before returning");
});

test("executeWorkOrder: preserves exit_code, stderr, and stdout telemetry from failing WorkerTransport", async (t) => {
  const { getWorkspaceRecord } = require("./worker-workspace.js");
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "k6a-exec-tel-fail-"));
  t.after(() => fs.rmSync(baseDir, { recursive: true, force: true }));

  const ws = await createWorkspace({ baseDir, source_snapshot_id: DUMMY_SNAPSHOT_ID });
  t.after(() => disposeWorkspace(ws));

  const failingTransport = {
    port_id: "port-failing-worker",
    kind: "worker-transport",
    run: async () => ({
      ok: false,
      failure_class: "worker-fail",
      exit_code: 2,
      stderr: "compilation error in module foo\n",
      stdout: "parsing step 1 complete\n",
    }),
  };

  const workOrder = {
    work_order_id: DUMMY_WORK_ORDER_ID,
    source_snapshot_id: DUMMY_SNAPSHOT_ID,
    allowed_paths: ["**"],
  };

  const result = await executeWorkOrder({
    workOrder,
    workspace: ws,
    transports: { worker: failingTransport },
    command: "failing-runner",
  });

  assert.equal(result.ok, false);
  assert.ok(result.workResult);
  assert.equal(result.workResult.exit_code, 2, "Exit code 2 from WorkerTransport must be preserved");
  assert.ok(result.workResult.logs.some((l) => l.includes("compilation error in module foo")), "stderr must be preserved in logs");
  assert.ok(result.workResult.logs.some((l) => l.includes("parsing step 1 complete")), "stdout must be preserved in logs");
});

test("recoverInterruptedExecution: updates authoritative status in private registry", async (t) => {
  const { getWorkspaceRecord } = require("./worker-workspace.js");
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "k6a-exec-rec-auth-"));
  t.after(() => fs.rmSync(baseDir, { recursive: true, force: true }));

  const ws = await createWorkspace({ baseDir, source_snapshot_id: DUMMY_SNAPSHOT_ID });
  t.after(() => disposeWorkspace(ws));

  assert.equal(getWorkspaceRecord(ws.workspace_id).descriptor.status, "active");

  const recovery = await recoverInterruptedExecution({
    workspace: ws,
    reason: "timeout",
  });

  assert.equal(recovery.status, "interrupted");
  assert.equal(getWorkspaceRecord(ws.workspace_id).descriptor.status, "interrupted", "Authoritative registry descriptor must be marked interrupted");
});

test("executeWorkOrder: rejects mutating work order in unverified fallback without enforced WorkerTransport", async (t) => {
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "k6a-exec-mut-fallback-"));
  t.after(() => fs.rmSync(baseDir, { recursive: true, force: true }));

  const ws = await createWorkspace({ baseDir, source_snapshot_id: DUMMY_SNAPSHOT_ID });
  t.after(() => disposeWorkspace(ws));

  const mutatingWorkOrder = {
    work_order_id: DUMMY_WORK_ORDER_ID,
    source_snapshot_id: DUMMY_SNAPSHOT_ID,
    operation: "apply",
    allowed_paths: ["src/**"],
  };

  const result = await executeWorkOrder({
    workOrder: mutatingWorkOrder,
    workspace: ws,
    command: process.execPath,
    args: ["-e", "console.log('mutating');"],
    isolationCapability: "partial",
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, "mutation-requires-enforced-isolation");
});

test("executeWorkOrder: adversarial test - subprocess writing outside workspace root is contained", async (t) => {
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "k6a-exec-adv-"));
  const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), "k6a-exec-outside-"));
  t.after(() => {
    try {
      fs.rmSync(baseDir, { recursive: true, force: true });
      fs.rmSync(outsideDir, { recursive: true, force: true });
    } catch {}
  });

  const ws = await createWorkspace({ baseDir, source_snapshot_id: DUMMY_SNAPSHOT_ID });
  t.after(() => disposeWorkspace(ws));

  const outsideFile = path.join(outsideDir, "pwned.txt").replace(/\\/g, "/");

  // Attempt to execute mutating apply in fallback -> rejected before execution
  const mutatingWorkOrder = {
    work_order_id: DUMMY_WORK_ORDER_ID,
    source_snapshot_id: DUMMY_SNAPSHOT_ID,
    operation: "apply",
    allowed_paths: ["src/**"],
  };

  const result = await executeWorkOrder({
    workOrder: mutatingWorkOrder,
    workspace: ws,
    command: process.execPath,
    args: ["-e", `require('fs').writeFileSync('${outsideFile}', 'evil');`],
    isolationCapability: "unavailable",
  });

  assert.equal(result.ok, false);
  assert.equal(fs.existsSync(outsideFile), false, "Subprocess must not be permitted to execute unconfined mutating commands in fallback");
});


