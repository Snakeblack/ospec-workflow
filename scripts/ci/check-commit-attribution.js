"use strict";

// Fails when a commit of <base>..<head>, or the pull request title or body
// (PR_TITLE, PR_BODY), credits an AI tool (rules/no-model-attribution.instructions.md).
// It reuses the commit-msg hook's checker, which a host without ospec never runs.
const { spawnSync } = require("node:child_process");
const { findAttribution } = require("../hooks/commit-msg-hook.js");

function offending(range, cwd = process.cwd()) {
  const log = spawnSync("git", ["log", "--format=%H%x00%B%x1e", range], { cwd, encoding: "utf8" });
  if (log.status !== 0) throw new Error(`git log ${range} failed: ${log.stderr}`);
  return log.stdout.split("\x1e").map((entry) => entry.trim()).filter(Boolean)
    .map((entry) => {
      const [sha, body = ""] = entry.split("\0");
      return { sha, line: findAttribution(body) };
    })
    .filter((hit) => hit.line);
}

function offendingText(title, body) {
  return findAttribution(`${title || ""}\n${body || ""}`);
}

if (require.main === module) {
  const range = process.argv[2];
  if (!range) {
    console.error("usage: check-commit-attribution.js <base>..<head>");
    process.exit(2);
  }
  const hits = offending(range);
  for (const hit of hits) console.error(`${hit.sha.slice(0, 8)}: ${hit.line}`);
  const text = offendingText(process.env.PR_TITLE, process.env.PR_BODY);
  if (text) console.error(`pull request: ${text}`);
  process.exit(hits.length > 0 || text ? 1 : 0);
}

module.exports = { offending, offendingText };
