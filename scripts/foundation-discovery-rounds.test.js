"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "..");
const SKILL = path.join(ROOT, "skills", "foundation", "SKILL.md");
const SCENARIOS = path.join(ROOT, "skills", "foundation", "assets", "scenarios");

function read(file) {
  return fs.readFileSync(file, "utf8");
}

test("foundation skill locks the six acceptance scenarios and the approval rule", () => {
  const text = read(SKILL);
  const rules = [
    "Do not write application code, manifests, dependencies, CI files or scaffolds",
    "without approval",
    "CLI local without a service",
    "files, errors, compatibility, distribution and tests",
    "Load `cncf-landscape`",
    "Treat Kubernetes as a requirement",
    "Small SaaS",
    "unknown cost and competencies",
    "Invent an SLO or any numeric budget",
    "Regulated or high-risk",
    "data, permissions, traceability and recovery",
    "Leave it a gap",
    "Documented brownfield",
    "Preserve prior content and the approval already in force",
    "status: inferred",
    "Stale source or offline",
    "revision or date",
    "only the decision that depends on the missing evidence",
    "Add a stale state to the knowledge map",
    "Small later change",
    "write only the delta",
    "Regenerate foundation",
    "Run a general technology search",
    "A local CLI, a language choice or bootstrap does not load it",
  ];
  for (const rule of rules) {
    assert.ok(text.includes(rule), `foundation skill is missing: ${rule}`);
  }
  for (const name of ["cli-local.md", "small-saas.md", "regulated.md", "brownfield.md", "stale-source.md", "small-change.md"]) {
    assert.ok(text.includes("assets/scenarios/"), "foundation skill must point at the scenario notes");
    assert.ok(fs.existsSync(path.join(SCENARIOS, name)), `missing scenario note ${name}`);
  }
});

test("CLI local note covers delivery concerns and does not require Kubernetes or CNCF", () => {
  const text = read(path.join(SCENARIOS, "cli-local.md"));
  for (const section of ["## Files", "## Errors", "## Compatibility", "## Distribution", "## Tests"]) {
    assert.ok(text.includes(section), `cli-local note is missing ${section}`);
  }
  assert.match(text, /Kubernetes is not a requirement/);
  assert.match(text, /cncf-landscape: not loaded/);
});

test("small SaaS note compares operations and records unknown cost without an SLO", () => {
  const text = read(path.join(SCENARIOS, "small-saas.md"));
  assert.match(text, /Compare keeping the managed database/);
  assert.match(text, /Cost: unknown/);
  assert.match(text, /Competencies: unknown/);
  assert.match(text, /No SLO is set/);
  assert.doesNotMatch(text, /\d+(?:\.\d+)?\s*%/);
});

test("regulated note deepens obligations and leaves an unconfirmed one as a gap", () => {
  const text = read(path.join(SCENARIOS, "regulated.md"));
  for (const section of ["## Data", "## Permissions", "## Traceability", "## Recovery", "## Gaps"]) {
    assert.ok(text.includes(section), `regulated note is missing ${section}`);
  }
  assert.match(text, /Retention period: unknown/);
  assert.match(text, /No competent source confirmed it/);
  assert.match(text, /Leave it a gap/);
});

test("brownfield note preserves the baseline, records a divergence and does not infer an ADR", () => {
  const text = read(path.join(SCENARIOS, "brownfield.md"));
  assert.match(text, /The service owns orders in one database\. Approval: accepted 2026-09-01\./);
  assert.match(text, /## Divergence/);
  assert.match(text, /## Proposed delta/);
  assert.doesNotMatch(text, /status:\s*inferred/);
});

test("stale source note shows revision and date and unknowns only the dependent decision", () => {
  const text = read(path.join(SCENARIOS, "stale-source.md"));
  assert.match(text, /revision: abc123/);
  assert.match(text, /retrieved_at: 2026-09-05/);
  assert.match(text, /Deployment target: unknown/);
  assert.match(text, /Problem statement: confirmed/);
});

test("small later change note writes a delta and does not regenerate foundation", () => {
  const text = read(path.join(SCENARIOS, "small-change.md"));
  assert.match(text, /## Applicable section/);
  assert.match(text, /## Delta/);
  assert.match(text, /Foundation was not regenerated/);
  assert.match(text, /No general technology search was run/);
  assert.doesNotMatch(text, /cncf-landscape/);
});
