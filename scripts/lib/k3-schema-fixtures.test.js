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
