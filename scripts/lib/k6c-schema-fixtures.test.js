"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { validateInstance, loadSchemaById } = require("./kernel-schema-validator.js");
const { validateChallengeResult, validateChallengeResultSet } = require("./adversarial-challenges/integrity.js");
const {
  assertK1SchemasUnchanged,
  digestFile,
  K1_SCHEMA_BASELINE,
} = require("./lifecycle-kernel/k1-compat.js");

const ROOT = path.resolve(__dirname, "../..");

function readJson(relPath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relPath), "utf8"));
}

test("K6c schema registration: manifest indexes challenge-plan and challenge-result", () => {
  const manifest = readJson("schemas/kernel/manifest.json");

  assert.ok(manifest.families["challenge-plan"], "manifest must register challenge-plan");
  assert.equal(manifest.families["challenge-plan"].schema_version, 1);
  assert.equal(manifest.families["challenge-plan"].$id, "ospec://schemas/kernel/challenge-plan/v1");
  assert.equal(manifest.families["challenge-plan"].path, "schemas/kernel/challenge-plan/v1.schema.json");

  assert.ok(manifest.families["challenge-result"], "manifest must register challenge-result");
  assert.equal(manifest.families["challenge-result"].schema_version, 1);
  assert.equal(manifest.families["challenge-result"].$id, "ospec://schemas/kernel/challenge-result/v1");
  assert.equal(manifest.families["challenge-result"].path, "schemas/kernel/challenge-result/v1.schema.json");

  const planSchema = loadSchemaById("ospec://schemas/kernel/challenge-plan/v1", { rootDir: ROOT });
  assert.equal(planSchema.$id, "ospec://schemas/kernel/challenge-plan/v1");

  const resultSchema = loadSchemaById("ospec://schemas/kernel/challenge-result/v1", { rootDir: ROOT });
  assert.equal(resultSchema.$id, "ospec://schemas/kernel/challenge-result/v1");
});

test("K6c contract claims: challenge families list required fields and enums", () => {
  const claims = readJson("schemas/kernel/contract-claims.json");

  assert.ok(claims.families["challenge-plan"], "challenge-plan claims must exist");
  assert.deepEqual(claims.families["challenge-plan"].required_fields, [
    "schema_version",
    "kind",
    "plan_id",
    "candidate_id",
    "node_id",
    "policy_snapshot_id",
    "evidence_strategy",
    "selected",
    "skipped",
    "reasons",
    "budget",
  ]);
  assert.deepEqual(claims.families["challenge-plan"].enum_values.evidence_strategy, [
    "bug",
    "feature",
    "refactor",
    "migration",
    "config-docs",
    "strict-tdd",
  ]);

  assert.ok(claims.families["challenge-result"], "challenge-result claims must exist");
  assert.deepEqual(claims.families["challenge-result"].required_fields, [
    "schema_version",
    "kind",
    "result_id",
    "plan_id",
    "candidate_id",
    "node_id",
    "policy_snapshot_id",
    "evidence_strategy",
    "challenge_type",
    "outcome",
    "node_id",
    "evidence_ids",
    "details",
  ]);
  assert.deepEqual(claims.families["challenge-result"].enum_values.outcome, [
    "passed",
    "failed",
    "error",
  ]);
  assert.deepEqual(claims.families["challenge-result"].enum_values.challenge_type, [
    "revert",
    "focal-mutation",
    "independent-acceptance",
    "regression-acceptance",
    "compatibility-acceptance",
    "test-inspection",
    "structural-validation",
    "behavior-equivalence",
    "rollback",
  ]);
});

test("K6c challenge-plan/v1: valid fixtures pass; missing budget and unknown type fail closed", () => {
  const schema = loadSchemaById("ospec://schemas/kernel/challenge-plan/v1", { rootDir: ROOT });

  const valid = readJson("schemas/kernel/challenge-plan/fixtures/valid/basic-plan.json");
  const validRes = validateInstance(schema, valid);
  assert.equal(validRes.valid, true, `valid challenge-plan rejected: ${JSON.stringify(validRes.errors)}`);

  const missingBudget = readJson("schemas/kernel/challenge-plan/fixtures/invalid/missing-budget.json");
  const mbRes = validateInstance(schema, missingBudget);
  assert.equal(mbRes.valid, false, "challenge-plan missing budget must fail");

  const unknownType = readJson("schemas/kernel/challenge-plan/fixtures/invalid/unknown-type.json");
  const utRes = validateInstance(schema, unknownType);
  assert.equal(utRes.valid, false, "challenge-plan with unknown challenge type must fail");

  assert.equal(validateInstance(schema, readJson("schemas/kernel/challenge-plan/fixtures/invalid/missing-node-id.json")).valid, false, "challenge-plan missing node binding must fail");
  assert.equal(validateInstance(schema, readJson("schemas/kernel/challenge-plan/fixtures/invalid/duplicate-selected.json")).valid, false, "challenge-plan duplicate selections must fail");
});

