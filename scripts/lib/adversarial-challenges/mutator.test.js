"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  applyFocalMutation,
  generateFocalMutations,
  inspectTestAssertions,
  revertSourcePatch,
} = require("./mutator.js");

test("REQ-adversarial-challenges-004: applyFocalMutation flips equality and relational operators", () => {
  const code = "function isValid(a, b) {\n  return a === b && a >= 10;\n}";
  // Line 2 has a === b and a >= 10
  const mutations = generateFocalMutations(code, { targetLines: [2] });

  assert.ok(mutations.length >= 2, "Must find at least 2 mutation opportunities on line 2");

  const mutated1 = applyFocalMutation(code, mutations[0]);
  assert.notEqual(mutated1, code);
  assert.ok(mutated1.includes("!==") || mutated1.includes("<") || mutated1.includes("||"));
});

test("REQ-adversarial-challenges-004: applyFocalMutation flips boolean and logical operators", () => {
  const code = "const flag = true;\nconst cond = x && y;";
  const mutations = generateFocalMutations(code, { targetLines: [1, 2] });

  assert.ok(mutations.length >= 2);
  const foundFalse = mutations.some((m) => m.replacement === "false");
  const foundOr = mutations.some((m) => m.replacement === "||");

  assert.equal(foundFalse, true);
  assert.equal(foundOr, true);
});

test("REQ-adversarial-challenges-004: mutations strictly respect targetLines boundary", () => {
  const code = "const a = 1 + 2;\nconst b = 3 + 4;\nconst c = 5 + 6;";
  // Only target line 2
  const mutations = generateFocalMutations(code, { targetLines: [2] });

  assert.equal(mutations.length, 1);
  assert.equal(mutations[0].line, 2);

  const mutated = applyFocalMutation(code, mutations[0]);
  assert.ok(mutated.includes("const a = 1 + 2;"), "Line 1 must not be mutated");
  assert.ok(mutated.includes("const b = 3 - 4;"), "Line 2 must be mutated");
  assert.ok(mutated.includes("const c = 5 + 6;"), "Line 3 must not be mutated");
});

test("REQ-adversarial-challenges-004: revertSourcePatch reverts applied replacements", () => {
  const base = "function calculate(x) {\n  return x * 2;\n}";
  const modified = "function calculate(x) {\n  return x * 4;\n}";

  const reverted = revertSourcePatch(modified, {
    original: "return x * 2;",
    modified: "return x * 4;",
  });

  assert.equal(reverted, base);
});

test("REQ-adversarial-challenges-004: inspectTestAssertions detects tautological assertions", () => {
  const tautologicalCode1 = `
    test("trivial test", () => {
      assert.equal(true, true);
    });
  `;
  const result1 = inspectTestAssertions(tautologicalCode1);
  assert.equal(result1.ok, false);
  assert.equal(result1.tautological, true);
  assert.equal(result1.reason_code, "TAUTOLOGICAL_TEST_DETECTED");

  const tautologicalCode2 = `
    test("empty test", () => {});
  `;
  const result2 = inspectTestAssertions(tautologicalCode2);
  assert.equal(result2.ok, false);
  assert.equal(result2.tautological, true);
  assert.equal(result2.reason_code, "TAUTOLOGICAL_TEST_DETECTED");

  const tautologicalCode3 = `
    test("self equality", () => {
      assert.strictEqual(x, x);
    });
  `;
  const result3 = inspectTestAssertions(tautologicalCode3);
  assert.equal(result3.ok, false);
  assert.equal(result3.tautological, true);
});

test("REQ-adversarial-challenges-004: inspectTestAssertions passes non-tautological test suites", () => {
  const validCode = `
    test("valid test", () => {
      const result = compute(5);
      assert.equal(result, 10);
    });
  `;
  const result = inspectTestAssertions(validCode);
  assert.equal(result.ok, true);
  assert.equal(result.tautological, false);
});
