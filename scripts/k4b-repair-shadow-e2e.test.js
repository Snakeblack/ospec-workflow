"use strict";

const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const REPO_ROOT = path.resolve(__dirname, "..");

function snapshotProductionSurfaces(repoRoot, e2eWorkspace) {
  const head = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: repoRoot,
    encoding: "buffer",
  });
  const branches = execFileSync("git", ["branch", "-a", "--no-color"], {
    cwd: repoRoot,
    encoding: "buffer",
  });
  const configYaml = fs.readFileSync(path.join(repoRoot, "openspec", "config.yaml"));
  const surfaces = { head, branches, configYaml };
  const workspacePackage = e2eWorkspace ? path.join(e2eWorkspace, "package.json") : null;
  if (workspacePackage && fs.existsSync(workspacePackage)) {
    const pkg = JSON.parse(fs.readFileSync(workspacePackage, "utf8"));
    surfaces.packageVersion = Buffer.from(String(pkg.version ?? ""), "utf8");
  }
  return surfaces;
}

function assertProductionSurfacesByteIdentical(before, after) {
  assert.equal(Buffer.compare(before.head, after.head), 0, "production git HEAD must remain byte-identical");
  assert.equal(Buffer.compare(before.branches, after.branches), 0, "production branch list must remain byte-identical");
  assert.equal(
    Buffer.compare(before.configYaml, after.configYaml),
    0,
    "openspec/config.yaml defaults must remain byte-identical"
  );
  if (before.packageVersion || after.packageVersion) {
    assert.ok(before.packageVersion && after.packageVersion, "package.json version snapshot must exist on both sides");
    assert.equal(
      Buffer.compare(before.packageVersion, after.packageVersion),
      0,
      "E2E workspace package.json version must remain byte-identical"
    );
  }
}

const { orchestrateRepairShadow, compareShadowExecution, buildComparisonProjection } = require("./lib/repair-shadow/index.js");
const { compileExecutionGraph, createPolicySnapshot } = require("./lib/execution-graph/index.js");
const workerWorkspace = require("./lib/worker-workspace.js");
const { computeTreeDigest } = require("./lib/worker-workspace.js");
const { computeSourceSnapshotId, computeCandidateId, validateCandidateV2, computeWorkResultId } = require("./lib/execution-identities/index.js");
const workerExecutor = require("./lib/worker-executor.js");
const {
  createClaudeHostAdapter,
  getClaudeProofMaterial,
} = require("./lib/host-adapters/claude.js");
const {
  makeSandboxedWorkerPrimitive,
  makeSandboxedIsolationPrimitive,
} = require("./lib/worker-sandbox.js");
const { buildExecutionOptionsFromMaterial } = require("./lib/test-support/k6a-worker-fixtures.js");
const { createFileSystemStore } = require("./lib/filesystem-store.js");
const { loadRepairShadowExecutions } = require("./lib/repair-shadow/execution-record-store.js");

function makeTempFileStore(t, dir) {
  const filePath = path.join(dir || os.tmpdir(), `k4b-e2e-exec-${Date.now()}-${Math.random().toString(16).slice(2)}.json`);
  t.after(() => {
    for (const extra of ["", ".lock", ".bak"]) {
      try { fs.unlinkSync(filePath + extra); } catch { /* ignore */ }
    }
  });
  return createFileSystemStore({ filePath, initializeIfMissing: true });
}

