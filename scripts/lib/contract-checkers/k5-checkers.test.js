"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { check: checkFailureTransitionMatrix } = require("./k5-failure-transition-matrix.js");
const { check: checkBudgetStructure } = require("./k5-budget-structure.js");

const ROOT = path.resolve(__dirname, "..", "..", "..");

test("k5-failure-transition-matrix checker: reports offenders for unallowlisted recovery operations", () => {
  const badTransition = {
    schema_version: 1,
    transition_id: "trans-ambiguous-repair",
    category: "ambiguous_effect",
    failure_code: "AMBIGUOUS_EFFECT_FAULT",
    target_operation: "repair",
    scope: { node_ids: ["n1"], allowed_paths: [], finding_ids: [] },
    expected_advancement: true,
  };

  const badFailure = {
    schema_version: 1,
    failure_id: "fail-missing-fields",
    // category, code, priority, blocking_fingerprint missing
  };

  const offenders = checkFailureTransitionMatrix({
    root: ROOT,
    transitions: [badTransition],
    failures: [badFailure],
  });

  assert.ok(offenders.length >= 2, "Must report unallowlisted transition and missing failure fields");
  assert.ok(offenders.some((o) => o.checker === "k5-failure-transition-matrix" && o.message.includes("unallowlisted operation 'repair' for category 'ambiguous_effect'")));
  assert.ok(offenders.some((o) => o.checker === "k5-failure-transition-matrix" && o.message.includes("missing required taxonomy field 'category'")));
});

test("k5-failure-transition-matrix checker: reports zero offenders on clean repository fixtures", () => {
  const offenders = checkFailureTransitionMatrix({ root: ROOT });
  assert.deepEqual(offenders, []);
});

test("k5-failure-transition-matrix checker: fails closed for unreadable or malformed files", (t) => {
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), "k5-failure-transition-"));
  t.after(() => fs.rmSync(fixtureDir, { recursive: true, force: true }));
  const malformedPath = path.join(fixtureDir, "malformed.json");
  const missingPath = path.join(fixtureDir, "missing.json");
  fs.writeFileSync(malformedPath, "{not-json");

  const offenders = checkFailureTransitionMatrix({
    root: fixtureDir,
    failureFiles: [malformedPath, missingPath],
  });

  assert.equal(offenders.length, 2);
  assert.deepEqual(offenders.map(({ checker, path: offenderPath, expected }) => ({ checker, path: offenderPath, expected })), [
    { checker: "k5-failure-transition-matrix", path: "malformed.json", expected: "readable JSON document" },
    { checker: "k5-failure-transition-matrix", path: "missing.json", expected: "readable JSON document" },
  ]);
});

test("k5-budget-structure checker: reports offenders for negative quotas, malformed fields, and inflated repair budgets", () => {
  const badBudget = {
    schema_version: 1,
    turns: -2,
    patches: -1,
    commands: "invalid-string",
    wall_time_minutes: -10,
    changed_lines: 0,
    effect_attempts: "many",
    authority_mutations: -5,
  };

  const inflatedChildBudget = {
    schema_version: 1,
    turns: 10,
    effect_attempts: 5,
    parent_budget: {
      turns: 5,
      effect_attempts: 3,
    },
  };

  const offenders = checkBudgetStructure({
    root: ROOT,
    budgets: [badBudget, inflatedChildBudget],
  });

  assert.ok(offenders.length >= 5, "Must report negative/malformed fields and budget inflation");
  assert.ok(offenders.some((o) => o.checker === "k5-budget-structure" && o.message.includes("turns")));
  assert.ok(offenders.some((o) => o.checker === "k5-budget-structure" && o.message.includes("effect_attempts")));
  assert.ok(offenders.some((o) => o.checker === "k5-budget-structure" && o.message.includes("inflates parent budget dimension 'turns': 10 > 5")));
  assert.ok(offenders.some((o) => o.checker === "k5-budget-structure" && o.message.includes("inflates parent budget dimension 'effect_attempts': 5 > 3")));
});

test("k5-budget-structure checker: reports zero offenders on clean repository fixtures", () => {
  const offenders = checkBudgetStructure({ root: ROOT });
  assert.deepEqual(offenders, []);
});

test("k5-budget-structure checker: fails closed for unreadable or malformed files", (t) => {
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), "k5-budget-structure-"));
  t.after(() => fs.rmSync(fixtureDir, { recursive: true, force: true }));
  const malformedPath = path.join(fixtureDir, "malformed.json");
  const missingPath = path.join(fixtureDir, "missing.json");
  fs.writeFileSync(malformedPath, "{not-json");

  const offenders = checkBudgetStructure({
    root: fixtureDir,
    budgetFiles: [malformedPath, missingPath],
  });

  assert.equal(offenders.length, 2);
  assert.deepEqual(offenders.map(({ checker, path: offenderPath, expected }) => ({ checker, path: offenderPath, expected })), [
    { checker: "k5-budget-structure", path: "malformed.json", expected: "readable JSON document" },
    { checker: "k5-budget-structure", path: "missing.json", expected: "readable JSON document" },
  ]);
});
