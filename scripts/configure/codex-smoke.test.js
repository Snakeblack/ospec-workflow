"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { runConfigure } = require("./cli.js");
const { validate: validateCodex } = require("./validate-codex.js");
const { main: installMain } = require("./install-codex.js");

const ROOT = path.resolve(__dirname, "..", "..");

function tmpDir(t, prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test("codex smoke: output is generated and installed as a root agent.md and custom TOML agents", async (t) => {
  const sourceDir = ROOT;
  const buildOut = tmpDir(t, "ospec-codex-smoke-build-");
  const destRepo = tmpDir(t, "ospec-codex-smoke-dest-");

  // 1. Generate + validate the published payload
  const generated = runConfigure({ sourceDir, target: "codex", outDir: buildOut, validate: false });
  assert.ok(generated.files.length > 0, "codex payload must be non-empty");
  const validation = validateCodex(buildOut);
  assert.deepEqual(validation.errors, [], `published payload must validate cleanly:\n${validation.errors.join("\n")}`);

  // 2. Install into a temp destination repo
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

  // 3. Root agent.md should exist and contain the orchestrator instructions
  const agentMdPath = path.join(destRepo, "agent.md");
  assert.ok(fs.existsSync(agentMdPath), "agent.md must be installed at the root");
  const agentMdContent = fs.readFileSync(agentMdPath, "utf8");
  assert.ok(
    agentMdContent.includes("sdd-propose") || agentMdContent.includes("Propose"),
    "agent.md must contain reference to orchestrator delegation workflows",
  );

  // 4. Custom agents (excluding orchestrator) should be generated as TOML agents
  const agentsDir = path.join(destRepo, ".codex", "agents");
  assert.ok(fs.existsSync(agentsDir), "agents directory must exist");
  assert.ok(fs.existsSync(path.join(agentsDir, "sdd-apply.toml")), "custom agent toml must exist");
  assert.ok(!fs.existsSync(path.join(agentsDir, "sdd-orchestrator.toml")), "orchestrator toml must not exist");
});
