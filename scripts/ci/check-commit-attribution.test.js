"use strict";

const assert = require("node:assert/strict");
const { execFileSync, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { offending, offendingText } = require("./check-commit-attribution.js");

const SCRIPT = path.join(__dirname, "check-commit-attribution.js");

function repo(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "commit-attribution-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const git = (...args) => execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.com", ...args], { cwd: dir, encoding: "utf8" }).trim();
  // --no-verify: a global commit-msg hook would refuse the attributed fixture.
  const commit = (message) => {
    git("commit", "-q", "--no-verify", "--allow-empty", "-m", message);
    return git("rev-parse", "HEAD");
  };
  git("init", "-q", "-b", "main");
  return { dir, commit };
}

test("offending lists only the commits of the range that credit a model", (t) => {
  const { dir, commit } = repo(t);
  const base = commit("chore: base\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>");
  const human = commit("feat: add x\n\nCo-Authored-By: Ana <ana@example.com>");
  const attributed = commit("fix: y\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>");
  const named = commit("fix(claude): adjust the adapter");

  const hits = offending(`${base}..${named}`, dir);

  assert.deepEqual(hits, [{ sha: attributed, line: "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" }]);
  assert.ok(!hits.some((hit) => hit.sha === human || hit.sha === base));
});

test("offending returns nothing for an empty range", (t) => {
  const { dir, commit } = repo(t);
  const head = commit("chore: only");
  assert.deepEqual(offending(`${head}..${head}`, dir), []);
});

test("offending throws when git cannot read the range", (t) => {
  const { dir, commit } = repo(t);
  commit("chore: only");
  assert.throws(() => offending("deadbeef..HEAD", dir), /git log deadbeef\.\.HEAD failed/);
});

test("offendingText flags the pull request title or body that credits a tool", () => {
  assert.equal(offendingText("feat: x", "## Summary\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)"),
    "🤖 Generated with [Claude Code](https://claude.com/claude-code)");
  assert.equal(offendingText("🤖 feat: x", ""), "🤖 feat: x");
  assert.equal(offendingText("fix(claude): adjust the adapter", null), null);
  assert.equal(offendingText("feat: x", "Co-Authored-By: Ana <ana@example.com>"), null);
});

test("the CLI exits 1 naming the commit and the pull request text, 0 when clean", (t) => {
  const { dir, commit } = repo(t);
  const base = commit("chore: base");
  const attributed = commit("fix: y\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>");
  const run = (range, env) => spawnSync(process.execPath, [SCRIPT, range], {
    cwd: dir, encoding: "utf8", env: { ...process.env, PR_TITLE: "", PR_BODY: "", ...env },
  });

  const dirty = run(`${base}..${attributed}`, { PR_BODY: "Summary\n\n🤖 Generated with Claude Code" });
  assert.equal(dirty.status, 1);
  assert.match(dirty.stderr, new RegExp(`${attributed.slice(0, 8)}: Co-Authored-By: Claude Opus 5\\.5`));
  assert.match(dirty.stderr, /pull request: 🤖 Generated with Claude Code/);

  const clean = run(`${attributed}..${attributed}`, { PR_TITLE: "fix(claude): adjust", PR_BODY: "Summary" });
  assert.equal(clean.status, 0, clean.stderr);

  const usage = spawnSync(process.execPath, [SCRIPT], { cwd: dir, encoding: "utf8" });
  assert.equal(usage.status, 2);
});
