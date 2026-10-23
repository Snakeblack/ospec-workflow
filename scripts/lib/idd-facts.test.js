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
    quotes: ["uniqueness=Build a task list", "copy=that stores items", "url-state=rejects an empty", "accessibility=an empty title.", "errors=task list that"],
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

test("a quoted value needs three characters besides spaces", () => {
  assert.strictEqual(isConcrete('"x"', "inputs"), false);
  assert.strictEqual(isConcrete("¿« a »?", "uniqueness"), false);
  assert.strictEqual(isConcrete("¿el filtro usa «abc»?", "url-state"), true);
});

test("a cite must point at a line with a letter or a digit", () => {
  const tree = { "README.md": "# demo\n\n---\n```\n" };
  for (const line of [2, 3, 4]) {
    assert.strictEqual(resolveFeatureCoverage({ cites: [`copy=README.md:${line}`], readFile: filesOf(tree) }).error.code, "cite-unresolved");
  }
  assert.match(resolveFeatureCoverage({ cites: ["copy=README.md:2"], readFile: filesOf(tree) }).error.message, /README\.md:2/);
  assert.strictEqual(resolveFeatureCoverage({ cites: ["copy=README.md:1"], readFile: filesOf(tree) }).error.code, "facts-undeclared");
});

test("each category needs its own line, fragment or question", () => {
  const tree = { "README.md": "line one\nline two\n" };
  const sameLine = resolveFeatureCoverage({ cites: ["copy=README.md:1", "errors=README.md:1"], readFile: filesOf(tree) });
  assert.strictEqual(sameLine.error.code, "facts-undeclared");
  assert.match(sameLine.error.message, /errors reuses the cite of copy/);
  const sameQuote = resolveFeatureCoverage({ quotes: [`copy=${REQUEST}`, `errors= ${REQUEST} `], request: ` ${REQUEST} `, readFile: filesOf(tree) });
  assert.strictEqual(sameQuote.error.code, "facts-undeclared");
  const stored = citedCoverage().map((entry, index) => (index === 1 ? { ...entry, cite: citedCoverage()[0].cite } : entry));
  assert.strictEqual(factsFromCoverage(stored).error.code, "facts-undeclared");
  const paths = CATEGORY_IDS.map((id) => ({ category: id, cite: { kind: "path", path: "README.md", line: 1 } }));
  assert.strictEqual(factsFromCoverage(paths).error.code, "facts-undeclared");
});

test("missing categories are refused and name the command", () => {
  const result = resolveFeatureCoverage({ request: REQUEST, readFile: () => null });
  assert.strictEqual(result.error.code, "facts-undeclared");
  assert.match(result.error.how, /--open-fact inputs:/);
  assert.match(result.error.message, /inputs/);
});

test("a feature asks at least one category; cites alone are refused (#390)", () => {
  const tree = { "README.md": "one\ntwo\nthree\nfour\nfive\nsix\nseven\n" };
  const cites = CATEGORY_IDS.map((id, index) => `${id}=README.md:${index + 1}`);
  const cited = resolveFeatureCoverage({ cites, request: REQUEST, readFile: filesOf(tree) });
  assert.strictEqual(cited.error.code, "facts-undeclared");
  assert.match(cited.error.message, /at least one category with --open-fact/);
  assert.match(cited.error.how, /At least one category is an --open-fact/);
  const asked = resolveFeatureCoverage({
    openFacts: ["inputs:¿el título admite más de 200 caracteres?"],
    cites: cites.slice(1),
    request: REQUEST,
    readFile: filesOf(tree),
  });
  assert.strictEqual(asked.error, undefined);
  assert.strictEqual(asked.coverage[0].question, "¿el título admite más de 200 caracteres?");
  // A state recorded before the rule, with every category cited, stays valid.
  assert.strictEqual(factsFromCoverage(citedCoverage()).error, undefined);
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
