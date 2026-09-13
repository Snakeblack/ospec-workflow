"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const {
  validateInstance,
  validateSchemaDocument,
  loadSchemaById,
} = require("./kernel-schema-validator.js");

const ROOT = path.resolve(__dirname, "../..");

function readJson(relPath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relPath), "utf8"));
}

test("result-envelope schema registration: manifest indexes result-envelope family at v1", () => {
  const manifest = readJson("schemas/kernel/manifest.json");

  assert.ok(manifest.families["result-envelope"], "manifest must register result-envelope");
  assert.equal(manifest.families["result-envelope"].schema_version, 1);
  assert.equal(
    manifest.families["result-envelope"].$id,
    "https://openspec.io/schemas/kernel/result-envelope/v1.schema.json"
  );
  assert.equal(
    manifest.families["result-envelope"].path,
    "schemas/kernel/result-envelope/v1/envelope.schema.json"
  );

  const schema = loadSchemaById(
    "https://openspec.io/schemas/kernel/result-envelope/v1.schema.json",
    { rootDir: ROOT }
  );
  assert.equal(schema.$id, "https://openspec.io/schemas/kernel/result-envelope/v1.schema.json");
  assert.equal(schema.schema_version, 1);
  const docValidation = validateSchemaDocument(schema);
  assert.equal(docValidation.valid, true, JSON.stringify(docValidation.errors));
});

test("result-envelope contract claims: required fields and enums are registered", () => {
  const claims = readJson("schemas/kernel/contract-claims.json");

  assert.ok(claims.families["result-envelope"], "contract-claims must register result-envelope");
  assert.deepEqual(claims.families["result-envelope"].required_fields, [
    "schema_version",
    "status",
    "executive_summary",
    "artifacts",
    "next_recommended",
    "risks",
    "skill_resolution",
  ]);
  assert.deepEqual(claims.families["result-envelope"].enum_values.status, [
    "success",
    "partial",
    "blocked",
  ]);
  assert.deepEqual(claims.families["result-envelope"].enum_values.skill_resolution, [
    "injected",
    "fallback-registry",
    "fallback-path",
    "none",
  ]);
  assert.deepEqual(claims.families["result-envelope"].enum_values.blocker_type, [
    "needs_user_decision",
    "design-mismatch",
    "spec-change-required",
    "workload-escalation",
  ]);
});

test("result-envelope v1 schema validates valid fixtures", () => {
  const schemaPath = path.join(ROOT, "schemas/kernel/result-envelope/v1/envelope.schema.json");
  assert.ok(fs.existsSync(schemaPath), "envelope.schema.json must exist");
  const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));

  const validFixtures = [
    "schemas/kernel/result-envelope/v1/fixtures/valid-v1.json",
    "schemas/kernel/result-envelope/v1/fixtures/blocked-v1.json",
    "schemas/kernel/result-envelope/v1/fixtures/ambiguity-spec-v1.json",
  ];

  for (const relPath of validFixtures) {
    const fixturePath = path.join(ROOT, relPath);
    assert.ok(fs.existsSync(fixturePath), `fixture missing: ${relPath}`);
    const instance = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
    const result = validateInstance(schema, instance);
    assert.equal(
      result.valid,
      true,
      `fixture ${relPath} unexpectedly failed: ${JSON.stringify(result.errors)}`
    );
  }
});

test("result-envelope v1 schema rejects invalid fixtures with path/rule", () => {
  const schemaPath = path.join(ROOT, "schemas/kernel/result-envelope/v1/envelope.schema.json");
  const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));

  const invalidFixtures = [
    {
      path: "schemas/kernel/result-envelope/v1/fixtures/invalid-v1.json",
      expectedMissing: ["/status", "/executive_summary"],
    },
    {
      path: "schemas/kernel/result-envelope/v1/fixtures/legacy-unversioned.json",
      expectedMissing: ["/schema_version"],
    },
  ];

  for (const { path: relPath, expectedMissing } of invalidFixtures) {
    const fixturePath = path.join(ROOT, relPath);
    assert.ok(fs.existsSync(fixturePath), `fixture missing: ${relPath}`);
    const instance = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
    const result = validateInstance(schema, instance);
    assert.equal(result.valid, false, `fixture ${relPath} unexpectedly passed`);
    assert.ok(result.errors.length >= 1);

    const missingPaths = new Set(
      result.errors.filter((e) => e.rule === "required").map((e) => e.path)
    );
    for (const expected of expectedMissing) {
      assert.ok(missingPaths.has(expected), `${relPath} expected required error for ${expected}`);
    }
  }
});

test("result-envelope top-level schema compatibility with schemas/kernel/result-envelope.schema.json", () => {
  const compatPath = path.join(ROOT, "schemas/kernel/result-envelope.schema.json");
  assert.ok(fs.existsSync(compatPath), "result-envelope.schema.json must exist for backward compatibility");
  const schema = JSON.parse(fs.readFileSync(compatPath, "utf8"));
  assert.equal(schema.$id, "https://openspec.io/schemas/kernel/result-envelope/v1.schema.json");
  assert.equal(schema.schema_version, 1);
});
