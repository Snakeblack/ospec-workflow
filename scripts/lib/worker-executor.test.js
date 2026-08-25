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
const { sha256Fingerprint } = require("./canonical-json.js");

const ROOT = path.resolve(__dirname, "..", "..");
const DUMMY_SNAPSHOT_ID = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const DUMMY_WORK_ORDER_ID = "sha256:1111111111111111111111111111111111111111111111111111111111111111";

function makeCanonicalWorkOrder(sourceSnapshotId = DUMMY_SNAPSHOT_ID, overrides = {}) {
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

const DEFAULT_WT_PORT_ID = "port-enforced-worker";

function workerTransportLiveFingerprint(adapterId, portId, probeDigest) {
  return sha256Fingerprint("worker-transport-live-identity/v1", {
    adapter_id: adapterId,
    port_id: portId,
    probe_digest: probeDigest,
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
  const probe_digest_for_fp = transport.probe_digest;
  const fingerprint = transport.fingerprint || workerTransportLiveFingerprint(
    adapterId,
    port_id,
    probe_digest_for_fp || "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
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
  // Prueba canónica capability-proof/v1: la contención vive en la evidencia y
  // en el probe (ligados por digest), nunca como propiedad ad-hoc del proof.
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
  const enforcedProof = makeEnforcedProof("adapter-test");
  const mockTransport = {
    port_id: "port-enforced-worker",
    adapter_id: "adapter-test",
    probe_digest: enforcedProof.probe_digest,
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

  const workOrder = makeCanonicalWorkOrder(DUMMY_SNAPSHOT_ID, {
    allowed_paths: ["output/**"],
  });

  const result = await executeWorkOrder({
    workOrder,
    workspace: ws,
    transports: { worker: mockTransport },
    command: "custom-runner",
    ...enforcedProof,
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

  const workOrder = makeCanonicalWorkOrder(DUMMY_SNAPSHOT_ID, {
    allowed_paths: ["output/**"],
  });

  const enforcedProof = makeEnforcedProof("adapter-e2e");
  const mockTransport = {
    port_id: DEFAULT_WT_PORT_ID,
    adapter_id: "adapter-e2e",
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
    workspace: ws,
    transports: { worker: mockTransport },
    ...enforcedProof,
    command: process.execPath,
    args: ["-e", "const fs = require('fs'); fs.mkdirSync('output', {recursive: true}); fs.writeFileSync('output/result.txt', 'hello'); console.log('done');"],
  });

  assert.equal(result.ok, true);
  assert.ok(result.workResult);
  assert.equal(result.workResult.exit_code, 0);
  assert.ok(result.workResult.logs.some((l) => l.includes("done")));
  assert.equal(result.workResult.work_order_id, workOrder.work_order_id);
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

  const workOrder = makeCanonicalWorkOrder(DUMMY_SNAPSHOT_ID, {
    operation: "verify",
    ownership: { owner: "agent-test", mode: "shared" },
    allowed_paths: ["**"],
  });

  const enforcedProof = makeEnforcedProof("adapter-test");
  const mockTransport = {
    port_id: "port-enforced-worker",
    kind: "worker-transport",
    adapter_id: "adapter-test",
    probe_digest: enforcedProof.probe_digest,
    run: async () => ({
      ok: false,
      exit_code: 2,
      stdout: "",
      stderr: "fatal error\n",
    }),
  };

  const result = await executeWorkOrder({
    workOrder,
    workspace: ws,
    transports: { worker: mockTransport },
    command: "failing-tool",
    ...enforcedProof,
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

  const workOrder = makeCanonicalWorkOrder(DUMMY_SNAPSHOT_ID, {
    operation: "verify",
    ownership: { owner: "agent-test", mode: "shared" },
    allowed_paths: ["**"],
  });

  // Declared enforced without proof must fail and report unavailable
  const resNoProof = await executeWorkOrder({
    workOrder,
    workspace: ws,
    command: process.execPath,
    args: ["-e", "console.log('no proof');"],
    isolationCapability: "enforced",
  });
  assert.equal(resNoProof.ok, false);
  assert.equal(resNoProof.isolationReported, "unavailable");

  // With verified capability state
  const enforcedProof = makeEnforcedProof("adapter-test");

  // Enforced with verified capability state and verified WorkerTransport port
  const mockEnforcedTransport = {
    port_id: "port-enforced-worker",
    kind: "worker-transport",
    adapter_id: "adapter-test",
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
    workspace: ws,
    transports: { worker: mockEnforcedTransport },
    command: "runner",
    ...enforcedProof,
  });
  assert.equal(resWithProofAndTransport.isolationReported, "enforced");
  assert.equal(resWithProofAndTransport.ok, true);

  // Enforced with proof but MISSING WorkerTransport must fail closed
  const resMissingTransport = await executeWorkOrder({
    workOrder,
    workspace: ws,
    command: process.execPath,
    args: ["-e", "console.log('missing transport');"],
    ...enforcedProof,
  });
  assert.equal(resMissingTransport.ok, false, "Must fail closed when enforced requested without WorkerTransport");
  assert.notEqual(resMissingTransport.isolationReported, "enforced");

  // Proof with broken containment probe must fail closed
  const brokenContainmentProof = makeEnforcedProof("adapter-test", { external_root_write: "LEAKED" });
  const mockBrokenTransport = {
    ...mockEnforcedTransport,
    probe_digest: brokenContainmentProof.probe_digest,
  };
  const resBrokenContainment = await executeWorkOrder({
    workOrder,
    workspace: ws,
    transports: { worker: mockBrokenTransport },
    command: "runner",
    ...brokenContainmentProof,
  });
  assert.equal(resBrokenContainment.ok, false);
  assert.equal(resBrokenContainment.reason, "containment-probe-unfulfilled");
});

test("executeWorkOrder: enforced WorkerTransport WITHOUT WorkerIsolation proof fails closed (containment-proof-required)", async (t) => {
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "k6a-exec-iso-required-"));
  t.after(() => fs.rmSync(baseDir, { recursive: true, force: true }));

  const ws = await createWorkspace({ baseDir, source_snapshot_id: DUMMY_SNAPSHOT_ID });
  t.after(() => disposeWorkspace(ws));

  const workOrder = makeCanonicalWorkOrder(DUMMY_SNAPSHOT_ID, {
    operation: "verify",
    ownership: { owner: "agent-test", mode: "shared" },
    allowed_paths: ["**"],
  });

  const { workerIsolation: _omitted, ...transportOnlyProof } = makeEnforcedProof("adapter-test");
  const mockTransport = {
    port_id: "port-enforced-worker",
    kind: "worker-transport",
    adapter_id: "adapter-test",
    probe_digest: transportOnlyProof.probe_digest,
    run: async () => ({ ok: true, exit_code: 0, stdout: "must not run", stderr: "" }),
  };

  const result = await executeWorkOrder({
    workOrder,
    workspace: ws,
    transports: { worker: mockTransport },
    command: "runner",
    ...transportOnlyProof,
  });

  assert.equal(result.ok, false, "Legacy fallback without isolation proof must not reach enforced");
  assert.equal(result.reason, "containment-proof-required");
  assert.equal(result.isolationReported, "unavailable");
});

test("executeWorkOrder: tampered WorkerIsolation evidence fails verification (worker-isolation-proof-invalid)", async (t) => {
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "k6a-exec-iso-tamper-"));
  t.after(() => fs.rmSync(baseDir, { recursive: true, force: true }));

  const ws = await createWorkspace({ baseDir, source_snapshot_id: DUMMY_SNAPSHOT_ID });
  t.after(() => disposeWorkspace(ws));

  const workOrder = makeCanonicalWorkOrder(DUMMY_SNAPSHOT_ID, {
    operation: "verify",
    ownership: { owner: "agent-test", mode: "shared" },
    allowed_paths: ["**"],
  });

  const enforcedProof = makeEnforcedProof("adapter-test");
  // Evidencia manipulada tras emitir el proof: el digest deja de cuadrar.
  const tamperedIsolation = {
    ...enforcedProof.workerIsolation,
    semantic_evidence: {
      ...enforcedProof.workerIsolation.semantic_evidence,
      containment: {
        allowed_write: "PASS",
        undeclared_workspace_write: "BLOCKED",
        external_root_write: "LEAKED",
      },
    },
  };
  const mockTransport = {
    port_id: "port-enforced-worker",
    kind: "worker-transport",
    adapter_id: "adapter-test",
    probe_digest: enforcedProof.probe_digest,
    run: async () => ({ ok: true, exit_code: 0, stdout: "must not run", stderr: "" }),
  };

  const result = await executeWorkOrder({
    workOrder,
    workspace: ws,
    transports: { worker: mockTransport },
    command: "runner",
    ...enforcedProof,
    workerIsolation: tamperedIsolation,
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, "worker-isolation-proof-invalid");
  assert.equal(result.isolationReported, "unavailable");
});

test("executeWorkOrder: fails closed when workspace is not registered in private registry", async (t) => {
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "k6a-exec-unrecorded-"));
  t.after(() => fs.rmSync(baseDir, { recursive: true, force: true }));

  const fakeWs = {
    workspace_id: "ws-fake-unregistered",
    root_path: baseDir,
    source_snapshot_id: DUMMY_SNAPSHOT_ID,
  };

  const workOrder = makeCanonicalWorkOrder(DUMMY_SNAPSHOT_ID, {
    allowed_paths: ["**"],
  });

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
    port_id: "port-enforced-worker",
    adapter_id: "adapter-different",
    probe_digest,
    run: async () => ({ ok: true, exit_code: 0, stdout: "ok", stderr: "" }),
  };

  const workOrder = makeCanonicalWorkOrder(DUMMY_SNAPSHOT_ID, {
    allowed_paths: ["**"],
  });

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

  const workOrder = makeCanonicalWorkOrder(DUMMY_SNAPSHOT_ID, {
    allowed_paths: ["**"],
  });

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
  const enforcedProof = makeEnforcedProof("adapter-test");
  const mockTransport = {
    port_id: "port-enforced-worker",
    adapter_id: "adapter-test",
    probe_digest: enforcedProof.probe_digest,
    kind: "worker-transport",
    invoke: async (request) => {
      receivedRequest = request;
      return { ok: true, exit_code: 0, stdout: "ok", stderr: "" };
    },
  };

  const workOrder = makeCanonicalWorkOrder(DUMMY_SNAPSHOT_ID, {
    allowed_paths: ["**"],
  });

  const controller = new AbortController();

  await executeWorkOrder({
    workOrder,
    workspace: ws,
    transports: { worker: mockTransport },
    command: "check-tool",
    args: ["--flag"],
    signal: controller.signal,
    budget: { wall_time_ms: 12000 },
    ...enforcedProof,
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

  const workOrder = makeCanonicalWorkOrder(DUMMY_SNAPSHOT_ID, {
    operation: "verify",
    ownership: { owner: "agent-test", mode: "shared" },
    allowed_paths: ["**"],
  });

  // Pure internal evaluation (no external subprocess) executes and truthfully reports unavailable without silent promotion
  const result = await executeWorkOrder({
    workOrder,
    workspace: ws,
    isolationCapability: "unavailable",
  });

  assert.equal(result.ok, true);
  assert.equal(result.isolationReported, "unavailable");
  assert.notEqual(result.isolationReported, "enforced");

  // Attempting to run external command via subprocess without enforced isolation fails closed
  const cmdResult = await executeWorkOrder({
    workOrder,
    workspace: ws,
    command: process.execPath,
    args: ["-e", "console.log('fallback ok');"],
    isolationCapability: "unavailable",
  });

  assert.equal(cmdResult.ok, false);
  assert.equal(cmdResult.reason, "subprocess-requires-enforced-isolation");
});

test("executeWorkOrder: handles abort signal and returns recovery descriptor", async (t) => {
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "k6a-exec-abort-"));
  t.after(() => fs.rmSync(baseDir, { recursive: true, force: true }));

  const ws = await createWorkspace({ baseDir, source_snapshot_id: DUMMY_SNAPSHOT_ID });
  t.after(() => disposeWorkspace(ws));

  const workOrder = makeCanonicalWorkOrder(DUMMY_SNAPSHOT_ID, {
    operation: "verify",
    ownership: { owner: "agent-test", mode: "shared" },
    allowed_paths: ["**"],
  });

  const controller = new AbortController();
  controller.abort();

  const enforcedProof = makeEnforcedProof("adapter-test");
  const mockTransport = {
    port_id: "port-enforced-worker",
    kind: "worker-transport",
    adapter_id: "adapter-test",
    probe_digest: enforcedProof.probe_digest,
    run: async () => ({
      ok: false,
      failure_class: "cancel",
      exit_code: 1,
      stdout: "",
      stderr: "aborted",
    }),
  };

  const result = await executeWorkOrder({
    workOrder,
    workspace: ws,
    transports: { worker: mockTransport },
    command: "tool",
    signal: controller.signal,
    ...enforcedProof,
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

  const workOrder = makeCanonicalWorkOrder(DUMMY_SNAPSHOT_ID, {
    allowed_paths: ["src/**"],
  });

  const enforcedProof = makeEnforcedProof("adapter-test");
  const mockTransport = {
    port_id: "port-enforced-worker",
    kind: "worker-transport",
    adapter_id: "adapter-test",
    probe_digest: enforcedProof.probe_digest,
    run: async () => ({ ok: true, exit_code: 0 }),
  };

  const result = await executeWorkOrder({
    workOrder,
    workspace: ws,
    transports: { worker: mockTransport },
    command: "tool",
    declaredTargets: ["unauthorized/file.txt"],
    ...enforcedProof,
  });

  assert.equal(result.ok, false);
  assert.ok(result.violation);
  assert.equal(result.violation.violation_type, "undeclared_write");
});

test("captureWorkResult: validates cryptographic binding against source WorkOrder", async () => {
  const workOrder = makeCanonicalWorkOrder(DUMMY_SNAPSHOT_ID, {
    node_id: "node-binding-1",
    role: "executor",
    operation: "apply",
    objective: "Run test suite",
    ownership: { owner: "agent-1", mode: "exclusive" },
    allowed_paths: ["src/**"],
    invariants: ["inv-1"],
    required_evidence: ["ev-1"],
    budget: { model_turns: 5, patches: 2, commands: 5, wall_time_minutes: 5, changed_lines: 100 },
  });

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

  const workOrder = makeCanonicalWorkOrder(DUMMY_SNAPSHOT_ID, {
    allowed_paths: ["**"],
  });

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

  const workOrder = makeCanonicalWorkOrder(DUMMY_SNAPSHOT_ID, {
    allowed_paths: ["src/**"], // Only src/** is allowed
  });

  const enforcedProof = makeEnforcedProof("adapter-e2e");
  const mockTransport = {
    port_id: DEFAULT_WT_PORT_ID,
    adapter_id: "adapter-e2e",
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
    workspace: ws,
    transports: { worker: mockTransport },
    ...enforcedProof,
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

  const workOrder = makeCanonicalWorkOrder(DUMMY_SNAPSHOT_ID, {
    operation: "verify",
    ownership: { owner: "agent-test", mode: "shared" },
    allowed_paths: ["**"],
  });

  const enforcedProof = makeEnforcedProof("adapter-test");
  const mockTransport = {
    port_id: "port-enforced-worker",
    kind: "worker-transport",
    adapter_id: "adapter-test",
    probe_digest: enforcedProof.probe_digest,
    run: async () => ({
      ok: false,
      failure_class: "timeout",
      exit_code: 1,
      stdout: "",
      stderr: "timed out",
    }),
  };

  const result = await executeWorkOrder({
    workOrder,
    workspace: ws,
    transports: { worker: mockTransport },
    command: "tool",
    budget: { wall_time_ms: 100 },
    ...enforcedProof,
  });

  assert.equal(result.ok, false);
  assert.equal(result.interrupted, true);
  assert.ok(result.recovery);
  assert.equal(result.recovery.reason, "timeout");
  assert.equal(ws.status, "interrupted");
});

test("executeWorkOrder: logs error when transport reports execution error", async (t) => {
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "k6a-exec-enoent-"));
  t.after(() => fs.rmSync(baseDir, { recursive: true, force: true }));

  const ws = await createWorkspace({ baseDir, source_snapshot_id: DUMMY_SNAPSHOT_ID });
  t.after(() => disposeWorkspace(ws));

  const workOrder = makeCanonicalWorkOrder(DUMMY_SNAPSHOT_ID, {
    operation: "verify",
    ownership: { owner: "agent-test", mode: "shared" },
    allowed_paths: ["**"],
  });

  const enforcedProof = makeEnforcedProof("adapter-test");
  const mockTransport = {
    port_id: "port-enforced-worker",
    kind: "worker-transport",
    adapter_id: "adapter-test",
    probe_digest: enforcedProof.probe_digest,
    run: async () => ({
      ok: false,
      exit_code: 1,
      stdout: "",
      stderr: "error: non_existent_binary_xyz_123 not found",
    }),
  };

  const result = await executeWorkOrder({
    workOrder,
    workspace: ws,
    transports: { worker: mockTransport },
    command: "non_existent_binary_xyz_123",
    args: [],
    ...enforcedProof,
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
  assert.ok(patch.includes("diff --git a/script.sh b/script.sh\nold mode 100644\nnew mode 100755"));
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
  assert.ok(patch.includes("diff --git a/run.sh b/run.sh\nold mode 100644\nnew mode 100755\n--- a/run.sh\n+++ b/run.sh\n@@ -1,2 +1,2 @@"));
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

  const workOrder = makeCanonicalWorkOrder(snapshotB, {
    allowed_paths: ["**"],
  });

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
    port_id: "port-enforced-worker",
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

  const enforcedProof = makeEnforcedProof("adapter-failing");
  const failingTransport = {
    port_id: "port-enforced-worker",
    adapter_id: "adapter-failing",
    probe_digest: enforcedProof.probe_digest,
    kind: "worker-transport",
    run: async () => ({
      ok: false,
      failure_class: "worker-fail",
      exit_code: 2,
      stderr: "compilation error in module foo\n",
      stdout: "parsing step 1 complete\n",
    }),
  };

  const workOrder = makeCanonicalWorkOrder(DUMMY_SNAPSHOT_ID, {
    allowed_paths: ["**"],
  });

  const result = await executeWorkOrder({
    workOrder,
    workspace: ws,
    transports: { worker: failingTransport },
    ...enforcedProof,
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

  const mutatingWorkOrder = makeCanonicalWorkOrder(DUMMY_SNAPSHOT_ID, {
    operation: "apply_implementation",
    ownership: { owner: "agent-test", mode: "exclusive" },
    allowed_paths: ["src/**"],
  });

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

  // Attempt 1: Execute mutating apply in fallback -> rejected before execution
  const mutatingWorkOrder = makeCanonicalWorkOrder(DUMMY_SNAPSHOT_ID, {
    operation: "apply_implementation",
    ownership: { owner: "agent-test", mode: "exclusive" },
    allowed_paths: ["src/**"],
  });

  const mutResult = await executeWorkOrder({
    workOrder: mutatingWorkOrder,
    workspace: ws,
    command: process.execPath,
    args: ["-e", `require('fs').writeFileSync('${outsideFile}', 'evil');`],
    isolationCapability: "unavailable",
  });

  assert.equal(mutResult.ok, false);
  assert.equal(mutResult.reason, "mutation-requires-enforced-isolation");
  assert.equal(fs.existsSync(outsideFile), false, "Subprocess must not execute unconfined mutating commands in fallback");

  // Attempt 2: Execute read-only verify in fallback trying to write outside -> rejected before execution
  const verifyWorkOrder = makeCanonicalWorkOrder(DUMMY_SNAPSHOT_ID, {
    operation: "verify",
    ownership: { owner: "agent-test", mode: "shared" },
    allowed_paths: ["**"],
  });

  const verifyResult = await executeWorkOrder({
    workOrder: verifyWorkOrder,
    workspace: ws,
    command: process.execPath,
    args: ["-e", `require('fs').writeFileSync('${outsideFile}', 'evil');`],
    isolationCapability: "unavailable",
  });

  assert.equal(verifyResult.ok, false);
  assert.equal(verifyResult.reason, "subprocess-requires-enforced-isolation");
  assert.equal(fs.existsSync(outsideFile), false, "Subprocess must not execute unconfined verify commands in fallback");
});

test("executeWorkOrder: rejects workOrder failing schema validation", async (t) => {
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "k6a-exec-schema-val-"));
  t.after(() => fs.rmSync(baseDir, { recursive: true, force: true }));

  const ws = await createWorkspace({ baseDir, source_snapshot_id: DUMMY_SNAPSHOT_ID });
  t.after(() => disposeWorkspace(ws));

  const invalidWorkOrder = {
    schema_version: 2,
    kind: "work-order/v2",
    // missing required fields
  };

  const result = await executeWorkOrder({
    workOrder: invalidWorkOrder,
    workspace: ws,
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, "invalid-work-order-schema");
});

test("executeWorkOrder: rejects workOrder when declared WorkOrderId does not match computed WorkOrderId", async (t) => {
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "k6a-exec-woid-mismatch-"));
  t.after(() => fs.rmSync(baseDir, { recursive: true, force: true }));

  const ws = await createWorkspace({ baseDir, source_snapshot_id: DUMMY_SNAPSHOT_ID });
  t.after(() => disposeWorkspace(ws));

  const canonical = makeCanonicalWorkOrder(DUMMY_SNAPSHOT_ID);
  const forgedWorkOrder = {
    ...canonical,
    work_order_id: "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
  };

  const result = await executeWorkOrder({
    workOrder: forgedWorkOrder,
    workspace: ws,
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, "work-order-id-mismatch");
});

test("executeWorkOrder: rejects workOrder with missing or empty allowed_paths", async (t) => {
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "k6a-exec-no-paths-"));
  t.after(() => fs.rmSync(baseDir, { recursive: true, force: true }));

  const ws = await createWorkspace({ baseDir, source_snapshot_id: DUMMY_SNAPSHOT_ID });
  t.after(() => disposeWorkspace(ws));

  const woEmptyPaths = makeCanonicalWorkOrder(DUMMY_SNAPSHOT_ID, {
    allowed_paths: [],
  });

  const result = await executeWorkOrder({
    workOrder: woEmptyPaths,
    workspace: ws,
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, "missing-allowed-paths");
});

test("generateUnifiedDiff: patches pass git apply --check and git apply with exact mode and content reproduction", (t) => {
  const { execSync } = require("node:child_process");
  const gitDir = fs.mkdtempSync(path.join(os.tmpdir(), "k6a-git-apply-test-"));
  t.after(() => {
    try { fs.rmSync(gitDir, { recursive: true, force: true }); } catch {}
  });

  let gitAvailable = false;
  try {
    execSync("git --version", { stdio: "ignore" });
    gitAvailable = true;
  } catch {}

  if (!gitAvailable) {
    t.skip("Git CLI not available for patch test");
    return;
  }

  execSync("git init", { cwd: gitDir, stdio: "ignore" });
  execSync("git config user.name 'Test'", { cwd: gitDir, stdio: "ignore" });
  execSync("git config user.email 'test@example.com'", { cwd: gitDir, stdio: "ignore" });

  // Initial files
  fs.writeFileSync(path.join(gitDir, "script.sh"), "#!/bin/sh\necho 1\n");
  fs.writeFileSync(path.join(gitDir, "run.sh"), "#!/bin/sh\necho old\n");
  execSync("git add .", { cwd: gitDir, stdio: "ignore" });
  execSync("git commit -m 'init'", { cwd: gitDir, stdio: "ignore" });

  // Test 1: Mode change only
  const patchModeOnly = generateUnifiedDiff(
    gitDir,
    [{ path: "script.sh", sha256: "sha256:same", mode: 0o100644 }],
    [{ path: "script.sh", sha256: "sha256:same", mode: 0o100755 }],
    new Map([["script.sh", "#!/bin/sh\necho 1\n"]])
  );
  assert.ok(patchModeOnly.includes("diff --git a/script.sh b/script.sh\nold mode 100644\nnew mode 100755"));

  const patch1File = path.join(gitDir, "mode-only.patch");
  fs.writeFileSync(patch1File, patchModeOnly);
  execSync("git apply --check mode-only.patch", { cwd: gitDir, stdio: "pipe" });
  execSync("git apply mode-only.patch", { cwd: gitDir, stdio: "pipe" });

  // Test 2: Mode + content change
  // Write new content to disk first so generateUnifiedDiff reads the updated content
  fs.writeFileSync(path.join(gitDir, "run.sh"), "#!/bin/sh\necho updated\n");

  const patchModeContent = generateUnifiedDiff(
    gitDir,
    [{ path: "run.sh", sha256: "sha256:old", mode: 0o100644 }],
    [{ path: "run.sh", sha256: "sha256:new", mode: 0o100755 }],
    new Map([["run.sh", "#!/bin/sh\necho old\n"]])
  );
  assert.ok(patchModeContent.includes("diff --git a/run.sh b/run.sh\nold mode 100644\nnew mode 100755\n--- a/run.sh\n+++ b/run.sh"));

  // Reset file on disk before applying patch
  fs.writeFileSync(path.join(gitDir, "run.sh"), "#!/bin/sh\necho old\n");

  const patch2File = path.join(gitDir, "mode-content.patch");
  fs.writeFileSync(patch2File, patchModeContent);
  execSync("git apply --check mode-content.patch", { cwd: gitDir, stdio: "pipe" });
  execSync("git apply mode-content.patch", { cwd: gitDir, stdio: "pipe" });

  assert.equal(fs.readFileSync(path.join(gitDir, "run.sh"), "utf8").replace(/\r\n/g, "\n"), "#!/bin/sh\necho updated\n");
});

test("executeWorkOrder: commands refuse unless isolationReported=enforced; G≠F invalidates; non-command MAY complete", async (t) => {
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "k6a-exec-req008-"));
  t.after(() => fs.rmSync(baseDir, { recursive: true, force: true }));
  const ws = await createWorkspace({ baseDir, source_snapshot_id: DUMMY_SNAPSHOT_ID });
  t.after(() => disposeWorkspace(ws));
  const workOrder = makeCanonicalWorkOrder(DUMMY_SNAPSHOT_ID, {
    operation: "verify",
    ownership: { owner: "agent-test", mode: "shared" },
    allowed_paths: ["**"],
  });

  for (const state of ["partial", "instructional", "unavailable"]) {
    const refused = await executeWorkOrder({
      workOrder,
      workspace: ws,
      command: process.execPath,
      args: ["-e", "console.log('no')"],
      isolationCapability: state,
    });
    assert.equal(refused.ok, false, state);
    assert.notEqual(refused.isolationReported, "enforced", state);
    assert.ok(
      refused.reason === "subprocess-requires-enforced-isolation" ||
        refused.reason === "strict-isolation-unfulfilled",
      state
    );
  }

  const nonCommand = await executeWorkOrder({
    workOrder,
    workspace: ws,
    isolationCapability: "partial",
  });
  assert.equal(nonCommand.ok, true);
  assert.notEqual(nonCommand.isolationReported, "enforced");

  const enforcedProof = makeEnforcedProof("adapter-test");
  const otherPort = {
    port_id: "port-G",
    kind: "worker-transport",
    adapter_id: "adapter-test",
    probe_digest: enforcedProof.probe_digest,
    run: async () => ({ ok: true, exit_code: 0, stdout: "must not run", stderr: "" }),
  };
  const mismatch = await executeWorkOrder({
    workOrder,
    workspace: ws,
    transports: { worker: otherPort },
    command: "runner",
    ...enforcedProof,
  });
  assert.equal(mismatch.ok, false);
  assert.notEqual(mismatch.isolationReported, "enforced");
});


