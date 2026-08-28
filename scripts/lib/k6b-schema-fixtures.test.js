"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { validateInstance, loadSchemaById } = require("./kernel-schema-validator.js");
const {
  assertK1SchemasUnchanged,
  digestFile,
  K1_SCHEMA_BASELINE,
} = require("./lifecycle-kernel/k1-compat.js");

const ROOT = path.resolve(__dirname, "../..");

function readJson(relPath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relPath), "utf8"));
}

test("K6b schema registration: manifest indexes evidence/v2, verification/v2, and assurance-graph/v1", () => {
  const manifest = readJson("schemas/kernel/manifest.json");

  assert.ok(manifest.families["evidence-v2"], "manifest must register evidence-v2");
  assert.equal(manifest.families["evidence-v2"].schema_version, 2);
  assert.equal(manifest.families["evidence-v2"].$id, "ospec://schemas/kernel/evidence/v2");
  assert.equal(manifest.families["evidence-v2"].path, "schemas/kernel/evidence/v2.schema.json");

  assert.ok(manifest.families["verification-v2"], "manifest must register verification-v2");
  assert.equal(manifest.families["verification-v2"].schema_version, 2);
  assert.equal(manifest.families["verification-v2"].$id, "ospec://schemas/kernel/verification/v2");
  assert.equal(manifest.families["verification-v2"].path, "schemas/kernel/verification/v2.schema.json");

  assert.ok(manifest.families["assurance-graph"], "manifest must register assurance-graph");
  assert.equal(manifest.families["assurance-graph"].schema_version, 1);
  assert.equal(manifest.families["assurance-graph"].$id, "ospec://schemas/kernel/assurance-graph/v1");
  assert.equal(manifest.families["assurance-graph"].path, "schemas/kernel/assurance-graph/v1.schema.json");

  const evidenceV2 = loadSchemaById("ospec://schemas/kernel/evidence/v2", { rootDir: ROOT });
  assert.equal(evidenceV2.$id, "ospec://schemas/kernel/evidence/v2");
  const verificationV2 = loadSchemaById("ospec://schemas/kernel/verification/v2", { rootDir: ROOT });
  assert.equal(verificationV2.$id, "ospec://schemas/kernel/verification/v2");
  const graph = loadSchemaById("ospec://schemas/kernel/assurance-graph/v1", { rootDir: ROOT });
  assert.equal(graph.$id, "ospec://schemas/kernel/assurance-graph/v1");

  assert.ok(manifest.families.assessment, "manifest must register assessment");
  assert.equal(manifest.families.assessment.schema_version, 1);
  assert.equal(manifest.families.assessment.$id, "ospec://schemas/kernel/assessment/v1");
  assert.equal(manifest.families.assessment.path, "schemas/kernel/assessment/v1.schema.json");
  const assessment = loadSchemaById("ospec://schemas/kernel/assessment/v1", { rootDir: ROOT });
  assert.equal(assessment.$id, "ospec://schemas/kernel/assessment/v1");

  assert.ok(manifest.families["assessment-v2"], "manifest must register assessment-v2");
  assert.equal(manifest.families["assessment-v2"].schema_version, 2);
  assert.equal(manifest.families["assessment-v2"].$id, "ospec://schemas/kernel/assessment/v2");
  assert.equal(manifest.families["assessment-v2"].path, "schemas/kernel/assessment/v2.schema.json");
  const assessmentV2 = loadSchemaById("ospec://schemas/kernel/assessment/v2", { rootDir: ROOT });
  assert.equal(assessmentV2.$id, "ospec://schemas/kernel/assessment/v2");
});

