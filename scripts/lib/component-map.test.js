"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { validateComponentMap } = require("./component-map.js");
const { lintDecisionRecord } = require("./decision-records.js");
const { validateKnowledgeMap } = require("./knowledge-map.js");

const FIXTURES = path.resolve(__dirname, "../../schemas/foundation/component-map/fixtures");
const REPO = path.join(FIXTURES, "sample-repo");

function recovery(name) {
  return JSON.parse(fs.readFileSync(path.join(FIXTURES, "recovery", name), "utf8"));
}

function codes(result) {
  return result.errors.map((error) => `${error.rule} ${error.path}`);
}

test("[REQ-component-map-001] the sample repository yields a component map and an inferred ADR whose evidence resolves", () => {
  const map = recovery("component-map.json");
  assert.deepEqual(validateComponentMap(map, { root: REPO }), { valid: true, errors: [] });
  assert.deepEqual(
    map.components.map((component) => component.id),
    ["api", "orders", "store", "payments-client"],
  );
  assert.equal(map.dependencies.length, 4);

  const adr = recovery("adr-0001-inferred.json");
  assert.equal(adr.status, "inferred");
  const linted = lintDecisionRecord(adr, { root: REPO });
  assert.equal(linted.valid, true);
  assert.deepEqual(linted.warnings, []);
});

test("[REQ-component-map-001] quality hints are assumed knowledge-map slots with a repository source", () => {
  const map = recovery("knowledge-map.json");
  assert.deepEqual(validateKnowledgeMap(map), { valid: true, errors: [] });
  const hint = map.slots.find((slot) => slot.id === "quality.drivers");
  assert.equal(hint.state, "assumed");
  assert.equal(hint.source.kind, "repository");
  assert.match(hint.source.ref, /^app\/payments_client\.py:[0-9]+$/);
});

test("[REQ-component-map-002] evidence that does not resolve rejects the map", () => {
  for (const [ref, reason] of [
    ["app/missing.py:1", /does not exist/],
    ["app/api.py:99", /past the end/],
    ["../README.md:1", /outside the repository/],
    ["app/api.py:0", /pattern/],
  ]) {
    const map = recovery("component-map.json");
    map.components[0].evidence = [ref];
    const result = validateComponentMap(map, { root: REPO });
    assert.equal(result.valid, false, ref);
    const error = result.errors.find((item) => item.path === "/components/0/evidence/0");
    assert.ok(error, `${ref}: ${JSON.stringify(result.errors)}`);
    assert.match(error.message, reason, ref);
  }
});

test("[REQ-component-map-002] a divergence keeps the documented text and points at it", () => {
  const map = recovery("component-map.json");
  const divergence = map.divergences[0];
  assert.equal(divergence.documented, "README.md:7");
  assert.match(fs.readFileSync(path.join(REPO, "README.md"), "utf8"), /only through the orders service/);
  map.divergences[0].documented = "README.md:40";
  const result = validateComponentMap(map, { root: REPO });
  assert.deepEqual(codes(result), ["evidence /divergences/0/documented"]);
});

test("[REQ-component-map-003] references between entries must name known components", () => {
  const map = recovery("component-map.json");
  map.dependencies.push({ from: "api", to: "billing", evidence: ["app/api.py:1"] });
  map.dependencies.push({ from: "store", to: "store", evidence: ["app/store.py:1"] });
  map.boundaries[0].components = ["ghost"];
  map.components.push({ ...map.components[0] });
  const result = validateComponentMap(map, { root: REPO });
  assert.equal(result.valid, false);
  assert.deepEqual(codes(result), [
    "unique /components/4/id",
    "reference /boundaries/0/components/0",
    "reference /dependencies/4/to",
    "reference /dependencies/5",
  ]);
});

test("[REQ-component-map-003] the map is structural without a root and requires evidence on every entry", () => {
  const map = recovery("component-map.json");
  map.components[0].evidence = ["app/missing.py:1"];
  assert.equal(validateComponentMap(map).valid, true);
  map.components[0].evidence = [];
  const result = validateComponentMap(map);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.rule === "minItems"));
});
