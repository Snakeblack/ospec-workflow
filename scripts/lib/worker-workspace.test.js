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
} = require("./worker-workspace.js");

const ROOT = path.resolve(__dirname, "..", "..");
const DUMMY_SNAPSHOT_ID = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

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

  const ws = await createWorkspace({ baseDir, source_snapshot_id: DUMMY_SNAPSHOT_ID });

  // Canonical SourceSnapshot v1 (NO synthetic .files map!)
  const canonicalSnapshot = {
    schema_version: 1,
    source_snapshot_id: DUMMY_SNAPSHOT_ID,
    repository_id: "repo-test-123",
    base_tree_digest: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    projection: "workspace",
    dependency_digests: [],
  };

  // WorkOrder v2 with DAG SHA-256 dependencies and decoupled capsule_inputs
  const workOrder = {
    schema_version: 2,
    work_order_id: "sha256:3333333333333333333333333333333333333333333333333333333333333333",
    source_snapshot_id: DUMMY_SNAPSHOT_ID,
    dependencies: ["sha256:1111111111111111111111111111111111111111111111111111111111111111"],
    capsule_inputs: ["src/index.js", "package.json"],
    allowed_paths: ["src/**"],
    environment: { NODE_ENV: "test" },
  };

  const filesMap = {
    "src/index.js": "console.log('canonical index');\n",
    "package.json": '{"name": "canonical-test"}\n',
    "unused/file.js": "not requested\n",
  };

  const capsule = await materializeSourceSnapshot(ws, workOrder, canonicalSnapshot, {
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

  const ws = await createWorkspace({ baseDir, source_snapshot_id: DUMMY_SNAPSHOT_ID });
  const canonicalSnapshot = {
    schema_version: 1,
    source_snapshot_id: DUMMY_SNAPSHOT_ID,
    repository_id: "repo-test-123",
    base_tree_digest: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    projection: "workspace",
    dependency_digests: [],
  };

  const workOrder = {
    work_order_id: "sha256:3333333333333333333333333333333333333333333333333333333333333333",
    source_snapshot_id: DUMMY_SNAPSHOT_ID,
    dependencies: [],
    capsule_inputs: ["missing/input.js"],
    allowed_paths: ["src/**"],
  };

  await assert.rejects(
    async () => {
      await materializeSourceSnapshot(ws, workOrder, canonicalSnapshot, { files: {} });
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

  const ws1 = await createWorkspace({ baseDir, source_snapshot_id: DUMMY_SNAPSHOT_ID });
  const ws2 = await createWorkspace({ baseDir, source_snapshot_id: DUMMY_SNAPSHOT_ID });

  const snapshot = {
    source_snapshot_id: DUMMY_SNAPSHOT_ID,
    files: {
      "src/index.js": "console.log('hello world');\n",
      "package.json": '{"name": "test-pkg"}\n',
      "unrelated/repo-artifact.txt": "ignored data\n",
    },
  };

  const workOrder = {
    work_order_id: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
    dependencies: ["sha256:4444444444444444444444444444444444444444444444444444444444444444"],
    allowed_paths: ["src/**"],
    environment: { TEST_ENV: "true" },
  };

  const capsule1 = await materializeSourceSnapshot(ws1, workOrder, snapshot, { capsule_inputs: ["src/index.js", "package.json"] });
  const capsule2 = await materializeSourceSnapshot(ws2, workOrder, snapshot, { capsule_inputs: ["src/index.js", "package.json"] });

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

test("materializeSourceSnapshot: supports array-based snapshot files format", async (t) => {
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "k6a-ws-mat-array-"));
  t.after(() => fs.rmSync(baseDir, { recursive: true, force: true }));

  const ws = await createWorkspace({ baseDir, source_snapshot_id: DUMMY_SNAPSHOT_ID });
  const snapshot = {
    source_snapshot_id: DUMMY_SNAPSHOT_ID,
    files: [
      { path: "src/main.js", content: "export const ok = 1;\n" },
      { path: "README.md", content: "# Hello\n" },
    ],
  };
  const workOrder = {
    work_order_id: "sha256:2222222222222222222222222222222222222222222222222222222222222222",
    dependencies: ["sha256:5555555555555555555555555555555555555555555555555555555555555555"],
    allowed_paths: ["src/**"],
  };

  const capsule = await materializeSourceSnapshot(ws, workOrder, snapshot, { capsule_inputs: ["src/main.js"] });
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

  const ws = await createWorkspace({ baseDir, source_snapshot_id: DUMMY_SNAPSHOT_ID });

  const snapshot = {
    source_snapshot_id: DUMMY_SNAPSHOT_ID,
    files: {
      "../escaped.txt": "evil content",
    },
  };

  const workOrder = {
    work_order_id: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
    dependencies: [],
    allowed_paths: ["src/**"],
  };

  await assert.rejects(
    async () => {
      await materializeSourceSnapshot(ws, workOrder, snapshot, { capsule_inputs: ["../escaped.txt"] });
    },
    /traversal/i
  );
});

