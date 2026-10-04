"use strict";

// REQ-session-memory-008/009, REQ-generator-018 (engram-per-target, adr-20261003-001):
// every target ships the host-neutral Engram addendum on its orchestrator
// instruction surface, and no generated MCP config or hooks file registers
// Engram (registration happens at install time through the upstream setup).
// Every test self-generates into a temp dir via runConfigure; it never reads the
// gitignored ROOT/dist tree.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { runConfigure, PROFILES } = require("./cli.js");

const ROOT = path.resolve(__dirname, "..", "..");
const ADDENDUM_PATH = "rules/engram-session-memory.instructions.md";
const HEADING = "# Engram Session Memory (optional)";
// Where each target folds the addendum: the orchestrator, since its source
// scope is agents/** (E0.2), or the identity rules/ tree on VS Code.
const SURFACES = {
  claude: /^skills\/sdd-orchestrator\/SKILL\.md$/,
  codex: /^skills\/sdd-orchestrator\/SKILL\.md$/,
  "github-copilot": /^\.github\/agents\/sdd-orchestrator\.agent\.md$/,
  opencode: /^\.opencode\/agents\/ospec-workflow\.md$/,
  cursor: /^agents\/sdd-orchestrator\.md$/,
  vscode: /^rules\/engram-session-memory\.instructions\.md$/,
  antigravity: /^agents\/sdd-orchestrator\.agent\.md$/,
};
const CONFIG_FILE = /(^|\/)(\.mcp\.json|mcp[-_]config\.json|opencode\.jsonc?|hooks\.json|config\.toml)$/;

function generate(t, target) {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), `ospec-engram-${target}-`));
  t.after(() => fs.rmSync(out, { recursive: true, force: true }));
  const result = runConfigure({ sourceDir: ROOT, target, outDir: out, validate: false });
  assert.equal(result.exitCode, 0, `${target} generation failed`);
  return { out, files: result.files };
}

test("the addendum source exists with the host-neutral heading", () => {
  const source = fs.readFileSync(path.join(ROOT, ADDENDUM_PATH), "utf8");
  assert.ok(source.includes(HEADING));
  assert.doesNotMatch(source, /Claude Code/, "the addendum must not be Claude-specific");
});

test("every generator target has a declared addendum surface", () => {
  assert.deepEqual(Object.keys(SURFACES).sort(), Object.keys(PROFILES).sort());
});

for (const target of Object.keys(PROFILES)) {
  test(`${target} output carries the addendum once and registers no Engram MCP/hook`, (t) => {
    const { out, files } = generate(t, target);
    const carriers = files.filter((f) => f.content.includes(HEADING)).map((f) => f.path);
    assert.equal(carriers.length, 1, `${target}: addendum carriers ${JSON.stringify(carriers)}`);
    assert.match(carriers[0], SURFACES[target]);
    assert.ok(fs.existsSync(path.join(out, carriers[0])), `${target}: ${carriers[0]} published`);

    for (const file of files.filter((f) => CONFIG_FILE.test(f.path))) {
      assert.doesNotMatch(file.content, /engram/i, `${target}: ${file.path} registers Engram`);
    }
  });
}
