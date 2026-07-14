"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), "utf8");

const SIGNAL_FIELDS = [
  "residual_ambiguity",
  "public_contract_questions",
  "conflicting_requirements",
  "missing_acceptance_criteria",
];

function loadDocumentedPredicate() {
  const handler = read("skills/_shared/clarify-routing.md");
  const match = handler.match(
    /```js\s+function shouldRunClarify\(signals\) \{([\s\S]*?)\n\}\s+```/,
  );
  assert.ok(match, "clarify handler must expose the shouldRunClarify predicate as executable JS");
  return new Function("signals", match[1]);
}

test("sdd-spec and common envelope contract require all ambiguity signals on success", () => {
  const specSkill = read("skills/sdd-spec/SKILL.md");
  const common = read("skills/_shared/sdd-phase-common.md");

  for (const field of SIGNAL_FIELDS) {
    assert.match(specSkill, new RegExp(`\\b${field}\\b`), `sdd-spec must emit ${field}`);
    assert.match(common, new RegExp(`\\b${field}\\b`), `common schema must define ${field}`);
  }
  assert.match(specSkill, /every successful `sdd-spec` return/i);
  assert.match(common, /required only for `sdd-spec` \+ `success`/i);
  assert.match(common, /validateEnvelope\(obj, \{ phase: "sdd-spec" \}\)/);
});

test("sdd-spec strict success example carries typed ambiguity signals", () => {
  const specSkill = read("skills/sdd-spec/SKILL.md");
  const match = specSkill.match(/```json:result-envelope\s+([\s\S]*?)\s+```/);
  assert.ok(match, "sdd-spec must include a strict result-envelope example");
  const envelope = JSON.parse(match[1]);

  assert.equal(envelope.status, "success");
  assert.equal(envelope.residual_ambiguity, false);
  for (const field of SIGNAL_FIELDS.slice(1)) {
    assert.deepEqual(envelope[field], [], `${field} must be an empty string array example`);
  }
});

test("documented clarify predicate skips only false plus three empty arrays", () => {
  const shouldRunClarify = loadDocumentedPredicate();
  const empty = {
    residual_ambiguity: false,
    public_contract_questions: [],
    conflicting_requirements: [],
    missing_acceptance_criteria: [],
  };

  assert.equal(shouldRunClarify(empty), false);
  assert.equal(shouldRunClarify({ ...empty, residual_ambiguity: true }), true);
  for (const field of SIGNAL_FIELDS.slice(1)) {
    assert.equal(shouldRunClarify({ ...empty, [field]: ["unresolved"] }), true, field);
  }
});

test("orchestrator fails closed before clarify or design on an invalid successful spec", () => {
  const orchestrator = read("agents/sdd-orchestrator.agent.md");

  assert.match(orchestrator, /validateEnvelope\(envelope, \{ phase: "sdd-spec" \}\)/);
  assert.match(orchestrator, /sdd-spec contract remediation/i);
  assert.match(orchestrator, /dispatch neither `sdd-clarify` nor `sdd-design`/i);
  assert.match(orchestrator, /status: blocked/);
  assert.match(orchestrator, /skills\/_shared\/clarify-routing\.md/);
  assert.match(orchestrator, /residual_ambiguity/);
  assert.doesNotMatch(orchestrator, /validate-phase\.js[^\n]*sdd-clarify/i);
  assert.doesNotMatch(orchestrator, /Active route is `lite`/);
});

test("clarify handler owns skipped state and phase-validation bypass", () => {
  const handler = read("skills/_shared/clarify-routing.md");

  assert.match(handler, /phases\.clarify\.status: skipped/);
  assert.match(handler, /MUST NOT[\s\S]*?validate-phase\.js/i);
  assert.match(handler, /status: blocked/);
  assert.match(handler, /questions_asked/);
});
