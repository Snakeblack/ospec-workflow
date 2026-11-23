"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const { extractCompactRules } = require("./lib/skill-registry.js");

const ROOT = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), "utf8");

// openspec/specs/skills/spec.md §6a and §6b.
const BRANCH_PR = read("skills/branch-pr/SKILL.md");
const ISSUE_CREATION = read("skills/issue-creation/SKILL.md");

function procedureOrder(body, heading) {
  const index = body.indexOf(`\n## ${heading}\n`);
  assert.notEqual(index, -1, `missing section: ${heading}`);
  return index;
}

test("branch-pr: the compact rules carry the branch, the default branch and the user's approval", () => {
  const rules = extractCompactRules(BRANCH_PR);

  assert.ok(rules.length > 0 && rules.length < 15, "every rule of branch-pr must reach a sub-agent");
  assert.ok(
    rules.some((rule) => /Feature branch MUST be created before any project file is edited/.test(rule) && rule.includes("<type>/<description>")),
    "a rule creates the branch before any edit and names the convention",
  );
  assert.ok(rules.some((rule) => /^Never edit files or commit on the default branch/.test(rule)), "a rule protects the default branch");
  assert.ok(
    rules.some((rule) => /Push, open, merge and release only with the user's approval/.test(rule)),
    "a rule keeps pushing, opening, merging and releasing with the user",
  );
  assert.ok(rules.some((rule) => /Never rewrite a pushed branch/.test(rule)), "a rule forbids rewriting a pushed branch");
});

test("branch-pr: the branch is created before any step that commits or opens a pull request", () => {
  const branch = procedureOrder(BRANCH_PR, "Before the Branch");
  const create = BRANCH_PR.indexOf("git switch -c <type>/<description>", branch);
  const commit = BRANCH_PR.indexOf("Commit by work unit");
  const open = BRANCH_PR.indexOf("gh pr create");

  assert.ok(create > branch, "the first procedure creates the branch");
  assert.ok(commit > create && open > commit, "committing and opening come after the branch");
});

test("branch-pr: each value the project decides has a source and a fallback", () => {
  const start = procedureOrder(BRANCH_PR, "What the Project Decides");
  const table = BRANCH_PR.slice(start, BRANCH_PR.indexOf("\n## ", start + 1));
  const rows = table.split("\n").filter((line) => /^\| (?!Value|---)/.test(line));

  assert.deepEqual(
    rows.map((row) => row.split("|")[1].trim()),
    ["Base branch", "Pull requests in flight", "Review budget", "Language", "Release"],
  );
  for (const row of rows) {
    const [, , source, fallback] = row.split("|").map((cell) => cell.trim());
    assert.match(source, /`[a-z ]+`/, `${row}: the source is a line of ospec team`);
    assert.ok(fallback.length > 0, `${row}: a project without ospec needs a fallback`);
  }
  assert.match(table, /`ospec team`/);
});

test("branch-pr: it leaves commits and oversized diffs to their skills and never fixes a repository's checks", () => {
  assert.match(BRANCH_PR, /`work-unit-commits`/);
  assert.match(BRANCH_PR, /`chained-pr`/);
  assert.match(BRANCH_PR, /Without `gh`, or on a host that is not GitHub/);
  assert.match(BRANCH_PR, /wait for the user's answer before pushing/);
  assert.match(BRANCH_PR, /Ask the user to approve the merge/);
  assert.doesNotMatch(BRANCH_PR, /shellcheck/i, "the checks are the project's, not a fixed tool");
  assert.doesNotMatch(BRANCH_PR, /status:approved/, "no fixed approval workflow");
});

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
