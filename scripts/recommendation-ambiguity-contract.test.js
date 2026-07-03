"use strict";

// Prose-invariant contract tests for the
// recommendation-contract-and-early-ambiguity-detection change. Pattern mirrors
// scripts/assumption-ledger-contract.test.js: read the canonical markdown source
// files and assert the required prose landmarks are present. No runtime JS
// behavior is introduced by this change — the contract IS the prose.

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs/promises");
const path = require("node:path");

const ROOT_DIR = path.resolve(__dirname, "..");
const SHARED_COMMON_PATH = path.join(ROOT_DIR, "skills", "_shared", "sdd-phase-common.md");
const ORCHESTRATOR_AGENT_PATH = path.join(ROOT_DIR, "agents", "sdd-orchestrator.agent.md");
const APPLY_SKILL_PATH = path.join(ROOT_DIR, "skills", "sdd-apply", "SKILL.md");
const AGENTS_SPEC_PATH = path.join(ROOT_DIR, "openspec", "specs", "agents", "spec.md");

async function readFile(filePath) {
  return fs.readFile(filePath, "utf8");
}

const BLOCKER_TYPE_VALUES = [
  "needs_user_decision",
  "design-mismatch",
  "spec-change-required",
  "workload-escalation",
];

// ---------------------------------------------------------------------------
// Phase 1: Shared Protocol Foundation (sdd-phase-common.md §D)
// ---------------------------------------------------------------------------

test("1.2 · sdd-phase-common.md §D documents blocker_type as a field with the 4-value enum", async () => {
  const content = await readFile(SHARED_COMMON_PATH);
  assert.ok(content.includes("`blocker_type`"), "§D must document `blocker_type` as a named field");
  for (const value of BLOCKER_TYPE_VALUES) {
    assert.ok(content.includes(value), `§D blocker_type enum must list \`${value}\``);
  }
});

test("1.3 · sdd-phase-common.md documents the recommended-option description contract", async () => {
  const content = await readFile(SHARED_COMMON_PATH);
  // Scoped to the new "Recommended Option Description Contract" section only, so a
  // full revert of that section fails even though the file has an older, unrelated
  // "reversibility" occurrence elsewhere (Assumption Entry Schema table).
  const headingIdx = content.indexOf("#### Recommended Option Description Contract");
  assert.ok(headingIdx !== -1, "must contain the Recommended Option Description Contract heading");
  const nextHeadingIdx = content.indexOf("\n### ", headingIdx + 1);
  const section = nextHeadingIdx === -1 ? content.slice(headingIdx) : content.slice(headingIdx, nextHeadingIdx);
  assert.ok(section.includes("rationale"), "must mention rationale");
  assert.ok(/trade-off/i.test(section), "must mention trade-off");
  assert.ok(section.includes("reversibility") || section.includes("reversible"), "must mention reversibility, scoped to the new section");
});

test("1.3 · sdd-phase-common.md documents that reason MUST name the cost of a wrong/guessed decision", async () => {
  const content = await readFile(SHARED_COMMON_PATH);
  assert.ok(/`reason`[^\n]*cost|cost[^\n]*`reason`/is.test(content), "must document reason must state the cost");
});

test("1.3 · sdd-phase-common.md scopes the description contract to question_gate.options[] only, excluding next_question", async () => {
  const content = await readFile(SHARED_COMMON_PATH);
  assert.ok(content.includes("question_gate.options[]"), "must scope the contract to question_gate.options[]");
  assert.ok(/next_question[^\n]*out of scope|out of scope[^\n]*next_question/is.test(content), "must explicitly exclude next_question");
});

// ---------------------------------------------------------------------------
// Phase 2: Orchestrator — Intent Restatement + Failure/Blocker Routing
// ---------------------------------------------------------------------------

test("1.4 · sdd-orchestrator.agent.md has an Intent Restatement subsection before Change Classification", async () => {
  const content = await readFile(ORCHESTRATOR_AGENT_PATH);
  const restatementIdx = content.indexOf("Intent Restatement");
  const classificationIdx = content.indexOf("### Change Classification");
  assert.ok(restatementIdx !== -1, "must contain an Intent Restatement subsection");
  assert.ok(classificationIdx !== -1, "must contain the Change Classification section");
  assert.ok(restatementIdx < classificationIdx, "Intent Restatement must appear before Change Classification");
});

