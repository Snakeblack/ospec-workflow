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

// REQ-lifecycle-kernel-033: tags, anchors and multi-line flow collections
// never let a key inside a scalar or a collection reach a line reader.
test("REQ-lifecycle-kernel-033: opaqueScalarLines blanks tagged and anchored scalars and multi-line flow collections", () => {
  const { opaqueScalarLines } = require("./yaml-lite.js");
  const text = [
    "a: !!str |",
    "  verdict: PASS",
    "b: &x >-",
    "  verdict: PASS",
    'c: !!str "two',
    '  verdict: PASS"',
    "d: [one,",
    "  verdict: PASS]",
    "e: {k: [1,",
    "    2], verdict: PASS}",
    "f: [don't, x]",
    "h:",
    "  - {k: 1,",
    "    verdict: PASS}",
    "g: !!str",
    "  text",
    "verdict: FAIL",
  ].join("\n");
  const { lines, error } = opaqueScalarLines(text);
  assert.equal(error, null);
  assert.deepEqual(lines.filter((line) => line.includes("verdict")), ["verdict: FAIL"]);
  assert.equal(lines[13], "");
  assert.equal(lines[15], "");
});

test("REQ-lifecycle-kernel-033: a flow collection that never closes is malformed", () => {
  const { opaqueScalarLines } = require("./yaml-lite.js");
  assert.match(opaqueScalarLines("a: [one,\nverdict: PASS\n").error, /flow collection never closes/);
  assert.match(opaqueScalarLines("a: [one,\n  two\n").error, /flow collection never closes/);
});

test("REQ-lifecycle-kernel-033: a value that starts on the line after its key is opaque too", () => {
  const { opaqueScalarLines } = require("./yaml-lite.js");
  const text = [
    "a:",
    "  |",
    "  verdict: PASS",
    "b:",
    "     >",
    "   verdict: PASS",
    "c:",
    '  "two',
    '  verdict: PASS"',
    "d:",
    "  - - |",
    "      verdict: PASS",
    "e:",
    "  [one,",
    "  verdict: PASS]",
    "verdict: FAIL",
  ].join("\n");
  const { lines, error } = opaqueScalarLines(text);
  assert.equal(error, null);
  assert.deepEqual(lines.filter((line) => line.includes("verdict")), ["verdict: FAIL"]);
});

test("REQ-lifecycle-kernel-033: a colon without a space, a quoted key and a properties-only value never expose a key inside a value", () => {
  const { opaqueScalarLines, scanScalarContinuations } = require("./yaml-lite.js");
  const text = [
    "a: text",
    "  verdict:PASS",
    '"k: v": |',
    "  verdict: PASS",
    "b: !!str",
    "  |",
    "    verdict: PASS",
    "c: &x",
    '  "open',
    '  verdict: PASS"',
    "d:",
    "  classification:trivial",
    "e: &y",
    "  nested: kept",
    "verdict: FAIL",
  ].join("\n");
  const { lines, error } = opaqueScalarLines(text);
  assert.equal(error, null);
  assert.deepEqual(lines.filter((line) => /verdict|classification/.test(line)), ["verdict: FAIL"]);
  assert.equal(lines[13], "  nested: kept");
  // The projector still sees a value on the line after its key as a line of its own.
  assert.equal(scanScalarContinuations(["d:", "  |", "  x"]).continuation[1], false);
});

test("REQ-lifecycle-kernel-033: a flow collection on the line after its key is opaque even when its first line looks like an entry", () => {
  const { opaqueScalarLines } = require("./yaml-lite.js");
  const text = [
    "approvals:",
    "  - gate: other",
    "    reason:",
    "      {x: 1,",
    "       gate: quality-gates",
    "       ,",
    "       decision: override",
    "      }",
    "notes:",
    "  !!map {x: 1,",
    "   classification: trivial",
    "  }",
    "classification: high",
  ].join("\n");
  const { lines, error } = opaqueScalarLines(text);
  assert.equal(error, null);
  assert.deepEqual(lines.filter((line) => /quality-gates|override|classification/.test(line)), ["classification: high"]);
});

test("REQ-lifecycle-kernel-033: only a space or a tab after a colon ends a key, as in Go", () => {
  const { opaqueScalarLines } = require("./yaml-lite.js");
  const { lines } = opaqueScalarLines("reason: first line\n  decision: override\n  gate: quality-gates\nstatus: active\n");
  assert.deepEqual(lines, ["reason: first line", "", "", "status: active", ""]);
});

test("REQ-lifecycle-kernel-033: a long line of spaces is scanned in linear time", () => {
  const { opaqueScalarLines } = require("./yaml-lite.js");
  const line = `a${" ".repeat(200000)}b`;
  const started = process.hrtime.bigint();
  opaqueScalarLines(`x: 1\n${line}\n  ${line}\n- ${line}\n`);
  assert.ok(Number(process.hrtime.bigint() - started) / 1e6 < 1000);
});
