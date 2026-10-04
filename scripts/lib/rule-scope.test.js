"use strict";

// Roadmap E0.2: a rule keeps the scope its source declares on every target.
// `applyTo: '**'` is global, `agents/**` is the orchestrator's protocol, and
// any other glob is a path scope expressed with the host's own mechanism.

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const { expandBraces, ruleScope } = require("./rule-scope.js");
const { parse, getField } = require("./frontmatter.js");
const { buildTargetFiles, measureTarget } = require("./context-baseline.js");
const { PROFILES } = require("../configure/cli.js");

const ROOT = path.resolve(__dirname, "..", "..");
const ORCHESTRATOR = /(^|\/)(sdd-orchestrator(\/SKILL\.md|\.agent\.md|\.md|\.toml)|ospec-workflow\.md)$/;

// Headings that identify each source rule wherever its body lands.
const HEADING = {
  attribution: "# Agent Behaviour and Commit Rules",
  common: "# SDD Common Protocol",
  engram: "# Engram Session Memory (optional)",
  openspec: "# OpenSpec Persistence Protocol",
  orchestrator: "# SDD Orchestrator",
  router: "# ospec-workflow",
  strictTdd: "# Strict TDD Protocol",
};
// Roadmap E0.4: what every request pays before any SDD work starts.
const ALWAYS_ON_BUDGET = 4096;
const SCOPED = [HEADING.common, HEADING.engram, HEADING.openspec, HEADING.strictTdd];

const built = new Map();
function target(id) {
  if (!built.has(id)) built.set(id, buildTargetFiles(ROOT, PROFILES[id]));
  return built.get(id);
}

// Anchored so an embedded, demoted copy ("#### Strict TDD ...") never matches.
function carries(content, heading) {
  return String(content).split(/\r?\n/).includes(heading);
}

function fileWith(files, heading) {
  return files.filter((file) => carries(file.content, heading));
}

function frontmatterOf(file) {
  return parse(String(file.content).replace(/\r\n/g, "\n")).frontmatter;
}

function ruleFile(files, heading) {
  const hits = fileWith(files, heading).filter((file) => !ORCHESTRATOR.test(file.path));
  assert.equal(hits.length, 1, `exactly one rule file must carry ${heading}`);
  return hits[0];
}

function scopeOf(fields) {
  const lines = Object.entries(fields).map(([key, value]) => `${key}: ${value}`);
  return ruleScope(parse(`---\n${lines.join("\n")}\n---\n\nbody\n`).frontmatter);
}

test("expandBraces expands one or more brace groups and leaves plain globs alone", () => {
  assert.deepEqual(expandBraces("openspec/**"), ["openspec/**"]);
  assert.deepEqual(expandBraces("**/*.{spec.ts,test.ts,go}"), ["**/*.spec.ts", "**/*.test.ts", "**/*.go"]);
  assert.deepEqual(expandBraces("{src,lib}/*.{js,ts}"), ["src/*.js", "src/*.ts", "lib/*.js", "lib/*.ts"]);
});

test("ruleScope classifies global, orchestrator and path scopes from the source", () => {
  assert.deepEqual(scopeOf({ applyTo: "'**'" }), { kind: "global", globs: [], conditional: false });
  assert.deepEqual(scopeOf({ description: "'no applyTo'" }), { kind: "global", globs: [], conditional: false });
  assert.deepEqual(scopeOf({ applyTo: "'agents/**/*.agent.md'" }), { kind: "orchestrator", globs: [], conditional: false });
  assert.deepEqual(scopeOf({ applyTo: "'openspec/**'" }), { kind: "path", globs: ["openspec/**"], conditional: false });
  assert.deepEqual(scopeOf({ applyTo: "'**/*.{ts,go}, docs/**'", activation: "conditional" }), {
    kind: "path",
    globs: ["**/*.ts", "**/*.go", "docs/**"],
    conditional: true,
  });
});

test("no target installs a scoped rule as an always-on instruction", () => {
  for (const id of Object.keys(PROFILES)) {
    const files = target(id);
    const alwaysOn = Object.keys(measureTarget(files).always_on_files);
    for (const filePath of alwaysOn) {
      const content = files.find((file) => file.path === filePath).content;
      for (const heading of SCOPED) {
        assert.ok(!carries(content, heading), `${id}: ${filePath} is always-on and carries ${heading}`);
      }
    }
  }
});