test("K6b contract claims: additive families list required fields without replacing v1 claims", () => {
  const claims = readJson("schemas/kernel/contract-claims.json");

  assert.deepEqual(claims.families.evidence.required_fields, [
    "schema_version",
    "evidence_id",
    "kind",
    "digest",
  ]);
  assert.ok(claims.families["evidence-v2"], "evidence-v2 claims must exist");
  assert.deepEqual(claims.families["evidence-v2"].required_fields, [
    "schema_version",
    "kind",
    "evidence_id",
    "candidate_id",
    "provenance",
    "origin",
    "digest",
    "node_id",
  ]);
  assert.deepEqual(claims.families["evidence-v2"].enum_values.provenance, [
    "runtime-observed",
    "host-attested",
    "tool-produced",
    "model-reported",
    "human-decision",
    "external-unverified",
  ]);

  assert.ok(claims.families["verification-v2"]);
  assert.deepEqual(claims.families["verification-v2"].enum_values.verdict, [
    "PASS",
    "PASS WITH WARNINGS",
    "FAIL",
  ]);

  assert.ok(claims.families["assurance-graph"]);
  assert.deepEqual(claims.families["assurance-graph"].enum_values.relation, [
    "verified-by",
    "satisfies",
    "derived-from",
    "invalidates",
  ]);

  assert.ok(claims.families.assessment, "assessment claims must exist");
  assert.deepEqual(claims.families.assessment.required_fields, [
    "schema_version",
    "kind",
    "assessment_id",
    "evidence_id",
    "role",
    "obligation_id",
    "node_id",
    "candidate_id",
    "policy_snapshot_id",
  ]);

  assert.ok(claims.families["assessment-v2"], "assessment-v2 claims must exist");
  assert.deepEqual(claims.families["assessment-v2"].required_fields, [
    "schema_version",
    "kind",
    "assessment_id",
    "evidence_id",
    "role",
    "obligation_id",
    "node_id",
    "candidate_id",
    "policy_snapshot_id",
    "evidence_requirements_satisfied",
  ]);
  assert.deepEqual(claims.families["assessment-v2"].enum_values.role, [
    "red",
    "green",
    "characterization-before",
    "characterization-after",
    "negative",
    "acceptance",
    "integration",
    "invariant",
    "smoke",
    "rollback",
    "dry-run",
  ]);
});

test("K6b evidence/v2: valid fixture passes; verdict and unknown provenance fail closed", () => {
  const schema = loadSchemaById("ospec://schemas/kernel/evidence/v2", { rootDir: ROOT });
  const valid = readJson("schemas/kernel/evidence/fixtures/valid/v2-runtime-observed.json");
  const validRes = validateInstance(schema, valid);
  assert.equal(validRes.valid, true, `valid evidence/v2 rejected: ${JSON.stringify(validRes.errors)}`);

  const withVerdict = readJson("schemas/kernel/evidence/fixtures/invalid/v2-with-verdict.json");
  const verdictRes = validateInstance(schema, withVerdict);
  assert.equal(verdictRes.valid, false, "evidence/v2 with verdict must fail");
  assert.ok(verdictRes.errors.some((e) => /verdict|additionalProperties/i.test(e.message + e.path + e.rule)));

  const unknownProv = readJson("schemas/kernel/evidence/fixtures/invalid/v2-unknown-provenance.json");
  const provRes = validateInstance(schema, unknownProv);
  assert.equal(provRes.valid, false, "worker-said-so provenance must fail");

  const malformed = readJson("schemas/kernel/evidence/fixtures/invalid/v2-malformed-candidate-id.json");
  assert.equal(validateInstance(schema, malformed).valid, false);

  const missing = readJson("schemas/kernel/evidence/fixtures/invalid/v2-missing-required.json");
  assert.equal(validateInstance(schema, missing).valid, false);
});

test("K6b verification/v2: valid fixture passes; cross-family substitution fails closed", () => {
  const verificationSchema = loadSchemaById("ospec://schemas/kernel/verification/v2", { rootDir: ROOT });
  const evidenceSchema = loadSchemaById("ospec://schemas/kernel/evidence/v2", { rootDir: ROOT });

  const valid = readJson("schemas/kernel/verification/fixtures/valid/v2-pass.json");
  const validRes = validateInstance(verificationSchema, valid);
  assert.equal(validRes.valid, true, `valid verification/v2 rejected: ${JSON.stringify(validRes.errors)}`);

  const evidenceAsVerification = readJson("schemas/kernel/verification/fixtures/invalid/v2-evidence-alias.json");
  assert.equal(
    validateInstance(verificationSchema, evidenceAsVerification).valid,
    false,
    "evidence/v2 must not validate as verification/v2"
  );

  const verificationAsEvidence = readJson("schemas/kernel/evidence/fixtures/invalid/v2-verification-alias.json");
  assert.equal(
    validateInstance(evidenceSchema, verificationAsEvidence).valid,
    false,
    "verification/v2 must not validate as evidence/v2"
  );

  const missingVerdict = readJson("schemas/kernel/verification/fixtures/invalid/v2-missing-verdict.json");
  assert.equal(validateInstance(verificationSchema, missingVerdict).valid, false);
});

