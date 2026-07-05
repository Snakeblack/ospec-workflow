"use strict";

// Verification tests for the sdd-document agent change.
// Validates:
// 1. Target generation transforms (vscode, claude, copilot, opencode)
// 2. Models routing mapping validation
// 3. Static contract validation for launch gate and Option C validation
// 4. Sandbox write boundaries constraints check

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs/promises");
const fsSync = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const ROOT_DIR = path.resolve(__dirname, "..");
const AGENT_PATH = path.join(ROOT_DIR, "agents", "sdd-document.agent.md");
const COMMAND_PATH = path.join(ROOT_DIR, "commands", "sdd-document.prompt.md");
const SKILL_PATH = path.join(ROOT_DIR, "skills", "sdd-document", "SKILL.md");
const MODELS_PATH = path.join(ROOT_DIR, "models.yaml");

function tmpOut(t) {
  const dir = fsSync.mkdtempSync(path.join(os.tmpdir(), "ospec-sdd-document-"));
  t.after(() => fsSync.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

// --- Static Contract / Schema Tests ---

test("sdd-document.agent.md has correct frontmatter and no model field", async () => {
  const content = await fs.readFile(AGENT_PATH, "utf8");
  assert.ok(content.includes("name: sdd-document"));
  assert.ok(content.includes("user-invocable: false"));
  assert.ok(content.includes("tools: ['read', 'search', 'edit']"));
  assert.ok(!content.includes("model:"));
});

test("sdd-document.prompt.md is mapped to sdd-orchestrator", async () => {
  const content = await fs.readFile(COMMAND_PATH, "utf8");
  assert.ok(content.includes("name: sdd-document"));
  assert.ok(content.includes("agent: sdd-orchestrator"));
});

test("models.yaml maps sdd-document to default model tier", async () => {
  const content = await fs.readFile(MODELS_PATH, "utf8");
  assert.ok(content.includes("sdd-document: default"), "models.yaml must map sdd-document to default");
});

test("skills/sdd-document/SKILL.md defines the question_gate with options A, B, C", async () => {
  const content = await fs.readFile(SKILL_PATH, "utf8");
  assert.ok(content.includes("Option A"), "SKILL.md must define Option A");
  assert.ok(content.includes("Option B"), "SKILL.md must define Option B");
  assert.ok(content.includes("Option C"), "SKILL.md must define Option C");
  assert.ok(content.includes("question_gate"), "SKILL.md must implement question_gate");
});

test("skills/sdd-document/SKILL.md details Option C path validation", async () => {
  const content = await fs.readFile(SKILL_PATH, "utf8");
  assert.ok(content.includes("fuzzy") || content.includes("invalid"), "SKILL.md must check for fuzzy or invalid paths for Option C");
  assert.ok(content.includes("clarify") || content.includes("blocked"), "SKILL.md must block or request clarification for bad Option C paths");
});

test("skills/sdd-document/SKILL.md enforces dynamic write sandbox boundaries", async () => {
  const content = await fs.readFile(SKILL_PATH, "utf8");
  assert.ok(content.includes("Sandbox") || content.includes("sandbox"), "SKILL.md must mention sandbox boundaries");
  assert.ok(content.includes("restrict") || content.includes("restricted"), "SKILL.md must restrict writes to target directory");
});

// --- Target Generation Verification Tests ---

test("Target generation transforms sdd-document to vscode target", (t) => {
  const { runConfigure } = require("./configure/cli.js");
  const out = tmpOut(t);
  const result = runConfigure({ sourceDir: ROOT_DIR, target: "vscode", outDir: out, validate: false });

  assert.equal(result.exitCode, 0);
  assert.ok(fsSync.existsSync(path.join(out, "agents/sdd-document.agent.md")), "vscode output must contain sdd-document.agent.md");
  assert.ok(fsSync.existsSync(path.join(out, "commands/sdd-document.prompt.md")), "vscode output must contain sdd-document.prompt.md");
});

test("Target generation transforms sdd-document to claude target", (t) => {
  const { runConfigure } = require("./configure/cli.js");
  const out = tmpOut(t);
  const result = runConfigure({ sourceDir: ROOT_DIR, target: "claude", outDir: out, validate: false });

  assert.equal(result.exitCode, 0);
  assert.ok(fsSync.existsSync(path.join(out, "agents/sdd-document.md")), "claude output must contain agents/sdd-document.md");
  assert.ok(fsSync.existsSync(path.join(out, "commands/sdd-document.md")), "claude output must contain commands/sdd-document.md");
  assert.ok(fsSync.existsSync(path.join(out, "skills/sdd-document/SKILL.md")), "claude output must contain skills/sdd-document/SKILL.md");
});

test("Target generation transforms sdd-document to github-copilot target", (t) => {
  const { runConfigure } = require("./configure/cli.js");
  const out = tmpOut(t);
  const result = runConfigure({ sourceDir: ROOT_DIR, target: "github-copilot", outDir: out, validate: false });

  assert.equal(result.exitCode, 0);
  assert.ok(fsSync.existsSync(path.join(out, ".github/agents/sdd-document.agent.md")), "copilot output must contain .github/agents/sdd-document.agent.md");
});

test("Target generation transforms sdd-document to opencode target", (t) => {
  const { runConfigure } = require("./configure/cli.js");
  const out = tmpOut(t);
  const result = runConfigure({ sourceDir: ROOT_DIR, target: "opencode", outDir: out, validate: false });

  assert.equal(result.exitCode, 0);
  assert.ok(fsSync.existsSync(path.join(out, ".opencode/agents/sdd-document.md")), "opencode output must contain .opencode/agents/sdd-document.md");
});
