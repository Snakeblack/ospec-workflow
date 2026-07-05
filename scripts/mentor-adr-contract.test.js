"use strict";

// Prose-invariant contract tests for Eje A remainder: A4 (mentorship mode) and
// A5 (ADRs wired into the flow). Pattern mirrors
// scripts/recommendation-ambiguity-contract.test.js: read the canonical markdown
// sources and assert the required prose landmarks; regenerate targets into a
// temp dir (never read ROOT/dist) to prove the landmarks survive generation.

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const ROOT_DIR = path.resolve(__dirname, "..");
const ORCHESTRATOR_AGENT_PATH = path.join(ROOT_DIR, "agents", "sdd-orchestrator.agent.md");
const SHARED_COMMON_PATH = path.join(ROOT_DIR, "skills", "_shared", "sdd-phase-common.md");
const CONFIG_PATH = path.join(ROOT_DIR, "openspec", "config.yaml");
const DESIGN_SKILL_PATH = path.join(ROOT_DIR, "skills", "sdd-design", "SKILL.md");
const ARCHIVE_SKILL_PATH = path.join(ROOT_DIR, "skills", "sdd-archive", "SKILL.md");

const MENTORSHIP_MODES = ["mentor", "balanced", "expert"];

async function readFile(filePath) {
  return fs.readFile(filePath, "utf8");
}

// ---------------------------------------------------------------------------
// A4 — Mentorship mode
// ---------------------------------------------------------------------------

test("A4.1 · orchestrator documents Mentorship Mode Forwarding with the 3-mode enum and balanced default", async () => {
  const content = await readFile(ORCHESTRATOR_AGENT_PATH);
  assert.ok(content.includes("#### Mentorship Mode Forwarding"), "must contain the Mentorship Mode Forwarding heading");
  for (const mode of MENTORSHIP_MODES) {
    assert.ok(content.includes(mode), `mentorship enum must list ${mode}`);
  }
  assert.match(content, /Mentorship mode: \{mode\}/, "must specify the injected dispatch line");
  assert.match(content, /default `balanced`|`balanced`, default|default: `balanced`|default `balanced`/i, "must declare balanced as default");
});

test("A4.2 · orchestrator bounds mentorship to user-facing prose only", async () => {
  const content = await readFile(ORCHESTRATOR_AGENT_PATH);
  const idx = content.indexOf("#### Mentorship Mode Forwarding");
  const section = content.slice(idx, content.indexOf("####", idx + 10));
  assert.match(section, /MUST NOT change persisted OpenSpec artifacts/i, "must state the artifact boundary");
});

test("A4.3 · sdd-phase-common.md §F defines the per-mode prose semantics", async () => {
  const content = await readFile(SHARED_COMMON_PATH);
  const idx = content.indexOf("### Mentorship Mode");
  assert.ok(idx !== -1, "must contain the Mentorship Mode section");
  const section = content.slice(idx, content.indexOf("\n## ", idx));
  assert.match(section, /Por qué así/, "mentor mode must define the 'Por qué así' section");
  assert.match(section, /teachable concept/i, "mentor mode must cap at 1 teachable concept");
  assert.match(section, /balanced.*default|default.*balanced/i, "balanced must be the absent-line default");
  assert.match(section, /MUST NOT alter persisted OpenSpec artifacts/i, "must state the artifact boundary");
});

