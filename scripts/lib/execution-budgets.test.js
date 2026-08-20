"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  DEFAULT_NODE_BUDGET,
  DEFAULT_AUTHORITY_BUDGET,
  isBudgetExhausted,
  isNodeBudgetExhausted,
  isAuthorityBudgetExhausted,
  evaluateNodeBudget,
  evaluateAuthorityBudget,
  decrementBudgetMonotonic,
  checkPatchBounds,
  isZeroDeltaMutation,
} = require("./execution-budgets.js");

test("evaluateNodeBudget: evaluates healthy budget and calculates remaining quotas", () => {
  const budget = {
    schema_version: 1,
    turns: 5,
    patches: 3,
    commands: 10,
    wall_time_minutes: 15,
    changed_lines: 400,
    allowed_paths: ["src/**"],
  };

  const consumed = {
    turns: 2,
    patches: 1,
    commands: 4,
    wall_time_minutes: 5,
    changed_lines: 120,
  };

  const result = evaluateNodeBudget(budget, consumed);
  assert.equal(result.ok, true);
  assert.equal(result.exhausted, false);
  assert.deepEqual(result.remaining, {
    turns: 3,
    patches: 2,
    commands: 6,
    wall_time_minutes: 10,
    changed_lines: 280,
  });
});

test("evaluateNodeBudget: reports exhausted when turns quota reaches or exceeds limit", () => {
  const budget = {
    schema_version: 1,
    turns: 5,
    patches: 5,
    commands: 10,
    wall_time_minutes: 15,
    changed_lines: 400,
    allowed_paths: [],
  };

  const resExceeded = evaluateNodeBudget(budget, { turns: 6 });
  assert.equal(resExceeded.ok, false);
  assert.equal(resExceeded.exhausted, true);
  assert.equal(resExceeded.dimension, "turns");
  assert.equal(resExceeded.code, "BUDGET_EXHAUSTED");
  assert.equal(resExceeded.remaining.turns, 0);

  const resExact = evaluateNodeBudget(budget, { turns: 5 });
  assert.equal(resExact.ok, false);
  assert.equal(resExact.exhausted, true);
  assert.equal(resExact.dimension, "turns");
});

test("evaluateAuthorityBudget: evaluates remaining authority limits and reports exhaustion", () => {
  const budget = {
    schema_version: 1,
    effect_attempts: 3,
    authority_mutations: 5,
    evidence_runs: 10,
    review_sweeps: 1,
  };

  const resHealthy = evaluateAuthorityBudget(budget, { effect_attempts: 1, authority_mutations: 2 });
  assert.equal(resHealthy.ok, true);
  assert.equal(resHealthy.remaining.effect_attempts, 2);
  assert.equal(resHealthy.remaining.authority_mutations, 3);
  assert.equal(resHealthy.remaining.review_sweeps, 1);

  const resExhausted = evaluateAuthorityBudget(budget, { effect_attempts: 3 });
  assert.equal(resExhausted.ok, false);
  assert.equal(resExhausted.exhausted, true);
  assert.equal(resExhausted.dimension, "effect_attempts");
  assert.equal(resExhausted.code, "AUTHORITY_BUDGET_EXHAUSTED");
});

test("decrementBudgetMonotonic: non-increasing decrement math across retries and CAS reconciliations", () => {
  const initial = {
    schema_version: 1,
    turns: 10,
    patches: 5,
    commands: 20,
    wall_time_minutes: 30,
    changed_lines: 400,
    allowed_paths: ["src/**"],
  };

  const delta1 = { turns: 3, commands: 5 };
  const step1 = decrementBudgetMonotonic(initial, delta1);
  assert.equal(step1.turns, 7);
  assert.equal(step1.commands, 15);
  assert.equal(step1.patches, 5);
  assert.deepEqual(step1.allowed_paths, ["src/**"]);

  // Second decrement never inflates prior consumed state
  const delta2 = { turns: 4, commands: 12 };
  const step2 = decrementBudgetMonotonic(step1, delta2);
  assert.equal(step2.turns, 3);
  assert.equal(step2.commands, 3);

  // Clamping at zero prevents negative underflow
  const delta3 = { turns: 10 };
  const step3 = decrementBudgetMonotonic(step2, delta3);
  assert.equal(step3.turns, 0);
});

