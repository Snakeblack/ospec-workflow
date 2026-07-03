"use strict";

// Prose-invariant contract tests for Eje C H1: C1 (phase summaries in
// state.yaml for cheap continuations) and C4 (compact rules budget lint —
// the enforcement itself lives in scripts/docs-lint.test.js; here we pin the
// documented contract). Pattern mirrors scripts/eje-b-contract.test.js.

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const ROOT_DIR = path.resolve(__dirname, "..");
const SHARED_COMMON_PATH = path.join(ROOT_DIR, "skills", "_shared", "sdd-phase-common.md");
const ORCHESTRATOR_AGENT_PATH = path.join(ROOT_DIR, "agents", "sdd-orchestrator.agent.md");
const TOKEN_BUDGET_PATH = path.join(ROOT_DIR, "skills", "_shared", "token-budget.md");
const DOCS_LINT_PATH = path.join(ROOT_DIR, "scripts", "docs-lint.test.js");

async function readFile(p) {
  return fs.readFile(p, "utf8");
}

// C1 — phase summaries

test("C1.1 · sdd-phase-common.md §C defines the Phase Summary Block with summary and key_decisions", async () => {
  const content = await readFile(SHARED_COMMON_PATH);
  assert.match(content, /### Phase Summary Block/);
  assert.match(content, /summary: /, "must show the summary field");
  assert.match(content, /key_decisions:/, "must show the key_decisions field");
  assert.match(content, /≤ 160 chars/, "summary must be capped at 160 chars");
  assert.match(content, /never invent content not in it/i, "summary must derive from the artifact");
});

test("C1.2 · orchestrator builds continuation prompts from state summaries instead of re-reading artifacts", async () => {
  const content = await readFile(ORCHESTRATOR_AGENT_PATH);
  assert.match(content, /phases\.\*\.summary/, "recovery must consume phases.*.summary");
  assert.match(content, /do NOT re-read completed phase artifacts inline/i, "must forbid inline artifact re-reads");
  assert.match(content, /fall back to reading artifacts/i, "pre-feature changes must fall back");
});

// C4 — compact rules budget

test("C4.1 · token-budget.md documents the enforced hard cap with ratchet-down rule", async () => {
  const content = await readFile(TOKEN_BUDGET_PATH);
  assert.match(content, /Hard cap 500 estimated tokens/, "must document the 500-token hard cap");
  assert.match(content, /ratchets down/i, "must document the ratchet rule");
});

test("C4.2 · docs-lint enforces the compact rules budget against discoverSkills output", async () => {
  const content = await readFile(DOCS_LINT_PATH);
  assert.match(content, /COMPACT_RULES_HARD_CAP_TOKENS = 500/, "lint must pin the cap at 500");
  assert.match(content, /discoverSkills/, "lint must measure real discovered skills");
});

// Cross-target regeneration (self-generated, temp dir — never read ROOT/dist)

test("G.1 · generated claude target carries the Phase Summary Block and the continuation rule", (t) => {
  const { runConfigure } = require("./configure/cli.js");
  const dir = require("node:fs").mkdtempSync(path.join(os.tmpdir(), "ospec-eje-c-"));
  t.after(() => require("node:fs").rmSync(dir, { recursive: true, force: true }));
  const result = runConfigure({ sourceDir: ROOT_DIR, target: "claude", outDir: dir, validate: false });

  const common = result.files.find((f) => f.path.endsWith("sdd-phase-common.md"));
  assert.ok(common, "claude target must ship sdd-phase-common.md");
  assert.match(common.content, /### Phase Summary Block/);

  const orchestrator = result.files.find((f) => f.path === "skills/sdd-orchestrator/SKILL.md");
  assert.ok(orchestrator, "claude target must emit skills/sdd-orchestrator/SKILL.md");
  assert.match(orchestrator.content, /phases\.\*\.summary/);
});