test("A4.4 · openspec/config.yaml documents the optional mentorship block as a strict no-op when absent", async () => {
  const content = await readFile(CONFIG_PATH);
  assert.match(content, /# mentorship:/, "must carry the commented mentorship example");
  assert.match(content, /#\s+mode: balanced\s+# mentor \| balanced \| expert/, "example must show the 3-mode enum");
  assert.match(content, /strict no-op/i, "absence must be documented as a strict no-op");
});

// ---------------------------------------------------------------------------
// A5 — ADRs wired into the flow
// ---------------------------------------------------------------------------

test("A5.1 · sdd-design extracts significant decisions to change-local ADRs with the 4-criteria significance rule", async () => {
  const content = await readFile(DESIGN_SKILL_PATH);
  assert.ok(content.includes("Step 3b: Extract ADRs"), "must contain the ADR extraction step");
  assert.match(content, /decisions\/adr-NNN\.md/, "must target changes/{name}/decisions/adr-NNN.md");
  for (const criterion of ["public contract", "data model", "new dependency", "cross-cutting pattern"]) {
    assert.ok(content.includes(criterion), `significance rule must list: ${criterion}`);
  }
  assert.match(content, /## Context[\s\S]*## Decision[\s\S]*## Alternatives[\s\S]*## Consequences/, "ADR template must carry the 4 sections");
});

test("A5.2 · sdd-archive promotes ADRs to docs/adr/ before copying to the archive destination and keeps change-local copies", async () => {
  const content = await readFile(ARCHIVE_SKILL_PATH);
  const promoteIdx = content.indexOf("Step 4b: Promote ADRs");
  const copyIdx = content.indexOf("Step 5: Copy Artifacts to Archive");
  assert.ok(promoteIdx !== -1, "must contain the ADR promotion step");
  assert.ok(copyIdx !== -1 && promoteIdx < copyIdx, "promotion must happen before copying to the archive destination");
  assert.match(content, /docs\/adr\/adr-\{YYYYMMDD\}-\{NNN\}/, "must define the docs/adr naming scheme");
  assert.match(content, /accepted/, "promotion must flip Status to accepted");
  assert.match(content, /skip silently/i, "missing decisions/ must be a silent no-op");
});

test("A5.3 · sdd-archive Step 5 scopes the executor to copy-and-report (never deletes the source or claims the move is complete)", async () => {
  const content = await readFile(ARCHIVE_SKILL_PATH);
  assert.match(content, /copy inventory/i, "must require reporting a copy inventory");
  assert.match(content, /MUST NOT[\s\S]{0,120}delete the source/, "must forbid the executor from deleting the source directory");
  assert.doesNotMatch(content, /then delete the source folder/i, "must NOT instruct the executor to delete the source folder itself");
});

test("A5.4 · orchestrator Reads/Writes table registers ADR artifacts for design and archive", async () => {
  const content = await readFile(ORCHESTRATOR_AGENT_PATH);
  assert.match(content, /`sdd-design`[^\n]*decisions\/adr-NNN\.md/, "design row must list decisions/adr-NNN.md");
  assert.match(content, /`sdd-archive`[^\n]*docs\/adr/, "archive row must list promoted docs/adr");
});

// ---------------------------------------------------------------------------
// Cross-target regeneration (self-generated, temp dir — never read ROOT/dist)
// ---------------------------------------------------------------------------

function tmpOut(t) {
  const dir = require("node:fs").mkdtempSync(path.join(os.tmpdir(), "ospec-mentor-adr-"));
  t.after(() => require("node:fs").rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test("G.1 · generated claude target carries Mentorship Mode Forwarding and the ADR steps", (t) => {
  const { runConfigure } = require("./configure/cli.js");
  const out = tmpOut(t);
  const result = runConfigure({ sourceDir: ROOT_DIR, target: "claude", outDir: out, validate: false });

  const orchestrator = result.files.find((f) => f.path === "skills/sdd-orchestrator/SKILL.md");
  assert.ok(orchestrator, "claude target must emit skills/sdd-orchestrator/SKILL.md");
  assert.match(orchestrator.content, /#### Mentorship Mode Forwarding/);

  const design = result.files.find((f) => f.path === "skills/sdd-design/SKILL.md");
  assert.ok(design, "claude target must emit skills/sdd-design/SKILL.md");
  assert.match(design.content, /Step 3b: Extract ADRs/);

  const archive = result.files.find((f) => f.path === "skills/sdd-archive/SKILL.md");
  assert.ok(archive, "claude target must emit skills/sdd-archive/SKILL.md");
  assert.match(archive.content, /Step 4b: Promote ADRs/);
});

test("G.2 · generated vscode target carries the mentorship semantics in sdd-phase-common", (t) => {
  const { runConfigure } = require("./configure/cli.js");
  const out = tmpOut(t);
  const result = runConfigure({ sourceDir: ROOT_DIR, target: "vscode", outDir: out, validate: false });

  const common = result.files.find((f) => f.path.endsWith("sdd-phase-common.md"));
  assert.ok(common, "vscode target must emit sdd-phase-common.md");
  assert.match(common.content, /### Mentorship Mode/);
  assert.match(common.content, /Por qué así/);
});
