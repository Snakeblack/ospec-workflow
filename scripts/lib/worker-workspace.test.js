"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { validateInstance, loadSchemaById } = require("./kernel-schema-validator.js");
const {
  createWorkspace,
  disposeWorkspace,
  materializeSourceSnapshot,
  inspectWorkspace,
  getWorkspaceRecord,
  computeTreeDigest,
  sha256,
} = require("./worker-workspace.js");
const { computeSourceSnapshotId, computeWorkOrderId } = require("./execution-identities/index.js");

const ROOT = path.resolve(__dirname, "..", "..");
const DUMMY_SNAPSHOT_ID = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

function makeCanonicalSnapshot(repository_id, files, overrides = {}) {
  const treeDigest = overrides.base_tree_digest || computeTreeDigest(files || {});
  const snapshot = {
    schema_version: 1,
    repository_id,
    base_tree_digest: treeDigest,
    projection: "workspace",
    dependency_digests: [],
    ...overrides,
  };
  if (!snapshot.source_snapshot_id) {
    snapshot.source_snapshot_id = computeSourceSnapshotId(snapshot);
  }
  return snapshot;
}

function makeCanonicalWorkOrder(snapshot, overrides = {}) {
  const { capsule_inputs, environment, ...validOverrides } = overrides;
  const wo = {
    schema_version: 2,
    kind: "work-order/v2",
    node_id: "node-test-1",
    role: "executor",
    status: "pending",
    operation: "apply",
    objective: "Test work order execution",
    source_snapshot_id: snapshot.source_snapshot_id,
    dependencies: [],
    ownership: { owner: "agent-test", mode: "exclusive" },
    allowed_paths: ["src/**"],
    invariants: ["inv-1"],
    required_evidence: ["ev-1"],
    budget: { model_turns: 5, patches: 2, commands: 5, wall_time_minutes: 5, changed_lines: 100 },
    ...validOverrides,
  };
  if (!wo.work_order_id) {
    wo.work_order_id = computeWorkOrderId(wo);
  }
  return wo;
}

test("computeTreeDigest: computes deterministic Merkle tree digest over files object, array, and Map", () => {
  const filesMap = {
    "src/b.js": "const b = 2;\n",
    "src/a.js": "const a = 1;\n",
  };
  const filesArray = [
    { path: "src/b.js", content: "const b = 2;\n" },
    { path: "src/a.js", content: "const a = 1;\n" },
  ];
  const mapObj = new Map([
    ["src/b.js", "const b = 2;\n"],
    ["src/a.js", "const a = 1;\n"],
  ]);

  const d1 = computeTreeDigest(filesMap);
  const d2 = computeTreeDigest(filesArray);
  const d3 = computeTreeDigest(mapObj);

  assert.ok(/^sha256:[a-f0-9]{64}$/.test(d1));
  assert.equal(d1, d2, "Object and array file representations must yield identical tree digest");
  assert.equal(d1, d3, "Object and Map file representations must yield identical tree digest");
});

test("computeTreeDigest: enforces byte-exact hashing where CRLF vs LF produce different tree digests", () => {
  const filesLF = { "src/file.txt": "hello\n" };
  const filesCRLF = { "src/file.txt": "hello\r\n" };

  const digestLF = computeTreeDigest(filesLF);
  const digestCRLF = computeTreeDigest(filesCRLF);

  assert.notEqual(digestLF, digestCRLF, "CRLF and LF must produce distinct digests (byte-exact identity)");
});

test("computeTreeDigest: fails closed when declared sha256 does not match recomputed byte digest", () => {
  const filesWithForgedSha = [
    { path: "src/a.js", content: "const a = 1;\n", sha256: "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff" },
  ];

  assert.throws(
    () => computeTreeDigest(filesWithForgedSha),
    /Declared sha256 mismatch/i
  );
});

test("createWorkspace: generates internal UUID and ignores caller-supplied options.workspace_id", async (t) => {
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "k6a-ws-uuid-"));
  t.after(() => fs.rmSync(baseDir, { recursive: true, force: true }));

  const customId = "ws-caller-injected-id";
  const ws = await createWorkspace({
    baseDir,
    source_snapshot_id: DUMMY_SNAPSHOT_ID,
    workspace_id: customId,
  });

  assert.notEqual(ws.workspace_id, customId, "Caller-supplied workspace_id must be ignored");
  assert.match(ws.workspace_id, /^ws-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
});

