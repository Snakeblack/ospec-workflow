"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { validateInstance, loadSchemaById } = require("./kernel-schema-validator.js");

const ROOT = path.resolve(__dirname, "..", "..");
const MANIFEST_PATH = path.join(ROOT, "schemas", "kernel", "manifest.json");
const CLAIMS_PATH = path.join(ROOT, "schemas", "kernel", "contract-claims.json");

function readJson(relPath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relPath), "utf8"));
}

test("K6a schema registration: manifest.json includes workspace-descriptor, capsule-definition, work-result-execution-payload, and containment-violation", () => {
  const manifest = readJson("schemas/kernel/manifest.json");

  assert.ok(manifest.families["workspace-descriptor"], "workspace-descriptor must be registered in manifest");
  assert.equal(manifest.families["workspace-descriptor"].schema_version, 1);
  assert.equal(manifest.families["workspace-descriptor"].$id, "ospec://schemas/kernel/workspace-descriptor/v1");
  assert.equal(manifest.families["workspace-descriptor"].path, "schemas/kernel/workspace-descriptor/v1.schema.json");

  assert.ok(manifest.families["capsule-definition"], "capsule-definition must be registered in manifest");
  assert.equal(manifest.families["capsule-definition"].schema_version, 1);
  assert.equal(manifest.families["capsule-definition"].$id, "ospec://schemas/kernel/capsule-definition/v1");
  assert.equal(manifest.families["capsule-definition"].path, "schemas/kernel/capsule-definition/v1.schema.json");

  assert.ok(manifest.families["work-result-execution-payload"], "work-result-execution-payload must be registered in manifest");
  assert.equal(manifest.families["work-result-execution-payload"].schema_version, 1);
  assert.equal(manifest.families["work-result-execution-payload"].$id, "ospec://schemas/kernel/work-result-execution-payload/v1");
  assert.equal(manifest.families["work-result-execution-payload"].path, "schemas/kernel/work-result-execution-payload/v1.schema.json");

  assert.ok(manifest.families["containment-violation"], "containment-violation must be registered in manifest");
  assert.equal(manifest.families["containment-violation"].schema_version, 1);
  assert.equal(manifest.families["containment-violation"].$id, "ospec://schemas/kernel/containment-violation/v1");
  assert.equal(manifest.families["containment-violation"].path, "schemas/kernel/containment-violation/v1.schema.json");
});

test("K6a contract claims: contract-claims.json specifies required fields for K6a families", () => {
  const claims = readJson("schemas/kernel/contract-claims.json");

  assert.ok(claims.families["workspace-descriptor"], "workspace-descriptor family must exist in claims");
  assert.deepEqual(claims.families["workspace-descriptor"].required_fields, [
    "schema_version",
    "workspace_id",
    "root_path",
    "source_snapshot_id",
    "status",
    "created_at",
  ]);
  assert.deepEqual(claims.families["workspace-descriptor"].enum_values.status, [
    "active",
    "disposed",
    "interrupted",
  ]);

  assert.ok(claims.families["capsule-definition"], "capsule-definition family must exist in claims");
  assert.deepEqual(claims.families["capsule-definition"].required_fields, [
    "schema_version",
    "capsule_id",
    "fingerprint",
    "source_snapshot_id",
    "dependencies",
    "allowed_paths",
    "environment",
  ]);

  assert.ok(claims.families["work-result-execution-payload"], "work-result-execution-payload family must exist in claims");
  assert.deepEqual(claims.families["work-result-execution-payload"].required_fields, [
    "schema_version",
    "work_result_id",
    "work_order_id",
    "source_snapshot_id",
    "patch",
    "commands",
    "logs",
    "exit_code",
    "filesystem_inventory",
    "execution_usage",
  ]);

  assert.ok(claims.families["containment-violation"], "containment-violation family must exist in claims");
  assert.deepEqual(claims.families["containment-violation"].required_fields, [
    "schema_version",
    "violation_id",
    "workspace_id",
    "work_order_id",
    "attempted_path",
    "allowed_paths",
    "violation_type",
    "timestamp",
  ]);
  assert.deepEqual(claims.families["containment-violation"].enum_values.violation_type, [
    "traversal",
    "symlink_escape",
    "undeclared_write",
    "permission_denied",
  ]);
});

test("K6a workspace-descriptor schema: validates valid and rejects invalid fixtures", () => {
  const schema = loadSchemaById("ospec://schemas/kernel/workspace-descriptor/v1", { rootDir: ROOT });

  const minimal = readJson("schemas/kernel/workspace-descriptor/fixtures/valid/valid-minimal.json");
  const minRes = validateInstance(schema, minimal);
  assert.equal(minRes.valid, true, `valid-minimal must pass: ${JSON.stringify(minRes.errors)}`);

  const full = readJson("schemas/kernel/workspace-descriptor/fixtures/valid/valid-disposed.json");
  const fullRes = validateInstance(schema, full);
  assert.equal(fullRes.valid, true, `valid-disposed must pass: ${JSON.stringify(fullRes.errors)}`);

  const interrupted = readJson("schemas/kernel/workspace-descriptor/fixtures/valid/valid-interrupted.json");
  const intRes = validateInstance(schema, interrupted);
  assert.equal(intRes.valid, true, `valid-interrupted must pass: ${JSON.stringify(intRes.errors)}`);

  const invalidStatus = readJson("schemas/kernel/workspace-descriptor/fixtures/invalid/invalid-unknown-status.json");
  const statusRes = validateInstance(schema, invalidStatus);
  assert.equal(statusRes.valid, false, "Invalid status enum must fail validation");

  const invalidSnapshot = readJson("schemas/kernel/workspace-descriptor/fixtures/invalid/invalid-malformed-snapshot.json");
  const snapRes = validateInstance(schema, invalidSnapshot);
  assert.equal(snapRes.valid, false, "Malformed source_snapshot_id must fail validation");

  const extraProp = readJson("schemas/kernel/workspace-descriptor/fixtures/invalid/invalid-extra-prop.json");
  const extraRes = validateInstance(schema, extraProp);
  assert.equal(extraRes.valid, false, "Extra property must fail validation");
});

