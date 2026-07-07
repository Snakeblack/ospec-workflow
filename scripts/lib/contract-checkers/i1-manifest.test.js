"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { parse } = require("../frontmatter.js");
const { check, parseRuntimeCapabilities, PHASE_SKILLS } = require("./i1-manifest.js");

function makeWorkspace(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "i1-manifest-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

function writeSkill(root, name, runtimeCapabilitiesBlock) {
  const dir = path.join(root, "skills", name);
  fs.mkdirSync(dir, { recursive: true });
  const lines = [
    "---",
    `name: ${name}`,
    `description: "fixture skill ${name}"`,
    "license: MIT",
    "metadata:",
    "  author: fixture",
    '  version: "1.0"',
  ];
  if (runtimeCapabilitiesBlock) {
    lines.push(runtimeCapabilitiesBlock);
  }
  lines.push("---", "", "Fixture skill body.", "");
  fs.writeFileSync(path.join(dir, "SKILL.md"), lines.join("\n"));
}

function writeAgent(root, name, tools, bodyReferencesSkill) {
  const dir = path.join(root, "agents");
  fs.mkdirSync(dir, { recursive: true });
  const referenced = bodyReferencesSkill || name;
  const content = [
    "---",
    `name: ${name}`,
    `description: "fixture agent ${name}"`,
    `tools: [${tools.map((t) => `'${t}'`).join(", ")}]`,
    "---",
    "",
    "## Required skill",
    `- \`skills/${referenced}/SKILL.md\``,
    "",
  ].join("\n");
  fs.writeFileSync(path.join(dir, `${name}.agent.md`), content);
}

// --- 2.1 parseRuntimeCapabilities ------------------------------------------

test("parseRuntimeCapabilities reads a runtime_capabilities: block map from rawLines", () => {
  const { frontmatter } = parse(
    [
      "---",
      "name: fixture",
      "runtime_capabilities:",
      "  execute: true",
      "  mcp: false",
      "  write: true",
      "---",
      "",
      "body",
    ].join("\n")
  );

  assert.deepEqual(parseRuntimeCapabilities(frontmatter), { execute: true, mcp: false, write: true });
});

test("parseRuntimeCapabilities returns all-false when the field is absent (missing manifest = all-false)", () => {
  const { frontmatter } = parse(["---", "name: fixture", "---", "", "body"].join("\n"));

  assert.deepEqual(parseRuntimeCapabilities(frontmatter), { execute: false, mcp: false, write: false });
});

test("parseRuntimeCapabilities tolerates reordered keys and extra indentation/whitespace", () => {
  const { frontmatter } = parse(
    [
      "---",
      "name: fixture",
      "runtime_capabilities:",
      "    write:   true",
      "  mcp: false",
      "      execute:  false",
      "---",
      "",
      "body",
    ].join("\n")
  );

  assert.deepEqual(parseRuntimeCapabilities(frontmatter), { execute: false, mcp: false, write: true });
});

// --- 2.2 Canonical 14-skill membership -------------------------------------

test("PHASE_SKILLS is exactly the 14 canonical names and excludes sdd-document/sdd-reconcile", () => {
  assert.deepEqual(
    [...PHASE_SKILLS].sort(),
    [
      "sdd-apply",
      "sdd-archive",
      "sdd-baseline",
      "sdd-clarify",
      "sdd-design",
      "sdd-explore",
      "sdd-foundation",
      "sdd-init",
      "sdd-onboard",
      "sdd-propose",
      "sdd-spec",
      "sdd-tasks",
      "sdd-verify",
      "sdd-workspace",
    ].sort()
  );
  assert.ok(!PHASE_SKILLS.includes("sdd-document"));
  assert.ok(!PHASE_SKILLS.includes("sdd-reconcile"));
});

// --- 2.3 Direction (a) ------------------------------------------------------

test("direction (a): declared execute:true without agent 'execute' tool yields exactly one offender", (t) => {
  const root = makeWorkspace(t);
  // write:true is declared (and IS backed by the agent's 'edit' tool) so this
  // fixture isolates the execute mismatch — a coincidental direction-(b)
  // offender from an unrelated capability would defeat the "exactly one"
  // assertion below.
  writeSkill(root, "sdd-fake", "runtime_capabilities:\n  execute: true\n  mcp: false\n  write: true");
  writeAgent(root, "sdd-fake", ["read", "search", "edit"]);

  const offenders = check({ root, phaseSkills: ["sdd-fake"] });

  assert.equal(offenders.length, 1);
  assert.equal(offenders[0].checker, "i1-manifest");
  assert.match(offenders[0].path, /sdd-fake[\\/]SKILL\.md$/);
  assert.match(offenders[0].message, /execute/);
});

test("direction (a): declared write:true without agent 'edit' tool yields one offender for write->edit", (t) => {
  const root = makeWorkspace(t);
  writeSkill(root, "sdd-fake", "runtime_capabilities:\n  execute: false\n  mcp: false\n  write: true");
  writeAgent(root, "sdd-fake", ["read", "search"]);

  const offenders = check({ root, phaseSkills: ["sdd-fake"] });

  assert.equal(offenders.length, 1);
  assert.match(offenders[0].message, /write/);
  assert.match(offenders[0].message, /'edit'/);
});

test("direction (a): both execute and write declared true and both unbacked yields two offenders", (t) => {
  const root = makeWorkspace(t);
  writeSkill(root, "sdd-fake", "runtime_capabilities:\n  execute: true\n  mcp: false\n  write: true");
  writeAgent(root, "sdd-fake", ["read", "search"]);

  const offenders = check({ root, phaseSkills: ["sdd-fake"] });

  assert.equal(offenders.length, 2);
});

// --- 2.4 Direction (b) -------------------------------------------------------

test("direction (b): agent grants 'edit' but bound phase skill declares write:false (or omits) -> one offender", (t) => {
  const root = makeWorkspace(t);
  writeSkill(root, "sdd-fake", "runtime_capabilities:\n  execute: false\n  mcp: false\n  write: false");
  writeAgent(root, "sdd-fake", ["read", "search", "edit"]);

  const offenders = check({ root, phaseSkills: ["sdd-fake"] });

  assert.equal(offenders.length, 1);
  assert.match(offenders[0].path, /sdd-fake\.agent\.md$/);
  assert.match(offenders[0].message, /'edit'/);
});

test("direction (b): agent grants both execute and edit unjustified yields two offenders, not one", (t) => {
  const root = makeWorkspace(t);
  writeSkill(root, "sdd-fake", null);
  writeAgent(root, "sdd-fake", ["read", "search", "edit", "execute"]);

  const offenders = check({ root, phaseSkills: ["sdd-fake"] });

  assert.equal(offenders.length, 2);
});

test("direction (b) is never evaluated for skills outside the phase-skill tier", (t) => {
  const root = makeWorkspace(t);
  writeSkill(root, "utility-fake", null);
  writeAgent(root, "consumer-fake", ["read", "search", "edit", "execute"], "utility-fake");

  // "utility-fake" is not in phaseSkills, so even though the consuming agent
  // grants tools unjustified by the (absent) manifest, direction (b) MUST NOT fire.
  const offenders = check({ root, phaseSkills: [] });

  assert.deepEqual(offenders, []);
});

// --- 2.5 Utility/stack-tier skills -------------------------------------------

test("utility/stack skill with no runtime_capabilities block passes without an offender", (t) => {
  const root = makeWorkspace(t);
  writeSkill(root, "utility-fake", null);
  writeAgent(root, "consumer-fake", ["read", "search", "edit"], "utility-fake");

  const offenders = check({ root, phaseSkills: [] });

  assert.deepEqual(offenders, []);
});

test("utility skill loaded by two agents: direction (a) evaluated per consumer, direction (b) never fires", (t) => {
  const root = makeWorkspace(t);
  writeSkill(root, "utility-fake", "runtime_capabilities:\n  execute: true\n  mcp: false\n  write: false");
  writeAgent(root, "consumer-a", ["read", "search", "edit"], "utility-fake");
  writeAgent(root, "consumer-b", ["read", "search", "edit", "execute"], "utility-fake");

  const offenders = check({ root, phaseSkills: [] });

  assert.equal(offenders.length, 1, "exactly one direction-(a) offender, for consumer-a only");
  assert.match(offenders[0].path, /utility-fake[\\/]SKILL\.md$/);
  assert.match(offenders[0].message, /consumer-a\.agent\.md/);
});

// --- 2.6 Mutation-verified round-trip ----------------------------------------

test("mutation-verified round-trip: fixing the orphan execute declaration makes the checker pass again", (t) => {
  const root = makeWorkspace(t);
  writeSkill(root, "sdd-fake", "runtime_capabilities:\n  execute: true\n  mcp: false\n  write: true");
  writeAgent(root, "sdd-fake", ["read", "search", "edit"]);

  const before = check({ root, phaseSkills: ["sdd-fake"] });
  assert.equal(before.length, 1);

  // Apply the fix: flip the declaration to false so it matches the agent's
  // actual tools: grant.
  writeSkill(root, "sdd-fake", "runtime_capabilities:\n  execute: false\n  mcp: false\n  write: true");

  const after = check({ root, phaseSkills: ["sdd-fake"] });
  assert.deepEqual(after, []);
});

// --- CRITICAL fix: phase skill with no bound agent file ----------------------

test("phase skill exists but its bound agent file is missing -> emits an explicit offender, not []", (t) => {
  const root = makeWorkspace(t);
  // sdd-fake is declared as phase-tier but agents/sdd-fake.agent.md is never
  // written — simulates the bound agent being deleted/renamed.
  writeSkill(root, "sdd-fake", "runtime_capabilities:\n  execute: true\n  mcp: false\n  write: true");

  const offenders = check({ root, phaseSkills: ["sdd-fake"] });

  assert.equal(offenders.length, 1);
  assert.equal(offenders[0].checker, "i1-manifest");
  assert.match(offenders[0].path, /sdd-fake[\\/]SKILL\.md$/);
  assert.match(offenders[0].message, /no bound agent file/);
  assert.match(offenders[0].message, /agents[\\/]sdd-fake\.agent\.md/);
});

test("phase skill with missing bound agent does not suppress checks for a sibling phase skill that has one", (t) => {
  const root = makeWorkspace(t);
  // sdd-orphan has no bound agent file at all (missing binding).
  writeSkill(root, "sdd-orphan", "runtime_capabilities:\n  execute: false\n  mcp: false\n  write: false");
  // sdd-fake HAS a bound agent, with an orphan execute:true unbacked by tools.
  writeSkill(root, "sdd-fake", "runtime_capabilities:\n  execute: true\n  mcp: false\n  write: true");
  writeAgent(root, "sdd-fake", ["read", "search", "edit"]);

  const offenders = check({ root, phaseSkills: ["sdd-orphan", "sdd-fake"] });

  assert.equal(offenders.length, 2, "one 'no bound agent' offender for sdd-orphan, one direction-(a) offender for sdd-fake");
  assert.ok(offenders.some((o) => /no bound agent file/.test(o.message) && /sdd-orphan/.test(o.message)));
  assert.ok(offenders.some((o) => /execute/.test(o.message) && /sdd-fake/.test(o.message)));
});

// --- check(ctx) against a repo tree with no skills/ dir ----------------------

test("check returns [] when the target root has no skills/ directory at all", (t) => {
  const root = makeWorkspace(t);
  assert.deepEqual(check({ root }), []);
});

// --- 3.2 Integration proof against the real repo tree ------------------------
//
// Proves the Phase 3 retrofit calibration (14 SKILL.md files' declared
// runtime_capabilities:) matches the real agents/*.agent.md tools: grants
// exactly. If this fails, the offender messages above name the exact
// skill/agent/tool mismatch to fix.

test("check({root: ROOT}) reports zero offenders against the real skills/ and agents/ trees", () => {
  const ROOT = path.resolve(__dirname, "..", "..", "..");
  assert.deepEqual(check({ root: ROOT }), []);
});