test("getWorkspaceRecord: returns defensive copy preventing external mutations to internal registry", async (t) => {
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "k6a-ws-encap-"));
  t.after(() => fs.rmSync(baseDir, { recursive: true, force: true }));

  const ws = await createWorkspace({ baseDir, source_snapshot_id: DUMMY_SNAPSHOT_ID });
  const record1 = getWorkspaceRecord(ws.workspace_id);
  assert.ok(record1, "Record must exist for active workspace");

  // Mutating the returned record or baselineContents must not affect subsequent getWorkspaceRecord calls
  if (record1.baselineContents) {
    record1.baselineContents.set("tampered.js", "evil");
  }
  if (record1.baselineInventory) {
    record1.baselineInventory.push({ path: "tampered.js" });
  }

  const record2 = getWorkspaceRecord(ws.workspace_id);
  assert.equal(record2.baselineContents ? record2.baselineContents.has("tampered.js") : false, false);
  assert.equal(record2.baselineInventory ? record2.baselineInventory.some((f) => f.path === "tampered.js") : false, false);
});

test("materializeSourceSnapshot: throws fail-closed error when workspace is not registered in private registry", async (t) => {
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "k6a-ws-unrecorded-"));
  const fakeDir = path.join(baseDir, "fake-ws");
  fs.mkdirSync(fakeDir, { recursive: true });
  t.after(() => fs.rmSync(baseDir, { recursive: true, force: true }));

  const filesMap = { "src/index.js": "console.log('hi');\n" };
  const canonicalSnapshot = makeCanonicalSnapshot("repo-test-123", filesMap);

  const fakeDescriptor = {
    workspace_id: "ws-unrecorded-12345",
    root_path: fakeDir,
    source_snapshot_id: canonicalSnapshot.source_snapshot_id,
  };

  const workOrder = makeCanonicalWorkOrder(canonicalSnapshot, {
    capsule_inputs: ["src/index.js"],
    allowed_paths: ["src/**"],
  });

  await assert.rejects(
    async () => {
      await materializeSourceSnapshot(fakeDescriptor, workOrder, canonicalSnapshot, {
        files: filesMap,
      });
    },
    /unrecorded|not found|registered/i
  );
  assert.equal(fs.existsSync(path.join(fakeDir, "src", "index.js")), false, "Must not write files to unrecorded workspace");
});

test("materializeSourceSnapshot: throws 3-way binding mismatch when workspace was created for snapshot A but materializing snapshot B", async (t) => {
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "k6a-ws-3way-mismatch-"));
  t.after(() => fs.rmSync(baseDir, { recursive: true, force: true }));

  const filesA = { "src/a.js": "const a = 'snapshot A';\n" };
  const filesB = { "src/b.js": "const b = 'snapshot B';\n" };
  const snapshotA = makeCanonicalSnapshot("repo-a", filesA);
  const snapshotB = makeCanonicalSnapshot("repo-b", filesB);

  // Workspace created for A
  const wsA = await createWorkspace({ baseDir, source_snapshot_id: snapshotA.source_snapshot_id });

  // WorkOrder for B
  const workOrderB = makeCanonicalWorkOrder(snapshotB, {
    capsule_inputs: ["src/b.js"],
    allowed_paths: ["src/**"],
  });

  // Attempt to materialize Snapshot B into Workspace A -> MUST fail closed
  await assert.rejects(
    async () => {
      await materializeSourceSnapshot(wsA, workOrderB, snapshotB, { files: filesB });
    },
    /Workspace source_snapshot_id binding mismatch/i
  );
});

test("materializeSourceSnapshot: throws 3-way binding mismatch when WorkOrder has snapshot A but materializing snapshot B", async (t) => {
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "k6a-ws-wo-mismatch-"));
  t.after(() => fs.rmSync(baseDir, { recursive: true, force: true }));

  const filesA = { "src/a.js": "const a = 'snapshot A';\n" };
  const filesB = { "src/b.js": "const b = 'snapshot B';\n" };
  const snapshotA = makeCanonicalSnapshot("repo-a", filesA);
  const snapshotB = makeCanonicalSnapshot("repo-b", filesB);

  // Workspace created for B
  const wsB = await createWorkspace({ baseDir, source_snapshot_id: snapshotB.source_snapshot_id });

  // WorkOrder for A
  const workOrderA = makeCanonicalWorkOrder(snapshotA, {
    capsule_inputs: ["src/a.js"],
    allowed_paths: ["src/**"],
  });

  // Attempt to materialize Snapshot B with WorkOrder A -> MUST fail closed
  await assert.rejects(
    async () => {
      await materializeSourceSnapshot(wsB, workOrderA, snapshotB, { files: filesB });
    },
    /WorkOrder binding validation failed/i
  );
});