test("decrementBudgetMonotonic: retains consumed turns and attempts across CAS conflict reconciliation without replenishment [REQ-execution-budgets-003]", () => {
  const nodeBudget = {
    schema_version: 1,
    turns: 5,
    patches: 3,
    commands: 10,
    wall_time_minutes: 15,
    changed_lines: 300,
    allowed_paths: ["src/**"],
  };
  const authBudget = {
    schema_version: 1,
    effect_attempts: 3,
    authority_mutations: 10,
    evidence_runs: 20,
    review_sweeps: 1,
  };

  // Lost CAS attempt executes 1 turn and 1 attempt
  const lostRaceDelta = { turns: 1, effect_attempts: 1 };
  const reconciledNode = decrementBudgetMonotonic(nodeBudget, lostRaceDelta);
  const reconciledAuth = decrementBudgetMonotonic(authBudget, lostRaceDelta);

  assert.equal(reconciledNode.turns, 4);
  assert.equal(reconciledAuth.effect_attempts, 2);

  // Retrying operation consumes another 1 turn
  const retryDelta = { turns: 1, effect_attempts: 1 };
  const finalNode = decrementBudgetMonotonic(reconciledNode, retryDelta);
  const finalAuth = decrementBudgetMonotonic(reconciledAuth, retryDelta);

  assert.equal(finalNode.turns, 3);
  assert.equal(finalAuth.effect_attempts, 1);
  assert.ok(finalNode.turns < nodeBudget.turns, "Turns must decrease monotonically");
  assert.ok(finalAuth.effect_attempts < authBudget.effect_attempts, "Attempts must decrease monotonically");
});


test("checkPatchBounds: enforces changed lines limit on diff text", () => {
  const patchDiff = `
diff --git a/src/auth/jwt.js b/src/auth/jwt.js
--- a/src/auth/jwt.js
+++ b/src/auth/jwt.js
@@ -1,3 +1,5 @@
+const jwt = require("jsonwebtoken");
+const config = require("../config.js");
 module.exports = {
-  verify: () => false
+  verify: (token) => jwt.verify(token, config.secret)
 };
`;

  // 3 additions + 1 deletion = 4 changed lines
  const resPass = checkPatchBounds({
    patch: patchDiff,
    changedLinesLimit: 10,
    allowedPaths: ["src/auth/**"],
  });
  assert.equal(resPass.ok, true);
  assert.equal(resPass.changed_lines, 4);

  const resFailLines = checkPatchBounds({
    patch: patchDiff,
    changedLinesLimit: 3,
    allowedPaths: ["src/auth/**"],
  });
  assert.equal(resFailLines.ok, false);
  assert.equal(resFailLines.code, "CHANGED_LINES_LIMIT_EXCEEDED");
  assert.equal(resFailLines.changed_lines, 4);
});

test("checkPatchBounds: enforces allowed paths globs on modified files", () => {
  const multiFileDiff = `
diff --git a/src/auth/jwt.js b/src/auth/jwt.js
+++ b/src/auth/jwt.js
@@ -1 +1,2 @@
+const ok = true;
diff --git a/src/billing/invoice.js b/src/billing/invoice.js
+++ b/src/billing/invoice.js
@@ -1 +1,2 @@
+const billed = true;
`;

  const resAllowed = checkPatchBounds({
    patch: multiFileDiff,
    changedLinesLimit: 100,
    allowedPaths: ["src/auth/**", "src/billing/**"],
  });
  assert.equal(resAllowed.ok, true);

  const resForbidden = checkPatchBounds({
    patch: multiFileDiff,
    changedLinesLimit: 100,
    allowedPaths: ["src/auth/**"],
  });
  assert.equal(resForbidden.ok, false);
  assert.equal(resForbidden.code, "ALLOWED_PATHS_VIOLATION");
  assert.ok(resForbidden.violations.includes("src/billing/invoice.js"));
});

test("isZeroDeltaMutation: counts attempt on non-advancing mutation while exempting advancing or read-only steps", () => {
  // Zero modified files and no state advance = zero delta
  assert.equal(
    isZeroDeltaMutation({
      modifiedFilesCount: 0,
      changedLines: 0,
      stateAdvanced: false,
    }),
    true
  );

  // Identical output hashes with no state advance = zero delta
  assert.equal(
    isZeroDeltaMutation({
      modifiedFilesCount: 0,
      changedLines: 0,
      stateAdvanced: false,
      outputHashBefore: "sha256:abc",
      outputHashAfter: "sha256:abc",
    }),
    true
  );

  // Advancing state = NOT zero delta
  assert.equal(
    isZeroDeltaMutation({
      modifiedFilesCount: 0,
      changedLines: 0,
      stateAdvanced: true,
    }),
    false
  );

  // Modifying files / changed lines = NOT zero delta
  assert.equal(
    isZeroDeltaMutation({
      modifiedFilesCount: 1,
      changedLines: 15,
      stateAdvanced: false,
    }),
    false
  );
});

