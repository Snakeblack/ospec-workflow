"use strict";

// Prose-invariant contract tests for Eje B horizon-2: B2 (ownership + change
// collision gate), B3 (REQ → task → commit → test traceability) and B5 (scale
// presets). Pattern mirrors scripts/mentor-adr-contract.test.js: prose
// landmarks in canonical sources + target regeneration into a temp dir
// (never reads ROOT/dist). The only runtime behavior added by Eje B — the
// commit-msg trailer check — is covered by scripts/hooks/commit-msg-hook.test.js.

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const ROOT_DIR = path.resolve(__dirname, "..");
const ORCHESTRATOR_AGENT_PATH = path.join(ROOT_DIR, "agents", "sdd-orchestrator.agent.md");
const COLLISION_GATE_PATH = path.join(ROOT_DIR, "skills", "_shared", "gate-change-collision.md");
const CONFIG_PATH = path.join(ROOT_DIR, "openspec", "config.yaml");
const SPEC_SKILL_PATH = path.join(ROOT_DIR, "skills", "sdd-spec", "SKILL.md");
const TASKS_SKILL_PATH = path.join(ROOT_DIR, "skills", "sdd-tasks", "SKILL.md");
const APPLY_SKILL_PATH = path.join(ROOT_DIR, "skills", "sdd-apply", "SKILL.md");
const ARCHIVE_SKILL_PATH = path.join(ROOT_DIR, "skills", "sdd-archive", "SKILL.md");
const INIT_SKILL_PATH = path.join(ROOT_DIR, "skills", "sdd-init", "SKILL.md");
const VERIFY_REPORT_FORMAT_PATH = path.join(ROOT_DIR, "skills", "sdd-verify", "references", "report-format.md");

async function readFile(filePath) {
  return fs.readFile(filePath, "utf8");
}

// ---------------------------------------------------------------------------
// B2 — ownership + change collision gate
// ---------------------------------------------------------------------------