test("materializeSourceSnapshot: throws cryptographic verification error when candidate file bytes do not match base_tree_digest", async (t) => {
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "k6a-ws-tree-mismatch-"));
  t.after(() => fs.rmSync(baseDir, { recursive: true, force: true }));

  const realFiles = { "src/index.js": "console.log('real');\n" };
  const canonicalSnapshot = makeCanonicalSnapshot("repo-test-123", realFiles);
  const ws = await createWorkspace({ baseDir, source_snapshot_id: canonicalSnapshot.source_snapshot_id });

  const workOrder = makeCanonicalWorkOrder(canonicalSnapshot, {
    capsule_inputs: ["src/index.js"],
    allowed_paths: ["src/**"],
  });

  // Provide tampered files that do not match canonicalSnapshot.base_tree_digest
  const tamperedFiles = { "src/index.js": "console.log('tampered bytes');\n" };

  await assert.rejects(
    async () => {
      await materializeSourceSnapshot(ws, workOrder, canonicalSnapshot, {
        files: tamperedFiles,
      });
    },
    /base_tree_digest mismatch/i
  );

  assert.equal(fs.existsSync(path.join(ws.root_path, "src", "index.js")), false, "Must not write files to disk on digest mismatch");
});

test("materializeSourceSnapshot: throws cryptographic verification error when source_snapshot_id does not match computeSourceSnapshotId", async (t) => {
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "k6a-ws-snap-mismatch-"));
  t.after(() => fs.rmSync(baseDir, { recursive: true, force: true }));

  const filesMap = { "src/index.js": "console.log('snap id check');\n" };
  const canonicalSnapshot = {
    schema_version: 1,
    source_snapshot_id: "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff", // forged/tampered ID
    repository_id: "repo-test-123",
    base_tree_digest: computeTreeDigest(filesMap),
    projection: "workspace",
    dependency_digests: [],
  };

  const ws = await createWorkspace({ baseDir, source_snapshot_id: canonicalSnapshot.source_snapshot_id });

  const workOrder = makeCanonicalWorkOrder(canonicalSnapshot, {
    capsule_inputs: ["src/index.js"],
    allowed_paths: ["src/**"],
  });

  await assert.rejects(
    async () => {
      await materializeSourceSnapshot(ws, workOrder, canonicalSnapshot, {
        files: filesMap,
      });
    },
    /binding validation failed|source_snapshot_id mismatch/i
  );

  assert.equal(fs.existsSync(path.join(ws.root_path, "src", "index.js")), false, "Must not write files to disk on source_snapshot_id mismatch");
});

test("materializeSourceSnapshot: preserves baseline file contents in workspace record for diffing", async (t) => {
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "k6a-ws-baseline-"));
  t.after(() => fs.rmSync(baseDir, { recursive: true, force: true }));

  const filesMap = {
    "src/app.js": "const version = 1;\n",
    "README.md": "# Sample Project\n",
  };
  const canonicalSnapshot = makeCanonicalSnapshot("repo-test-123", filesMap);
  const ws = await createWorkspace({ baseDir, source_snapshot_id: canonicalSnapshot.source_snapshot_id });

  const workOrder = makeCanonicalWorkOrder(canonicalSnapshot, {
    capsule_inputs: ["src/app.js", "README.md"],
    allowed_paths: ["src/**", "README.md"],
  });

  await materializeSourceSnapshot(ws, workOrder, canonicalSnapshot, {
    files: filesMap,
  });

  const record = getWorkspaceRecord(ws.workspace_id);
  assert.ok(record);
  assert.ok(record.baselineContents instanceof Map, "baselineContents must be a Map");
  assert.equal(record.baselineContents.get("src/app.js"), "const version = 1;\n");
  assert.equal(record.baselineContents.get("README.md"), "# Sample Project\n");
});

