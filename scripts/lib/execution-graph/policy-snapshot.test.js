"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const { validateInstance, loadSchemaById } = require("../kernel-schema-validator.js");
const {
  createPolicySnapshot,
  computePolicySnapshotDigest,
} = require("./policy-snapshot.js");

const ROOT = path.resolve(__dirname, "..", "..", "..");

test("PolicySnapshot: generates valid schema instance and deterministic SHA-256 digest", () => {
  const snapshot = createPolicySnapshot({
    compilerVersion: "1.0.0",
    classifierVersion: "1.0.0",
    runtimeVersion: "1.0.0",
    effectiveRules: ["rule-fail-closed", "rule-must-evidence"],
  });

  assert.equal(snapshot.schema_version, 1);
  assert.equal(snapshot.compiler_version, "1.0.0");
  assert.equal(snapshot.classifier_version, "1.0.0");
  assert.equal(snapshot.runtime_version, "1.0.0");
  assert.deepEqual(snapshot.effective_rules, ["rule-fail-closed", "rule-must-evidence"]);
  assert.match(snapshot.policy_bundle_digest, /^sha256:[a-f0-9]{64}$/);
  assert.match(snapshot.snapshot_id, /^sha256:[a-f0-9]{64}$/);

  const schema = loadSchemaById("ospec://schemas/kernel/policy-snapshot/v1", { rootDir: ROOT });
  const validation = validateInstance(schema, snapshot);
  assert.equal(validation.valid, true, `PolicySnapshot must validate: ${JSON.stringify(validation.errors)}`);
});

test("PolicySnapshot: divergent effective rules produce distinct PolicySnapshot digests", () => {
  const snapshotA = createPolicySnapshot({
    compilerVersion: "1.0.0",
    classifierVersion: "1.0.0",
    runtimeVersion: "1.0.0",
    effectiveRules: ["rule-alpha", "rule-beta"],
  });

  const snapshotB = createPolicySnapshot({
    compilerVersion: "1.0.0",
    classifierVersion: "1.0.0",
    runtimeVersion: "1.0.0",
    effectiveRules: ["rule-alpha", "rule-gamma"],
  });

  assert.notEqual(snapshotA.snapshot_id, snapshotB.snapshot_id);
  assert.notEqual(snapshotA.policy_bundle_digest, snapshotB.policy_bundle_digest);
  assert.notEqual(computePolicySnapshotDigest(snapshotA), computePolicySnapshotDigest(snapshotB));
});

test("PolicySnapshot: divergent component versions produce distinct digests", () => {
  const snapshotA = createPolicySnapshot({
    compilerVersion: "1.0.0",
    classifierVersion: "1.0.0",
    runtimeVersion: "1.0.0",
    effectiveRules: ["rule-alpha"],
  });

  const snapshotB = createPolicySnapshot({
    compilerVersion: "1.1.0",
    classifierVersion: "1.0.0",
    runtimeVersion: "1.0.0",
    effectiveRules: ["rule-alpha"],
  });

  assert.notEqual(snapshotA.snapshot_id, snapshotB.snapshot_id);
});
