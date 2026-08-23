"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { validateInstance, loadSchemaById } = require("./kernel-schema-validator.js");
const { isPathContained, validateAllowedPaths } = require("./allowed-paths-validator.js");

const ROOT = path.resolve(__dirname, "..", "..");

test("isPathContained: returns true for exact and prefix glob matches", () => {
  assert.equal(isPathContained("src/index.js", ["src/index.js"]), true);
  assert.equal(isPathContained("src/utils/math.js", ["src/**"]), true);
  assert.equal(isPathContained("src/utils/math.js", ["src/"]), true);
  assert.equal(isPathContained("./src/utils/math.js", ["src/**"]), true);
  assert.equal(isPathContained("src\\utils\\math.js", ["src/**"]), true);
  assert.equal(isPathContained("src/file.js", ["src/*"]), true);
  assert.equal(isPathContained("src/nested/file.js", ["src/*"]), false);
  assert.equal(isPathContained("root.txt", ["*"]), true);
  assert.equal(isPathContained("root.txt", ["**"]), true);
});

test("isPathContained: returns false for paths outside allowed_paths", () => {
  assert.equal(isPathContained("lib/index.js", ["src/**"]), false);
  assert.equal(isPathContained("package.json", ["src/**"]), false);
  assert.equal(isPathContained("src-other/index.js", ["src/"]), false);
});

test("isPathContained: fails closed on path traversal and invalid path characters", () => {
  assert.equal(isPathContained("../outside.js", ["src/**"]), false);
  assert.equal(isPathContained("src/../../outside.js", ["src/**"]), false);
  assert.equal(isPathContained("src/..\\outside.js", ["src/**"]), false);
  assert.equal(isPathContained("", ["src/**"]), false);
  assert.equal(isPathContained(null, ["src/**"]), false);
  assert.equal(isPathContained(undefined, ["src/**"]), false);
  assert.equal(isPathContained(123, ["src/**"]), false);
});

test("validateAllowedPaths: succeeds when all targets are within allowed_paths", () => {
  const result = validateAllowedPaths(
    ["src/a.js", "src/b/c.js", "tests/unit.test.js"],
    ["src/**", "tests/**"],
    {
      workspace_id: "ws-test-1234",
      work_order_id: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
    }
  );

  assert.equal(result.ok, true);
  assert.equal(result.violation, undefined);
});

test("validateAllowedPaths: empty targetPaths array returns ok: true", () => {
  const result = validateAllowedPaths([], ["src/**"]);
  assert.equal(result.ok, true);
});

test("validateAllowedPaths: non-array targetPaths fails closed", () => {
  const result = validateAllowedPaths(null, ["src/**"]);
  assert.equal(result.ok, false);
  assert.ok(result.violation);
  assert.equal(result.violation.violation_type, "undeclared_write");
});

test("validateAllowedPaths: fails closed with traversal violation on ../ sequences", () => {
  const result = validateAllowedPaths(
    ["src/a.js", "src/../../etc/passwd"],
    ["src/**"],
    {
      workspace_id: "ws-test-1234",
      work_order_id: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
    }
  );

  assert.equal(result.ok, false);
  assert.ok(result.violation, "Must emit violation");
  assert.equal(result.violation.violation_type, "traversal");
  assert.equal(result.violation.attempted_path, "src/../../etc/passwd");
  assert.equal(result.violation.schema_version, 1);

  const schema = loadSchemaById("ospec://schemas/kernel/containment-violation/v1", { rootDir: ROOT });
  const schemaRes = validateInstance(schema, result.violation);
  assert.equal(schemaRes.valid, true, `Emitted violation must conform to schema: ${JSON.stringify(schemaRes.errors)}`);
});

test("validateAllowedPaths: fails closed with undeclared_write violation on unallowed paths", () => {
  const result = validateAllowedPaths(
    ["src/a.js", "unauthorized/config.json"],
    ["src/**"],
    {
      workspace_id: "ws-test-1234",
      work_order_id: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
    }
  );

  assert.equal(result.ok, false);
  assert.ok(result.violation);
  assert.equal(result.violation.violation_type, "undeclared_write");
  assert.equal(result.violation.attempted_path, "unauthorized/config.json");

  const schema = loadSchemaById("ospec://schemas/kernel/containment-violation/v1", { rootDir: ROOT });
  const schemaRes = validateInstance(schema, result.violation);
  assert.equal(schemaRes.valid, true);
});

test("validateAllowedPaths: detects symlink escapes when workspaceRoot is provided", (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "k6a-validator-symlink-"));
  const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), "k6a-validator-outside-"));
  t.after(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    fs.rmSync(outsideDir, { recursive: true, force: true });
  });

  const secretFile = path.join(outsideDir, "secret.txt");
  fs.writeFileSync(secretFile, "confidential");

  const symlinkPath = path.join(tempDir, "symlink-escape.txt");
  try {
    fs.symlinkSync(secretFile, symlinkPath);
  } catch (err) {
    if (err.code === "EPERM") {
      // On Windows without symlink privileges, test passes cleanly
      return;
    }
    throw err;
  }

  const result = validateAllowedPaths(
    ["symlink-escape.txt"],
    ["**"],
    {
      workspaceRoot: tempDir,
      workspace_id: "ws-symlink-test",
      work_order_id: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
    }
  );

  assert.equal(result.ok, false);
  assert.ok(result.violation);
  assert.equal(result.violation.violation_type, "symlink_escape");

  const schema = loadSchemaById("ospec://schemas/kernel/containment-violation/v1", { rootDir: ROOT });
  const schemaRes = validateInstance(schema, result.violation);
  assert.equal(schemaRes.valid, true);
});

test("validateAllowedPaths: detects symlink escape in intermediate non-instantiated hierarchies", (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "k6a-validator-ancestor-"));
  const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), "k6a-validator-outdir-"));
  t.after(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    fs.rmSync(outsideDir, { recursive: true, force: true });
  });

  const symlinkDir = path.join(tempDir, "symlink-dir");
  try {
    fs.symlinkSync(outsideDir, symlinkDir, "junction");
  } catch (err) {
    if (err.code === "EPERM") return;
    throw err;
  }

  // Target file does NOT exist yet under symlinkDir
  const targetPath = "symlink-dir/non-existent-sub/file.txt";
  const result = validateAllowedPaths(
    [targetPath],
    ["**"],
    {
      workspaceRoot: tempDir,
      workspace_id: "ws-symlink-ancestor-test",
      work_order_id: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
    }
  );

  assert.equal(result.ok, false, "Must fail closed on symlink ancestor escape");
  assert.ok(result.violation, "Must emit violation");
  assert.equal(result.violation.violation_type, "symlink_escape");
});

test("validateAllowedPaths: validates structured mutation delta object", () => {
  const mutationDelta = {
    created: ["src/feature/new.js"],
    modified: ["src/index.js"],
    deleted: ["src/legacy.js"],
  };

  const successResult = validateAllowedPaths(
    mutationDelta,
    ["src/**"],
    {
      workspace_id: "ws-delta-test",
      work_order_id: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
    }
  );
  assert.equal(successResult.ok, true);

  const violationDelta = {
    created: ["src/feature/new.js"],
    modified: ["config/secret.env"],
    deleted: [],
  };
  const failResult = validateAllowedPaths(
    violationDelta,
    ["src/**"],
    {
      workspace_id: "ws-delta-test",
      work_order_id: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
    }
  );
  assert.equal(failResult.ok, false);
  assert.equal(failResult.violation.violation_type, "undeclared_write");
  assert.equal(failResult.violation.attempted_path, "config/secret.env");
});