test("disposeWorkspace: does not delete untracked arbitrary paths", async (t) => {
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "k6a-ws-untracked-"));
  const arbitraryDir = path.join(baseDir, "arbitrary-target");
  fs.mkdirSync(arbitraryDir, { recursive: true });
  fs.writeFileSync(path.join(arbitraryDir, "critical.txt"), "do not delete");
  t.after(() => fs.rmSync(baseDir, { recursive: true, force: true }));

  // Passing an arbitrary descriptor not in the private registry
  const fakeDescriptor = {
    workspace_id: "ws-untracked-fake",
    root_path: arbitraryDir,
  };

  const result = await disposeWorkspace(fakeDescriptor);
  assert.equal(result.ok, true);
  assert.equal(result.status, "disposed");
  assert.ok(fs.existsSync(arbitraryDir), "Untracked arbitrary directory must NOT be deleted");
});

test("materializeSourceSnapshot: materializes canonical SourceSnapshot v1 with decoupled capsule_inputs and SHA-256 dependencies", async (t) => {
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "k6a-ws-canonical-"));
  t.after(() => fs.rmSync(baseDir, { recursive: true, force: true }));

  const filesMap = {
    "src/index.js": "console.log('canonical index');\n",
    "package.json": '{"name": "canonical-test"}\n',
    "unused/file.js": "not requested\n",
  };
  const canonicalSnapshot = makeCanonicalSnapshot("repo-test-123", filesMap);
  const ws = await createWorkspace({ baseDir, source_snapshot_id: canonicalSnapshot.source_snapshot_id });

  // WorkOrder v2 with DAG SHA-256 dependencies and decoupled capsule_inputs
  const workOrder = makeCanonicalWorkOrder(canonicalSnapshot, {
    dependencies: ["sha256:1111111111111111111111111111111111111111111111111111111111111111"],
    capsule_inputs: ["src/index.js", "package.json"],
    allowed_paths: ["src/**"],
    environment: { NODE_ENV: "test" },
  });

  const capsule = await materializeSourceSnapshot(ws, workOrder, canonicalSnapshot, {
    capsule_inputs: ["src/index.js", "package.json"],
    files: filesMap,
  });

  assert.ok(fs.existsSync(path.join(ws.root_path, "src", "index.js")));
  assert.ok(fs.existsSync(path.join(ws.root_path, "package.json")));
  assert.equal(fs.existsSync(path.join(ws.root_path, "unused", "file.js")), false);

  assert.deepEqual(capsule.capsule_inputs, ["package.json", "src/index.js"]);
  assert.deepEqual(capsule.dependencies, ["sha256:1111111111111111111111111111111111111111111111111111111111111111"]);
  assert.ok(/^sha256:[a-f0-9]{64}$/.test(capsule.fingerprint));

  const schema = loadSchemaById("ospec://schemas/kernel/capsule-definition/v1", { rootDir: ROOT });
  const validation = validateInstance(schema, capsule);
  assert.equal(validation.valid, true, `Capsule must conform to schema: ${JSON.stringify(validation.errors)}`);
});

test("materializeSourceSnapshot: fails closed when declared capsule_input is missing", async (t) => {
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "k6a-ws-missing-input-"));
  t.after(() => fs.rmSync(baseDir, { recursive: true, force: true }));

  const filesMap = { "src/present.js": "const ok = true;\n" };
  const canonicalSnapshot = makeCanonicalSnapshot("repo-test-123", filesMap);
  const ws = await createWorkspace({ baseDir, source_snapshot_id: canonicalSnapshot.source_snapshot_id });

  const workOrder = makeCanonicalWorkOrder(canonicalSnapshot, {
    allowed_paths: ["src/**"],
  });

  await assert.rejects(
    async () => {
      await materializeSourceSnapshot(ws, workOrder, canonicalSnapshot, {
        capsule_inputs: ["missing/input.js"],
        files: {},
      });
    },
    /missing.*input/i
  );
});

test("createWorkspace: allocates dedicated directory and returns valid descriptor", async (t) => {
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "k6a-ws-create-"));
  t.after(() => fs.rmSync(baseDir, { recursive: true, force: true }));

  const ws = await createWorkspace({
    baseDir,
    source_snapshot_id: DUMMY_SNAPSHOT_ID,
  });

  assert.ok(ws.workspace_id.startsWith("ws-"));
  assert.equal(ws.source_snapshot_id, DUMMY_SNAPSHOT_ID);
  assert.equal(ws.status, "active");
  assert.ok(fs.existsSync(ws.root_path), "Workspace directory must exist on disk");

  const schema = loadSchemaById("ospec://schemas/kernel/workspace-descriptor/v1", { rootDir: ROOT });
  const validation = validateInstance(schema, ws);
  assert.equal(validation.valid, true, `Descriptor must conform to schema: ${JSON.stringify(validation.errors)}`);
});