test("E2E: N1 multiply() propagates to N2 through real K6a workspaces", async (t) => {
  const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), "k4b-e2e-"));
  t.after(() => {
    try { fs.rmSync(tmpBase, { recursive: true, force: true }); } catch { /* ignore */ }
  });

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
      objective: "Import and execute multiply from N1's derived base",
      ownership: { owner: "agent:repair", mode: "exclusive" },
      dependencies: ["n1-helper"],
      allowed_paths: ["src/index.js", "src/helper.js"],
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

  const primitives = {
    worker: makeSandboxedWorkerPrimitive(),
    workerIsolation: makeSandboxedIsolationPrimitive(),
  };
  const adapter = await createClaudeHostAdapter({ primitives });
  const material = await getClaudeProofMaterial({ primitives });
  const execOpts = buildExecutionOptionsFromMaterial(material);

  const n1Script = `
    const fs = require("node:fs");
    fs.writeFileSync("src/helper.js", [
      "function add(a, b) { return a + b; }",
      "function multiply(a, b) { return a * b; }",
      "module.exports = { add, multiply };",
      ""
    ].join("\\n"));
  `;
  const n2Script = `
    const fs = require("node:fs");
    const { multiply } = require("./src/helper.js");
    const product = multiply(2, 3);
    if (product !== 6) {
      console.error("multiply(2,3)=" + product);
      process.exit(1);
    }
    console.log("multiply_ok=" + product);
    fs.writeFileSync("src/index.js", [
      "const { add, multiply } = require('./helper.js');",
      "console.log(add(1, 2));",
      "console.log(multiply(2, 3));",
      ""
    ].join("\\n"));
  `;

  const created = [];
  const disposed = [];
  const materializedInputs = [];
  const originalCreate = workerWorkspace.createWorkspace;
  const originalDispose = workerWorkspace.disposeWorkspace;
  const originalMaterialize = workerWorkspace.materializeSourceSnapshot;
  t.mock.method(workerWorkspace, "createWorkspace", async function mockedCreate(...args) {
    const ws = await originalCreate.apply(this, args);
    created.push(ws.workspace_id);
    return ws;
  });
  t.mock.method(workerWorkspace, "disposeWorkspace", async function mockedDispose(descriptor) {
    disposed.push(descriptor && descriptor.workspace_id);
    return originalDispose.apply(this, arguments);
  });
  t.mock.method(workerWorkspace, "materializeSourceSnapshot", async function mockedMaterialize(...args) {
    materializedInputs.push((args[1] && args[1].capsule_inputs) || []);
    return originalMaterialize.apply(this, args);
  });

  const fixedBaseline = {
    steps: ["n1-helper", "n2-index"],
    diff_hash: "sha256:dummy",
    obligations: ["ob1", "ob2"],
    invariants: ["inv-log-output", "inv-pure-math"],
    inventory: ["src/helper.js", "src/index.js"],
  };

  const store = makeTempFileStore(t, tmpBase);
  const beforeProduction = snapshotProductionSurfaces(REPO_ROOT, tmpBase);
  const result = await orchestrateRepairShadow(graph, {
    sourceSnapshot,
    files: baseFiles,
    baseDir: tmpBase,
    isolationCapability: "enforced",
    policySnapshot,
    store,
    workerTransport: adapter.transports.WorkerTransport,
    capabilityProof: execOpts.capabilityProof,
    semantic_evidence: execOpts.semantic_evidence,
    expectedAdapterId: execOpts.expectedAdapterId,
    expectedAdapterVersion: execOpts.expectedAdapterVersion,
    expectedHostRuntimeVersion: execOpts.expectedHostRuntimeVersion,
    expectedProbeDigest: execOpts.expectedProbeDigest,
    workerIsolation: execOpts.workerIsolation,
    executorOptionsByNode: {
      "n1-helper": {
        commands: [{ command: process.execPath, args: ["-e", n1Script] }],
      },
      "n2-index": {
        commands: [{ command: process.execPath, args: ["-e", n2Script] }],
      },
    },
    baselineResult: fixedBaseline,
  });
  const afterProduction = snapshotProductionSurfaces(REPO_ROOT, tmpBase);
  assertProductionSurfacesByteIdentical(beforeProduction, afterProduction);

  assert.equal(result.ok, true, result.error || "E2E orchestration must succeed");
  assert.equal(result.graph_telemetry["n1-helper"].status, "completed");
  assert.equal(result.graph_telemetry["n2-index"].status, "completed");
  assert.ok(
    (result.workResults[1].logs || []).some((line) => String(line).includes("multiply_ok=6")),
    "N2 must import and execute multiply(2,3) === 6 on the derived base"
  );
  assert.ok(
    String(result.workResults[0].patch || "").includes("multiply"),
    "N1 WorkResult patch must add multiply()"
  );

  assert.equal(created.length, 2, "each node must receive a fresh workspace");
  assert.notEqual(created[0], created[1], "N1 and N2 must not share a workspace");
  assert.deepEqual(disposed.slice().sort(), created.slice().sort(), "every workspace must be disposed");
  assert.deepEqual(materializedInputs[0], ["src/helper.js"]);
  assert.deepEqual(materializedInputs[1], ["src/helper.js", "src/index.js"]);
  assert.equal(materializedInputs.some((inputs) => inputs.includes("src/config.json")), false);

  assert.equal(result.lineage_verification.ok, true);
  assert.equal(result.lineage_verification.lineage.length, 6);
  assert.ok(result.candidate);
  assert.equal(validateCandidateV2(result.candidate), true);
  assert.equal(result.candidate.candidate_id, computeCandidateId(result.candidate));
  assert.equal(result.candidate.base_tree, baseTreeDigest, "freeze must stay anchored to original SourceSnapshot");
  assert.ok(result.shadow_comparison);
  const shiftedTelemetry = Object.fromEntries(
    Object.entries(result.graph_telemetry || {}).map(([id, tel]) => [
      id,
      {
        ...tel,
        started_at: "1999-01-01T00:00:00.000Z",
        finished_at: "1999-01-01T00:00:01.000Z",
        duration_ms: 1,
        commands: (tel.commands || []).map((c) => ({ ...c, duration_ms: 1 })),
      },
    ])
  );
  const clockStable = compareShadowExecution(
    buildComparisonProjection({
      executionGraph: graph,
      candidate: result.candidate,
      workResults: result.workResults,
      graphTelemetry: result.graph_telemetry,
    }),
    buildComparisonProjection({
      executionGraph: graph,
      candidate: result.candidate,
      workResults: result.workResults,
      graphTelemetry: shiftedTelemetry,
    })
  );
  assert.equal(clockStable.dimension_match_rates.execution_metrics, 1);
  assert.equal(clockStable.match, true);
  assert.equal(clockStable.discrepancy_classification, "full-match");
  assert.match(result.execution_record_id, /^sha256:[a-f0-9]{64}$/);
  assert.notEqual(result.execution_record_id, result.candidate.candidate_id);
  const loaded = await loadRepairShadowExecutions(store, result.candidate.candidate_id);
  assert.equal(loaded.ok, true);
  assert.equal(loaded.records.length, 1);
  assert.equal(loaded.records[0].kind, "repair-shadow-execution/v1");
  assert.equal(loaded.records[0].policy_snapshot.snapshot_id, policySnapshot.snapshot_id);
  assert.equal(Object.prototype.hasOwnProperty.call(loaded.records[0], "fingerprint"), false);
});

test("E2E Fault Injection: Interrupted node halts downstream and cleans up workspaces fail-closed", async (t) => {
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

    t.mock.method(workerExecutor, "executeWorkOrder", async (callOptions) => {
      const workOrder = callOptions.workOrder;
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
    });

    const result = await orchestrateRepairShadow(graph, {
      sourceSnapshot,
      files: baseFiles,
      baseDir: tmpBase,
      isolationCapability: "enforced",
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
