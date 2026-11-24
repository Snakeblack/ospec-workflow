"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const { extractCompactRules } = require("./lib/skill-registry.js");

const ROOT = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), "utf8");

// openspec/specs/skills/spec.md §6b.
const ISSUE_CREATION = read("skills/issue-creation/SKILL.md");

test("issue-creation: the issue holds what a change starts from", () => {
  for (const part of ["Kind", "Summary", "Evidence", "Result", "Open questions"]) {
    assert.match(ISSUE_CREATION, new RegExp(`^\\| ${part} \\|`, "m"), `the issue holds: ${part}`);
  }
  for (const flag of ["--kind", "--summary", "--acceptance", "--open-fact"]) {
    assert.ok(ISSUE_CREATION.includes(`\`${flag}\``), `it maps to ospec record intent ${flag}`);
  }
  assert.doesNotMatch(ISSUE_CREATION, /status:(?:approved|needs-review)/, "no fixed approval workflow");
});

test("issue-creation: the compact rules keep secrets and vulnerabilities out, and the user approves the publication", () => {
  const rules = extractCompactRules(ISSUE_CREATION);

  assert.ok(rules.length > 0 && rules.length < 15, "every rule of issue-creation must reach a sub-agent");
  assert.ok(rules.some((rule) => /^Never put secrets, tokens, personal data or private code in an issue/.test(rule)));
  assert.ok(rules.some((rule) => /^Never file a vulnerability as a public issue/.test(rule)));
  assert.ok(rules.some((rule) => /issue templates and the labels the repository already has/.test(rule)));
  assert.ok(
    rules.some((rule) => /^Publish an issue, or evidence added to an existing one, only after the user saw that draft and agreed/.test(rule)),
    "the publication gate reaches a sub-agent through the compact rules",
  );
  assert.ok(!rules.some((rule) => /add the new evidence there/.test(rule)), "no rule tells an agent to post evidence by itself");
  assert.doesNotMatch(ISSUE_CREATION, /unless they already asked/, "asking for an issue is not agreeing to its draft");
  assert.match(ISSUE_CREATION, /wait for the user's answer/);
});
