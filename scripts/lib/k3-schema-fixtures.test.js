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

test("K3 schemas: Candidate v2 schema validates freeze fields and rejects invalid fixtures", () => {
  const schema = readJson("schemas/kernel/candidate/v2.schema.json");
  const validFrozen = readJson("schemas/kernel/candidate/fixtures/valid/v2-minimal.json");
  const invalidCommit = readJson("schemas/kernel/candidate/fixtures/invalid/commit-projection.json");
  const invalidAlias = readJson("schemas/kernel/candidate/fixtures/invalid/work-result-alias.json");

  const validRes = validateInstance(schema, validFrozen);
  assert.equal(validRes.valid, true, `valid frozen fixture rejected: ${JSON.stringify(validRes.errors)}`);

  const invalidCommitRes = validateInstance(schema, invalidCommit);
  assert.equal(invalidCommitRes.valid, false, "commit projection in Candidate must be rejected");

  const invalidAliasRes = validateInstance(schema, invalidAlias);
  assert.equal(invalidAliasRes.valid, false, "WorkResult aliased as Candidate must be rejected");
});

test("K3 schemas: WorkOrder v2 schema requires source_snapshot_id for bound work orders", () => {
  const schema = readJson("schemas/kernel/work-order/v2.schema.json");
  const validOrder = {
    schema_version: 2,
    kind: "work-order/v2",
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

test("K3 schemas: candidate/v2 and work-order/v2 schemas expose canonical $id and kind const", () => {
  const candidateV2Schema = readJson("schemas/kernel/candidate/v2.schema.json");
  assert.equal(candidateV2Schema.$id, "ospec://schemas/kernel/candidate/v2");
  assert.equal(candidateV2Schema.schema_version, 2);
  assert.equal(candidateV2Schema.properties.kind.const, "candidate/v2");
  assert.ok(candidateV2Schema.required.includes("repository_id"));

  const workOrderV2Schema = readJson("schemas/kernel/work-order/v2.schema.json");
  assert.equal(workOrderV2Schema.$id, "ospec://schemas/kernel/work-order/v2");
  assert.equal(workOrderV2Schema.schema_version, 2);
  assert.equal(workOrderV2Schema.properties.kind.const, "work-order/v2");
});

test("K3 schemas: candidate/v2 schema validates valid and invalid v2 fixtures", () => {
  const schema = readJson("schemas/kernel/candidate/v2.schema.json");
  const validV2 = readJson("schemas/kernel/candidate/fixtures/valid/v2-minimal.json");
  const invalidV2 = readJson("schemas/kernel/candidate/fixtures/invalid/v2-missing-kind.json");

  const validRes = validateInstance(schema, validV2);
  assert.equal(validRes.valid, true, `valid candidate/v2 fixture rejected: ${JSON.stringify(validRes.errors)}`);

  const invalidRes = validateInstance(schema, invalidV2);
  assert.equal(invalidRes.valid, false, "candidate/v2 fixture missing kind must be rejected");
});

test("K3 schemas: work-order/v2 schema validates valid and invalid v2 fixtures", () => {
  const schema = readJson("schemas/kernel/work-order/v2.schema.json");
  const validV2 = readJson("schemas/kernel/work-order/fixtures/valid/v2-minimal.json");
  const invalidV2 = readJson("schemas/kernel/work-order/fixtures/invalid/v2-missing-kind.json");

  const validRes = validateInstance(schema, validV2);
  assert.equal(validRes.valid, true, `valid work-order/v2 fixture rejected: ${JSON.stringify(validRes.errors)}`);

  const invalidRes = validateInstance(schema, invalidV2);
  assert.equal(invalidRes.valid, false, "work-order/v2 fixture missing kind must be rejected");
});

test("Adversarial Scenario 7: Candidate without freeze fields in schema v2 is REJECTED", () => {
  const schema = readJson("schemas/kernel/candidate/v2.schema.json");
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
  const schema = readJson("schemas/kernel/candidate/v2.schema.json");
  const workResult = readJson("schemas/kernel/work-result/fixtures/valid/minimal.json");
  const res = validateInstance(schema, workResult);
  assert.equal(res.valid, false, "WorkResult must fail validation against Candidate v2 Schema");
});

test("Adversarial Scenario 13 (Design): Candidate validated against WorkOrder v2 Schema is REJECTED", () => {
  const schema = readJson("schemas/kernel/work-order/v2.schema.json");
  const candidateV2 = readJson("schemas/kernel/candidate/fixtures/valid/v2-minimal.json");
  const res = validateInstance(schema, candidateV2);
  assert.equal(res.valid, false, "Candidate v2 must fail validation against WorkOrder v2 Schema");
});

test("Adversarial Scenario 14: candidate/v1 continues validating v1, candidate/v2 validates K3 semantics", () => {
  const schemaV1 = readJson("schemas/kernel/candidate/v1.schema.json");
  const schemaV2 = readJson("schemas/kernel/candidate/v2.schema.json");
  const v1Fixture = readJson("schemas/kernel/candidate/fixtures/valid/minimal.json");
  const v2Fixture = readJson("schemas/kernel/candidate/fixtures/valid/v2-minimal.json");

  const resV1 = validateInstance(schemaV1, v1Fixture);
  assert.equal(resV1.valid, true, `v1 schema must validate v1 fixture: ${JSON.stringify(resV1.errors)}`);

  const resV2 = validateInstance(schemaV2, v2Fixture);
  assert.equal(resV2.valid, true, `v2 schema must validate v2 fixture: ${JSON.stringify(resV2.errors)}`);

  const resV1InV2 = validateInstance(schemaV2, v1Fixture);
  assert.equal(resV1InV2.valid, false, "v1 fixture must fail v2 schema");
});

test("K3 adversarial: canonical v2 paths + $id resolve; wrong candidate-v2/ tree is not authoritative", () => {
  const manifest = readJson("schemas/kernel/manifest.json");
  assert.ok(manifest.families["candidate-v2"], "manifest must register candidate-v2 family");
  assert.equal(manifest.families["candidate-v2"].path, "schemas/kernel/candidate/v2.schema.json");
  assert.equal(manifest.families["candidate-v2"].$id, "ospec://schemas/kernel/candidate/v2");
  assert.ok(manifest.families["work-order-v2"], "manifest must register work-order-v2 family");
  assert.equal(manifest.families["work-order-v2"].path, "schemas/kernel/work-order/v2.schema.json");
  assert.equal(manifest.families["work-order-v2"].$id, "ospec://schemas/kernel/work-order/v2");

  const loadedCand = loadSchemaById("ospec://schemas/kernel/candidate/v2", { rootDir: ROOT });
  assert.equal(loadedCand.$id, "ospec://schemas/kernel/candidate/v2");
  const loadedWo = loadSchemaById("ospec://schemas/kernel/work-order/v2", { rootDir: ROOT });
  assert.equal(loadedWo.$id, "ospec://schemas/kernel/work-order/v2");

  assert.equal(fs.existsSync(path.join(ROOT, "schemas/kernel/candidate-v2")), false,
    "legacy schemas/kernel/candidate-v2/ tree must not exist as authoritative publication");
  assert.equal(fs.existsSync(path.join(ROOT, "schemas/kernel/work-order-v2")), false,
    "legacy schemas/kernel/work-order-v2/ tree must not exist as authoritative publication");
});

test("K3 adversarial: K1 v1 files+pins match 02e97a5 era; pin-only retarget is non-compliant", () => {
  const ERA = {
    "schemas/kernel/candidate/v1.schema.json":
      "sha256:752c7a708300d64b8480b35ebf2897592df36246462d139004c8ec585556edfd",
    "schemas/kernel/work-order/v1.schema.json":
      "sha256:a8204e0ff55a5175b33ada046928d82e32acb22d73068bbe2988ac1d50c921e5",
  };

  for (const [rel, expected] of Object.entries(ERA)) {
    const actual = digestFile(path.join(ROOT, ...rel.split("/")));
    assert.equal(actual, expected, `${rel} bytes must match 02e97a5-era digest`);
    assert.equal(K1_SCHEMA_BASELINE[rel], expected, `${rel} pin must match restored file digest`);
  }

  const result = assertK1SchemasUnchanged(ROOT);
  assert.equal(result.ok, true, `K1 baseline must be intact: ${JSON.stringify(result)}`);

  // Document non-compliance of pin-only retarget: if pins pointed at drifted digests
  // while files were restored (or vice versa), assertK1SchemasUnchanged would fail.
  const driftedPinBaseline = {
    ...K1_SCHEMA_BASELINE,
    "schemas/kernel/candidate/v1.schema.json":
      "sha256:7cf47e0aa1e53f0c1ffe9581a5925654078c075b94ac3bc0822a9212b8f64b82",
  };
  const pinOnly = assertK1SchemasUnchanged(ROOT, driftedPinBaseline);
  assert.equal(pinOnly.ok, false, "pin-only retarget (pins≠restored files) must be non-compliant");
  assert.ok(pinOnly.changed.includes("schemas/kernel/candidate/v1.schema.json"));
});
