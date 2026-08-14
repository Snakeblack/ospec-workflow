"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { main: installOpenCode } = require("../../scripts/configure/install-global-opencode.js");
const { main: installCopilot } = require("../../scripts/configure/install-global-copilot.js");
const { main: installAntigravity } = require("../../scripts/configure/install-antigravity.js");
const { main: installCodex } = require("../../scripts/configure/install-codex.js");
const { main: installVsCode, updateSettingsJsoncPreservingComments } = require("../../scripts/configure/install-vscode.js");

function makeTempDir(t, prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test("OpenCode installation engine: multi-version upgrade converges and preserves user files", (t) => {
  const sandbox = makeTempDir(t, "opencode-conv-");
  const globalDir = path.join(sandbox, "opencode-home");
  const sourceV1 = path.join(sandbox, "source-v1");
  const sourceV2 = path.join(sandbox, "source-v2");

  fs.mkdirSync(globalDir, { recursive: true });

  // Setup V1 generated files
  const outDirV1 = path.join(sourceV1, "dist", "opencode");
  fs.mkdirSync(path.join(outDirV1, ".opencode", "agents"), { recursive: true });
  fs.mkdirSync(path.join(outDirV1, "skills", "test-skill"), { recursive: true });
  fs.writeFileSync(path.join(outDirV1, ".opencode", "agents", "sdd-apply.md"), "apply v1");
  fs.writeFileSync(path.join(outDirV1, ".opencode", "agents", "sdd-deprecated.md"), "deprecated agent");
  fs.writeFileSync(path.join(outDirV1, "skills", "test-skill", "SKILL.md"), "skill v1");
  fs.writeFileSync(
    path.join(outDirV1, "opencode.json"),
    JSON.stringify({ mcp: { context7: { type: "local" } } })
  );

  // Run V1 setup
  const codeV1 = installOpenCode(["--source", sourceV1, "--dest", globalDir, "--no-validate"], {
    fs,
    copyBinaryToTree: () => {},
    runConfigure: () => ({ exitCode: 0 }),
    stdout: { write: () => {} },
    stderr: { write: () => {} },
  });
  assert.equal(codeV1, 0);

  // User adds custom agent and custom skill directly in global home
  fs.writeFileSync(path.join(globalDir, "agents", "my-custom-agent.md"), "# Custom Agent");
  fs.mkdirSync(path.join(globalDir, "skills", "user-skill"), { recursive: true });
  fs.writeFileSync(path.join(globalDir, "skills", "user-skill", "SKILL.md"), "# User Skill");

  // Setup V2 generated files (sdd-deprecated.md is removed, sdd-verify.md is added)
  const outDirV2 = path.join(sourceV2, "dist", "opencode");
  fs.mkdirSync(path.join(outDirV2, ".opencode", "agents"), { recursive: true });
  fs.mkdirSync(path.join(outDirV2, "skills", "test-skill"), { recursive: true });
  fs.writeFileSync(path.join(outDirV2, ".opencode", "agents", "sdd-apply.md"), "apply v2");
  fs.writeFileSync(path.join(outDirV2, ".opencode", "agents", "sdd-verify.md"), "verify v2");
  fs.writeFileSync(path.join(outDirV2, "skills", "test-skill", "SKILL.md"), "skill v2");
  fs.writeFileSync(
    path.join(outDirV2, "opencode.json"),
    JSON.stringify({ mcp: { context7: { type: "local" } } })
  );

  // Run V2 setup
  const codeV2 = installOpenCode(["--source", sourceV2, "--dest", globalDir, "--no-validate"], {
    fs,
    copyBinaryToTree: () => {},
    runConfigure: () => ({ exitCode: 0 }),
    stdout: { write: () => {} },
    stderr: { write: () => {} },
  });
  assert.equal(codeV2, 0);

  // 1. Assert stale file was properly deleted from agents/
  assert.equal(fs.existsSync(path.join(globalDir, "agents", "sdd-deprecated.md")), false);

  // 2. Assert new files exist
  assert.equal(fs.existsSync(path.join(globalDir, "agents", "sdd-verify.md")), true);
  assert.equal(fs.readFileSync(path.join(globalDir, "agents", "sdd-apply.md"), "utf8"), "apply v2");

  // 3. Assert user files are completely untouched
  assert.equal(fs.existsSync(path.join(globalDir, "agents", "my-custom-agent.md")), true);
  assert.equal(fs.existsSync(path.join(globalDir, "skills", "user-skill", "SKILL.md")), true);

  // 4. Assert ownership manifest contains properly-prefixed paths
  const manifest = JSON.parse(fs.readFileSync(path.join(globalDir, ".ospec-workflow-install.json"), "utf8"));
  assert.ok(manifest.files.includes("agents/sdd-apply.md"));
  assert.ok(manifest.files.includes("agents/sdd-verify.md"));
  assert.ok(manifest.files.includes("skills/test-skill/SKILL.md"));
  assert.ok(!manifest.files.includes("sdd-apply.md")); // Must NOT be un-prefixed
  assert.ok(!manifest.files.includes("agents/my-custom-agent.md")); // Must NOT claim user file
});

test("Copilot installation engine: multi-version upgrade converges and preserves user files", (t) => {
  const sandbox = makeTempDir(t, "copilot-conv-");
  const globalDir = path.join(sandbox, "copilot-home");
  const sourceV1 = path.join(sandbox, "source-v1");
  const sourceV2 = path.join(sandbox, "source-v2");

  fs.mkdirSync(globalDir, { recursive: true });

  // V1 build
  const outDirV1 = path.join(sourceV1, "dist", "github-copilot");
  fs.mkdirSync(path.join(outDirV1, ".github", "agents"), { recursive: true });
  fs.writeFileSync(path.join(outDirV1, ".github", "agents", "old-agent.md"), "old copilot agent");
  fs.writeFileSync(path.join(outDirV1, ".github", "agents", "sdd-apply.md"), "copilot apply v1");

  const codeV1 = installCopilot(["--source", sourceV1, "--dest", globalDir, "--no-validate"], {
    fs,
    copyBinaryToTree: () => {},
    runConfigure: () => ({ exitCode: 0 }),
    stdout: { write: () => {} },
    stderr: { write: () => {} },
  });
  assert.equal(codeV1, 0);

  // User adds custom prompt
  fs.mkdirSync(path.join(globalDir, "prompts"), { recursive: true });
  fs.writeFileSync(path.join(globalDir, "prompts", "user-custom.prompt.md"), "custom prompt");

  // V2 build (old-agent.md removed)
  const outDirV2 = path.join(sourceV2, "dist", "github-copilot");
  fs.mkdirSync(path.join(outDirV2, ".github", "agents"), { recursive: true });
  fs.writeFileSync(path.join(outDirV2, ".github", "agents", "sdd-apply.md"), "copilot apply v2");

  const codeV2 = installCopilot(["--source", sourceV2, "--dest", globalDir, "--no-validate"], {
    fs,
    copyBinaryToTree: () => {},
    runConfigure: () => ({ exitCode: 0 }),
    stdout: { write: () => {} },
    stderr: { write: () => {} },
  });
  assert.equal(codeV2, 0);

  // Assert old agent pruned, new updated, user prompt preserved
  assert.equal(fs.existsSync(path.join(globalDir, "agents", "old-agent.md")), false);
  assert.equal(fs.readFileSync(path.join(globalDir, "agents", "sdd-apply.md"), "utf8"), "copilot apply v2");
  assert.equal(fs.existsSync(path.join(globalDir, "prompts", "user-custom.prompt.md")), true);

  const manifest = JSON.parse(fs.readFileSync(path.join(globalDir, ".ospec-workflow-install.json"), "utf8"));
  assert.ok(manifest.files.includes("agents/sdd-apply.md"));
  assert.ok(!manifest.files.includes("agents/old-agent.md"));
});

test("VS Code settings: preserves existing comments and syntax during installation", () => {
  const initialJsonc = `// Global user preferences
{
  // Theme settings
  "workbench.colorTheme": "Default Dark+",
  /* Plugin array */
  "chat.pluginLocations": [
    "/existing/plugin/path"
  ],
}
`;
  const { content, updated } = updateSettingsJsoncPreservingComments(initialJsonc, "/new/ospec/dist/vscode");
  assert.equal(updated, true);
  assert.match(content, /\/\/ Global user preferences/);
  assert.match(content, /\/\/ Theme settings/);
  assert.match(content, /\/\* Plugin array \*\//);
  assert.match(content, /"\/existing\/plugin\/path"/);
  assert.match(content, /"\/new\/ospec\/dist\/vscode"/);
});

test("Antigravity installation engine: multi-version upgrade converges and preserves user hooks/skills", (t) => {
  const sandbox = makeTempDir(t, "antigravity-conv-");
  const globalDir = path.join(sandbox, "antigravity-home");
  const sourceV1 = path.join(sandbox, "source-v1");
  const sourceV2 = path.join(sandbox, "source-v2");

  fs.mkdirSync(globalDir, { recursive: true });

  // V1 build
  const outDirV1 = path.join(sourceV1, "dist", "antigravity");
  fs.mkdirSync(path.join(outDirV1, "skills", "old-skill"), { recursive: true });
  fs.writeFileSync(path.join(outDirV1, "skills", "old-skill", "SKILL.md"), "# Old Skill");
  fs.writeFileSync(
    path.join(outDirV1, "hooks.json"),
    JSON.stringify({ hooks: { SessionStart: [{ command: "node test-v1.js" }] } })
  );

  const codeV1 = installAntigravity(["--source", sourceV1, "--dest", globalDir, "--no-validate"], {
    fs,
    copyBinaryToTree: () => {},
    runConfigure: () => ({ exitCode: 0 }),
    validateInstalled: () => ({ errors: [] }),
    stdout: { write: () => {} },
    stderr: { write: () => {} },
  });
  assert.equal(codeV1, 0);

  // User adds custom rule and custom skill
  fs.mkdirSync(path.join(globalDir, "rules"), { recursive: true });
  fs.writeFileSync(path.join(globalDir, "rules", "user-rule.md"), "# User Rule");
  fs.mkdirSync(path.join(globalDir, "skills", "user-skill"), { recursive: true });
  fs.writeFileSync(path.join(globalDir, "skills", "user-skill", "SKILL.md"), "# User Skill");

  // V2 build (old-skill removed, new-skill added)
  const outDirV2 = path.join(sourceV2, "dist", "antigravity");
  fs.mkdirSync(path.join(outDirV2, "skills", "new-skill"), { recursive: true });
  fs.writeFileSync(path.join(outDirV2, "skills", "new-skill", "SKILL.md"), "# New Skill");
  fs.writeFileSync(
    path.join(outDirV2, "hooks.json"),
    JSON.stringify({ hooks: { SessionStart: [{ command: "node test-v2.js" }] } })
  );

  const codeV2 = installAntigravity(["--source", sourceV2, "--dest", globalDir, "--no-validate"], {
    fs,
    copyBinaryToTree: () => {},
    runConfigure: () => ({ exitCode: 0 }),
    validateInstalled: () => ({ errors: [] }),
    stdout: { write: () => {} },
    stderr: { write: () => {} },
  });
  assert.equal(codeV2, 0);

  // Assert old skill pruned, new skill added, user rule and skill untouched
  assert.equal(fs.existsSync(path.join(globalDir, "skills", "old-skill", "SKILL.md")), false);
  assert.equal(fs.existsSync(path.join(globalDir, "skills", "new-skill", "SKILL.md")), true);
  assert.equal(fs.existsSync(path.join(globalDir, "rules", "user-rule.md")), true);
  assert.equal(fs.existsSync(path.join(globalDir, "skills", "user-skill", "SKILL.md")), true);

  const manifest = JSON.parse(fs.readFileSync(path.join(globalDir, ".ospec-workflow-install.json"), "utf8"));
  assert.ok(manifest.files.includes("skills/new-skill/SKILL.md"));
  assert.ok(!manifest.files.includes("skills/old-skill/SKILL.md"));
});

test("Codex installation engine: multi-version upgrade converges skills and agents while preserving user custom skills", (t) => {
  const sandbox = makeTempDir(t, "codex-conv-");
  const home = path.join(sandbox, "user-home");
  const codexRoot = path.join(home, ".codex");
  const skillsRoot = path.join(home, ".agents", "skills");
  const sourceV1 = path.join(sandbox, "source-v1");
  const sourceV2 = path.join(sandbox, "source-v2");

  fs.mkdirSync(codexRoot, { recursive: true });
  fs.mkdirSync(skillsRoot, { recursive: true });

  // V1 build: sdd-apply and old-skill
  const outDirV1 = path.join(sourceV1, "dist", "codex");
  fs.mkdirSync(path.join(outDirV1, ".codex", "agents"), { recursive: true });
  fs.writeFileSync(path.join(outDirV1, "AGENTS.md"), "# Codex Agents");
  fs.writeFileSync(path.join(outDirV1, ".codex", "agents", "sdd-apply.toml"), 'name = "sdd-apply"');
  fs.writeFileSync(path.join(outDirV1, ".codex", "agents", "old-agent.toml"), 'name = "old-agent"');
  fs.mkdirSync(path.join(outDirV1, "skills", "old-skill"), { recursive: true });
  fs.writeFileSync(path.join(outDirV1, "skills", "old-skill", "SKILL.md"), "# Old Skill");
  fs.mkdirSync(path.join(outDirV1, "scripts"), { recursive: true });
  fs.writeFileSync(path.join(outDirV1, "hooks.json"), JSON.stringify({ hooks: {} }));

  const codeV1 = installCodex(["--source", sourceV1, "--no-validate"], {
    fs,
    homedir: () => home,
    outDir: outDirV1,
    runConfigure: () => ({ exitCode: 0 }),
    findCodexBin: () => null,
    stdout: { write: () => {} },
    stderr: { write: () => {} },
  });
  assert.equal(codeV1, 0);

  // User adds custom agent and custom skill
  fs.writeFileSync(path.join(codexRoot, "agents", "user-custom.toml"), 'name = "user-custom"');
  fs.mkdirSync(path.join(skillsRoot, "user-custom-skill"), { recursive: true });
  fs.writeFileSync(path.join(skillsRoot, "user-custom-skill", "SKILL.md"), "# User Custom Skill");

  // V2 build: old-agent and old-skill are removed; sdd-verify and new-skill are added
  const outDirV2 = path.join(sourceV2, "dist", "codex");
  fs.mkdirSync(path.join(outDirV2, ".codex", "agents"), { recursive: true });
  fs.writeFileSync(path.join(outDirV2, "AGENTS.md"), "# Codex Agents");
  fs.writeFileSync(path.join(outDirV2, ".codex", "agents", "sdd-apply.toml"), 'name = "sdd-apply"');
  fs.writeFileSync(path.join(outDirV2, ".codex", "agents", "sdd-verify.toml"), 'name = "sdd-verify"');
  fs.mkdirSync(path.join(outDirV2, "skills", "new-skill"), { recursive: true });
  fs.writeFileSync(path.join(outDirV2, "skills", "new-skill", "SKILL.md"), "# New Skill");
  fs.mkdirSync(path.join(outDirV2, "scripts"), { recursive: true });
  fs.writeFileSync(path.join(outDirV2, "hooks.json"), JSON.stringify({ hooks: {} }));

  const codeV2 = installCodex(["--source", sourceV2, "--no-validate"], {
    fs,
    homedir: () => home,
    outDir: outDirV2,
    runConfigure: () => ({ exitCode: 0 }),
    findCodexBin: () => null,
    stdout: { write: () => {} },
    stderr: { write: () => {} },
  });
  assert.equal(codeV2, 0);

  // Assert old agent and old skill were pruned
  assert.equal(fs.existsSync(path.join(codexRoot, "agents", "old-agent.toml")), false);
  assert.equal(fs.existsSync(path.join(skillsRoot, "old-skill", "SKILL.md")), false);

  // Assert new agent and new skill were added
  assert.equal(fs.existsSync(path.join(codexRoot, "agents", "sdd-verify.toml")), true);
  assert.equal(fs.existsSync(path.join(skillsRoot, "new-skill", "SKILL.md")), true);

  // Assert user custom files are completely preserved
  assert.equal(fs.existsSync(path.join(codexRoot, "agents", "user-custom.toml")), true);
  assert.equal(fs.existsSync(path.join(skillsRoot, "user-custom-skill", "SKILL.md")), true);

  // Assert both manifests are present and updated
  const codexManifest = JSON.parse(fs.readFileSync(path.join(codexRoot, ".ospec-workflow-install.json"), "utf8"));
  assert.equal(codexManifest.target, "codex");
  assert.ok(codexManifest.files.includes("agents/sdd-verify.toml"));
  assert.ok(!codexManifest.files.includes("agents/old-agent.toml"));

  const skillsManifest = JSON.parse(fs.readFileSync(path.join(skillsRoot, ".ospec-workflow-install.json"), "utf8"));
  assert.equal(skillsManifest.target, "codex-skills");
  assert.ok(skillsManifest.files.includes("new-skill/SKILL.md"));
  assert.ok(!skillsManifest.files.includes("old-skill/SKILL.md"));
});