test("disposeWorkspace: cleanly removes workspace directory and is idempotent", async (t) => {
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "k6a-ws-dispose-"));
  t.after(() => fs.rmSync(baseDir, { recursive: true, force: true }));

  const ws = await createWorkspace({
    baseDir,
    source_snapshot_id: DUMMY_SNAPSHOT_ID,
  });

  assert.ok(fs.existsSync(ws.root_path));

  const result1 = await disposeWorkspace(ws);
  assert.equal(result1.ok, true);
  assert.equal(result1.status, "disposed");
  assert.equal(ws.status, "disposed");
  assert.equal(fs.existsSync(ws.root_path), false, "Workspace directory must be deleted");

  // Idempotent second invocation
  const result2 = await disposeWorkspace(ws);
  assert.equal(result2.ok, true);
  assert.equal(result2.status, "disposed");

  // Idempotent with missing descriptor / path
  const result3 = await disposeWorkspace({ root_path: path.join(baseDir, "non-existent-dir") });
  assert.equal(result3.ok, true);
});

test("materializeSourceSnapshot: projects declared dependencies and yields deterministic fingerprint", async (t) => {
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "k6a-ws-mat-"));
  t.after(() => fs.rmSync(baseDir, { recursive: true, force: true }));

  const filesMap = {
    "src/index.js": "console.log('hello world');\n",
    "package.json": '{"name": "test-pkg"}\n',
    "unrelated/repo-artifact.txt": "ignored data\n",
  };
  const canonicalSnapshot = makeCanonicalSnapshot("repo-test-123", filesMap);

  const ws1 = await createWorkspace({ baseDir, source_snapshot_id: canonicalSnapshot.source_snapshot_id });
  const ws2 = await createWorkspace({ baseDir, source_snapshot_id: canonicalSnapshot.source_snapshot_id });

  const workOrder = makeCanonicalWorkOrder(canonicalSnapshot, {
    dependencies: ["sha256:4444444444444444444444444444444444444444444444444444444444444444"],
    allowed_paths: ["src/**"],
    environment: { TEST_ENV: "true" },
  });

  const capsule1 = await materializeSourceSnapshot(ws1, workOrder, canonicalSnapshot, {
    capsule_inputs: ["src/index.js", "package.json"],
    files: filesMap,
  });
  const capsule2 = await materializeSourceSnapshot(ws2, workOrder, canonicalSnapshot, {
    capsule_inputs: ["src/index.js", "package.json"],
    files: filesMap,
  });

  // Check files materialized in ws1
  assert.ok(fs.existsSync(path.join(ws1.root_path, "src", "index.js")));
  assert.ok(fs.existsSync(path.join(ws1.root_path, "package.json")));
  assert.equal(fs.existsSync(path.join(ws1.root_path, "unrelated", "repo-artifact.txt")), false, "Extraneous files must not be materialized");

  // Deterministic fingerprint
  assert.equal(capsule1.fingerprint, capsule2.fingerprint);
  assert.ok(/^sha256:[a-f0-9]{64}$/.test(capsule1.fingerprint));

  const schema = loadSchemaById("ospec://schemas/kernel/capsule-definition/v1", { rootDir: ROOT });
  const validation = validateInstance(schema, capsule1);
  assert.equal(validation.valid, true, `Capsule must conform to schema: ${JSON.stringify(validation.errors)}`);
});

