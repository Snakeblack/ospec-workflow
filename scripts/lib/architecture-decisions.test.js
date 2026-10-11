"use strict";

// This repository's own foundation (E2.6 dogfood-ospec-foundation):
// docs/architecture/decisions/ holds only architecture ADRs, each one lints
// with no error and no warning, and every driver it cites exists.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { lintDecisionRecord, parseAdrMarkdown } = require("./decision-records.js");
const { validateKnowledgeMap } = require("./knowledge-map.js");
const { validateComponentMap } = require("./component-map.js");

const ROOT = path.resolve(__dirname, "../..");
const ARCHITECTURE = path.join(ROOT, "docs/architecture");
const DECISIONS = path.join(ARCHITECTURE, "decisions");
// The products and formats ospec is built on or ships to. None belongs in a Decision section.
const STACK = [
  "Node.js",
  "JavaScript",
  "Go",
  "OpenSpec",
  "Engram",
  "GitHub",
  "Claude Code",
  "Codex",
  "Cursor",
  "OpenCode",
  "Copilot",
  "YAML",
  "JSON Schema",
];

function readJson(relative) {
  return JSON.parse(fs.readFileSync(path.join(ARCHITECTURE, relative), "utf8"));
}

function decisions() {
  return fs
    .readdirSync(DECISIONS)
    .sort()
    .map((name) => ({ name, record: parseAdrMarkdown(fs.readFileSync(path.join(DECISIONS, name), "utf8"), { stack: STACK }) }));
}

test("docs/architecture/decisions holds only numbered architecture ADRs", () => {
  const entries = decisions();
  assert.ok(entries.length >= 10, `expected at least 10 ADRs, found ${entries.length}`);
  entries.forEach(({ name, record }, index) => {
    const id = String(index + 1).padStart(4, "0");
    assert.match(name, /^[0-9]{4}-[a-z0-9]+(-[a-z0-9]+)*\.md$/, name);
    assert.equal(name.slice(0, 4), id, `${name} is out of sequence`);
    assert.equal(record.id, id, `${name} heading id`);
    assert.equal(record.kind, "adr", name);
  });
});

test("every ADR of ospec lints with no error and no warning", () => {
  for (const { name, record } of decisions()) {
    assert.deepEqual(lintDecisionRecord(record, { root: ROOT }), { valid: true, errors: [], warnings: [] }, name);
  }
});

test("every driver an ADR cites exists in the knowledge map or the technical baseline", () => {
  const scenarios = new Set(readJson("knowledge-map.yaml").quality_scenarios.map((scenario) => scenario.id));
  const baseline = fs.readFileSync(path.join(ARCHITECTURE, "technical-baseline.md"), "utf8");
  for (const { name, record } of decisions()) {
    for (const driver of record.drivers) {
      if (driver.kind === "scenario") assert.ok(scenarios.has(driver.id), `${name}: scenario ${driver.id}`);
      else assert.ok(baseline.includes(`\`${driver.kind}:${driver.id}\``), `${name}: ${driver.kind} ${driver.id}`);
    }
  }
});

test("the knowledge map and the component map of ospec validate", () => {
  const knowledge = readJson("knowledge-map.yaml");
  assert.equal(knowledge.profile, "public-library");
  assert.deepEqual(validateKnowledgeMap(knowledge), { valid: true, errors: [] });
  assert.deepEqual(validateComponentMap(readJson("component-map.yaml"), { root: ROOT }), { valid: true, errors: [] });
});