test("no target distributes this repository's release flow", () => {
  for (const id of Object.keys(PROFILES)) {
    for (const file of target(id)) {
      assert.ok(!/Post-Archive Flow \(Release and Publication\)/.test(file.content), `${id}: ${file.path} ships the release flow`);
      assert.ok(!/agents-protocol/.test(file.path), `${id}: ${file.path} is the synthesized AGENTS.md rule`);
    }
  }
});

test("the global attribution rule stays always-on where hosts load rules", () => {
  for (const id of ["cursor", "github-copilot", "antigravity", "opencode"]) {
    const files = target(id);
    const rule = ruleFile(files, HEADING.attribution);
    assert.ok(rule.path in measureTarget(files).always_on_files, `${id}: ${rule.path} must stay always-on`);
  }
});

test("orchestrator-scoped rules are embedded in the orchestrator agent", () => {
  for (const id of ["cursor", "github-copilot", "antigravity", "opencode"]) {
    const files = target(id);
    const orchestrator = files.find((file) => ORCHESTRATOR.test(file.path) && /agents\//.test(file.path));
    assert.ok(orchestrator, `${id}: orchestrator agent missing`);
    for (const heading of [HEADING.common, HEADING.engram]) {
      assert.ok(carries(orchestrator.content, heading), `${id}: orchestrator lacks ${heading}`);
      assert.equal(fileWith(files, heading).length, 1, `${id}: ${heading} must live only in the orchestrator`);
    }
  }
});

test("path-scoped rules use each host's native path mechanism", () => {
  const tdd = ["**/*.spec.ts", "**/*.test.ts", "**/*.cs", "**/*.js", "**/*.go", "**/*.py", "**/*.kt"];

  const cursor = target("cursor");
  for (const [heading, globs] of [[HEADING.openspec, ["openspec/**"]], [HEADING.strictTdd, tdd]]) {
    const fm = frontmatterOf(ruleFile(cursor, heading));
    assert.equal(getField(fm, "alwaysApply").value, "false");
    assert.deepEqual(getField(fm, "globs").value, globs);
  }

  const copilot = target("github-copilot");
  assert.equal(getField(frontmatterOf(ruleFile(copilot, HEADING.openspec)), "applyTo").value, "openspec/**");
  assert.equal(getField(frontmatterOf(ruleFile(copilot, HEADING.strictTdd)), "applyTo").value, tdd.join(","));

  const antigravity = target("antigravity");
  for (const [heading, globs] of [[HEADING.openspec, ["openspec/**"]], [HEADING.strictTdd, tdd]]) {
    const fm = frontmatterOf(ruleFile(antigravity, heading));
    assert.equal(getField(fm, "trigger").value, "glob");
    assert.equal(getField(fm, "globs").value, globs.join(", "));
    assert.equal(getField(fm, "applyTo"), null, "Antigravity does not read applyTo");
  }
  const attribution = frontmatterOf(ruleFile(antigravity, HEADING.attribution));
  assert.equal(getField(attribution, "trigger").value, "always_on");
});

test("OpenCode, without path scopes, embeds always-active path rules and drops conditional ones", () => {
  const files = target("opencode");
  const orchestrator = files.find((file) => file.path === ".opencode/agents/ospec-workflow.md");
  assert.ok(carries(orchestrator.content, HEADING.openspec));
  assert.equal(fileWith(files, HEADING.strictTdd).length, 0, "Strict TDD reaches apply/verify through their embedded modules");
  const instructions = files.filter((file) => file.path.startsWith(".opencode/instructions/")).map((file) => file.path);
  assert.deepEqual(instructions, [
    ".opencode/instructions/no-model-attribution.instructions.md",
    ".opencode/instructions/ospec-router.instructions.md",
  ]);
});

// --- E0.4: the router is the only always-on entry point to SDD -------------

function alwaysOnFiles(id) {
  const files = target(id);
  return Object.keys(measureTarget(files).always_on_files).map((filePath) => files.find((file) => file.path === filePath));
}

test("every target loads the router and the attribution rule within 4 KB always-on", () => {
  for (const id of Object.keys(PROFILES)) {
    const measured = measureTarget(target(id));
    assert.ok(measured.always_on_bytes <= ALWAYS_ON_BUDGET, `${id}: ${measured.always_on_bytes} B always-on exceeds ${ALWAYS_ON_BUDGET}`);
    const alwaysOn = alwaysOnFiles(id);
    assert.equal(alwaysOn.filter((file) => carries(file.content, HEADING.router)).length, 1, `${id}: the router must be always-on once`);
    assert.equal(alwaysOn.filter((file) => carries(file.content, HEADING.attribution)).length, 1, `${id}: the attribution rule must be always-on once`);
  }
});

test("no always-on instruction carries the SDD orchestrator", () => {
  for (const id of Object.keys(PROFILES)) {
    for (const file of alwaysOnFiles(id)) {
      assert.ok(!carries(file.content, HEADING.orchestrator), `${id}: ${file.path} is always-on and carries the orchestrator`);
    }
  }
});

test("the router enters SDD only on an explicit request and names the host's own orchestrator", () => {
  const entry = {
    claude: "skill `ospec-workflow:sdd-orchestrator`",
    codex: "skill `sdd-orchestrator`",
    cursor: "agent `sdd-orchestrator`",
    "github-copilot": "agent `sdd-orchestrator`",
    vscode: "agent `sdd-orchestrator`",
    antigravity: "agent `sdd-orchestrator`",
    opencode: "agent `ospec-workflow`",
  };
  for (const id of Object.keys(PROFILES)) {
    const router = alwaysOnFiles(id).find((file) => carries(file.content, HEADING.router));
    assert.ok(router.content.includes(`Load the ${entry[id]}`), `${id}: the router must name ${entry[id]}`);
    assert.ok(!/\{\{[^}]*\}\}/.test(router.content), `${id}: unresolved router placeholder`);
    assert.ok(router.content.includes("`/sdd-*`"), `${id}: the router must name the /sdd-* commands`);
    assert.ok(!/\bOffer it\b/.test(router.content), `${id}: the router must not offer SDD on its own`);
  }
});

