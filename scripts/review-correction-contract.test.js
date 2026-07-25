"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");

test("review-correction source defines targeted-only exact outcome contract", () => {
  const agent = fs.readFileSync(path.join(ROOT, "agents/review-correction.agent.md"), "utf8");
  const skill = fs.readFileSync(path.join(ROOT, "skills/review-correction/SKILL.md"), "utf8");
  const models = fs.readFileSync(path.join(ROOT, "models.yaml"), "utf8");
  const contract = `${agent}\n${skill}`;
  assert.match(contract, /resolved\|unresolved/);
  assert.match(contract, /every frozen unresolved finding ID exactly once/i);
  assert.match(contract, /MUST NOT.*new.*block/i);
  assert.match(contract, /follow-ups?.*non-blocking/i);
  assert.match(contract, /regression.*evidence/i);
  assert.match(models, /^\s*review-correction: default$/m);
});

test("slice remediation contracts preserve active-slice, migration, regression, and read-only boundaries in source mirrors", () => {
  const sources = [
    "skills/_shared/gate-4r-review.md",
    "agents/sdd-orchestrator.agent.md",
    "skills/review-correction/SKILL.md",
    "agents/review-correction.agent.md",
    "rules/sdd-common.instructions.md",
    "rules/sdd-openspec.instructions.md",
  ].map((relative) => fs.readFileSync(path.join(ROOT, relative), "utf8"));
  const contract = sources.join("\n");
  for (const marker of ["active slice", "Persist the pending", "read-only", "reconciliation-required", "new-candidate", "new-scope", "new-discovery-authority"]) {
    assert.match(contract, new RegExp(marker, "i"), marker);
  }
  assert.match(contract, /impacted[_ -]slice.*regression|regression.*impacted[_ -]slice/i);
  assert.match(sources[4], /Remediation v2 charges and validates one evidence-bound root-cause slice at a time/);
  assert.match(sources[5], /additive remediation-v2 manifest\/slices with immutable per-slice line\/attempt budgets/);
});
