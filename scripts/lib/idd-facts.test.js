"use strict";

const test = require("node:test");
const assert = require("node:assert");

const { CATEGORY_IDS, citedCoverage, countTests, factsFromCoverage, isConcrete, resolveFeatureCoverage } = require("./idd-facts.js");

const REQUEST = "Build a task list that stores items and rejects an empty title.";

function filesOf(tree) {
  return (file) => (Object.prototype.hasOwnProperty.call(tree, file) ? tree[file] : null);
}

test("a concrete question names a limit, a value or a format", () => {
  assert.strictEqual(isConcrete("¿el título admite más de 200 caracteres?", "inputs"), true);
  assert.strictEqual(isConcrete("¿se persiste en localStorage o solo en memoria?", "persistence"), true);
  assert.strictEqual(isConcrete('¿el filtro usa "todas"?', "url-state"), true);
  assert.strictEqual(isConcrete("¿accesibilidad?", "accessibility"), false);
  assert.strictEqual(isConcrete("¿errores?", "errors"), false);
  assert.strictEqual(isConcrete("¿entradas y límites?", "inputs"), false);
});

test("a feature cite must be a real line or a fragment of the request", () => {
  const tree = { "README.md": "line one\nline two\n" };
  const covered = resolveFeatureCoverage({
    openFacts: ["inputs:¿el título admite más de 200 caracteres?"],
    cites: ["persistence=README.md:2"],
    quotes: CATEGORY_IDS.filter((id) => id !== "inputs" && id !== "persistence").map((id) => `${id}=${REQUEST}`),
    request: REQUEST,
    readFile: filesOf(tree),
  });
  assert.strictEqual(covered.error, undefined);
  assert.strictEqual(covered.coverage.find((entry) => entry.category === "persistence").cite.line, 2);
  assert.deepStrictEqual(resolveFeatureCoverage({ cites: ["persistence=README.md:9"], readFile: filesOf(tree) }).error.code, "cite-unresolved");
  assert.deepStrictEqual(resolveFeatureCoverage({ cites: ["persistence=../README.md:1"], readFile: filesOf(tree) }).error.code, "cite-unresolved");
  assert.deepStrictEqual(
    resolveFeatureCoverage({ quotes: [`copy=not in the request!!`], request: REQUEST, readFile: filesOf(tree) }).error.code,
    "cite-unresolved",
  );
  assert.strictEqual(resolveFeatureCoverage({ openFacts: ["inputs:¿límites?"], readFile: filesOf(tree) }).error.code, "facts-undeclared");
});

test("missing categories are refused and name the command", () => {
  const result = resolveFeatureCoverage({ request: REQUEST, readFile: () => null });
  assert.strictEqual(result.error.code, "facts-undeclared");
  assert.match(result.error.how, /--open-fact inputs:/);
  assert.match(result.error.message, /inputs/);
});

test("resolved coverage stores the seven categories in order", () => {
  const built = factsFromCoverage(citedCoverage());
  assert.deepStrictEqual(
    built.facts.coverage.map((entry) => entry.category),
    [...CATEGORY_IDS],
  );
  assert.strictEqual(factsFromCoverage([{ category: "inputs", question: "¿errores?" }]).error.code, "facts-undeclared");
});

test("a recognized runner reporting zero tests is not a passing count", () => {
  assert.strictEqual(countTests(["ℹ tests 0", "ℹ pass 0"]), 0);
  assert.strictEqual(countTests(["# tests 4", "# pass 4"]), 4);
  assert.strictEqual(countTests(["Could not find any test files"]), 0);
  assert.strictEqual(countTests(["no tests ran in 0.01s"]), 0);
  assert.strictEqual(countTests(["lint clean"]), null);
});
