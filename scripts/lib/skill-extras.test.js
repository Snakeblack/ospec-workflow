"use strict";

// Roadmap E0.3 (b2): six collaboration and niche skills ship only in the
// optional extras package. Every target leaves them out by default and
// installs them with `--with-extras`.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { EXTRA_SKILLS, isExtraSkillPath } = require("./skill-extras.js");
const { transform } = require("./target-transform.js");
const { loadTree, parseModels, PROFILES, SOURCE_ROOTS } = require("../configure/cli.js");

const ROOT = path.resolve(__dirname, "..", "..");
const MODELS = parseModels(fs.readFileSync(path.join(ROOT, "models.yaml"), "utf8"));

function build(target, options = {}) {
  const profile = PROFILES[target];
  const files = loadTree(ROOT, [...SOURCE_ROOTS, ...(profile.sourceRoots || [])]);
  return transform({ files, profile, models: MODELS, ...options }).files.map((file) => file.path);
}

function extrasIn(paths) {
  return EXTRA_SKILLS.filter((name) => paths.some((p) => p.startsWith(`skills/${name}/`)));
}

test("the extras package lists the six skills of the audit, each present in the source", () => {
  assert.deepEqual([...EXTRA_SKILLS].sort(), [
    "caveman-compress",
    "comment-writer",
    "gh-release-notes",
    "issue-creation",
    "judgment-day",
    "stack-webmcp",
  ]);
  for (const name of EXTRA_SKILLS) {
    assert.ok(fs.existsSync(path.join(ROOT, "skills", name, "SKILL.md")), `skills/${name}/SKILL.md must exist`);
  }
});

test("isExtraSkillPath matches whole skill directories only", () => {
  assert.equal(isExtraSkillPath("skills/judgment-day/SKILL.md"), true);
  assert.equal(isExtraSkillPath("skills/caveman-compress/scripts/compress.py"), true);
  assert.equal(isExtraSkillPath("skills/caveman/SKILL.md"), false);
  assert.equal(isExtraSkillPath("skills/judgment-day-extra/SKILL.md"), false);
  assert.equal(isExtraSkillPath("agents/judgment-day/SKILL.md"), false);
});

for (const target of Object.keys(PROFILES)) {
  test(`${target}: a default build leaves the extras out and --with-extras ships all six`, () => {
    assert.deepEqual(extrasIn(build(target)), []);
    assert.deepEqual(extrasIn(build(target, { withExtras: true })).sort(), [...EXTRA_SKILLS].sort());
  });
}
