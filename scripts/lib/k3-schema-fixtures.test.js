"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { validateInstance } = require("./kernel-schema-validator.js");

const ROOT = path.resolve(__dirname, "../..");

function readJson(relPath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relPath), "utf8"));
}

test("K3 schemas: manifest registers source-snapshot and work-result families", () => {
  const manifest = readJson("schemas/kernel/manifest.json");
  assert.ok(manifest.families["source-snapshot"], "manifest must register source-snapshot");
  assert.equal(manifest.families["source-snapshot"].$id, "ospec://schemas/kernel/source-snapshot/v1");
  assert.equal(manifest.families["source-snapshot"].path, "schemas/kernel/source-snapshot/v1.schema.json");

  assert.ok(manifest.families["work-result"], "manifest must register work-result");
  assert.equal(manifest.families["work-result"].$id, "ospec://schemas/kernel/work-result/v1");
  assert.equal(manifest.families["work-result"].path, "schemas/kernel/work-result/v1.schema.json");
});

test("K3 schemas: SourceSnapshot schema validates valid and invalid fixtures", () => {
  const schema = readJson("schemas/kernel/source-snapshot/v1.schema.json");
  const validMinimal = readJson("schemas/kernel/source-snapshot/fixtures/valid/minimal.json");
  const invalidMinimal = readJson("schemas/kernel/source-snapshot/fixtures/invalid/minimal.json");

  const validRes = validateInstance(schema, validMinimal);
  assert.equal(validRes.valid, true, `valid fixture rejected: ${JSON.stringify(validRes.errors)}`);

  const invalidRes = validateInstance(schema, invalidMinimal);
  assert.equal(invalidRes.valid, false, "invalid fixture should be rejected");
});

test("K3 schemas: WorkResult schema validates valid and invalid fixtures", () => {
  const schema = readJson("schemas/kernel/work-result/v1.schema.json");
  const validMinimal = readJson("schemas/kernel/work-result/fixtures/valid/minimal.json");
  const invalidMinimal = readJson("schemas/kernel/work-result/fixtures/invalid/minimal.json");

  const validRes = validateInstance(schema, validMinimal);
  assert.equal(validRes.valid, true, `valid fixture rejected: ${JSON.stringify(validRes.errors)}`);

  const invalidRes = validateInstance(schema, invalidMinimal);
  assert.equal(invalidRes.valid, false, "invalid fixture should be rejected");
});

test("K3 schemas: Candidate schema validates K3 freeze fields and rejects invalid fixtures", () => {
  const schema = readJson("schemas/kernel/candidate/v1.schema.json");
  const validFrozen = readJson("schemas/kernel/candidate/fixtures/valid/k3-frozen.json");
  const invalidCommit = readJson("schemas/kernel/candidate/fixtures/invalid/commit-projection.json");
  const invalidAlias = readJson("schemas/kernel/candidate/fixtures/invalid/work-result-alias.json");

  const validRes = validateInstance(schema, validFrozen);
  assert.equal(validRes.valid, true, `valid frozen fixture rejected: ${JSON.stringify(validRes.errors)}`);

  const invalidCommitRes = validateInstance(schema, invalidCommit);
  assert.equal(invalidCommitRes.valid, false, "commit projection in Candidate must be rejected");

  const invalidAliasRes = validateInstance(schema, invalidAlias);
  assert.equal(invalidAliasRes.valid, false, "WorkResult aliased as Candidate must be rejected");
});

test("K3 schemas: WorkOrder schema requires source_snapshot_id for bound work orders", () => {
  const schema = readJson("schemas/kernel/work-order/v1.schema.json");
  const validOrder = {
    schema_version: 1,
    work_order_id: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
    source_snapshot_id: "sha256:2222222222222222222222222222222222222222222222222222222222222222",
    node_id: "node-1",
    role: "worker",
    status: "pending",
    operation: "compile",
    objective: "build target",
    dependencies: [],
    ownership: { owner: "worker", mode: "exclusive" },
    allowed_paths: ["src/"],
    invariants: [],
    required_evidence: ["build-log"],
    budget: { model_turns: 5, patches: 2, commands: 10, wall_time_minutes: 5, changed_lines: 50 }
  };

  const validRes = validateInstance(schema, validOrder);
  assert.equal(validRes.valid, true, `valid WorkOrder with source_snapshot_id rejected: ${JSON.stringify(validRes.errors)}`);

  const invalidOrder = { ...validOrder };
  delete invalidOrder.source_snapshot_id;
  const invalidRes = validateInstance(schema, invalidOrder);
  assert.equal(invalidRes.valid, false, "WorkOrder missing source_snapshot_id must be rejected");
});

