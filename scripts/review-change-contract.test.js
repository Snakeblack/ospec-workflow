"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { validateGeneralistDecision } = require("./lib/review-dimensions.js");

const ROOT = path.resolve(__dirname, "..");

test("review-change source is read-only and defines the exact bounded decision contract", () => {
  const agent = fs.readFileSync(path.join(ROOT, "agents/review-change.agent.md"), "utf8");
  const skill = fs.readFileSync(path.join(ROOT, "skills/review-change/SKILL.md"), "utf8");
  assert.match(agent, /tools: \['read', 'search'\]/);
  assert.match(agent + skill, /artifacts: \[\]/);
  assert.match(skill, /exactly.*status.*specialists.*reason/is);
  assert.match(skill, /MUST NOT.*findings.*severity.*remediation/is);
  assert.match(skill, /basic correctness/i);
  assert.match(skill, /permission|process/i);
});

test("generalist payload accepts clear and canonical escalation, rejects malformed boundaries", () => {
  assert.equal(validateGeneralistDecision({ status: "clear", specialists: [], reason: "signals=none;dimensions=none" }).valid, true);
  assert.equal(validateGeneralistDecision({ status: "needs-specialist", specialists: ["risk", "reliability"], reason: "signals=diff-auth-permission,diff-process-execution;dimensions=risk,reliability" }).valid, true);
  assert.equal(validateGeneralistDecision({ status: "needs-specialist", specialists: ["reliability", "risk"], reason: "Wrong order." }).valid, false);
  assert.equal(validateGeneralistDecision({ status: "needs-specialist", specialists: ["risk"], reason: "" }).valid, false);
  assert.equal(validateGeneralistDecision({ status: "needs-specialist", specialists: ["risk"], reason: "token=sk-live-SYNTHETIC_TOKEN" }).valid, false);
});

test("generalist contract structurally excludes arbitrary persisted reason material", () => {
  const source = fs.readFileSync(path.join(ROOT, "skills/review-change/SKILL.md"), "utf8");
  assert.match(source, /reason.{0,120}not free-form/is);
  assert.match(source, /arbitrary.*diff text|diff text.*arbitrary/is);
  assert.match(source, /credentials, secrets, tokens/i);
});

test("generalist contract requires structural classifier references instead of prose", () => {
  const source = fs.readFileSync(path.join(ROOT, "skills/review-change/SKILL.md"), "utf8");
  assert.match(source, /signals=.*dimensions=/i);
  assert.match(source, /allowlisted|allowlist/i);
  assert.match(source, /MUST NOT.*free-form|free-form.*MUST NOT/is);
});

test("registration and specialist sources remain distinct", () => {
  const models = fs.readFileSync(path.join(ROOT, "models.yaml"), "utf8");
  const orchestrator = fs.readFileSync(path.join(ROOT, "agents/sdd-orchestrator.agent.md"), "utf8");
  assert.match(models, /^\s*review-change: default$/m);
  assert.match(orchestrator, /agents: \[[^\n]*'review-change'/);
  for (const id of ["risk", "reliability", "resilience", "readability"]) {
    assert.ok(fs.existsSync(path.join(ROOT, `skills/review-${id}/SKILL.md`)));
  }
});
