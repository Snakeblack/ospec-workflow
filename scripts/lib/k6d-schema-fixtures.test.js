"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { validateInstance, loadSchemaById } = require("./kernel-schema-validator.js");
const { assertK1SchemasUnchanged } = require("./lifecycle-kernel/k1-compat.js");

const ROOT = path.resolve(__dirname, "../..");
const read = (relative) => JSON.parse(fs.readFileSync(path.join(ROOT, relative), "utf8"));

test("K6d registers both closed v1 schemas and claims", () => {
  const manifest = read("schemas/kernel/manifest.json");
  const claims = read("schemas/kernel/contract-claims.json");
  for (const [family, id] of [["architecture-alternative", "ospec://schemas/kernel/architecture-alternative/v1"], ["complexity-architecture-delta", "ospec://schemas/kernel/complexity-architecture-delta/v1"]]) {
    assert.equal(manifest.families[family].$id, id);
    assert.equal(manifest.families[family].schema_version, 1);
    assert.ok(claims.families[family]);
    assert.equal(loadSchemaById(id, { rootDir: ROOT }).$id, id);
  }
  const reportSchema = loadSchemaById("ospec://schemas/kernel/complexity-architecture-delta/v1", { rootDir: ROOT });
  assert.deepEqual(reportSchema.properties.authority.enum, ["advisory"]);
  assert.deepEqual(claims.families["complexity-architecture-delta"].enum_values.authority, ["advisory"]);
  assert.equal(Object.hasOwn(claims.families["complexity-architecture-delta"].enum_values, "signal_code"), false);
});

test("K6d valid fixtures validate and invalid bindings, rationale and cross-family payloads fail closed", () => {
  const alternative = loadSchemaById("ospec://schemas/kernel/architecture-alternative/v1", { rootDir: ROOT });
  const report = loadSchemaById("ospec://schemas/kernel/complexity-architecture-delta/v1", { rootDir: ROOT });
  const validAlternative = read("schemas/kernel/architecture-alternative/fixtures/valid/new-abstraction.json");
  const validReport = read("schemas/kernel/complexity-architecture-delta/fixtures/valid/observed.json");
  assert.equal(validateInstance(alternative, validAlternative).valid, true);
  assert.equal(validateInstance(report, validReport).valid, true);
  assert.equal(validateInstance(alternative, read("schemas/kernel/architecture-alternative/fixtures/invalid/incomplete-rationale.json")).valid, false);
  assert.equal(validateInstance(alternative, read("schemas/kernel/architecture-alternative/fixtures/invalid/unsupported-classification.json")).valid, false);
  assert.equal(validateInstance(report, read("schemas/kernel/complexity-architecture-delta/fixtures/invalid/malformed-candidate-id.json")).valid, false);
  assert.equal(validateInstance(report, read("schemas/kernel/complexity-architecture-delta/fixtures/invalid/missing-candidate-id.json")).valid, false);
  assert.equal(validateInstance(report, read("schemas/kernel/complexity-architecture-delta/fixtures/invalid/missing-report-id.json")).valid, false);
  assert.equal(validateInstance(report, read("schemas/kernel/complexity-architecture-delta/fixtures/invalid/malformed-report-id.json")).valid, false);
  const divergent = read("schemas/kernel/complexity-architecture-delta/fixtures/invalid/divergent-candidate-binding.json");
  const divergentSchema = validateInstance(report, divergent);
  const bindingMismatch = Array.isArray(divergent.alternatives)
    && divergent.alternatives.some((entry) => entry && entry.candidate_id !== divergent.candidate_id);
  assert.equal(divergentSchema.valid && !bindingMismatch, false);
  assert.equal(bindingMismatch, true);
  assert.equal(validateInstance(report, validAlternative).valid, false);
  assert.equal(validateInstance(alternative, validReport).valid, false);
  assert.equal(assertK1SchemasUnchanged(ROOT).ok, true);
});
