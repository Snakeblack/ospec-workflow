"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "..");

// Fixture directories are compared byte for byte on every platform, so a
// Windows checkout must keep them LF. The bench reference fixtures are the
// exception: their counter-test must not depend on the line ending.
const FIXTURE_PATH = /(^|\/)(fixtures|__fixtures__|testdata)\/|^scripts\/evals\/bench\/scenarios\/|^skills\/foundation\/assets\/scenarios\//;
const BENCH_REFERENCE = /^scripts\/evals\/bench\/__fixtures__\//;

function git(args, input) {
  const result = spawnSync("git", args, { cwd: ROOT, encoding: "utf8", input, maxBuffer: 64 * 1024 * 1024 });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

function eolOf(files) {
  const eol = new Map();
  for (const line of git(["check-attr", "--stdin", "eol"], files.join("\n") + "\n").split(/\r?\n/)) {
    const match = /^(.*): eol: (\S+)$/.exec(line);
    if (match) eol.set(match[1], match[2]);
  }
  return eol;
}

const tracked = git(["ls-files", "-z"]).split("\0").filter(Boolean);

test("every fixture directory checks out with LF", () => {
  const fixtures = tracked.filter((file) => FIXTURE_PATH.test(file) && !BENCH_REFERENCE.test(file));
  assert.ok(fixtures.some((file) => file.startsWith("scripts/evals/bench/scenarios/")), "the bench scenarios are fixtures");
  const eol = eolOf(fixtures);
  const notLf = fixtures.filter((file) => eol.get(file) !== "lf");
  assert.deepEqual(notLf, []);
});

test("the bench reference fixtures keep the checkout line ending", () => {
  const references = tracked.filter((file) => BENCH_REFERENCE.test(file));
  assert.ok(references.length > 0);
  const eol = eolOf(references);
  assert.deepEqual(references.filter((file) => eol.get(file) !== "unspecified"), []);
});
