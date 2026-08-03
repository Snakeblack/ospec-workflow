"use strict";

// Unified contract lint harness (REQ-contract-lint-001, -005). Wired to
// pre-commit/CI purely via the existing `node --test scripts/**/*.test.js`
// glob already run by `scripts/check.js` — no new invocation pathway is
// introduced (see tasks.md's "Resolved open question"). Standalone via
// `node --test scripts/contract-lint.test.js`.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const { runAllCheckers, DEFAULT_REGISTRY } = require("./lib/contract-lint.js");

const ROOT = path.resolve(__dirname, "..");

test("unified contract lint: every registered checker reports zero offenders against the real repo", () => {
  const offenders = runAllCheckers({ root: ROOT });

  if (offenders.length > 0) {
    // REQ-contract-lint-006: the failure output names the checker, the
    // offending path, and the expected-vs-actual mismatch — self-sufficient
    // without opening the checker's source.
    const report = offenders
      .map((o) => `[${o.checker}] ${o.path}\n  expected: ${o.expected}\n  actual:   ${o.actual}\n  ${o.message}`)
      .join("\n\n");
    assert.fail(`contract lint found ${offenders.length} offender(s):\n\n${report}`);
  }
});

test("unified contract lint: DEFAULT_REGISTRY includes the four K1 checkers", () => {
  const lintSource = fs.readFileSync(path.join(__dirname, "lib", "contract-lint.js"), "utf8");
  assert.match(lintSource, /k1-schema-compat/);
  assert.match(lintSource, /k1-emission/);
  assert.match(lintSource, /k1-prose-authority/);
  assert.match(lintSource, /k1-maturity/);
  assert.ok(DEFAULT_REGISTRY.length >= 7);
  for (const checker of DEFAULT_REGISTRY) {
    assert.ok(Array.isArray(checker({ root: ROOT })));
  }
});

test("unified contract lint: one checker failing does not prevent the others from running (no short-circuit)", () => {
  const offenderFromFirst = {
    checker: "fake-failing-checker",
    path: "fixture/path",
    expected: "x",
    actual: "y",
    message: "synthetic offender for the no-short-circuit integration case",
  };

  const calls = [];
  const failingChecker = () => {
    calls.push("failingChecker");
    return [offenderFromFirst];
  };
  const passingChecker = () => {
    calls.push("passingChecker");
    return [];
  };

  const offenders = runAllCheckers({ root: ROOT }, [failingChecker, passingChecker]);

  assert.deepEqual(calls, ["failingChecker", "passingChecker"], "both checkers must run");
  assert.deepEqual(offenders, [offenderFromFirst]);
});