test("DEFAULT_NODE_BUDGET and DEFAULT_AUTHORITY_BUDGET expose valid baseline envelopes", () => {
  assert.equal(DEFAULT_NODE_BUDGET.schema_version, 1);
  assert.ok(DEFAULT_NODE_BUDGET.turns > 0);
  assert.ok(DEFAULT_NODE_BUDGET.changed_lines > 0);
  assert.ok(Array.isArray(DEFAULT_NODE_BUDGET.allowed_paths));

  assert.equal(DEFAULT_AUTHORITY_BUDGET.schema_version, 1);
  assert.ok(DEFAULT_AUTHORITY_BUDGET.effect_attempts > 0);
});

test("isBudgetExhausted: evaluates all 6 node dimensions accurately", () => {
  // 1. turns
  assert.equal(isBudgetExhausted({ turns: 0 }).exhausted, true);
  assert.equal(isBudgetExhausted({ turns: 5 }, { turns: 5 }).exhausted, true);
  assert.equal(isBudgetExhausted({ turns: 5 }, { turns: 4 }).exhausted, false);

  // 2. patches
  assert.equal(isBudgetExhausted({ patches: 0 }).exhausted, true);
  assert.equal(isBudgetExhausted({ patches: 3 }, { patches: 3 }).exhausted, true);

  // 3. commands
  assert.equal(isBudgetExhausted({ commands: 0 }).exhausted, true);
  assert.equal(isBudgetExhausted({ commands: 10 }, { commands: 10 }).exhausted, true);

  // 4. wall_time_minutes
  assert.equal(isBudgetExhausted({ wall_time_minutes: 0 }).exhausted, true);
  assert.equal(isBudgetExhausted({ wall_time_minutes: 30 }, { wall_time_minutes: 30 }).exhausted, true);

  // 5. changed_lines
  assert.equal(isBudgetExhausted({ changed_lines: 0 }).exhausted, true);
  assert.equal(isBudgetExhausted({ changed_lines: 100 }, { changed_lines: 150 }).exhausted, true);

  // 6. allowed_paths
  const allowed = isBudgetExhausted({ allowed_paths: ["src/**"] }, { modified_paths: ["docs/readme.md"] });
  assert.equal(allowed.exhausted, true);
  assert.equal(allowed.dimension, "allowed_paths");
  assert.equal(allowed.code, "ALLOWED_PATHS_VIOLATION");
});

test("isBudgetExhausted: evaluates all 4 authority dimensions accurately", () => {
  // 1. effect_attempts
  assert.equal(isBudgetExhausted({ effect_attempts: 0 }).exhausted, true);
  assert.equal(isBudgetExhausted({ effect_attempts: 3 }, { effect_attempts: 3 }).exhausted, true);

  // 2. authority_mutations
  assert.equal(isBudgetExhausted({ authority_mutations: 0 }).exhausted, true);
  assert.equal(isBudgetExhausted({ authority_mutations: 5 }, { authority_mutations: 5 }).exhausted, true);

  // 3. evidence_runs
  assert.equal(isBudgetExhausted({ evidence_runs: 0 }).exhausted, true);
  assert.equal(isBudgetExhausted({ evidence_runs: 10 }, { evidence_runs: 10 }).exhausted, true);

  // 4. review_sweeps
  assert.equal(isBudgetExhausted({ review_sweeps: 0 }).exhausted, true);
  assert.equal(isBudgetExhausted({ review_sweeps: 1 }, { review_sweeps: 1 }).exhausted, true);
});

test("isNodeBudgetExhausted and isAuthorityBudgetExhausted apply default envelope overlays", () => {
  const healthyNode = isNodeBudgetExhausted({}, { turns: 1 });
  assert.equal(healthyNode.exhausted, false);

  const exhaustedNode = isNodeBudgetExhausted({}, { turns: 10 });
  assert.equal(exhaustedNode.exhausted, true);

  const healthyAuth = isAuthorityBudgetExhausted({}, { effect_attempts: 1 });
  assert.equal(healthyAuth.exhausted, false);

  const exhaustedAuth = isAuthorityBudgetExhausted({}, { effect_attempts: 3 });
  assert.equal(exhaustedAuth.exhausted, true);
});
