"use strict";

// The repo ships two plugin manifests on purpose:
//   - .plugin.json                 canonical, read by VS Code / direct-load
//   - .claude-plugin/plugin.json   compatibility copy, read by the Claude
//                                  distribution and the generator (cli.js source)
// They MUST describe the same plugin (same name, version, component wiring) or a
// consumer loads stale metadata. Nothing derives one from the other, so this test
// is the contract that keeps them from drifting. If you change one, change both.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "..");
const CANONICAL = path.join(ROOT, ".plugin.json");
const CLAUDE_COPY = path.join(ROOT, ".claude-plugin", "plugin.json");

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

test("the canonical and Claude manifests stay in sync", () => {
  const canonical = readJson(CANONICAL);
  const claudeCopy = readJson(CLAUDE_COPY);

  assert.deepEqual(
    claudeCopy,
    canonical,
    ".claude-plugin/plugin.json must mirror the canonical .plugin.json (bump both together)",
  );
});
