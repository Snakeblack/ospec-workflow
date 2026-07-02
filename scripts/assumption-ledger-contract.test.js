"use strict";

// Prose-invariant contract tests for the add-assumption-ledger change.
// Pattern mirrors scripts/federation-baseline-contract.test.js: read the
// canonical markdown source files and assert the required prose landmarks
// are present. No runtime JS behavior is introduced by this change — the
// contract IS the prose.

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const ROOT_DIR = path.resolve(__dirname, "..");
const SHARED_COMMON_PATH = path.join(ROOT_DIR, "skills", "_shared", "sdd-phase-common.md");
const ORCHESTRATOR_AGENT_PATH = path.join(ROOT_DIR, "agents", "sdd-orchestrator.agent.md");
const VERIFY_SKILL_PATH = path.join(ROOT_DIR, "skills", "sdd-verify", "SKILL.md");
const VERIFY_REPORT_FORMAT_PATH = path.join(ROOT_DIR, "skills", "sdd-verify", "references", "report-format.md");
const VERIFY_AGENT_PATH = path.join(ROOT_DIR, "agents", "sdd-verify.agent.md");

async function readFile(filePath) {
  return fs.readFile(filePath, "utf8");
}

// ---------------------------------------------------------------------------
// Phase 1: Shared Protocol Foundation (sdd-phase-common.md §D)
// ---------------------------------------------------------------------------

test("1.1 · sdd-phase-common.md §D lists assumptions as an OPTIONAL envelope field", async () => {
  const content = await readFile(SHARED_COMMON_PATH);
  assert.match(
    content,
    /`assumptions`[^\n]*OPTIONAL/,
    "§D envelope field list must document `assumptions` as OPTIONAL"
  );
});

test("1.1 · sdd-phase-common.md contains the 5-column Assumption Entry Schema table", async () => {
  const content = await readFile(SHARED_COMMON_PATH);
  for (const field of ["id", "phase", "statement", "reversibility", "basis"]) {
    assert.ok(
      content.includes(`\`${field}\``),
      `Assumption Entry Schema table must document field \`${field}\``
    );
  }
});

test("1.1 · sdd-phase-common.md documents the Materiality Rule keywords", async () => {
  const content = await readFile(SHARED_COMMON_PATH);
  assert.ok(content.includes("observable behavior"), "must mention 'observable behavior'");
  assert.ok(content.includes("public contract"), "must mention 'public contract'");
  assert.ok(content.includes("reversibility"), "must mention 'reversibility'");
  assert.ok(content.includes("question_gate"), "must mention 'question_gate'");
});

// ---------------------------------------------------------------------------
// Phase 2: Orchestrator Assumption Ledger Protocol
// ---------------------------------------------------------------------------

