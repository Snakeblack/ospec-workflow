"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { main, parseArgs } = require("./install-global-opencode.js");

test("parseArgs handles arguments cleanly", () => {
  assert.deepEqual(parseArgs(["--dry-run"]), {
    dryRun: true,
    validate: true,
    source: undefined,
    dest: undefined,
  });
  assert.deepEqual(parseArgs(["--dest", "/custom/dest"]), {
    dryRun: false,
    validate: true,
    source: undefined,
    dest: "/custom/dest",
  });
});

// --- uvx prerequisite warning (foundation document conversion) -------------

function uvxBox(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "opencode-uvx-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, "source");
  const dest = path.join(root, "dest");
  fs.mkdirSync(path.join(source, "dist", "opencode"), { recursive: true });
  fs.mkdirSync(dest, { recursive: true });
  fs.writeFileSync(path.join(source, "package.json"), JSON.stringify({ name: "ospec-workflow", version: "1.0.0" }));
  fs.writeFileSync(
    path.join(source, "dist", "opencode", "opencode.json"),
    JSON.stringify({ mcp: { markitdown: { type: "local", command: ["uvx", "markitdown-mcp@0.0.1a7"], enabled: true } } }),
  );
  return { source, dest };
}

function runInstall(source, dest, deps = {}) {
  return main(["--source", source, "--dest", dest], {
    runConfigure: () => ({ files: [], summary: [], exitCode: 0, validation: null }),
    copyBinaryToTree() {},
    stdout: { write() {} },
    ...deps,
  });
}

test("setup:opencode warns when the generated MCP config needs uvx and the binary is missing", (t) => {
  const { source, dest } = uvxBox(t);
  const stderr = [];
  const exitCode = runInstall(source, dest, {
    spawnSync: () => ({ error: new Error("ENOENT") }),
    stderr: { write: (chunk) => stderr.push(chunk) },
  });
  assert.equal(exitCode, 0);
  assert.match(stderr.join(""), /uvx/);
  assert.match(stderr.join(""), /docs\.astral\.sh\/uv/);
  assert.ok(fs.existsSync(path.join(dest, "opencode.json")), "the global config is still merged");
});

test("setup:opencode stays silent when uvx answers", (t) => {
  const { source, dest } = uvxBox(t);
  const stderr = [];
  const probes = [];
  const exitCode = runInstall(source, dest, {
    spawnSync(command, args) {
      probes.push([command, ...args]);
      return { status: 0 };
    },
    stderr: { write: (chunk) => stderr.push(chunk) },
  });
  assert.equal(exitCode, 0);
  assert.deepEqual(probes, [["uvx", "--version"]]);
  assert.doesNotMatch(stderr.join(""), /uvx/);
});
