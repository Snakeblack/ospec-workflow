"use strict";

// Roadmap E0.3 (b2): the optional extras package. These skills stay in the
// source tree but no target installs them unless the user passes
// `--with-extras` (REQ-generator-021). Collaboration helpers and niche skills
// that most sessions never use, so they do not cost listing context by default.

const EXTRA_SKILLS = Object.freeze([
  "issue-creation",
  "comment-writer",
  "gh-release-notes",
  "judgment-day",
  "caveman-compress",
  "stack-webmcp",
]);

const EXTRA_DIRS = EXTRA_SKILLS.map((name) => `skills/${name}/`);

function isExtraSkillPath(filePath) {
  const normalized = String(filePath).replace(/\\/g, "/");
  return EXTRA_DIRS.some((dir) => normalized.startsWith(dir));
}

module.exports = { EXTRA_SKILLS, isExtraSkillPath };