test("1.4 · sdd-orchestrator.agent.md routes design-mismatch to sdd-design", async () => {
  const content = await readFile(ORCHESTRATOR_AGENT_PATH);
  assert.ok(
    /design-mismatch[^\n]*sdd-design|sdd-design[^\n]*design-mismatch/is.test(content),
    "must document design-mismatch routes to sdd-design"
  );
});

test("1.4 · sdd-orchestrator.agent.md distinguishes verify-time origin tags from apply-time live blockers", async () => {
  const content = await readFile(ORCHESTRATOR_AGENT_PATH);
  const sectionIdx = content.indexOf("### Failure & Blocker Routing");
  assert.ok(sectionIdx !== -1, "must contain the Failure & Blocker Routing section");
  const nextHeadingIdx = content.indexOf("\n### ", sectionIdx + 1);
  const section = nextHeadingIdx === -1 ? content.slice(sectionIdx) : content.slice(sectionIdx, nextHeadingIdx);
  assert.ok(/post-hoc origin tag/i.test(section), "must clarify design-gap/spec-gap are post-hoc origin tags from verify");
  assert.ok(/live blocker/i.test(section), "must clarify blocker_type values are live apply-time blockers");
});

// ---------------------------------------------------------------------------
// Phase 1b: blocker_type naming-convention note (kebab-case going forward)
// ---------------------------------------------------------------------------

test("1.7 · sdd-phase-common.md §D blocker_type table has a naming-convention note", async () => {
  const content = await readFile(SHARED_COMMON_PATH);
  const idx = content.indexOf("`blocker_type`");
  assert.ok(idx !== -1, "must document blocker_type");
  const tail = content.slice(idx, idx + 1200);
  assert.ok(/snake_case/i.test(tail), "must note the existing snake_case value");
  assert.ok(/kebab-case/i.test(tail), "must note the existing kebab-case values");
  assert.ok(/SHOULD use kebab-case/i.test(tail), "must direct new values to use kebab-case going forward");
});

test("1.7 · agents/spec.md §6.1 blocker_type row has a naming-convention note", async () => {
  const content = await readFile(AGENTS_SPEC_PATH);
  const idx = content.indexOf("`blocker_type`");
  assert.ok(idx !== -1, "must document blocker_type");
  const tail = content.slice(idx, idx + 1200);
  assert.ok(/snake_case/i.test(tail), "must note the existing snake_case value");
  assert.ok(/kebab-case/i.test(tail), "must note the existing kebab-case values");
  assert.ok(/SHOULD use kebab-case/i.test(tail), "must direct new values to use kebab-case going forward");
});

// ---------------------------------------------------------------------------
// Phase 3: sdd-apply design-mismatch blocker
// ---------------------------------------------------------------------------

test("1.5 · sdd-apply/SKILL.md Step 4 contains the design-mismatch blocker line", async () => {
  const content = await readFile(APPLY_SKILL_PATH);
  const stepIdx = content.indexOf("### Step 4: Implement Tasks");
  const rulesIdx = content.indexOf("## Rules");
  const step4 = content.slice(stepIdx, rulesIdx);
  assert.ok(step4.includes("blocked: design-mismatch"), "Step 4 must contain the literal `blocked: design-mismatch` blocker");
});

test("1.5 · sdd-apply/SKILL.md Rules section contains the design-mismatch blocker line", async () => {
  const content = await readFile(APPLY_SKILL_PATH);
  const rulesIdx = content.indexOf("## Rules");
  const rules = content.slice(rulesIdx);
  assert.ok(rules.includes("blocked: design-mismatch"), "Rules must contain the literal `blocked: design-mismatch` blocker");
});

test("1.5 · sdd-apply/SKILL.md Step 4 requires persisting partial progress before spec-change-required and design-mismatch STOPs", async () => {
  const content = await readFile(APPLY_SKILL_PATH);
  const stepIdx = content.indexOf("### Step 4: Implement Tasks");
  const rulesIdx = content.indexOf("## Rules");
  const step4 = content.slice(stepIdx, rulesIdx);
  assert.ok(
    /persist(ing)? partial progress[^\n]*spec-change-required|spec-change-required[^\n]*persist(ing)? partial progress/is.test(step4),
    "Step 4 spec-change-required STOP must require persisting partial progress on already-completed tasks first"
  );
  assert.ok(
    /persist(ing)? partial progress[^\n]*design-mismatch|design-mismatch[^\n]*persist(ing)? partial progress/is.test(step4),
    "Step 4 design-mismatch STOP must require persisting partial progress on already-completed tasks first"
  );
});

