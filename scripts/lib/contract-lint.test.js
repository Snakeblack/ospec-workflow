"use strict";

// Unit-level test for the aggregator core (REQ-contract-lint-001). Exercises
// `runAllCheckers` against fake, injected checkers — not the real registry —
// so this test is independent of the real repo tree. The harness that wires
// the real registry against the real repo lives in
// `scripts/contract-lint.test.js` (Phase 6).

const assert = require("node:assert/strict");
const test = require("node:test");

const { runAllCheckers } = require("./contract-lint.js");

function makeSpyChecker(returnValue) {
  const checker = (ctx) => {
    checker.calls.push(ctx);
    return returnValue;
  };
  checker.calls = [];
  return checker;
}

test("runAllCheckers calls every registered checker and concatenates their offenders", () => {
  const offenderA = { checker: "fakeA", path: "a.md", expected: "x", actual: "y", message: "a offender" };
  const checkerWithOffender = makeSpyChecker([offenderA]);
  const checkerAllPass = makeSpyChecker([]);

  const ctx = { root: "/fake/root" };
  const result = runAllCheckers(ctx, [checkerWithOffender, checkerAllPass]);

  assert.equal(checkerWithOffender.calls.length, 1);
  assert.equal(checkerAllPass.calls.length, 1);
  assert.deepEqual(checkerWithOffender.calls[0], ctx);
  assert.deepEqual(result, [offenderA]);
});

test("runAllCheckers returns [] when every registered checker passes", () => {
  const checkerA = makeSpyChecker([]);
  const checkerB = makeSpyChecker([]);

  const result = runAllCheckers({ root: "/fake/root" }, [checkerA, checkerB]);

  assert.deepEqual(result, []);
  assert.equal(checkerA.calls.length, 1);
  assert.equal(checkerB.calls.length, 1);
});

test("runAllCheckers does not short-circuit — a checker that fails does not prevent others from running", () => {
  const offenderA = { checker: "fakeA", path: "a.md", expected: "x", actual: "y", message: "a offender" };
  const checkerWithOffender = makeSpyChecker([offenderA]);
  const checkerAfterFailure = makeSpyChecker([]);

  runAllCheckers({ root: "/fake/root" }, [checkerWithOffender, checkerAfterFailure]);

  assert.equal(checkerAfterFailure.calls.length, 1, "checker registered after a failing one MUST still run");
});

test("runAllCheckers lets a throwing checker propagate instead of swallowing it as an offender", () => {
  const throwingChecker = () => {
    throw new Error("checker bug: unexpected input shape");
  };
  const neverCalled = makeSpyChecker([]);

  assert.throws(
    () => runAllCheckers({ root: "/fake/root" }, [throwingChecker, neverCalled]),
    /checker bug: unexpected input shape/
  );
});
