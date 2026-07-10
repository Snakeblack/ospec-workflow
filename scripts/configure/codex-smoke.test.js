"use strict";

// REQ-install-003: minimal skill → orchestrator → SessionStart smoke test over
// the *published* codex payload (built by runConfigure, never the gitignored
// dist/ tree — see the "dist tests must self-generate" convention shared by
// real-repo.test.js and install-codex.test.js). This intentionally stays
// narrower than a full E2E apply/verify/4R cycle: it does not spawn the
// `codex` CLI binary (unavailable in CI), it drives the same Node hook entry
// point the generated wrapper's `command`/`commandWindows` invoke
// (scripts/hooks/session-start.js) directly against the generated+installed
// tree, per design.md's Testing Strategy "E2E (smoke)" row and Open Questions
// note (live-CLI smoke stays a manual field check).

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { runConfigure } = require("./cli.js");
const { validate: validateCodex } = require("./validate-codex.js");
const { main: installMain } = require("./install-codex.js");
const { runSessionStart } = require("../hooks/session-start.js");

const ROOT = path.resolve(__dirname, "..", "..");

function tmpDir(t, prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function parseAgentToml(content) {
  const fields = {};
  const multilineMatch = content.match(/developer_instructions = """\n([\s\S]*?)"""/);
  let head = content;
  if (multilineMatch) {
    fields.developer_instructions = multilineMatch[1];
    head = content.slice(0, multilineMatch.index);
  }
  for (const line of head.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const m = trimmed.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*"((?:[^"\\]|\\.)*)"\s*$/);
    if (!m) {
      throw new Error(`malformed TOML line: ${JSON.stringify(line)}`);
    }
    fields[m[1]] = m[2].replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  }
  return fields;
}

test("codex smoke: skill entry dispatches through the orchestrator TOML agent to a well-formed SessionStart response", async (t) => {
  const sourceDir = ROOT;
  const buildOut = tmpDir(t, "ospec-codex-smoke-build-");
  const destRepo = tmpDir(t, "ospec-codex-smoke-dest-");

  // 1. Generate + validate the published payload (never read gitignored dist/).
  const generated = runConfigure({ sourceDir, target: "codex", outDir: buildOut, validate: false });
  assert.ok(generated.files.length > 0, "codex payload must be non-empty");
  const validation = validateCodex(buildOut);
  assert.deepEqual(validation.errors, [], `published payload must validate cleanly:\n${validation.errors.join("\n")}`);

  // 2. Install into a temp destination repo via the real install channels
  // (agent channel: .codex/agents/*.toml; per REQ-install-001 this never
  // creates or modifies .codex/config.toml).
  const installExit = installMain([destRepo, "--no-validate"], {
    cwd: sourceDir,
    stdout: { write() {} },
    stderr: { write() {} },
    runConfigure({ outDir, validate }) {
      assert.equal(validate, false);
      const result = runConfigure({ sourceDir, target: "codex", outDir, validate: false });
      return { exitCode: 0, validation: null, files: result.files };
    },
  });
  assert.equal(installExit, 0);
  assert.ok(!fs.existsSync(path.join(destRepo, ".codex", "config.toml")));

  // 3. Skill entry point → orchestrator: the installed orchestrator TOML agent
  // is autodetectable (REQ-agents-010) and its developer_instructions retain
  // delegation to the phase sub-agents an entry skill's flow reaches.
  const orchestratorTomlPath = path.join(destRepo, ".codex", "agents", "sdd-orchestrator.toml");
  assert.ok(fs.existsSync(orchestratorTomlPath), "orchestrator TOML agent must be installed");
  const orchestratorFields = parseAgentToml(fs.readFileSync(orchestratorTomlPath, "utf8"));
  assert.equal(orchestratorFields.name, "sdd-orchestrator");
  assert.ok(orchestratorFields.description);
  assert.ok(
    orchestratorFields.developer_instructions.includes("sdd-propose"),
    "orchestrator dispatch must retain the phase sub-agent it delegates proposal work to",
  );
  assert.match(
    fs.readFileSync(orchestratorTomlPath, "utf8"),
    /\[agents\]\nmax_depth = 1\n/,
    "installed Codex agents must prevent recursive delegation",
  );

  // 4. Orchestrator → SessionStart: invoke the same Node hook entry point the
  // generated wrapper's command/commandWindows target, against the generated
  // plugin bundle (buildOut, which the orchestrator's session lives under).
  const workspace = tmpDir(t, "ospec-codex-smoke-workspace-");
  fs.mkdirSync(path.join(workspace, "openspec"), { recursive: true });
  fs.writeFileSync(path.join(workspace, "openspec", "config.yaml"), "strict_tdd: true\n");

  const sessionStartResult = await runSessionStart({
    input: { cwd: workspace },
    pluginRoot: buildOut,
    now: () => new Date("2026-07-10T00:00:00.000Z"),
  });

  assert.equal(sessionStartResult.status, "ok");
  assert.equal(sessionStartResult.ospecDetected, true);
  assert.ok(sessionStartResult.registry && typeof sessionStartResult.registry.status === "string");
  assert.match(sessionStartResult.registry.status, /^(generated|reused)$/);
});
