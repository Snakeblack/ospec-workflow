"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { readYamlScalar } = require("./yaml-lite.js");

const PATH = ["testing", "tdd_mode"];

test("reads a nested scalar and unquotes it", () => {
  assert.equal(readYamlScalar("testing:\n  tdd_mode: strict\n", PATH), "strict");
  assert.equal(readYamlScalar('testing:\n  tdd_mode: "strict"\n', PATH), "strict");
  assert.equal(readYamlScalar("testing:\r\n  tdd_mode: 'focused'\r\n", PATH), "focused");
  assert.equal(readYamlScalar("name: x\ntesting:\n    coverage: 80\n    tdd_mode: strict # enforced\n", PATH), "strict");
});

test("comments never declare a key", () => {
  assert.equal(readYamlScalar("# tdd_mode: strict\ntesting:\n  tdd_mode: standard\n", PATH), "standard");
  assert.equal(readYamlScalar("testing:\n  # tdd_mode: strict\n", PATH), null);
  assert.equal(readYamlScalar("testing: # tdd_mode: strict\n  tdd_mode: focused\n", PATH), "focused");
  assert.equal(readYamlScalar('testing:\n  tdd_mode: "a # b"\n', PATH), "a # b");
});

test("a key only counts under the section the path names", () => {
  assert.equal(readYamlScalar("review:\n  tdd_mode: strict\ntesting:\n  coverage: 80\n", PATH), null);
  assert.equal(readYamlScalar("tdd_mode: strict\n", PATH), null);
  assert.equal(readYamlScalar("testing:\n  nested:\n    tdd_mode: strict\n", PATH), null);
  assert.equal(readYamlScalar("testing:\nother:\n  tdd_mode: strict\n", PATH), null);
  assert.equal(readYamlScalar("testing:\n  nested:\n    x: 1\n  tdd_mode: strict\n", PATH), "strict");
  assert.equal(readYamlScalar("testing: strict\n  tdd_mode: strict\n", PATH), null);
});

test("block scalars and list items are other keys' content", () => {
  assert.equal(readYamlScalar("notes: |\n  testing:\n    tdd_mode: strict\n", PATH), null);
  assert.equal(readYamlScalar("testing:\n  - tdd_mode: strict\n", PATH), null);
});

test("absent text, path or value reads as null", () => {
  assert.equal(readYamlScalar(null, PATH), null);
  assert.equal(readYamlScalar("", PATH), null);
  assert.equal(readYamlScalar("testing:\n  tdd_mode:\n", PATH), null);
  assert.equal(readYamlScalar("testing:\n  tdd_mode: strict\n", []), null);
});

test("one-line flow mappings are read, as sdd-init may write them", () => {
  assert.equal(readYamlScalar("testing: { tdd_mode: strict }\n", PATH), "strict");
  assert.equal(readYamlScalar('testing: {coverage: 80, tdd_mode: "focused"} # profile\n', PATH), "focused");
  assert.equal(readYamlScalar("testing: { coverage: 80 }\n", PATH), null);
  assert.equal(readYamlScalar("review: { tdd_mode: strict }\n", PATH), null);
  assert.equal(readYamlScalar("testing: { tdd_mode: { a: b } }\n", PATH), null);
  assert.equal(readYamlScalar("a: { b: { c: deep } }\n", ["a", "b", "c"]), "deep");
  assert.equal(readYamlScalar("traceability: { trailers: required }\n", ["traceability", "trailers"]), "required");
});