test("K6b assurance-graph/v1: valid fixtures pass; reviewed-by, malformed digest, and attestation alias fail", () => {
  const schema = loadSchemaById("ospec://schemas/kernel/assurance-graph/v1", { rootDir: ROOT });

  const minimal = readJson("schemas/kernel/assurance-graph/fixtures/valid/v1-minimal.json");
  const minRes = validateInstance(schema, minimal);
  assert.equal(minRes.valid, true, `valid graph rejected: ${JSON.stringify(minRes.errors)}`);

  const withManifest = readJson("schemas/kernel/assurance-graph/fixtures/valid/v1-with-manifest.json");
  const manRes = validateInstance(schema, withManifest);
  assert.equal(manRes.valid, true, `graph with manifest rejected: ${JSON.stringify(manRes.errors)}`);
  assert.equal(withManifest.equivalence_manifest.kind, "equivalence-manifest/v1");

  const reviewedBy = readJson("schemas/kernel/assurance-graph/fixtures/invalid/v1-reviewed-by.json");
  assert.equal(validateInstance(schema, reviewedBy).valid, false, "reviewed-by must fail");

  const malformed = readJson("schemas/kernel/assurance-graph/fixtures/invalid/v1-malformed-digest.json");
  assert.equal(validateInstance(schema, malformed).valid, false);

  const attestation = readJson("schemas/kernel/assurance-graph/fixtures/invalid/v1-attestation-alias.json");
  assert.equal(validateInstance(schema, attestation).valid, false, "attestation-shaped payload must fail graph schema");

  const missing = readJson("schemas/kernel/assurance-graph/fixtures/invalid/v1-missing-fields.json");
  assert.equal(validateInstance(schema, missing).valid, false);
});

test("K6b equivalence manifest cannot alias attestation or authorization kinds", () => {
  const manifest = readJson("schemas/kernel/assurance-graph/fixtures/valid/v1-with-manifest.json").equivalence_manifest;
  assert.equal(manifest.kind, "equivalence-manifest/v1");
  assert.notEqual(manifest.kind, "candidate-evaluation-attestation/v1");
  assert.notEqual(manifest.kind, "delivery-authorization/v1");

  const attestationStub = {
    type: "object",
    required: ["kind", "attestation_id", "candidate_id"],
    properties: {
      kind: { const: "candidate-evaluation-attestation/v1" },
      attestation_id: { type: "string" },
      candidate_id: { type: "string" },
    },
    additionalProperties: false,
  };
  const authorizationStub = {
    type: "object",
    required: ["kind", "authorization_id", "candidate_id"],
    properties: {
      kind: { const: "delivery-authorization/v1" },
      authorization_id: { type: "string" },
      candidate_id: { type: "string" },
    },
    additionalProperties: false,
  };
  assert.equal(validateInstance(attestationStub, manifest).valid, false);
  assert.equal(validateInstance(authorizationStub, manifest).valid, false);
});