test("materializeSourceSnapshot: supports array-based options.files format", async (t) => {
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "k6a-ws-mat-array-"));
  t.after(() => fs.rmSync(baseDir, { recursive: true, force: true }));

  const filesArray = [
    { path: "src/main.js", content: "export const ok = 1;\n" },
    { path: "README.md", content: "# Hello\n" },
  ];
  const canonicalSnapshot = makeCanonicalSnapshot("repo-test-123", filesArray);
  const ws = await createWorkspace({ baseDir, source_snapshot_id: canonicalSnapshot.source_snapshot_id });

  const workOrder = makeCanonicalWorkOrder(canonicalSnapshot, {
    dependencies: ["sha256:5555555555555555555555555555555555555555555555555555555555555555"],
    allowed_paths: ["src/**"],
  });

  const capsule = await materializeSourceSnapshot(ws, workOrder, canonicalSnapshot, {
    capsule_inputs: ["src/main.js"],
    files: filesArray,
  });
  assert.ok(fs.existsSync(path.join(ws.root_path, "src", "main.js")));
  assert.equal(fs.existsSync(path.join(ws.root_path, "README.md")), false);
  assert.ok(/^sha256:[a-f0-9]{64}$/.test(capsule.fingerprint));
});

test("inspectWorkspace: computes filesystem inventory with SHA-256 digests and file modes", async (t) => {
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "k6a-ws-inspect-"));
  t.after(() => fs.rmSync(baseDir, { recursive: true, force: true }));

  const ws = await createWorkspace({ baseDir, source_snapshot_id: DUMMY_SNAPSHOT_ID });

  fs.mkdirSync(path.join(ws.root_path, "src"), { recursive: true });
  fs.writeFileSync(path.join(ws.root_path, "src", "app.js"), "const x = 42;\n");
  fs.writeFileSync(path.join(ws.root_path, "README.md"), "# Title\n");

  const inventory = await inspectWorkspace(ws);

  assert.equal(inventory.length, 2);
  assert.equal(inventory[0].path, "README.md");
  assert.ok(/^sha256:[a-f0-9]{64}$/.test(inventory[0].sha256));
  assert.ok(typeof inventory[0].mode === "number");

  assert.equal(inventory[1].path, "src/app.js");
  assert.ok(/^sha256:[a-f0-9]{64}$/.test(inventory[1].sha256));
});

test("inspectWorkspace: fails closed returning empty array for unrecorded workspace descriptor with forged root_path", async (t) => {
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "k6a-ws-forged-inspect-"));
  t.after(() => fs.rmSync(baseDir, { recursive: true, force: true }));

  fs.writeFileSync(path.join(baseDir, "secret.txt"), "classified");

  const forgedDescriptor = {
    workspace_id: "ws-untracked-forged-999",
    root_path: baseDir,
  };

  const inventory = await inspectWorkspace(forgedDescriptor);
  assert.deepEqual(inventory, [], "Must return empty inventory for unrecorded descriptor");
});

test("inspectWorkspace: returns empty array on empty workspace", async (t) => {
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "k6a-ws-empty-"));
  t.after(() => fs.rmSync(baseDir, { recursive: true, force: true }));

  const ws = await createWorkspace({ baseDir, source_snapshot_id: DUMMY_SNAPSHOT_ID });
  const inventory = await inspectWorkspace(ws);
  assert.deepEqual(inventory, []);
});

test("materializeSourceSnapshot: rejects dependency paths containing traversal sequences", async (t) => {
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "k6a-ws-traversal-"));
  t.after(() => fs.rmSync(baseDir, { recursive: true, force: true }));

  const filesMap = { "src/app.js": "const ok = 1;\n" };
  const canonicalSnapshot = makeCanonicalSnapshot("repo-test-123", filesMap);
  const ws = await createWorkspace({ baseDir, source_snapshot_id: canonicalSnapshot.source_snapshot_id });

  const workOrder = makeCanonicalWorkOrder(canonicalSnapshot, {
    capsule_inputs: ["../escaped.txt"],
    allowed_paths: ["src/**"],
  });

  await assert.rejects(
    async () => {
      await materializeSourceSnapshot(ws, workOrder, canonicalSnapshot, {
        capsule_inputs: ["../escaped.txt"],
        files: { "../escaped.txt": "evil content" },
      });
    },
    /traversal/i
  );
});

