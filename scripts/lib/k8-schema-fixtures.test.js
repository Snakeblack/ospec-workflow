"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { validateInstance, loadSchemaById } = require("./kernel-schema-validator.js");
const { assertK1SchemasUnchanged } = require("./lifecycle-kernel/k1-compat.js");

const ROOT = path.resolve(__dirname, "../..");
const ATTESTATION_ID = "ospec://schemas/kernel/candidate-evaluation-attestation/v1";
const FIXTURES = "schemas/kernel/candidate-evaluation-attestation/fixtures";
const read = (relative) => JSON.parse(fs.readFileSync(path.join(ROOT, relative), "utf8"));

test("K8 registers candidate-evaluation-attestation/v1 with policy_digest required and closed literals", () => {
  const manifest = read("schemas/kernel/manifest.json");
  const claims = read("schemas/kernel/contract-claims.json");

  assert.ok(manifest.families["candidate-evaluation-attestation"], "manifest must register the family");
  assert.equal(manifest.families["candidate-evaluation-attestation"].$id, ATTESTATION_ID);
  assert.equal(
    manifest.families["candidate-evaluation-attestation"].path,
    "schemas/kernel/candidate-evaluation-attestation/v1.schema.json"
  );
  assert.equal(manifest.families["candidate-evaluation-attestation"].schema_version, 1);

  const schema = loadSchemaById(ATTESTATION_ID, { rootDir: ROOT });
  assert.equal(schema.$id, ATTESTATION_ID);
  assert.ok(schema.required.includes("policy_digest"), "policy_digest must be required");
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual(schema.properties.kind.enum, ["candidate-evaluation-attestation"]);
  assert.deepEqual(schema.properties.outcome.enum, ["approved-for-evaluation"]);
  assert.deepEqual(schema.properties.valid_for.enum, ["evaluation"]);

  assert.ok(claims.families["candidate-evaluation-attestation"], "claims must register the family");
  assert.ok(
    claims.families["candidate-evaluation-attestation"].required_fields.includes("policy_digest"),
    "claims must require policy_digest"
  );
  assert.deepEqual(claims.families["candidate-evaluation-attestation"].enum_values.outcome, [
    "approved-for-evaluation",
  ]);
  assert.deepEqual(claims.families["candidate-evaluation-attestation"].enum_values.valid_for, [
    "evaluation",
  ]);
});

test("K8 valid fixtures pass; same candidate under a distinct policy yields a distinct attestation", () => {
  const schema = loadSchemaById(ATTESTATION_ID, { rootDir: ROOT });

  const minimal = read(`${FIXTURES}/valid/v1-minimal.json`);
  const minimalRes = validateInstance(schema, minimal);
  assert.equal(minimalRes.valid, true, `minimal attestation rejected: ${JSON.stringify(minimalRes.errors)}`);

  const alternatePolicy = read(`${FIXTURES}/valid/v1-distinct-policy.json`);
  const alternateRes = validateInstance(schema, alternatePolicy);
  assert.equal(alternateRes.valid, true, `alternate-policy attestation rejected: ${JSON.stringify(alternateRes.errors)}`);

  assert.equal(alternatePolicy.candidate_id, minimal.candidate_id, "both attestations bind the same candidate");
  assert.notEqual(alternatePolicy.policy_digest, minimal.policy_digest, "policies must differ");
  assert.notEqual(alternatePolicy.attestation_id, minimal.attestation_id, "attestations must not be interchangeable");
});

test("K8 boundary: missing policy_digest and wrong kind/outcome/valid_for literals fail closed", () => {
  const schema = loadSchemaById(ATTESTATION_ID, { rootDir: ROOT });

  const missingPolicyDigest = read(`${FIXTURES}/invalid/v1-missing-policy-digest.json`);
  const missingRes = validateInstance(schema, missingPolicyDigest);
  assert.equal(missingRes.valid, false, "attestation without policy_digest must fail");
  assert.ok(
    missingRes.errors.some((e) => /policy_digest|required/i.test(e.message + e.path + e.rule)),
    "rejection must name policy_digest"
  );

  const wrongKind = read(`${FIXTURES}/invalid/v1-wrong-kind.json`);
  assert.equal(validateInstance(schema, wrongKind).valid, false, "versioned kind literal must fail");

  const wrongOutcome = read(`${FIXTURES}/invalid/v1-wrong-outcome.json`);
  assert.equal(
    validateInstance(schema, wrongOutcome).valid,
    false,
    "approved-for-delivery outcome must fail"
  );

  const wrongValidFor = read(`${FIXTURES}/invalid/v1-wrong-valid-for.json`);
  assert.equal(
    validateInstance(schema, wrongValidFor).valid,
    false,
    "valid_for delivery must fail"
  );
});

test("K8 boundary: delivery-authorization-shaped payload and unknown properties are rejected", () => {
  const schema = loadSchemaById(ATTESTATION_ID, { rootDir: ROOT });
  const receiptSchema = loadSchemaById("ospec://schemas/kernel/receipt/v1", { rootDir: ROOT });

  const authorization = read(`${FIXTURES}/invalid/v1-delivery-authorization-alias.json`);
  assert.equal(authorization.kind, "delivery-authorization");
  assert.equal(
    validateInstance(schema, authorization).valid,
    false,
    "delivery-authorization payload must not validate as candidate-evaluation-attestation"
  );

  const unknownProperty = read(`${FIXTURES}/invalid/v1-unknown-property.json`);
  const unknownRes = validateInstance(schema, unknownProperty);
  assert.equal(unknownRes.valid, false, "unknown top-level property must fail");
  assert.ok(
    unknownRes.errors.some((e) => /additionalProperties|candidate_digest/i.test(e.message + e.path + e.rule)),
    "rejection must name the unknown property"
  );

  const minimal = read(`${FIXTURES}/valid/v1-minimal.json`);
  assert.equal(
    validateInstance(receiptSchema, minimal).valid,
    false,
    "attestation must not validate as the legacy receipt/v1 envelope"
  );
});

test("K8 registration leaves the frozen K1 schema baseline intact", () => {
  assert.equal(assertK1SchemasUnchanged(ROOT).ok, true);
});
