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
