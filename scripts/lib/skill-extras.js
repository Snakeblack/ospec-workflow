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

// Roadmap E1.6 (d2): the SDD package. IDD is the default flow, so the SDD
// phases (the `sdd-*` skills, the `sdd-*` agents with the orchestrator, the
// `/sdd-*` commands and the `sdd-*` rules) ship only with `--with-sdd`
// (REQ-generator-025). The `review-*` agents and `skills/_shared/` stay: IDD's
// trust review uses them.
const SDD_PATTERNS = Object.freeze([
  /^skills\/sdd-[a-z0-9-]+\//,
  /^agents\/sdd-[a-z0-9-]+\.agent\.md$/,
  /^commands\/sdd-[a-z0-9-]+\.prompt\.md$/,
  /^rules\/sdd-[a-z0-9-]+\.instructions\.md$/,
]);

function isSddPackagePath(filePath) {
  const normalized = String(filePath).replace(/\\/g, "/");
  return SDD_PATTERNS.some((pattern) => pattern.test(normalized));
}

module.exports = { EXTRA_SKILLS, isExtraSkillPath, isSddPackagePath };
