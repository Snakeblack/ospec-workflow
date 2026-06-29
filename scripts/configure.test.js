"use strict";

/**
 * Phase 8.1 — Verify that the branch-before-code text from Phase 7 has been
 * propagated into all four dist/ targets via `scripts/configure`.
 *
 * Each assertion reads the agent/skill file in the generated dist/ output and
 * checks for a key phrase introduced by the Phase 7 edits.
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "..");
const DIST = path.join(ROOT, "dist");

/**
 * The four configured targets and their dist/ output directory names.
 * The vscode target is an identity transform; the others have separate schemas.
 */
const TARGETS = [
  { name: "claude", dir: path.join(DIST, "claude-marketplace") },
  { name: "vscode", dir: path.join(DIST, "vscode") },
  { name: "github-copilot", dir: path.join(DIST, "github-copilot") },
  { name: "opencode", dir: path.join(DIST, "opencode") },
];

/**
 * Key phrases from the Phase 7 edits that MUST appear in the generated dist/
 * after `scripts/configure` has been run.
 */
const BRANCH_PR_PHRASE = "Feature branch MUST be created before any project file is edited";
const ORCHESTRATOR_PHRASE = "RECOMIENDA confirmar que hay una rama de feature activa";

/** Recursively search a directory tree for files containing a phrase. */
function findPhrase(dir, phrase) {
  if (!fs.existsSync(dir)) return false;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (findPhrase(abs, phrase)) return true;
    } else if (entry.isFile() && (entry.name.endsWith(".md") || entry.name.endsWith(".json") || entry.name.endsWith(".yaml") || entry.name.endsWith(".yml"))) {
      try {
        const content = fs.readFileSync(abs, "utf8");
        if (content.includes(phrase)) return true;
      } catch {
        // ignore unreadable files
      }
    }
  }
  return false;
}

for (const { name, dir } of TARGETS) {
  test(`dist/${name}: branch-pr Critical Rule 6 (branch-before-code) present`, () => {
    assert.ok(
      findPhrase(dir, BRANCH_PR_PHRASE),
      `dist/${name} must contain '${BRANCH_PR_PHRASE}' — run scripts/configure to regenerate`
    );
  });

  test(`dist/${name}: orchestrator branch advisory present`, () => {
    assert.ok(
      findPhrase(dir, ORCHESTRATOR_PHRASE),
      `dist/${name} must contain '${ORCHESTRATOR_PHRASE}' — run scripts/configure to regenerate`
    );
  });
}