test("K3 schemas: candidate/v2 and work-order/v2 schemas expose valid $id and kind const", () => {
  const candidateV2Schema = readJson("schemas/kernel/candidate-v2/v2.schema.json");
  assert.equal(candidateV2Schema.$id, "ospec://schemas/kernel/candidate-v2/v2");
  assert.equal(candidateV2Schema.schema_version, 2);
  assert.equal(candidateV2Schema.properties.kind.const, "candidate/v2");

  const workOrderV2Schema = readJson("schemas/kernel/work-order-v2/v2.schema.json");
  assert.equal(workOrderV2Schema.$id, "ospec://schemas/kernel/work-order-v2/v2");
  assert.equal(workOrderV2Schema.schema_version, 2);
  assert.equal(workOrderV2Schema.properties.kind.const, "work-order/v2");
});

test("K3 schemas: candidate/v2 schema validates valid and invalid v2 fixtures", () => {
  const schema = readJson("schemas/kernel/candidate-v2/v2.schema.json");
  const validV2 = readJson("schemas/kernel/candidate-v2/fixtures/valid/minimal.json");
  const invalidV2 = readJson("schemas/kernel/candidate-v2/fixtures/invalid/missing-kind.json");

  const validRes = validateInstance(schema, validV2);
  assert.equal(validRes.valid, true, `valid candidate/v2 fixture rejected: ${JSON.stringify(validRes.errors)}`);

  const invalidRes = validateInstance(schema, invalidV2);
  assert.equal(invalidRes.valid, false, "candidate/v2 fixture missing kind must be rejected");
});

test("K3 schemas: work-order/v2 schema validates valid and invalid v2 fixtures", () => {
  const schema = readJson("schemas/kernel/work-order-v2/v2.schema.json");
  const validV2 = readJson("schemas/kernel/work-order-v2/fixtures/valid/minimal.json");
  const invalidV2 = readJson("schemas/kernel/work-order-v2/fixtures/invalid/missing-kind.json");

  const validRes = validateInstance(schema, validV2);
  assert.equal(validRes.valid, true, `valid work-order/v2 fixture rejected: ${JSON.stringify(validRes.errors)}`);

  const invalidRes = validateInstance(schema, invalidV2);
  assert.equal(invalidRes.valid, false, "work-order/v2 fixture missing kind must be rejected");
});

test("Adversarial Scenario 7: Candidate without freeze fields in schema v2 is REJECTED", () => {
  const schema = readJson("schemas/kernel/candidate-v2/v2.schema.json");
  const unfrozenCandidate = {
    schema_version: 2,
    kind: "candidate/v2",
    candidate_id: "sha256:0000000000000000000000000000000000000000000000000000000000000001",
    repository_id: "repo-1",
    projection: "workspace",
    base_tree: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
    candidate_tree: "sha256:2222222222222222222222222222222222222222222222222222222222222222",
    diff_hash: "sha256:3333333333333333333333333333333333333333333333333333333333333333",
    paths: ["a.js"]
    // missing changed_paths_modes_digest, intended_untracked_digest, relation
  };
  const res = validateInstance(schema, unfrozenCandidate);
  assert.equal(res.valid, false, "Candidate v2 missing freeze fields must be rejected");
});

test("Adversarial Scenario 12 (Design): WorkResult validated against Candidate v2 Schema is REJECTED", () => {
  const schema = readJson("schemas/kernel/candidate-v2/v2.schema.json");
  const workResult = readJson("schemas/kernel/work-result/fixtures/valid/minimal.json");
  const res = validateInstance(schema, workResult);
  assert.equal(res.valid, false, "WorkResult must fail validation against Candidate v2 Schema");
});

test("Adversarial Scenario 13 (Design): Candidate validated against WorkOrder v2 Schema is REJECTED", () => {
  const schema = readJson("schemas/kernel/work-order-v2/v2.schema.json");
  const candidateV2 = readJson("schemas/kernel/candidate-v2/fixtures/valid/minimal.json");
  const res = validateInstance(schema, candidateV2);
  assert.equal(res.valid, false, "Candidate v2 must fail validation against WorkOrder v2 Schema");
});

test("Adversarial Scenario 14: candidate/v1 continues validating v1, candidate/v2 validates K3 semantics, K1_SCHEMA_BASELINE remains intact", () => {
  const schemaV1 = readJson("schemas/kernel/candidate/v1.schema.json");
  const schemaV2 = readJson("schemas/kernel/candidate-v2/v2.schema.json");
  const v1Fixture = readJson("schemas/kernel/candidate/fixtures/valid/minimal.json");
  const v2Fixture = readJson("schemas/kernel/candidate-v2/fixtures/valid/minimal.json");

  // candidate/v1 validates v1 fixture
  const resV1 = validateInstance(schemaV1, v1Fixture);
  assert.equal(resV1.valid, true, `v1 schema must validate v1 fixture: ${JSON.stringify(resV1.errors)}`);

  // candidate/v2 validates v2 fixture
  const resV2 = validateInstance(schemaV2, v2Fixture);
  assert.equal(resV2.valid, true, `v2 schema must validate v2 fixture: ${JSON.stringify(resV2.errors)}`);

  // v1 fixture fails v2 schema because missing kind and required v2 freeze fields
  const resV1InV2 = validateInstance(schemaV2, v1Fixture);
  assert.equal(resV1InV2.valid, false, "v1 fixture must fail v2 schema");
});