test("B2.1 · collision gate handler exists with the 3-option question and collision audit shape", async () => {
  const content = await readFile(COLLISION_GATE_PATH);
  assert.match(content, /# Change Collision Gate/);
  for (const option of ["Continue anyway", "Coordinate first", "Re-scope this change"]) {
    assert.ok(content.includes(option), `question must offer: ${option}`);
  }
  assert.match(content, /collisions:/, "must define the collisions: audit block");
  assert.match(content, /findActiveChanges/, "must reuse findActiveChanges");
});

test("B2.2 · orchestrator pointer table routes the collision gate before sdd-apply", async () => {
  const content = await readFile(ORCHESTRATOR_AGENT_PATH);
  assert.match(content, /\| Change Collision Gate \|[^\n]*gate-change-collision\.md/, "pointer table must list the handler");
  assert.match(content, /before dispatching `sdd-apply` AND at least one OTHER active/, "trigger must be scoped to apply with other active changes");
});

test("B2.3 · orchestrator stamps owner (author + branch) on new changes", async () => {
  const content = await readFile(ORCHESTRATOR_AGENT_PATH);
  assert.match(content, /author: \{git config user\.name\}/, "must stamp author from git");
  assert.match(content, /branch: \{git branch --show-current\}/, "must stamp branch");
});

test("B2.4 · sdd-spec declares touched baseline domains (declare-only), orchestrator computes fingerprints, sdd-archive enforces the stale-baseline check", async () => {
  const spec = await readFile(SPEC_SKILL_PATH);
  assert.match(spec, /touched_baseline_domains/, "sdd-spec must declare touched_baseline_domains (declare-only)");
  assert.doesNotMatch(spec, /sha256/i, "sdd-spec must NOT compute or write the SHA-256 fingerprint itself");
  const orchestrator = await readFile(ORCHESTRATOR_AGENT_PATH);
  assert.match(orchestrator, /baseline_fingerprints/, "orchestrator must own writing baseline_fingerprints");
  assert.match(orchestrator, /touched_baseline_domains/, "orchestrator must source domains from touched_baseline_domains");
  const archive = await readFile(ARCHIVE_SKILL_PATH);
  assert.match(archive, /Stale-baseline check/i, "sdd-archive must carry the stale-baseline check");
  assert.match(archive, /blocker_type: stale-baseline/, "mismatch must block with stale-baseline");
});

test("B2.5 · config documents the optional ownership block as a strict no-op when absent", async () => {
  const content = await readFile(CONFIG_PATH);
  assert.match(content, /# ownership:/, "must carry the commented ownership example");
  assert.match(content, /codeowners_sync/, "must document codeowners_sync");
});

// ---------------------------------------------------------------------------
// B3 — traceability REQ → task → commit → test
// ---------------------------------------------------------------------------

test("B3.1 · sdd-spec defines stable REQ ids on ADDED requirements", async () => {
  const content = await readFile(SPEC_SKILL_PATH);
  assert.match(content, /\{#REQ-\{domain\}-\{NNN\}\}/, "template must carry the REQ id suffix");
  assert.match(content, /never reused after removal/i, "id stability rule must be stated");
});

test("B3.2 · sdd-tasks maps tasks to REQ ids with MUST coverage", async () => {
  const content = await readFile(TASKS_SKILL_PATH);
  assert.match(content, /\[REQ-\{domain\}-\{NNN\}\]/, "task template must carry the [REQ-...] tag");
  assert.match(content, /every MUST requirement appears in at least one task/i, "MUST coverage rule");
});

test("B3.3 · sdd-apply appends Ospec-Change / Ospec-Task trailers to work-unit commits", async () => {
  const content = await readFile(APPLY_SKILL_PATH);
  assert.match(content, /Ospec-Change: \{change-name\}/, "must define the Ospec-Change trailer");
  assert.match(content, /Ospec-Task: \{task-number\}/, "must define the Ospec-Task trailer");
});

test("B3.4 · verify report format includes the Traceability Matrix with WARNING for REQs without tests", async () => {
  const content = await readFile(VERIFY_REPORT_FORMAT_PATH);
  assert.match(content, /### Traceability Matrix/);
  assert.match(content, /\| REQ \| Tasks \| Commits \| Tests \| Status \|/, "matrix must carry the 5 columns");
  assert.match(content, /REQ without linked test/i, "must flag REQs without tests");
  assert.match(content, /tasks-gap/, "REQ absent from tasks must be a tasks-gap finding");
});

test("B3.5 · config documents the traceability policy (advisory default, required opt-in)", async () => {
  const content = await readFile(CONFIG_PATH);
  assert.match(content, /# traceability:/, "must carry the commented traceability example");
  assert.match(content, /advisory \(default\) \| required/, "must document both policies");
});

// ---------------------------------------------------------------------------
// B5 — scale presets
// ---------------------------------------------------------------------------

test("B5.1 · orchestrator asks the scale question once at first init with team recommended", async () => {
  const content = await readFile(ORCHESTRATOR_AGENT_PATH);
  assert.match(content, /project scale/i, "init guard must ask project scale");
  for (const preset of ["`solo`", "`team`", "`enterprise`"]) {
    assert.ok(content.includes(preset), `scale options must include ${preset}`);
  }
  assert.match(content, /`scale: \{answer\}`/, "must forward scale in the Parameters block");
});

test("B5.2 · sdd-init materializes the preset and preserves an existing scale key", async () => {
  const content = await readFile(INIT_SKILL_PATH);
  assert.match(content, /Scale preset/i, "must carry the scale preset step");
  for (const preset of ["`solo`", "`team`", "`enterprise`"]) {
    assert.ok(content.includes(preset), `init must define preset ${preset}`);
  }
  assert.match(content, /preserve it unchanged/i, "re-init must preserve existing scale");
});

test("B5.3 · config documents the scale key with the 3 presets", async () => {
  const content = await readFile(CONFIG_PATH);
  assert.match(content, /# scale: team/, "must carry the commented scale example");
  assert.match(content, /enterprise\s+→ strict TDD/, "must document the enterprise preset");
});

// ---------------------------------------------------------------------------
// Cross-target regeneration (self-generated, temp dir — never read ROOT/dist)
// ---------------------------------------------------------------------------

function tmpOut(t) {
  const dir = require("node:fs").mkdtempSync(path.join(os.tmpdir(), "ospec-eje-b-"));
  t.after(() => require("node:fs").rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test("G.1 · generated claude target carries the collision gate handler and the traceability landmarks", (t) => {
  const { runConfigure } = require("./configure/cli.js");
  const out = tmpOut(t);
  const result = runConfigure({ sourceDir: ROOT_DIR, target: "claude", outDir: out, validate: false });

  const gate = result.files.find((f) => f.path.endsWith("gate-change-collision.md"));
  assert.ok(gate, "claude target must ship gate-change-collision.md");
  assert.match(gate.content, /# Change Collision Gate/);

  const orchestrator = result.files.find((f) => f.path === "skills/sdd-orchestrator/SKILL.md");
  assert.ok(orchestrator, "claude target must emit skills/sdd-orchestrator/SKILL.md");
  assert.match(orchestrator.content, /Change Collision Gate/);

  const apply = result.files.find((f) => f.path === "skills/sdd-apply/SKILL.md");
  assert.ok(apply, "claude target must emit skills/sdd-apply/SKILL.md");
  assert.match(apply.content, /Ospec-Change: \{change-name\}/);
});