test("K6c challenge-result/v1: valid fixtures pass; invalid outcome and invalid type fail closed", () => {
  const schema = loadSchemaById("ospec://schemas/kernel/challenge-result/v1", { rootDir: ROOT });

  const passed = readJson("schemas/kernel/challenge-result/fixtures/valid/passed-result.json");
  const passedRes = validateInstance(schema, passed);
  assert.equal(passedRes.valid, true, `valid passed-result rejected: ${JSON.stringify(passedRes.errors)}`);

  const failed = readJson("schemas/kernel/challenge-result/fixtures/valid/failed-result.json");
  const failedRes = validateInstance(schema, failed);
  assert.equal(failedRes.valid, true, `valid failed-result rejected: ${JSON.stringify(failedRes.errors)}`);

  const invalidOutcome = readJson("schemas/kernel/challenge-result/fixtures/invalid/invalid-outcome.json");
  const ioRes = validateInstance(schema, invalidOutcome);
  assert.equal(ioRes.valid, false, "challenge-result with invalid outcome must fail");
  assert.equal(validateInstance(schema, readJson("schemas/kernel/challenge-result/fixtures/invalid/missing-policy-snapshot-id.json")).valid, false, "challenge-result missing policy binding must fail");
});

test("K6c malformed-hash fixtures and cross-bound pair fail closed", () => {
  const planSchema = loadSchemaById("ospec://schemas/kernel/challenge-plan/v1", { rootDir: ROOT });
  const resultSchema = loadSchemaById("ospec://schemas/kernel/challenge-result/v1", { rootDir: ROOT });

  const malformedPlan = readJson("schemas/kernel/challenge-plan/fixtures/invalid/malformed-hash.json");
  const malformedResult = readJson("schemas/kernel/challenge-result/fixtures/invalid/malformed-hash.json");
  assert.equal(validateInstance(planSchema, malformedPlan).valid, false, "malformed plan_id hash must fail schema validation");
  assert.equal(validateInstance(resultSchema, malformedResult).valid, false, "malformed result_id hash must fail schema validation");

  const pairPlan = readJson("schemas/kernel/challenge-plan/fixtures/pairs/cross-bound-plan.json");
  const pairResult = readJson("schemas/kernel/challenge-result/fixtures/pairs/cross-bound-result.json");
  assert.equal(validateInstance(planSchema, pairPlan).valid, true, `cross-bound plan must be schema-valid: ${JSON.stringify(validateInstance(planSchema, pairPlan).errors)}`);
  assert.equal(validateInstance(resultSchema, pairResult).valid, true, `cross-bound result must be schema-valid: ${JSON.stringify(validateInstance(resultSchema, pairResult).errors)}`);
  assert.equal(validateChallengeResult(pairResult, pairPlan).ok, false, "cross-bound result must fail pair integrity");
  assert.equal(validateChallengeResultSet(pairPlan, [pairResult]).ok, false, "cross-bound pair must fail set integrity");
});

test("K6c cross-family substitution fails closed", () => {
  const planSchema = loadSchemaById("ospec://schemas/kernel/challenge-plan/v1", { rootDir: ROOT });
  const resultSchema = loadSchemaById("ospec://schemas/kernel/challenge-result/v1", { rootDir: ROOT });
  const evidenceSchema = loadSchemaById("ospec://schemas/kernel/evidence/v2", { rootDir: ROOT });
  const verificationSchema = loadSchemaById("ospec://schemas/kernel/verification/v2", { rootDir: ROOT });

  const validPlan = readJson("schemas/kernel/challenge-plan/fixtures/valid/basic-plan.json");
  const validResult = readJson("schemas/kernel/challenge-result/fixtures/valid/passed-result.json");

  assert.equal(validateInstance(evidenceSchema, validPlan).valid, false, "challenge-plan must not validate as evidence/v2");
  assert.equal(validateInstance(verificationSchema, validPlan).valid, false, "challenge-plan must not validate as verification/v2");
  assert.equal(validateInstance(evidenceSchema, validResult).valid, false, "challenge-result must not validate as evidence/v2");
  assert.equal(validateInstance(verificationSchema, validResult).valid, false, "challenge-result must not validate as verification/v2");

  assert.equal(validateInstance(planSchema, validResult).valid, false, "challenge-result must not validate as challenge-plan/v1");
  assert.equal(validateInstance(resultSchema, validPlan).valid, false, "challenge-plan must not validate as challenge-result/v1");
});

test("K6c: K1 and K6b schemas and pins remain byte-identical", () => {
  const K1_RES = assertK1SchemasUnchanged(ROOT);
  assert.equal(K1_RES.ok, true, `K1 baseline must remain intact: ${JSON.stringify(K1_RES)}`);

  const K6B_PINS = {
    "schemas/kernel/evidence/v2.schema.json":
      "sha256:fad66198ac48f47109041e45017e77227268610cddbb929e4dfcc3e0c5ec4910",
    "schemas/kernel/verification/v2.schema.json":
      "sha256:441ee351d7c094558818a3af0cfcac8b823818e5562c341d3595f2305cc4396b",
    "schemas/kernel/assessment/v1.schema.json":
      "sha256:67aef041ff0581ffc553ef10232f4e14e0106359c45dcc1ce29380ef469e1887",
    "schemas/kernel/assessment/v2.schema.json":
      "sha256:9221c805992743016daf6051301436cb5a34bf81c64dc2b7a31347984317ecd6",
    "schemas/kernel/runner-receipt/v1.schema.json":
      "sha256:f6a2be9bb7805c33417663c80de927f3e62a0e7f8612484aea0eb5389e4ecdb7",
  };

  for (const [rel, expected] of Object.entries(K6B_PINS)) {
    const actual = digestFile(path.join(ROOT, ...rel.split("/")));
    assert.equal(actual, expected, `${rel} bytes must remain frozen`);
  }
});
