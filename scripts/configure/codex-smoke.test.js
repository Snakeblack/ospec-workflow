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

function listFiles(root, relDir = "", files = []) {
  const absolute = path.join(root, relDir);
  for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
    const relative = relDir ? path.join(relDir, entry.name) : entry.name;
    if (entry.isDirectory()) {
      listFiles(root, relative, files);
    } else if (entry.isFile()) {
      files.push(relative);
    }
  }
  return files.sort();
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

test("codex smoke: global install contains every generated skill and preserves user state across two runs", (t) => {
  const sourceDir = ROOT;
  const buildOut = tmpDir(t, "ospec-codex-global-smoke-build-");
  const installSource = tmpDir(t, "ospec-codex-global-smoke-source-");
  const homeDir = tmpDir(t, "ospec-codex-global-smoke-home-");
  const generated = runConfigure({ sourceDir, target: "codex", outDir: buildOut, validate: false });
  assert.ok(generated.files.length > 0);
  assert.deepEqual(validateCodex(buildOut).errors, []);

  fs.mkdirSync(path.join(homeDir, ".codex"), { recursive: true });
  fs.writeFileSync(path.join(homeDir, ".codex", "config.toml"), "model = \"user-choice\"\n");
  fs.writeFileSync(path.join(homeDir, ".codex", "auth.json"), "{\"token\":\"user-owned\"}\n");
  fs.mkdirSync(path.join(homeDir, ".agents", "skills", "user-extra"), { recursive: true });
  fs.writeFileSync(path.join(homeDir, ".agents", "skills", "user-extra", "SKILL.md"), "keep\n");

  const runInstall = () => installMain([], {
    cwd: installSource,
    homedir: () => homeDir,
    stdout: { write() {} },
    stderr: { write() {} },
    findCodexBin: () => null,
    runConfigure({ outDir }) {
      fs.cpSync(buildOut, outDir, { recursive: true, force: true });
      return { exitCode: 0, validation: null, files: generated.files };
    },
  });

  assert.equal(runInstall(), 0);
  const installedSkills = path.join(homeDir, ".agents", "skills");
  const generatedSkillFiles = listFiles(path.join(buildOut, "skills"));
  assert.ok(generatedSkillFiles.includes(path.join("commands", "sdd-apply", "SKILL.md")));
  assert.ok(generatedSkillFiles.includes(path.join("accessibility", "SKILL.md")));
  for (const relative of generatedSkillFiles) {
    assert.ok(
      fs.readFileSync(path.join(buildOut, "skills", relative)).equals(fs.readFileSync(path.join(installedSkills, relative))),
      `installed skill must match generated payload: ${relative}`,
    );
  }
  const firstSnapshot = generatedSkillFiles.map((relative) => [
    relative,
    fs.readFileSync(path.join(installedSkills, relative), "hex"),
  ]);

  assert.equal(runInstall(), 0);
  assert.deepEqual(
    generatedSkillFiles.map((relative) => [relative, fs.readFileSync(path.join(installedSkills, relative), "hex")]),
    firstSnapshot,
  );
  assert.equal(fs.readFileSync(path.join(installedSkills, "user-extra", "SKILL.md"), "utf8"), "keep\n");
  assert.equal(fs.readFileSync(path.join(homeDir, ".codex", "config.toml"), "utf8"), "model = \"user-choice\"\n");
  assert.equal(fs.readFileSync(path.join(homeDir, ".codex", "auth.json"), "utf8"), "{\"token\":\"user-owned\"}\n");
});
