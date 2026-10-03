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
const ORCHESTRATOR = /(^|\/)(sdd-orchestrator(\/SKILL\.md|\.agent\.md|\.md|\.toml)|ospec-workflow\.md)$|^AGENTS\.md$/;

// Headings that identify each source rule wherever its body lands.
const HEADING = {
  attribution: "# Agent Behaviour and Commit Rules",
  common: "# SDD Common Protocol",
  engram: "# Engram Session Memory (optional)",
  openspec: "# OpenSpec Persistence Protocol",
  strictTdd: "# Strict TDD Protocol",
};
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
      // Codex folds its orchestrator into AGENTS.md: that one belongs to E0.4.
      if (ORCHESTRATOR.test(filePath)) continue;
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
  assert.deepEqual(instructions, [".opencode/instructions/no-model-attribution.instructions.md"]);
});
