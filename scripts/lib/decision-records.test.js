"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { lintDecisionRecord } = require("./decision-records.js");

const ROOT = path.resolve(__dirname, "../../schemas/foundation/decision-records");
const VALID = ["adr.json", "tsr.json", "dc.json"];
const WARNINGS = [
  "technological-adr.json",
  "misclassified-dc.json",
  "adr-missing-driver.json",
  "tsr-missing-adr.json",
  "tsr-missing-date.json",
];

function readFixture(relative) {
  const parsed = JSON.parse(fs.readFileSync(path.join(ROOT, relative), "utf8"));
  const expectedWarnings = parsed.expected_warnings || [];
  const expectedError = parsed.expected_error;
  delete parsed.expected_warnings;
  delete parsed.expected_error;
  return { parsed, expectedWarnings, expectedError };
}

test("[REQ-decision-records-001] a valid ADR, TSR and DC produce no warnings", () => {
  for (const name of VALID) {
    const { parsed } = readFixture(`fixtures/valid/${name}`);
    const result = lintDecisionRecord(parsed);
    assert.equal(result.valid, true, name);
    assert.deepEqual(result.warnings, [], name);
  }
  const adr = readFixture("fixtures/valid/adr.json").parsed;
  assert.equal(adr.drivers[0].kind, "scenario");
  assert.ok(adr.options.some((option) => option.includes("PostgreSQL")));
  assert.ok(adr.stack.includes("PostgreSQL"));
  assert.equal(adr.decision.includes("PostgreSQL"), false);
});

test("[REQ-decision-records-002] a technological ADR is a warning and stays valid", () => {
  const { parsed, expectedWarnings } = readFixture("fixtures/warnings/technological-adr.json");
  const result = lintDecisionRecord(parsed);
  assert.equal(result.valid, true);
  assert.deepEqual(result.warnings.map((item) => item.code), expectedWarnings);
  assert.equal(result.errors.length, 0);
});

test("[REQ-decision-records-002] the stack list may be passed as an argument", () => {
  const { parsed } = readFixture("fixtures/valid/adr.json");
  const quiet = lintDecisionRecord(parsed, { stack: ["Go"] });
  assert.deepEqual(quiet.warnings, []);
  const named = lintDecisionRecord(parsed, { stack: ["unit"] });
  assert.equal(named.valid, true);
  assert.deepEqual(named.warnings.map((item) => item.code), ["technology-in-decision"]);
});

test("[REQ-decision-records-003] a development decision classified as an ADR is a warning and stays valid", () => {
  const { parsed, expectedWarnings } = readFixture("fixtures/warnings/misclassified-dc.json");
  const result = lintDecisionRecord(parsed);
  assert.equal(result.valid, true);
  assert.equal(parsed.kind, "dc");
  assert.equal(parsed.as, "adr");
  assert.deepEqual(result.warnings.map((item) => item.code), expectedWarnings);
});

test("[REQ-decision-records-004] an ADR with no driver id is a warning and stays valid", () => {
  const { parsed, expectedWarnings } = readFixture("fixtures/warnings/adr-missing-driver.json");
  const result = lintDecisionRecord(parsed);
  assert.equal(result.valid, true);
  assert.equal(parsed.drivers.length, 0);
  assert.deepEqual(result.warnings.map((item) => item.code), expectedWarnings);
});

test("[REQ-decision-records-005] a TSR without an ADR or a dated source is a warning and stays valid", () => {
  for (const name of ["tsr-missing-adr.json", "tsr-missing-date.json"]) {
    const { parsed, expectedWarnings } = readFixture(`fixtures/warnings/${name}`);
    const result = lintDecisionRecord(parsed);
    assert.equal(result.valid, true, name);
    assert.deepEqual(result.warnings.map((item) => item.code), expectedWarnings, name);
  }
  const both = readFixture("fixtures/warnings/tsr-missing-adr.json").parsed;
  both.sources = [{ ref: "Vendor documentation" }];
  const result = lintDecisionRecord(both);
  assert.equal(result.valid, true);
  assert.deepEqual(result.warnings.map((item) => item.code), ["missing-adr", "missing-dated-source"]);
});

test("[REQ-decision-records-001] a record that is not an ADR, TSR or DC is rejected", () => {
  const result = lintDecisionRecord({ schema: "ospec-decision-record/v1", kind: "note" });
  assert.equal(result.valid, false);
  assert.deepEqual(result.warnings, []);
  assert.ok(result.errors.some((error) => error.rule === "oneOf"));
});

test("warning fixtures cover the three acceptance cases and the other lint warnings", () => {
  const codes = WARNINGS.map((name) => readFixture(`fixtures/warnings/${name}`).expectedWarnings[0]);
  assert.deepEqual(codes, [
    "technology-in-decision",
    "misclassified-development-decision",
    "missing-driver",
    "missing-adr",
    "missing-dated-source",
  ]);
});