test("K6b: K1 evidence/v1 and verification/v1 files and pins remain byte-identical", () => {
  const ERA = {
    "schemas/kernel/evidence/v1.schema.json":
      "sha256:edf5f600909482a2c45e5959d26d9a58d12631c31b276006f713801792c2b050",
    "schemas/kernel/evidence/fixtures/valid/minimal.json":
      "sha256:5eb865fe3de23bd6ae0cddd83bceffe9e91d148f4193007e43dc379b28ae4ff0",
    "schemas/kernel/evidence/fixtures/invalid/minimal.json":
      "sha256:a58c86857a5e00c1d4c21d56fce039b690db08a21e0208098a9452c2d71cf6b1",
    "schemas/kernel/verification/v1.schema.json":
      "sha256:15a12ffe15a823239ad8e3bacd2c4dd97e646bc11733cae139e8863735674606",
    "schemas/kernel/verification/fixtures/valid/minimal.json":
      "sha256:c095b92561feb3f7f7f32c153679b821a3e164f610061bd044231ba7b770f6d9",
    "schemas/kernel/verification/fixtures/invalid/minimal.json":
      "sha256:5146916324fef6864776a4b4dc2912b8159c54d0c81d64340ce8a1dc84a425f3",
  };

  for (const [rel, expected] of Object.entries(ERA)) {
    const actual = digestFile(path.join(ROOT, ...rel.split("/")));
    assert.equal(actual, expected, `${rel} bytes must remain frozen`);
    assert.equal(K1_SCHEMA_BASELINE[rel], expected, `${rel} K1 pin must remain frozen`);
  }

  const result = assertK1SchemasUnchanged(ROOT);
  assert.equal(result.ok, true, `K1 baseline must be intact: ${JSON.stringify(result)}`);
});

test("K6b assessment/v1: valid fixture passes; verdict, missing fields, and cross-family fail closed", () => {
  const assessmentSchema = loadSchemaById("ospec://schemas/kernel/assessment/v1", { rootDir: ROOT });
  const evidenceSchema = loadSchemaById("ospec://schemas/kernel/evidence/v2", { rootDir: ROOT });
  const verificationSchema = loadSchemaById("ospec://schemas/kernel/verification/v2", { rootDir: ROOT });

  const complete = readJson("schemas/kernel/assessment/fixtures/valid/v1-complete.json");
  const completeRes = validateInstance(assessmentSchema, complete);
  assert.equal(completeRes.valid, true, `valid assessment rejected: ${JSON.stringify(completeRes.errors)}`);

  const missing = readJson("schemas/kernel/assessment/fixtures/invalid/v1-missing-required.json");
  assert.equal(validateInstance(assessmentSchema, missing).valid, false);

  const withVerdict = readJson("schemas/kernel/assessment/fixtures/invalid/v1-with-verdict.json");
  const verdictRes = validateInstance(assessmentSchema, withVerdict);
  assert.equal(verdictRes.valid, false, "assessment/v1 with verdict must fail");
  assert.ok(verdictRes.errors.some((e) => /verdict|additionalProperties/i.test(e.message + e.path + e.rule)));

  const alias = readJson("schemas/kernel/assessment/fixtures/invalid/v1-evidence-alias.json");
  assert.equal(validateInstance(assessmentSchema, alias).valid, false, "evidence/v2 must not validate as assessment/v1");
  assert.equal(validateInstance(evidenceSchema, complete).valid, false, "assessment/v1 must not validate as evidence/v2");
  assert.equal(validateInstance(verificationSchema, complete).valid, false, "assessment/v1 must not validate as verification/v2");
});

test("K6b assessment/v1: four roles share one evidence_id and produce distinct assessment_id values", () => {
  const schema = loadSchemaById("ospec://schemas/kernel/assessment/v1", { rootDir: ROOT });
  const four = readJson("schemas/kernel/assessment/fixtures/valid/v1-four-roles.json");
  assert.ok(Array.isArray(four), "v1-four-roles.json must be an array of payloads");
  assert.equal(four.length, 4);

  const evidenceIds = new Set();
  const assessmentIds = new Set();
  const roles = new Set();
  for (const payload of four) {
    const result = validateInstance(schema, payload);
    assert.equal(result.valid, true, `four-role payload rejected: ${JSON.stringify(result.errors)}`);
    evidenceIds.add(payload.evidence_id);
    assessmentIds.add(payload.assessment_id);
    roles.add(payload.role);
  }
  assert.equal(evidenceIds.size, 1, "four roles must share one evidence_id");
  assert.equal(assessmentIds.size, 4, "four roles must produce four assessment_id values");
  assert.equal(roles.size, 4);
});

