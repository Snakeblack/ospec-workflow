"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { lintDecisionRecord, parseAdrMarkdown, parseFitnessChecks } = require("./decision-records.js");

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

const SAMPLE_REPO = path.resolve(__dirname, "../../schemas/foundation/component-map/fixtures/sample-repo");

function inferredAdr() {
  const { parsed } = readFixture("fixtures/valid/adr.json");
  return { ...parsed, status: "inferred", evidence: ["app/store.py:3"] };
}

test("[REQ-decision-records-006] an inferred ADR needs path:line evidence", () => {
  assert.deepEqual(lintDecisionRecord(inferredAdr()), { valid: true, errors: [], warnings: [] });
  for (const evidence of [undefined, []]) {
    const record = inferredAdr();
    if (evidence === undefined) delete record.evidence;
    else record.evidence = evidence;
    const result = lintDecisionRecord(record);
    assert.equal(result.valid, false, String(evidence));
    assert.deepEqual(result.warnings, []);
  }
  const malformed = { ...inferredAdr(), evidence: ["app/store.py"] };
  assert.equal(lintDecisionRecord(malformed).valid, false);
});

test("[REQ-decision-records-006] with a root, evidence that does not resolve rejects the record", () => {
  assert.equal(lintDecisionRecord(inferredAdr(), { root: SAMPLE_REPO }).valid, true);
  const confirmed = { ...inferredAdr(), status: "accepted", evidence: ["app/store.py:400"] };
  assert.equal(lintDecisionRecord(confirmed).valid, true);
  const result = lintDecisionRecord(confirmed, { root: SAMPLE_REPO });
  assert.equal(result.valid, false);
  assert.deepEqual(result.errors.map((error) => `${error.rule} ${error.path}`), ["evidence /evidence/0"]);
  assert.deepEqual(result.warnings, []);
});

test("[REQ-decision-records-006] only an ADR may be inferred", () => {
  const { parsed } = readFixture("fixtures/valid/tsr.json");
  assert.equal(lintDecisionRecord({ ...parsed, status: "inferred" }).valid, false);
});

function readMarkdown(name) {
  return fs.readFileSync(path.join(ROOT, "fixtures/markdown", name), "utf8");
}

test("[REQ-decision-records-007] a Markdown ADR parses into its record and lints quietly", () => {
  const record = parseAdrMarkdown(readMarkdown("0001-one-deployable-unit.md"), { stack: ["PostgreSQL"] });
  assert.equal(record.schema, "ospec-decision-record/v1");
  assert.equal(record.kind, "adr");
  assert.equal(record.id, "0001");
  assert.equal(record.title, "One deployable unit owns its data");
  assert.equal(record.status, "accepted");
  assert.equal(record.date, "2026-10-10");
  assert.deepEqual(record.evidence, [
    "schemas/foundation/decision-records/v1.schema.json:1",
    "schemas/foundation/decision-records/v1.schema.json:4",
  ]);
  assert.deepEqual(record.drivers, [
    { kind: "scenario", id: "latency-under-load" },
    { kind: "constraint", id: "one-team" },
  ]);
  assert.deepEqual(record.options, [
    "One deployable unit: one write path and one failure domain.",
    "PostgreSQL per service: rejected here; a product name belongs in the technology record.",
  ]);
  assert.equal(record.decision, "One deployable unit owns its data and its write path.");
  assert.equal(record.review_trigger, "A second team needs to deploy on its own cadence.");
  assert.deepEqual(record.stack, ["PostgreSQL"]);
  const root = path.resolve(__dirname, "../..");
  assert.deepEqual(lintDecisionRecord(record, { root }), { valid: true, errors: [], warnings: [] });
});

test("[REQ-decision-records-007] a missing section rejects the Markdown ADR", () => {
  const result = lintDecisionRecord(parseAdrMarkdown(readMarkdown("0002-missing-decision.md")));
  assert.equal(result.valid, false);
  assert.deepEqual(result.warnings, []);
});

test("[REQ-decision-records-007] superseded by NNNN reads as superseded and the stack argument applies", () => {
  const text = readMarkdown("0001-one-deployable-unit.md").replace("- Status: accepted", "- Status: superseded by 0007");
  const record = parseAdrMarkdown(text, { stack: ["write path"] });
  assert.equal(record.status, "superseded");
  const result = lintDecisionRecord(record);
  assert.equal(result.valid, true);
  assert.deepEqual(result.warnings.map((entry) => entry.code), ["technology-in-decision"]);
});

test("[REQ-decision-records-007] a driver cited twice counts once and prose is not a driver", () => {
  const text = readMarkdown("0001-one-deployable-unit.md")
    .replace("`constraint:one-team`", "`scenario:latency-under-load` and the latency scenario");
  const record = parseAdrMarkdown(text);
  assert.deepEqual(record.drivers, [{ kind: "scenario", id: "latency-under-load" }]);
  assert.deepEqual(record.stack, []);
});

test("[REQ-decision-records-008] Check lines of the Fitness function section are its executable checks", () => {
  const text = readMarkdown("0001-one-deployable-unit.md").replace(
    "A dependency rule rejects a domain import of an adapter.",
    "A dependency rule rejects a domain import of an adapter.\n- Check: `node --test test/boundaries.test.js`\n* check: `npm run lint:deps`\n- Check: ``",
  );
  assert.deepEqual(parseFitnessChecks(text), ["node --test test/boundaries.test.js", "npm run lint:deps"]);
  const record = parseAdrMarkdown(text);
  assert.equal(lintDecisionRecord(record).valid, true);
  assert.match(record.fitness_function, /^A dependency rule rejects a domain import of an adapter\./);
});

test("[REQ-decision-records-008] a Check line outside the Fitness function section is not a check", () => {
  const text = readMarkdown("0001-one-deployable-unit.md").replace(
    "A second unit needs a new ADR.",
    "A second unit needs a new ADR.\n- Check: `npm test`",
  );
  assert.deepEqual(parseFitnessChecks(text), []);
  assert.deepEqual(parseFitnessChecks(readMarkdown("0001-one-deployable-unit.md")), []);
});