test("1.5 · sdd-apply/SKILL.md Rules section requires persisting partial progress before spec-change-required and design-mismatch STOPs", async () => {
  const content = await readFile(APPLY_SKILL_PATH);
  const rulesIdx = content.indexOf("## Rules");
  const rules = content.slice(rulesIdx);
  assert.ok(
    /persist(ing)? partial progress[^\n]*spec-change-required|spec-change-required[^\n]*persist(ing)? partial progress/is.test(rules),
    "Rules spec-change-required STOP must require persisting partial progress on already-completed tasks first"
  );
  assert.ok(
    /persist(ing)? partial progress[^\n]*design-mismatch|design-mismatch[^\n]*persist(ing)? partial progress/is.test(rules),
    "Rules design-mismatch STOP must require persisting partial progress on already-completed tasks first"
  );
});

test("1.5 · sdd-apply/SKILL.md documents the cosmetic-deviation exclusion", async () => {
  const content = await readFile(APPLY_SKILL_PATH);
  assert.ok(/cosmetic/i.test(content), "must document a cosmetic-deviation exclusion for design-mismatch");
});

// ---------------------------------------------------------------------------
// Phase 4: baseline agents/spec.md §6.1
// ---------------------------------------------------------------------------

test("1.6 · openspec/specs/agents/spec.md §6.1 lists the blocker_type row with the 4-value enum", async () => {
  const content = await readFile(AGENTS_SPEC_PATH);
  assert.ok(content.includes("`blocker_type`"), "§6.1 must document `blocker_type` as a named field");
  for (const value of BLOCKER_TYPE_VALUES) {
    assert.ok(content.includes(value), `§6.1 blocker_type enum must list \`${value}\``);
  }
});

// ---------------------------------------------------------------------------
// Phase 4b: sweep-fixed `recommended: true` example descriptions
// (rationale + trade-off + reversibility), so a revert of these 4 files is caught
// ---------------------------------------------------------------------------

test("1.4b · dispatch-lifecycle-hooks.md 'Retry' recommended option keeps its fixed rationale/trade-off/reversibility description", async () => {
  const content = await readFile(path.join(ROOT_DIR, "skills", "_shared", "dispatch-lifecycle-hooks.md"));
  assert.ok(content.includes("Trade-off vs. override"), "must keep the trade-off clause");
  assert.ok(/Reversible/i.test(content), "must keep the reversibility clause");
  assert.ok(/Recommended because/i.test(content), "must keep the rationale clause");
});

test("1.4b · gate-archive-quality.md 'Fix and re-run verify' recommended option keeps its fixed rationale/trade-off/reversibility description", async () => {
  const content = await readFile(path.join(ROOT_DIR, "skills", "_shared", "gate-archive-quality.md"));
  assert.ok(content.includes("Trade-off vs. override"), "must keep the trade-off clause");
  assert.ok(/Reversible/i.test(content), "must keep the reversibility clause");
  assert.ok(/Recommended because/i.test(content), "must keep the rationale clause");
});

test("1.4b · route-brownfield.md 'Run /sdd-baseline now' recommended option keeps its fixed rationale/trade-off/reversibility description", async () => {
  const content = await readFile(path.join(ROOT_DIR, "skills", "_shared", "route-brownfield.md"));
  assert.ok(content.includes("Trade-off vs. skipping"), "must keep the trade-off clause");
  assert.ok(/Reversible/i.test(content), "must keep the reversibility clause");
  assert.ok(/Recommended for brownfield repos/i.test(content), "must keep the rationale clause");
});

test("1.4b · sdd-clarify/SKILL.md keeps the pointer to the Recommended Option Description Contract", async () => {
  const content = await readFile(path.join(ROOT_DIR, "skills", "sdd-clarify", "SKILL.md"));
  assert.ok(content.includes("rationale, trade-off, and reversibility"), "must keep the rationale/trade-off/reversibility summary");
  assert.ok(content.includes("Recommended Option Description Contract"), "must keep the pointer to §D's contract");
});
