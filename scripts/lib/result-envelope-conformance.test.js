"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { validateInstance } = require("./kernel-schema-validator.js");
const { validateEnvelope } = require("./result-envelope.js");

const ROOT = path.resolve(__dirname, "../..");
const SCHEMA_PATH = path.join(ROOT, "schemas/kernel/result-envelope/v1/envelope.schema.json");
const ROOT_SCHEMA_PATH = path.join(ROOT, "schemas/kernel/result-envelope.schema.json");
const FIXTURES_DIR = path.join(ROOT, "schemas/kernel/result-envelope/v1/fixtures");
const VALID_DIR = path.join(FIXTURES_DIR, "valid");
const INVALID_DIR = path.join(FIXTURES_DIR, "invalid");

const schemaV1 = JSON.parse(fs.readFileSync(SCHEMA_PATH, "utf8"));
const rootSchema = JSON.parse(fs.readFileSync(ROOT_SCHEMA_PATH, "utf8"));

function loadJsonFixtures(dir) {
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((filename) => ({
      filename,
      filePath: path.join(dir, filename),
      content: JSON.parse(fs.readFileSync(path.join(dir, filename), "utf8")),
    }));
}

test("differential conformance: all valid fixtures pass schema and JS validator", () => {
  const validFixtures = loadJsonFixtures(VALID_DIR);
  assert.ok(validFixtures.length > 0, "must have at least one valid fixture");

  for (const { filename, content } of validFixtures) {
    const schemaResult = validateInstance(schemaV1, content);
    const rootSchemaResult = validateInstance(rootSchema, content);
    const jsResult = validateEnvelope(content);

    assert.equal(
      schemaResult.valid,
      true,
      `[v1 schema] valid fixture ${filename} unexpectedly failed: ${JSON.stringify(schemaResult.errors)}`
    );
    assert.equal(
      rootSchemaResult.valid,
      true,
      `[root schema] valid fixture ${filename} unexpectedly failed: ${JSON.stringify(rootSchemaResult.errors)}`
    );
    assert.equal(
      jsResult.valid,
      true,
      `[JS validator] valid fixture ${filename} unexpectedly failed: ${JSON.stringify(jsResult.errors)}`
    );
    assert.equal(
      schemaResult.valid,
      jsResult.valid,
      `conformance mismatch for valid fixture ${filename}: schema=${schemaResult.valid}, js=${jsResult.valid}`
    );
  }
});

test("differential conformance: all invalid fixtures fail schema and JS validator", () => {
  const invalidFixtures = loadJsonFixtures(INVALID_DIR);
  assert.ok(invalidFixtures.length > 0, "must have at least one invalid fixture");

  for (const { filename, content } of invalidFixtures) {
    const schemaResult = validateInstance(schemaV1, content);
    const rootSchemaResult = validateInstance(rootSchema, content);
    const jsResult = validateEnvelope(content);

    assert.equal(
      schemaResult.valid,
      false,
      `[v1 schema] invalid fixture ${filename} unexpectedly passed`
    );
    assert.equal(
      rootSchemaResult.valid,
      false,
      `[root schema] invalid fixture ${filename} unexpectedly passed`
    );
    assert.equal(
      jsResult.valid,
      false,
      `[JS validator] invalid fixture ${filename} unexpectedly passed`
    );
    assert.equal(
      schemaResult.valid,
      jsResult.valid,
      `conformance mismatch for invalid fixture ${filename}: schema=${schemaResult.valid}, js=${jsResult.valid}`
    );
  }
});

function assertInvalidConformance(filename, { expectedRule, expectedPath, expectedJsError } = {}) {
  const fixturePath = path.join(INVALID_DIR, filename);
  const content = JSON.parse(fs.readFileSync(fixturePath, "utf8"));

  const schemaResult = validateInstance(schemaV1, content);
  const rootSchemaResult = validateInstance(rootSchema, content);
  const jsResult = validateEnvelope(content);

  assert.equal(schemaResult.valid, false, `[v1 schema] ${filename} unexpectedly passed`);
  assert.equal(rootSchemaResult.valid, false, `[root schema] ${filename} unexpectedly passed`);
  assert.equal(jsResult.valid, false, `[JS validator] ${filename} unexpectedly passed`);
  assert.equal(schemaResult.valid, jsResult.valid);
  assert.equal(schemaResult.valid, rootSchemaResult.valid);

  if (expectedRule) {
    assert.ok(
      schemaResult.errors.some((e) => e.rule === expectedRule && (!expectedPath || e.path === expectedPath)),
      `[v1 schema] ${filename} expected rule ${expectedRule} at ${expectedPath || "any"}`
    );
    assert.ok(
      rootSchemaResult.errors.some((e) => e.rule === expectedRule && (!expectedPath || e.path === expectedPath)),
      `[root schema] ${filename} expected rule ${expectedRule} at ${expectedPath || "any"}`
    );
  }

  if (expectedJsError) {
    assert.ok(
      jsResult.errors.some((err) => err.includes(expectedJsError)),
      `[JS validator] ${filename} expected error containing "${expectedJsError}"`
    );
  }
}

test("differential conformance: blocked fixture without question_gate is rejected by schema and JS", () => {
  assertInvalidConformance("blocked-missing-question-gate.json", {
    expectedRule: "required",
    expectedPath: "/question_gate",
    expectedJsError: "question_gate is required when status is blocked",
  });
});

test("differential conformance: empty question_gate text fields are rejected by schema and JS", () => {
  assertInvalidConformance("empty-question-gate-fields.json", {
    expectedRule: "minLength",
    expectedJsError: "must be a non-empty string",
  });
});

test("differential conformance: empty assumption text fields are rejected by schema and JS", () => {
  assertInvalidConformance("empty-assumption-fields.json", {
    expectedRule: "minLength",
    expectedJsError: "must be a non-empty string",
  });
});

test("differential conformance: whitespace-only required strings fixture is rejected by schema and JS", () => {
  assertInvalidConformance("whitespace-only-required-strings.json", {
    expectedRule: "pattern",
    expectedJsError: "must be a non-empty string",
  });
});

test("differential conformance: non-string detailed_report fixture is rejected by schema and JS", () => {
  assertInvalidConformance("non-string-detailed-report.json", {
    expectedRule: "type",
    expectedPath: "/detailed_report",
    expectedJsError: "detailed_report must be a string",
  });
});

test("differential conformance: explicit null question_gate on non-blocked status is rejected by schema and JS", () => {
  assertInvalidConformance("null-question-gate.json", {
    expectedRule: "type",
    expectedPath: "/question_gate",
    expectedJsError: "question_gate must be an object",
  });
});

test("differential conformance: BOM-only (U+FEFF) whitespace strings are rejected by schema and JS", () => {
  assertInvalidConformance("bom-whitespace-only-strings.json", {
    expectedRule: "pattern",
    expectedPath: "/executive_summary",
    expectedJsError: "must be a non-empty string",
  });
});