test("computeTreeDigest: fails closed when array item content is missing (zero-trust byte verification)", () => {
  const filesNoContent = [
    { path: "src/a.js", sha256: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
  ];

  assert.throws(
    () => computeTreeDigest(filesNoContent),
    /requires content for each file/i
  );
});

test("materializeSourceSnapshot: enforces zero-trust byte hashing over candidateFiles ignoring declared hash bypass", async (t) => {
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "k6a-ws-zt-"));
  t.after(() => fs.rmSync(baseDir, { recursive: true, force: true }));

  const authenticContent = "const x = 42;\n";
  const forgedContent = "const x = 999;\n"; // Different bytes!
  const authenticFileSha = sha256(authenticContent);

  const authenticFiles = { "src/main.js": authenticContent };
  const canonicalSnapshot = makeCanonicalSnapshot("repo-zt", authenticFiles);
  const ws = await createWorkspace({ baseDir, source_snapshot_id: canonicalSnapshot.source_snapshot_id });

  const workOrder = makeCanonicalWorkOrder(canonicalSnapshot, {
    capsule_inputs: ["src/main.js"],
    allowed_paths: ["src/**"],
  });

  // Positive case: Declared file sha256 matches authentic candidate bytes -> PASS
  const validDeclaredMetadata = [{ path: "src/main.js", sha256: authenticFileSha }];
  const capsule = await materializeSourceSnapshot(ws, workOrder, canonicalSnapshot, {
    capsule_inputs: ["src/main.js"],
    files: validDeclaredMetadata,
    resolveFile: () => authenticContent,
  });
  assert.ok(capsule.fingerprint);

  // Negative case: Declared file sha256 matches authentic hash, but resolveFile returns forged bytes -> FAIL CLOSED
  await assert.rejects(
    async () => {
      await materializeSourceSnapshot(ws, workOrder, canonicalSnapshot, {
        capsule_inputs: ["src/main.js"],
        files: validDeclaredMetadata,
        resolveFile: () => forgedContent,
      });
    },
    /Declared sha256 mismatch/i
  );
});

test("markWorkspaceInterrupted: transitions active workspace to interrupted with reason and rejects invalid transitions", async (t) => {
  const { markWorkspaceInterrupted } = require("./worker-workspace.js");
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "k6a-ws-reg-update-"));
  t.after(() => fs.rmSync(baseDir, { recursive: true, force: true }));

  const ws = await createWorkspace({ baseDir, source_snapshot_id: DUMMY_SNAPSHOT_ID });
  assert.equal(getWorkspaceRecord(ws.workspace_id).descriptor.status, "active");

  const updated = markWorkspaceInterrupted(ws.workspace_id, "timeout_exceeded");
  assert.equal(updated, true);
  const rec = getWorkspaceRecord(ws.workspace_id);
  assert.equal(rec.descriptor.status, "interrupted");
  assert.equal(rec.descriptor.interrupted_reason, "timeout_exceeded");

  // Re-transitioning already interrupted workspace must return false
  const repeat = markWorkspaceInterrupted(ws.workspace_id, "another_reason");
  assert.equal(repeat, false);

  const nonExistent = markWorkspaceInterrupted("ws-non-existent", "interrupted");
  assert.equal(nonExistent, false);
});

test("inspectWorkspace: throws fail-closed error when encountering escaping symlink", async (t) => {
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "k6a-ws-sym-esc-"));
  const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), "k6a-ws-outside-"));
  t.after(() => {
    try {
      fs.rmSync(baseDir, { recursive: true, force: true });
      fs.rmSync(outsideDir, { recursive: true, force: true });
    } catch {}
  });

  fs.writeFileSync(path.join(outsideDir, "secret.txt"), "classified data");
  const ws = await createWorkspace({ baseDir, source_snapshot_id: DUMMY_SNAPSHOT_ID });

  // Create an escaping symlink inside workspace pointing to outsideDir
  try {
    fs.symlinkSync(outsideDir, path.join(ws.root_path, "escaped_link"), "junction");
  } catch (err) {
    t.skip(`Symlink creation not permitted in this environment: ${err.message}`);
    return;
  }

  await assert.rejects(
    async () => {
      await inspectWorkspace(ws);
    },
    /Symlink escape detected/i
  );
});

test("inspectWorkspace: throws fail-closed error on dangling symlink", async (t) => {
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "k6a-ws-sym-dang-"));
  t.after(() => fs.rmSync(baseDir, { recursive: true, force: true }));

  const ws = await createWorkspace({ baseDir, source_snapshot_id: DUMMY_SNAPSHOT_ID });

  try {
    fs.symlinkSync(path.join(ws.root_path, "non_existent_target.txt"), path.join(ws.root_path, "dangling.txt"));
  } catch (err) {
    t.skip(`Symlink creation not permitted in this environment: ${err.message}`);
    return;
  }

  await assert.rejects(
    async () => {
      await inspectWorkspace(ws);
    },
    /Unreadable or dangling symlink/i
  );
});


