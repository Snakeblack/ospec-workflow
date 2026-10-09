"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

function snapshot(root) {
  const entries = [];
  function walk(relative = "") {
    for (const entry of fs.readdirSync(path.join(root, relative), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const child = path.join(relative, entry.name);
      entries.push(entry.isDirectory() ? ["dir", child] : ["file", child, createHash("sha256").update(fs.readFileSync(path.join(root, child))).digest("hex")]);
      if (entry.isDirectory()) walk(child);
    }
  }
  walk();
  return createHash("sha256").update(JSON.stringify(entries)).digest("hex");
}

test("installer tests preserve an inherited CODEX_HOME", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "codex-inherited-home-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const runtime = path.join(root, "ospec-workflow", "scripts", "hooks");
  fs.mkdirSync(runtime, { recursive: true });
  fs.writeFileSync(path.join(runtime, "ospec-codex-hook.js"), "// installed hook must survive\n");
  fs.writeFileSync(path.join(root, "hooks.json"), JSON.stringify({ hooks: { SessionStart: [{ hooks: [{ command: "user-hook" }] }] } }));
  fs.writeFileSync(path.join(root, ".ospec-workflow-install.json"), JSON.stringify({
    version: "0.0.0", target: "codex", files: ["hooks.json", "ospec-workflow/scripts/hooks/ospec-codex-hook.js"],
  }));
  const before = snapshot(root);

  const env = { ...process.env, CODEX_HOME: root };
  // A nested Node test runner must schedule its own tests, not inherit the
  // worker marker that would let it exit successfully without running them.
  delete env.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath, [
    "--test", "--test-reporter=tap",
    path.join(__dirname, "install-codex.test.js"),
    path.join(__dirname, "codex-smoke.test.js"),
    path.join(__dirname, "../../tests/integration/installation-convergence.test.js"),
  ], {
    env,
    encoding: "utf8",
    timeout: 60000,
    maxBuffer: 4 * 1024 * 1024,
  });

  assert.equal(snapshot(root), before, "fixtures must not write to or prune the host's inherited home");
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /# tests [1-9]\d+/, "the nested runner must execute the installer suite");
});