test("2.1 · sdd-orchestrator.agent.md contains the Assumption Ledger Protocol heading", async () => {
  const content = await readFile(ORCHESTRATOR_AGENT_PATH);
  assert.match(content, /### Assumption Ledger Protocol/);
});

test("2.1 · sdd-orchestrator.agent.md documents the assumptions: YAML shape", async () => {
  const content = await readFile(ORCHESTRATOR_AGENT_PATH);
  assert.match(content, /assumptions:\s*\n\s*-\s*id:/);
});

test("2.1 · sdd-orchestrator.agent.md documents the renumber-on-collision rule and no-fabrication rule", async () => {
  const content = await readFile(ORCHESTRATOR_AGENT_PATH);
  assert.ok(/renumber/i.test(content), "must document renumbering on id collision");
  assert.ok(
    content.includes("MUST NOT infer assumption entries from conversation memory"),
    "must document the no-fabrication rule verbatim"
  );
});

// ---------------------------------------------------------------------------
// Phase 3: sdd-verify Reconciliation
// ---------------------------------------------------------------------------

test("3.1 · sdd-verify SKILL.md contains the Step 2a pre-flight heading", async () => {
  const content = await readFile(VERIFY_SKILL_PATH);
  assert.match(content, /Step 2a[:.]? Assumption Reconciliation Pre-flight/i);
});

test("3.1 · sdd-verify SKILL.md documents the three resolution actions plus leave-unresolved", async () => {
  const content = await readFile(VERIFY_SKILL_PATH);
  assert.ok(
    content.includes("exactly three resolution actions"),
    "must mention the distinctive 'exactly three resolution actions' phrase from Step 2a"
  );
  assert.ok(content.includes("`confirm`"), "must mention `confirm` as a backtick-quoted action");
  assert.ok(content.includes("`correct`"), "must mention `correct` as a backtick-quoted action");
  assert.ok(
    content.includes("`promote-to-clarification`"),
    "must mention `promote-to-clarification` as a backtick-quoted action"
  );
  assert.ok(content.includes("`leave-unresolved`"), "must mention `leave-unresolved` as a backtick-quoted action");
});

test("3.1 · sdd-verify SKILL.md documents WARNING-for-low and no-escalation-for-high rules", async () => {
  const content = await readFile(VERIFY_SKILL_PATH);
  assert.ok(
    /reversibility:\s*low[^\n]*WARNING|WARNING[^\n]*reversibility:\s*low/i.test(content),
    "must document unresolved low-reversibility entries raise a WARNING finding"
  );
  assert.ok(
    /reversibility:\s*high[^\n]*no escalation|no escalation/i.test(content),
    "must document unresolved high-reversibility entries never escalate"
  );
});

test("3.1 · sdd-verify SKILL.md documents it MUST NOT auto-invoke sdd-clarify", async () => {
  const content = await readFile(VERIFY_SKILL_PATH);
  assert.ok(content.includes("MUST NOT auto-invoke `sdd-clarify`"));
});

test("3.5 · report-format.md contains the Assumption Reconciliation section with the required table columns", async () => {
  const content = await readFile(VERIFY_REPORT_FORMAT_PATH);
  assert.match(content, /### Assumption Reconciliation/);
  for (const column of ["id", "statement", "reversibility", "outcome"]) {
    assert.ok(
      content.includes(`{${column}`) || content.includes(`| ${column}`) || content.includes(`\`${column}\``),
      `Assumption Reconciliation table must reference column ${column}`
    );
  }
});

test("3.7 · sdd-verify.agent.md permits state.yaml assumption-resolution writes", async () => {
  const content = await readFile(VERIFY_AGENT_PATH);
  assert.ok(
    /state\.yaml/.test(content) && /assumption/i.test(content),
    "Required artifacts section must permit state.yaml assumption-resolution writes"
  );
});

// ---------------------------------------------------------------------------
// Phase 4: Cross-Target Regeneration and Integration (self-generated, temp dir)
// ---------------------------------------------------------------------------

function tmpOut(t) {
  const dir = require("node:fs").mkdtempSync(path.join(os.tmpdir(), "ospec-assumption-ledger-"));
  t.after(() => require("node:fs").rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test("4.1 · generated vscode target carries the Assumption Ledger Protocol and Step 2a text", (t) => {
  const { runConfigure } = require("./configure/cli.js");
  const out = tmpOut(t);
  const result = runConfigure({ sourceDir: ROOT_DIR, target: "vscode", outDir: out, validate: false });

  const orchestrator = result.files.find((f) => f.path === "agents/sdd-orchestrator.agent.md");
  assert.ok(orchestrator, "vscode target must emit agents/sdd-orchestrator.agent.md");
  assert.match(orchestrator.content, /### Assumption Ledger Protocol/);

  const verify = result.files.find((f) => f.path === "skills/sdd-verify/SKILL.md");
  assert.ok(verify, "vscode target must emit skills/sdd-verify/SKILL.md");
  assert.match(verify.content, /Step 2a[:.]? Assumption Reconciliation Pre-flight/i);
});

test("4.2 · generated claude orchestrator/verify wrapper carries the pointer to sdd-phase-common.md §D unchanged", (t) => {
  const { runConfigure } = require("./configure/cli.js");
  const out = tmpOut(t);
  const result = runConfigure({ sourceDir: ROOT_DIR, target: "claude", outDir: out, validate: false });

  const orchestratorSkill = result.files.find((f) => f.path === "skills/sdd-orchestrator/SKILL.md");
  assert.ok(orchestratorSkill, "claude target must emit skills/sdd-orchestrator/SKILL.md");
  assert.match(orchestratorSkill.content, /### Assumption Ledger Protocol/);

  const verifySkill = result.files.find((f) => f.path === "skills/sdd-verify/SKILL.md");
  assert.ok(verifySkill, "claude target must emit skills/sdd-verify/SKILL.md");
  assert.ok(
    verifySkill.content.includes("_shared/sdd-phase-common.md") || verifySkill.content.includes("sdd-phase-common.md"),
    "claude verify skill must keep the pointer to sdd-phase-common.md §D"
  );
});
