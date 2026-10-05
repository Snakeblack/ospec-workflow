"use strict";

// E1.3 impact-signals: the filesystem and git side of signal derivation —
// idd/config.yaml, the stack markers at the root and the diff against a base
// (openspec/specs/idd/spec.md, REQ-idd-012, REQ-idd-013).

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const { IddWorkspaceError, readGitDiff, readProjectContext } = require("./idd-workspace.js");

function tempDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "idd-workspace-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function write(root, rel, content) {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function git(root, ...args) {
  return execFileSync("git", ["-C", root, ...args], { encoding: "utf8" });
}

function gitRepo(t) {
  const root = tempDir(t);
  git(root, "init", "-q");
  git(root, "config", "user.email", "test@example.invalid");
  git(root, "config", "user.name", "test");
  git(root, "config", "commit.gpgsign", "false");
  return root;
}

function commitAll(root, message) {
  git(root, "add", "-A");
  git(root, "commit", "-q", "--no-verify", "-m", message);
}

test("project context without a config uses the detected stacks and the defaults", (t) => {
  const root = tempDir(t);
  write(root, "package.json", "{}");
  const context = readProjectContext(root);
  assert.strictEqual(context.mode, null);
  assert.strictEqual(context.strictTdd, false);
  assert.deepStrictEqual(context.stacks, ["node"]);
  assert.ok(context.patterns["public-contract"].includes("**/routes/**"));
});

test("project context reads mode, strict_tdd and the impact section from idd/config.yaml", (t) => {
  const root = tempDir(t);
  write(root, "idd/config.yaml", "mode: idd\nstrict_tdd: true\nimpact:\n  public_contract:\n    - cli/**\n");
  const context = readProjectContext(root);
  assert.strictEqual(context.mode, "idd");
  assert.strictEqual(context.strictTdd, true);
  assert.deepStrictEqual(context.stacks, []);
  assert.ok(context.patterns["public-contract"].includes("cli/**"));
});

test("openspec/config.yaml is SDD configuration and never configures IDD", (t) => {
  const root = tempDir(t);
  write(root, "openspec/config.yaml", "strict_tdd: true\nimpact:\n  public_contract:\n    - cli/**\n");
  const context = readProjectContext(root);
  assert.strictEqual(context.strictTdd, false);
  assert.ok(!context.patterns["public-contract"].includes("cli/**"));
});

test("an invalid configuration is reported with its code", (t) => {
  const root = tempDir(t);
  write(root, "idd/config.yaml", "impact:\n  stack: cobol\n");
  assert.throws(() => readProjectContext(root), (error) => error.code === "impact-config-invalid");
  write(root, "idd/config.yaml", "workflow:\n  mode: idd\n");
  assert.throws(() => readProjectContext(root), (error) => error.code === "config-invalid");
});

test("the diff holds modified, deleted and untracked paths with their added lines", (t) => {
  const root = gitRepo(t);
  write(root, "src/api/orders.js", "const size = 20;\nmodule.exports = { size };\n");
  write(root, "src/legacy/fax.js", "module.exports = {};\n");
  commitAll(root, "base");

  write(root, "src/api/orders.js", "const size = 50;\nmodule.exports = { size };\n");
  fs.rmSync(path.join(root, "src/legacy/fax.js"));
  write(root, "db/migrations/002_drop.sql", "-- cleanup\nALTER TABLE customers DROP COLUMN fax;\n");
  write(root, "idd/c/state.yaml", "{}\n");

  const diff = readGitDiff(root);
  assert.deepStrictEqual(diff.paths, ["db/migrations/002_drop.sql", "src/api/orders.js", "src/legacy/fax.js"]);
  assert.deepStrictEqual(diff.addedLines["src/api/orders.js"], ["const size = 50;"]);
  assert.deepStrictEqual(diff.addedLines["db/migrations/002_drop.sql"], [
    "-- cleanup",
    "ALTER TABLE customers DROP COLUMN fax;",
  ]);
  assert.ok(!("src/legacy/fax.js" in diff.addedLines));
});

test("the diff against a base includes committed work on the branch", (t) => {
  const root = gitRepo(t);
  write(root, "README.md", "x\n");
  commitAll(root, "base");
  const base = git(root, "rev-parse", "HEAD").trim();
  write(root, "src/auth/session.js", "module.exports = 1;\n");
  commitAll(root, "work");

  assert.deepStrictEqual(readGitDiff(root).paths, []);
  assert.deepStrictEqual(readGitDiff(root, { base }).paths, ["src/auth/session.js"]);
});

test("the diff is refused outside a git repository or with an unknown base", (t) => {
  const plain = tempDir(t);
  assert.throws(() => readGitDiff(plain), (error) => error instanceof IddWorkspaceError && error.code === "not-a-git-repo");

  const root = gitRepo(t);
  write(root, "a.txt", "a\n");
  commitAll(root, "base");
  assert.throws(() => readGitDiff(root, { base: "no-such-ref" }), (error) => error.code === "unknown-base");
  assert.throws(() => readGitDiff(root, { base: "--output=x" }), (error) => error.code === "unknown-base");
});