test("Codex loads the orchestrator as the sdd-orchestrator skill, with its scoped rules", () => {
  const files = target("codex");
  const agentsMd = files.find((file) => file.path === "AGENTS.md");
  assert.ok(carries(agentsMd.content, HEADING.router) && carries(agentsMd.content, HEADING.attribution));
  const skill = files.find((file) => file.path === "skills/sdd-orchestrator/SKILL.md");
  assert.ok(skill, "codex: the orchestrator must be emitted as a skill");
  assert.equal(getField(frontmatterOf(skill), "name").value, "sdd-orchestrator");
  for (const heading of [HEADING.orchestrator, HEADING.common, HEADING.engram, HEADING.openspec]) {
    assert.ok(carries(skill.content, heading), `codex: the orchestrator skill lacks ${heading}`);
  }
  assert.equal(fileWith(files, HEADING.strictTdd).length, 0, "Strict TDD reaches apply/verify through their embedded modules");
  const command = files.find((file) => file.path === "skills/commands/sdd-new/SKILL.md");
  assert.match(command.content, /the `sdd-orchestrator` skill/);
  assert.ok(!/Spawn the `sdd-orchestrator` agent|`sdd-orchestrator` custom agent/.test(command.content), "codex has no orchestrator agent to spawn");
});

test("Claude builds the router in global-instructions/CLAUDE.md for the installer, outside the orchestrator skill", () => {
  const files = target("claude");
  const claudeMd = files.find((file) => file.path === "global-instructions/CLAUDE.md");
  assert.ok(claudeMd, "claude: global-instructions/CLAUDE.md must be built");
  assert.ok(carries(claudeMd.content, HEADING.router) && carries(claudeMd.content, HEADING.attribution));
  const skill = files.find((file) => file.path === "skills/sdd-orchestrator/SKILL.md");
  assert.ok(!carries(skill.content, HEADING.router) && !carries(skill.content, HEADING.attribution), "global rules live in CLAUDE.md only");
  assert.ok(carries(skill.content, HEADING.common), "orchestrator-scoped rules stay in the skill");
});
