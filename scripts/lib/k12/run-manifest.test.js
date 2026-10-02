"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const test = require("node:test");

const {
  POLICIES,
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

test("builds and freezes a manifest with complete measurements and oracle records", () => {
  const manifest = buildRunManifest({
    ...validInput(),
    outcome: {
      status: "pass",
      note: "all checks passed",
      measurements: {
        phases_executed: 4,
        effects_executed: 3,
        events_recorded: 12,
        wall_ms: 150.5,
        interruptions: 0,
        recoveries: 1,
      },
      oracle: { applied: true, reason: "compared against catalog digest" },
    },
  });

  assert.equal(Object.isFrozen(manifest.outcome.measurements), true);
  assert.equal(Object.isFrozen(manifest.outcome.oracle), true);
});

test("rejects incomplete or unknown outcome measurements and oracle fields", () => {
  const completeMeasurements = {
    phases_executed: 4,
    effects_executed: 3,
    events_recorded: 12,
    wall_ms: 150.5,
    interruptions: 0,
    recoveries: 1,
  };
  const sparseMeasurements = {
    phases_executed: 4,
    effects_executed: 3,
    events_recorded: 12,
    wall_ms: 150.5,
    interruptions: 0,
  };
  const cases = [
    {
      ...validInput(),
      outcome: { status: "pass", measurements: sparseMeasurements },
    },
    {
      ...validInput(),
      outcome: { status: "pass", measurements: { ...completeMeasurements, extra: 1 } },
    },
    {
      ...validInput(),
      outcome: { status: "pass", oracle: { applied: true, reason: "checked", extra: true } },
    },
    {
      ...validInput(),
      outcome: { status: "pass", oracle: { applied: false } },
    },
  ];

  for (const input of cases) {
    assert.throws(() => buildRunManifest(input), RunManifestError);
  }
});

test("keeps legacy status and note outcomes valid with the pre-extension run_id", () => {
  const manifest = buildRunManifest(validInput());

  assert.equal(manifest.outcome.status, "pass");
  assert.equal(manifest.outcome.note, "all checks passed");
  assert.equal(manifest.run_id, "fe230ebc245f1bfae74f55e0b08eb53f");
});

test("validates manifests without throwing", () => {
  const invalid = validateRunManifest({ ...validInput(), repetition_index: 3 });
  const valid = validateRunManifest(buildRunManifest(validInput()));

  assert.equal(invalid.valid, false);
  assert.ok(Array.isArray(invalid.errors));
  assert.ok(invalid.errors.length > 0);
  assert.deepEqual(valid, { valid: true, errors: [] });
});

test("collects errors for each new outcome validation violation without throwing", () => {
  const completeMeasurements = {
    phases_executed: 4,
    effects_executed: 3,
    events_recorded: 12,
    wall_ms: 150.5,
    interruptions: 0,
    recoveries: 1,
  };
  const sparseMeasurements = {
    effects_executed: 3,
    events_recorded: 12,
    wall_ms: 150.5,
    interruptions: 0,
    recoveries: 1,
  };
  const cases = [
    {
      manifest: {
        ...validInput(),
        outcome: { status: "pass", measurements: sparseMeasurements },
      },
      expectedError: "run manifest outcome measurements phases_executed must be an integer greater than or equal to 0",
    },
    {
      manifest: {
        ...validInput(),
        outcome: { status: "pass", measurements: { ...completeMeasurements, unknown: 1 } },
      },
      expectedError: "run manifest outcome measurements contains unknown field \"unknown\"",
    },
    {
      manifest: {
        ...validInput(),
        outcome: { status: "pass", oracle: { applied: true, reason: "checked", unknown: true } },
      },
      expectedError: "run manifest outcome oracle contains unknown field \"unknown\"",
    },
    {
      manifest: {
        ...validInput(),
        outcome: { status: "pass", oracle: { applied: false } },
      },
      expectedError: "run manifest outcome oracle reason must be a non-empty string",
    },
  ];

  for (const { manifest, expectedError } of cases) {
    assert.doesNotThrow(() => validateRunManifest(manifest));
    const validation = validateRunManifest(manifest);
    assert.equal(validation.valid, false);
    assert.ok(validation.errors.includes(expectedError));
  }
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

test("accepts exactly the fixed control and adaptive-repair-v1 pilot arms", () => {
  assert.deepEqual(POLICIES, ["fixed", "adaptive-repair-v1"]);
  const adaptive = buildRunManifest({ ...validInput(), policy: "adaptive-repair-v1" });
  assert.equal(adaptive.policy, "adaptive-repair-v1");
  assert.notEqual(adaptive.run_id, buildRunManifest(validInput()).run_id);

  for (const policy of ["kernel", "kernel-shadow", "adaptive", "", undefined]) {
    const validation = validateRunManifest({ ...buildRunManifest(validInput()), policy });
    assert.equal(validation.valid, false, String(policy));
    assert.ok(validation.errors.includes("run manifest policy must be one of fixed, adaptive-repair-v1"));
  }

  const schemaPath = resolve(__dirname, "../../../schemas/kernel/run-manifest/v1.schema.json");
  const schema = JSON.parse(readFileSync(schemaPath, "utf8"));
  assert.deepEqual(schema.properties.policy.enum, POLICIES);
});

test("keeps schema required fields synchronized with the module", () => {
  const schemaPath = resolve(__dirname, "../../../schemas/kernel/run-manifest/v1.schema.json");
  const schema = JSON.parse(readFileSync(schemaPath, "utf8"));

  assert.deepEqual(schema.required, REQUIRED_RUN_MANIFEST_FIELDS);
});
