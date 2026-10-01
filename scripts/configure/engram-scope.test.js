"use strict";

// REQ-session-memory-008/009, REQ-generator-018: the Engram addendum is confined
// to the Claude target. Every test self-generates into a temp dir via
// runConfigure; it never reads the gitignored ROOT/dist tree.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { runConfigure, PROFILES } = require("./cli.js");

const ROOT = path.resolve(__dirname, "..", "..");
const ADDENDUM_PATH = "rules/engram-session-memory.instructions.md";
const HEADING = "# Engram Session Memory (Claude Code, optional)";
// Neutral host-adapter table row allowed in the shared phase protocol (REQ-skills-020).
const NEUTRAL_ALLOWLIST = /(^|\/)skills\/_shared\/sdd-phase-common\.md$/;

function generate(t, target) {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), `ospec-engram-${target}-`));
  t.after(() => fs.rmSync(out, { recursive: true, force: true }));
  const result = runConfigure({ sourceDir: ROOT, target, outDir: out, validate: false });
  assert.equal(result.exitCode, 0, `${target} generation failed`);
  return { out, files: result.files };
}

test("the addendum source exists with the expected heading", () => {
  const source = fs.readFileSync(path.join(ROOT, ADDENDUM_PATH), "utf8");
  assert.ok(source.includes(HEADING));
});

test("claude output inlines the addendum into the orchestrator skill and registers no Engram MCP/hook", (t) => {
  const { files } = generate(t, "claude");
  const orchestrator = files.find((f) => /skills\/sdd-orchestrator\/SKILL\.md$/.test(f.path));
  assert.ok(orchestrator, "claude emits the orchestrator skill");
  assert.ok(orchestrator.content.includes(HEADING), "orchestrator skill carries the addendum");
  assert.ok(!files.some((f) => f.path === ADDENDUM_PATH), "no standalone rules file in claude output");

  const mcp = files.find((f) => f.path === ".mcp.json");
  if (mcp) assert.doesNotMatch(mcp.content, /engram/i);
  const hooks = files.find((f) => /hooks\/hooks\.json$/.test(f.path));
  if (hooks) assert.doesNotMatch(hooks.content, /engram/i);
});

for (const target of Object.keys(PROFILES).filter((id) => id !== "claude")) {
  test(`${target} output has no Engram addendum, MCP entry or hook`, (t) => {
    const { out, files } = generate(t, target);
    for (const file of files) {
      assert.ok(!file.content.includes(HEADING), `${target}: ${file.path} contains the addendum heading`);
      if (NEUTRAL_ALLOWLIST.test(file.path)) continue;
      assert.doesNotMatch(file.content, /engram/i, `${target}: ${file.path} mentions Engram`);
    }
    // Same check against what was actually published to disk.
    assert.ok(!fs.existsSync(path.join(out, ADDENDUM_PATH)), `${target}: addendum file published`);
  });
}