test("K6b assessment/v2: valid fixture passes; missing coverage, empty coverage, verdict, and cross-family fail closed", () => {
  const assessmentSchema = loadSchemaById("ospec://schemas/kernel/assessment/v2", { rootDir: ROOT });
  const evidenceSchema = loadSchemaById("ospec://schemas/kernel/evidence/v2", { rootDir: ROOT });
  const verificationSchema = loadSchemaById("ospec://schemas/kernel/verification/v2", { rootDir: ROOT });

  const complete = readJson("schemas/kernel/assessment/fixtures/valid/v2-complete.json");
  const completeRes = validateInstance(assessmentSchema, complete);
  assert.equal(completeRes.valid, true, `valid assessment/v2 rejected: ${JSON.stringify(completeRes.errors)}`);

  const emptyCoverage = readJson("schemas/kernel/assessment/fixtures/invalid/v2-empty-coverage.json");
  const emptyRes = validateInstance(assessmentSchema, emptyCoverage);
  assert.equal(emptyRes.valid, false, "assessment/v2 with empty evidence_requirements_satisfied must fail");

  const missingCoverage = readJson("schemas/kernel/assessment/fixtures/invalid/v2-missing-coverage.json");
  assert.equal(validateInstance(assessmentSchema, missingCoverage).valid, false);

  const withVerdict = readJson("schemas/kernel/assessment/fixtures/invalid/v2-with-verdict.json");
  const verdictRes = validateInstance(assessmentSchema, withVerdict);
  assert.equal(verdictRes.valid, false, "assessment/v2 with verdict must fail");
  assert.ok(verdictRes.errors.some((e) => /verdict|additionalProperties/i.test(e.message + e.path + e.rule)));

  const alias = readJson("schemas/kernel/assessment/fixtures/invalid/v1-evidence-alias.json");
  assert.equal(validateInstance(assessmentSchema, alias).valid, false, "evidence/v2 must not validate as assessment/v2");
  assert.equal(validateInstance(evidenceSchema, complete).valid, false, "assessment/v2 must not validate as evidence/v2");
  assert.equal(validateInstance(verificationSchema, complete).valid, false, "assessment/v2 must not validate as verification/v2");
});

test("K6b assessment/v2: four roles share one evidence_id and produce distinct assessment_id values", () => {
  const schema = loadSchemaById("ospec://schemas/kernel/assessment/v2", { rootDir: ROOT });
  const four = readJson("schemas/kernel/assessment/fixtures/valid/v2-four-roles.json");
  assert.ok(Array.isArray(four), "v2-four-roles.json must be an array of payloads");
  assert.equal(four.length, 4);

  const evidenceIds = new Set();
  const assessmentIds = new Set();
  const roles = new Set();
  for (const payload of four) {
    const result = validateInstance(schema, payload);
    assert.equal(result.valid, true, `four-role v2 payload rejected: ${JSON.stringify(result.errors)}`);
    evidenceIds.add(payload.evidence_id);
    assessmentIds.add(payload.assessment_id);
    roles.add(payload.role);
  }
  assert.equal(evidenceIds.size, 1, "four roles must share one evidence_id");
  assert.equal(assessmentIds.size, 4, "four roles must produce four assessment_id values");
  assert.equal(roles.size, 4);
});

test("K6b: evidence/v2 and verification/v2 schema bytes remain frozen after assessment publication", () => {
  const V2_PINS = {
    "schemas/kernel/evidence/v2.schema.json":
      "sha256:fad66198ac48f47109041e45017e77227268610cddbb929e4dfcc3e0c5ec4910",
    "schemas/kernel/verification/v2.schema.json":
      "sha256:441ee351d7c094558818a3af0cfcac8b823818e5562c341d3595f2305cc4396b",
  };
  for (const [rel, expected] of Object.entries(V2_PINS)) {
    const actual = digestFile(path.join(ROOT, ...rel.split("/")));
    assert.equal(actual, expected, `${rel} bytes must remain frozen`);
  }
});