test("K6a capsule-definition schema: validates valid and rejects invalid fixtures", () => {
  const schema = loadSchemaById("ospec://schemas/kernel/capsule-definition/v1", { rootDir: ROOT });

  const minimal = readJson("schemas/kernel/capsule-definition/fixtures/valid/valid-minimal.json");
  const minRes = validateInstance(schema, minimal);
  assert.equal(minRes.valid, true, `valid-minimal must pass: ${JSON.stringify(minRes.errors)}`);

  const full = readJson("schemas/kernel/capsule-definition/fixtures/valid/valid-full.json");
  const fullRes = validateInstance(schema, full);
  assert.equal(fullRes.valid, true, `valid-full must pass: ${JSON.stringify(fullRes.errors)}`);

  const missingAllowed = readJson("schemas/kernel/capsule-definition/fixtures/invalid/invalid-missing-allowed-paths.json");
  const allowRes = validateInstance(schema, missingAllowed);
  assert.equal(allowRes.valid, false, "Missing allowed_paths must fail validation");

  const missingDeps = readJson("schemas/kernel/capsule-definition/fixtures/invalid/invalid-missing-dependencies.json");
  const depRes = validateInstance(schema, missingDeps);
  assert.equal(depRes.valid, false, "Missing dependencies must fail validation");

  const malformedFp = readJson("schemas/kernel/capsule-definition/fixtures/invalid/invalid-malformed-fingerprint.json");
  const fpRes = validateInstance(schema, malformedFp);
  assert.equal(fpRes.valid, false, "Malformed fingerprint must fail validation");
});

test("K6a work-result-execution-payload schema: validates valid, rejects invalid, and strictly prohibits CandidateId", () => {
  const schema = loadSchemaById("ospec://schemas/kernel/work-result-execution-payload/v1", { rootDir: ROOT });

  const minimal = readJson("schemas/kernel/work-result-execution-payload/fixtures/valid/valid-minimal.json");
  const minRes = validateInstance(schema, minimal);
  assert.equal(minRes.valid, true, `valid-minimal must pass: ${JSON.stringify(minRes.errors)}`);

  const full = readJson("schemas/kernel/work-result-execution-payload/fixtures/valid/valid-full.json");
  const fullRes = validateInstance(schema, full);
  assert.equal(fullRes.valid, true, `valid-full must pass: ${JSON.stringify(fullRes.errors)}`);

  const withCandidate = readJson("schemas/kernel/work-result-execution-payload/fixtures/invalid/invalid-with-candidate-id.json");
  const candRes = validateInstance(schema, withCandidate);
  assert.equal(candRes.valid, false, "WorkResult containing candidate_id must fail validation");

  const missingPatch = readJson("schemas/kernel/work-result-execution-payload/fixtures/invalid/invalid-missing-patch.json");
  const patchRes = validateInstance(schema, missingPatch);
  assert.equal(patchRes.valid, false, "Missing patch must fail validation");

  const candidateSchema = loadSchemaById("ospec://schemas/kernel/candidate/v2", { rootDir: ROOT });
  const nonAliasingRes = validateInstance(candidateSchema, minimal);
  assert.equal(nonAliasingRes.valid, false, "WorkResultExecutionPayload must fail Candidate v2 schema validation");
});

test("K6a containment-violation schema: validates valid and rejects invalid fixtures", () => {
  const schema = loadSchemaById("ospec://schemas/kernel/containment-violation/v1", { rootDir: ROOT });

  const traversal = readJson("schemas/kernel/containment-violation/fixtures/valid/valid-traversal.json");
  const travRes = validateInstance(schema, traversal);
  assert.equal(travRes.valid, true, `valid-traversal must pass: ${JSON.stringify(travRes.errors)}`);

  const symlink = readJson("schemas/kernel/containment-violation/fixtures/valid/valid-symlink-escape.json");
  const symRes = validateInstance(schema, symlink);
  assert.equal(symRes.valid, true, `valid-symlink-escape must pass: ${JSON.stringify(symRes.errors)}`);

  const undeclared = readJson("schemas/kernel/containment-violation/fixtures/valid/valid-undeclared-write.json");
  const undRes = validateInstance(schema, undeclared);
  assert.equal(undRes.valid, true, `valid-undeclared-write must pass: ${JSON.stringify(undRes.errors)}`);

  const invalidType = readJson("schemas/kernel/containment-violation/fixtures/invalid/invalid-violation-type.json");
  const typeRes = validateInstance(schema, invalidType);
  assert.equal(typeRes.valid, false, "Invalid violation_type must fail validation");

  const missingAttempted = readJson("schemas/kernel/containment-violation/fixtures/invalid/invalid-missing-attempted-path.json");
  const attRes = validateInstance(schema, missingAttempted);
  assert.equal(attRes.valid, false, "Missing attempted_path must fail validation");

  const opReceiptSchema = loadSchemaById("ospec://schemas/kernel/operation-receipt/v1", { rootDir: ROOT });
  const nonAliasingReceipt = validateInstance(opReceiptSchema, traversal);
  assert.equal(nonAliasingReceipt.valid, false, "ContainmentViolation must fail OperationReceipt schema validation");
});
