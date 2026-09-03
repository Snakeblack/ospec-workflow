"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { validateRouterDecision } = require("./lib/review-dimensions.js");

const ROOT = path.resolve(__dirname, "..");

test("review-change source is read-only and defines the exact bounded decision contract", () => {
  const agent = fs.readFileSync(path.join(ROOT, "agents/review-change.agent.md"), "utf8");
  const skill = fs.readFileSync(path.join(ROOT, "skills/review-change/SKILL.md"), "utf8");
  assert.match(agent, /tools: \['read', 'search'\]/);
  assert.match(agent + skill, /artifacts: \[\]/);
  assert.match(skill, /exactly.*classification_status.*added_domains.*reason/is);
  assert.match(skill, /MUST NOT.*findings.*severity.*remediation/is);
  assert.match(skill, /residual evidence|residual-only/i);
  assert.match(skill, /per-capability|unattributed capability/i);
});

test("review-change defines the complete successful outer result envelope", () => {
  const skill = fs.readFileSync(path.join(ROOT, "skills/review-change/SKILL.md"), "utf8");
  const contract = skill.split("## Exact decision contract")[1] || "";
  const requiredOuterFields = [
    "status",
    "executive_summary",
    "artifacts",
    "next_recommended",
    "risks",
    "skill_resolution",
  ];
  const example = /```yaml\r?\n([\s\S]*?)\r?\n```/.exec(contract)?.[1] || "";
  const outerFields = new Set(
    example.split(/\r?\n/)
      .map((line) => /^([a-z_]+):/.exec(line)?.[1])
      .filter(Boolean),
  );
  const missingFields = requiredOuterFields.filter(
    (field) => !outerFields.has(field),
  );

  assert.deepEqual(
    missingFields,
    [],
    `review-change outer result envelope omits: ${missingFields.join(", ")}`,
  );
});

test("router payload accepts sufficient merge and rejects malformed boundaries", () => {
  assert.equal(validateRouterDecision({ classification_status: "sufficient", added_domains: ["runtime"], reason: "ambiguity=runtime-code-without-domain-attribution;added=runtime" }).valid, true);
  assert.equal(validateRouterDecision({ classification_status: "ambiguous", added_domains: [], reason: "ambiguity=cross-capability-blast-radius;added=none" }).valid, true);
  assert.equal(validateRouterDecision({ classification_status: "sufficient", added_domains: ["efficiency", "runtime"], reason: "ambiguity=runtime-code-without-domain-attribution;added=runtime,efficiency" }).valid, false);
  assert.equal(validateRouterDecision({ classification_status: "sufficient", added_domains: ["runtime"], reason: "" }).valid, false);
  assert.equal(validateRouterDecision({ classification_status: "sufficient", added_domains: ["runtime"], reason: "token=sk-live-SYNTHETIC_TOKEN" }).valid, false);
});

test("router contract structurally excludes arbitrary persisted reason material", () => {
  const source = fs.readFileSync(path.join(ROOT, "skills/review-change/SKILL.md"), "utf8");
  assert.match(source, /reason.{0,120}not free-form/is);
  assert.match(source, /arbitrary.*diff text|diff text.*arbitrary/is);
  assert.match(source, /credentials|tokens/i);
});

test("router contract requires closed ambiguity grammar instead of prose", () => {
  const source = fs.readFileSync(path.join(ROOT, "skills/review-change/SKILL.md"), "utf8");
  assert.match(source, /ambiguity=.*added=/i);
  assert.match(source, /Allowed ambiguity codes|ambiguity codes/i);
  assert.match(source, /MUST NOT.*free-form|free-form.*MUST NOT/is);
});

test("registration and specialist sources remain distinct", () => {
  const models = fs.readFileSync(path.join(ROOT, "models.yaml"), "utf8");
  const orchestrator = fs.readFileSync(path.join(ROOT, "agents/sdd-orchestrator.agent.md"), "utf8");
  assert.match(models, /^\s*review-change: (?:premium|default|cheap)$/m);
  assert.match(orchestrator, /agents: \[[^\n]*'review-change'/);
  for (const id of ["trust", "runtime", "evolution", "efficiency"]) {
    assert.ok(fs.existsSync(path.join(ROOT, `skills/review-${id}/SKILL.md`)));
  }
  for (const id of ["risk", "reliability", "resilience", "readability"]) {
    assert.ok(fs.existsSync(path.join(ROOT, `skills/review-${id}/SKILL.md`)), `legacy ${id} retained`);
  }
});
