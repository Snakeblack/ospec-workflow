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
const ROUTE_DOCUMENT_PATH = path.join(ROOT_DIR, "skills", "_shared", "route-document.md");

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
  assert.ok(content.includes("tools: ['read', 'search', 'edit', 'execute']"));
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

test("skills/sdd-document/SKILL.md details relative path formatting", async () => {
  const content = await fs.readFile(SKILL_PATH, "utf8");
  assert.ok(content.includes("relative paths starting with a forward slash"), "SKILL.md must enforce relative file paths");
});

test("skills/sdd-document/SKILL.md details themed subdirectory structures", async () => {
  const content = await fs.readFile(SKILL_PATH, "utf8");
  assert.ok(content.includes("themed subdirectory") && content.includes("{domain-slug}/{page-name}.md"), "SKILL.md must specify themed subdirectories for domains");
});

test("skills/sdd-document/SKILL.md defines the official metadata format", async () => {
  const content = await fs.readFile(SKILL_PATH, "utf8");
  assert.ok(content.includes("generator") && content.includes("stats") && content.includes("sections"), "SKILL.md must define full metadata schema");
});

// --- REQ-agents-005 / REQ-sdd-document-006 / REQ-sdd-document-011 (wire-sdd-document) ---

test("skills/sdd-document/SKILL.md .last-update.json schema includes doc_language and scope_choice", async () => {
  const content = await fs.readFile(SKILL_PATH, "utf8");
  const stepMatch = content.match(/### Step 6\.4:[\s\S]*?```json([\s\S]*?)```/);
  assert.ok(stepMatch, "SKILL.md must contain a fenced JSON block in Step 6.4 documenting .last-update.json");
  const schemaBlock = stepMatch[1];
  assert.ok(schemaBlock.includes("doc_language"), "SKILL.md .last-update.json schema block must document doc_language");
  assert.ok(schemaBlock.includes("scope_choice"), "SKILL.md .last-update.json schema block must document scope_choice");
});

test("skills/sdd-document/SKILL.md describes ONE batched question_gate for language+scope, not two sequential gates", async () => {
  const content = await fs.readFile(SKILL_PATH, "utf8");
  assert.ok(
    content.includes("batched") && content.includes("single") && content.includes("question_gate"),
    "SKILL.md must describe a single batched question_gate for language+scope"
  );
  assert.ok(
    !/first gate presented to the user, before any other question/.test(content),
    "SKILL.md must not describe language as a standalone gate that must run first, independently of scope"
  );
});

test("skills/_shared/route-document.md §3 rejects an out-of-repo custom_path at gate time (rel-3)", async () => {
  const content = await fs.readFile(ROUTE_DOCUMENT_PATH, "utf8");
  const sectionMatch = content.match(/#### 3\. Output-dir resolution([\s\S]*?)(?:\r?\n#### 4\.)/);
  assert.ok(sectionMatch, "route-document.md must contain a '#### 3. Output-dir resolution' section");
  const section = sectionMatch[1];
  assert.ok(
    section.includes("outside the repository working tree"),
    "§3 must describe detecting a custom_path that resolves outside the repository working tree"
  );
  assert.ok(
    /reject it at gate time/i.test(section) && /do not delegate/i.test(section),
    "§3 must reject an out-of-repo custom_path at gate time instead of delegating"
  );
  assert.ok(
    /re-prompt/i.test(section),
    "§3 must re-prompt the user for a valid in-repo path instead of silently failing"
  );
});

test("skills/_shared/route-document.md is present under all four dist targets", (t) => {
  const { runConfigure } = require("./configure/cli.js");
  const relPath = "skills/_shared/route-document.md";

  for (const target of ["claude", "vscode", "github-copilot", "opencode"]) {
    const out = tmpOut(t);
    runConfigure({ sourceDir: ROOT_DIR, target, outDir: out, validate: false });
    assert.ok(
      fsSync.existsSync(path.join(out, relPath)),
      `${relPath} missing from ${target} output`
    );
  }
});

