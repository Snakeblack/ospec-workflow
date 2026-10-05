"use strict";

// The hidden checks are only worth something if a correct delivery passes all
// of them and the untouched seed fails its acceptance check. Each scenario has
// a reference delivery in __fixtures__/reference/<id>/ that overlays the seed.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { loadScenarios, materializeRepo, listFiles } = require("./scenarios.js");
const { runChecks } = require("./checks.js");
const { parseCsv } = require("./check-kit.js");

const REFERENCE_DIR = path.join(__dirname, "__fixtures__", "reference");

function workspace(scenario, { reference }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `bench-${scenario.id}-`));
  materializeRepo(scenario, root);
  if (reference) {
    const overlay = path.join(REFERENCE_DIR, scenario.id);
    for (const file of listFiles(overlay)) {
      const target = path.join(root, file);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(path.join(overlay, file), target);
    }
  }
  return root;
}

for (const scenario of loadScenarios()) {
  test(`${scenario.id}: the reference delivery passes every hidden check`, () => {
    const results = runChecks(scenario, workspace(scenario, { reference: true }));
    assert.deepEqual(results.filter((result) => !result.pass), []);
  });

  test(`${scenario.id}: the seed fails acceptance and keeps its regressions green`, () => {
    const results = runChecks(scenario, workspace(scenario, { reference: false }));
    for (const result of results.filter((item) => item.kind === "acceptance")) assert.equal(result.pass, false, result.id);
    assert.deepEqual(results.filter((item) => item.kind === "regression" && !item.pass), []);
  });
}

test("a check that crashes or prints nothing counts as failed", () => {
  const scenario = {
    checksPath: path.join(__dirname, "missing-checks.js"),
    checks: [{ id: "ghost", kind: "acceptance", fact: null }],
  };
  const [result] = runChecks(scenario, os.tmpdir());
  assert.equal(result.pass, false);
  assert.ok(result.error);
});

test("parseCsv follows RFC 4180 quoting", () => {
  assert.deepEqual(parseCsv("a,b\r\n\"Pérez, Ana\",\"di \"\"hola\"\"\"\n"), [["a", "b"], ["Pérez, Ana", "di \"hola\""]]);
});
