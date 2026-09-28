"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const test = require("node:test");

const {
  REQUIRED_RUN_MANIFEST_FIELDS,
  RunManifestError,
  buildRunManifest,
  runManifestDigest,
  validateRunManifest,
} = require("./run-manifest.js");

function validInput() {
  return {
    schema_version: 1,
    cohort_id: "cohort-2026-04",
    fixture_id: "K12-local-001",
    stratum: "local-reversible",
    policy: "fixed",
    repetition_index: 0,
    repetitions_total: 3,
    order_seed: "seed-001",
    worktree_path: "worktrees/k12-local-001",
    cache_namespace: "k12-local-001-0",
    evaluator: "node-test",
    host: "ci-linux-01",
    catalog_digest: "a".repeat(64),
    started_at: "2026-04-01T10:00:00Z",
    completed_at: "2026-04-01T10:01:00Z",
    outcome: { status: "pass", note: "all checks passed" },
    versions: { runner_version: "1.0.0", node_version: "22.0.0" },
  };
}

test("builds a frozen manifest with a deterministic generated run_id", () => {
  const input = validInput();
  const first = buildRunManifest(input);
  const second = buildRunManifest(validInput());
  const changed = buildRunManifest({ ...validInput(), evaluator: "alternate-evaluator" });

  assert.equal(first.run_id.length, 32);
  assert.equal(first.run_id, second.run_id);
  assert.notEqual(first.run_id, changed.run_id);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.outcome), true);
  assert.equal(Object.isFrozen(first.versions), true);
});

test("rejects each fail-closed manifest rule with RunManifestError", () => {
  const cases = [
    { ...validInput(), unexpected: true },
    { ...validInput(), repetition_index: 3 },
    { ...validInput(), worktree_path: "worktrees/../outside" },
    { ...validInput(), catalog_digest: "A".repeat(64) },
    {
      ...validInput(),
      started_at: "2026-04-01T10:01:00Z",
      completed_at: "2026-04-01T10:00:00Z",
    },
  ];

  for (const input of cases) {
    assert.throws(() => buildRunManifest(input), RunManifestError);
  }
});

test("validates manifests without throwing", () => {
  const invalid = validateRunManifest({ ...validInput(), repetition_index: 3 });
  const valid = validateRunManifest(buildRunManifest(validInput()));

  assert.equal(invalid.valid, false);
  assert.ok(Array.isArray(invalid.errors));
  assert.ok(invalid.errors.length > 0);
  assert.deepEqual(valid, { valid: true, errors: [] });
});

test("produces a stable digest across key permutation", () => {
  const manifest = buildRunManifest(validInput());
  const reordered = {
    versions: { node_version: "22.0.0", runner_version: "1.0.0" },
    outcome: { note: "all checks passed", status: "pass" },
    completed_at: manifest.completed_at,
    started_at: manifest.started_at,
    catalog_digest: manifest.catalog_digest,
    host: manifest.host,
    evaluator: manifest.evaluator,
    cache_namespace: manifest.cache_namespace,
    worktree_path: manifest.worktree_path,
    order_seed: manifest.order_seed,
    repetitions_total: manifest.repetitions_total,
    repetition_index: manifest.repetition_index,
    policy: manifest.policy,
    stratum: manifest.stratum,
    fixture_id: manifest.fixture_id,
    cohort_id: manifest.cohort_id,
    run_id: manifest.run_id,
    schema_version: manifest.schema_version,
  };

  assert.equal(runManifestDigest(manifest), runManifestDigest(reordered));
});

test("keeps schema required fields synchronized with the module", () => {
  const schemaPath = resolve(__dirname, "../../../schemas/kernel/run-manifest/v1.schema.json");
  const schema = JSON.parse(readFileSync(schemaPath, "utf8"));

  assert.deepEqual(schema.required, REQUIRED_RUN_MANIFEST_FIELDS);
});
