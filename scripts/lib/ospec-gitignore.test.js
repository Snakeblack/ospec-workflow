"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { ensureOspecGitignore, mkdirOspec } = require("./ospec-gitignore.js");
const { setup } = require("../setup-git-hooks.js");

function tempDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ospec-gitignore-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test("ensureOspecGitignore appends .ospec/ once and keeps an existing ignore", (t) => {
  const root = tempDir(t);
  const file = path.join(root, ".gitignore");
  fs.writeFileSync(file, "node_modules\n");
  assert.equal(ensureOspecGitignore(root).changed, true);
  assert.equal(fs.readFileSync(file, "utf8"), "node_modules\n.ospec/\n");
  assert.equal(ensureOspecGitignore(root).changed, false);
  assert.equal(fs.readFileSync(file, "utf8"), "node_modules\n.ospec/\n");

  const already = tempDir(t);
  fs.writeFileSync(path.join(already, ".gitignore"), "/.ospec/**\n");
  assert.equal(ensureOspecGitignore(already).changed, false);
});

test("a symlink gitignore is not followed", (t) => {
  const root = tempDir(t);
  const outside = tempDir(t);
  const target = path.join(outside, "ignored.txt");
  fs.writeFileSync(target, "keep\n");
  fs.symlinkSync(target, path.join(root, ".gitignore"));
  assert.equal(ensureOspecGitignore(root).changed, false);
  assert.equal(fs.readFileSync(target, "utf8"), "keep\n");
  assert.equal(fs.lstatSync(path.join(root, ".gitignore")).isSymbolicLink(), true);

  const dangling = tempDir(t);
  const missing = path.join(outside, "missing-target");
  fs.symlinkSync(missing, path.join(dangling, ".gitignore"));
  assert.equal(ensureOspecGitignore(dangling).changed, false);
  assert.equal(fs.existsSync(missing), false);

  fs.mkdirSync(path.join(root, ".git", "hooks"), { recursive: true });
  setup(root);
  assert.equal(fs.readFileSync(target, "utf8"), "keep\n");
  assert.equal(fs.lstatSync(path.join(root, ".gitignore")).isSymbolicLink(), true);
});

test("setup adds .ospec/ to a repository gitignore", (t) => {
  const root = tempDir(t);
  fs.mkdirSync(path.join(root, ".git", "hooks"), { recursive: true });
  setup(root);
  assert.match(fs.readFileSync(path.join(root, ".gitignore"), "utf8"), /^\.ospec\/\n/);
  assert.match(fs.readFileSync(path.join(root, ".git", "hooks", "pre-commit"), "utf8"), /pre-commit-hook\.js/);
});

test("mkdirOspec makes .ospec/ ignore itself and keeps an existing ignore", (t) => {
  const root = tempDir(t);
  const ignore = path.join(root, ".ospec", ".gitignore");
  mkdirOspec(path.join(root, ".ospec", "session", "change"));
  assert.equal(fs.statSync(path.join(root, ".ospec", "session", "change")).isDirectory(), true);
  assert.equal(fs.readFileSync(ignore, "utf8"), "*\n");

  fs.writeFileSync(ignore, "session/\n");
  mkdirOspec(path.join(root, ".ospec", "cache"));
  assert.equal(fs.readFileSync(ignore, "utf8"), "session/\n");
  assert.equal(fs.existsSync(path.join(root, ".gitignore")), false);
});

test("mkdirOspec never follows a symlink .ospec/.gitignore and leaves other directories alone", (t) => {
  const root = tempDir(t);
  const outside = tempDir(t);
  const missing = path.join(outside, "missing-target");
  fs.mkdirSync(path.join(root, ".ospec"));
  fs.symlinkSync(missing, path.join(root, ".ospec", ".gitignore"));
  mkdirOspec(path.join(root, ".ospec", "session"));
  assert.equal(fs.existsSync(missing), false);

  // On Windows an exclusive create ("wx") follows a dangling symlink and
  // creates its target (CI, windows-latest); this fs does the same anywhere.
  const windowsLike = {
    ...fs,
    writeFileSync(file, data, options) {
      const stat = fs.lstatSync(file, { throwIfNoEntry: false });
      if (stat && stat.isSymbolicLink() && options && options.flag === "wx") {
        return fs.writeFileSync(fs.readlinkSync(file), data);
      }
      return fs.writeFileSync(file, data, options);
    },
  };
  mkdirOspec(path.join(root, ".ospec", "cache"), windowsLike);
  assert.equal(fs.existsSync(missing), false);

  const plain = path.join(tempDir(t), "openspec", "changes");
  mkdirOspec(plain);
  assert.deepEqual(fs.readdirSync(path.dirname(plain)), ["changes"]);
  assert.equal(fs.existsSync(path.join(path.dirname(plain), ".gitignore")), false);
});
