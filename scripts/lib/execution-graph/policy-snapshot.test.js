"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const { validateInstance, loadSchemaById } = require("../kernel-schema-validator.js");
const {
  createPolicySnapshot,
  computePolicySnapshotDigest,
  validatePolicySnapshotBinding,
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

test("PolicySnapshot: validatePolicySnapshotBinding validates intact snapshot successfully", () => {
  const snapshot = createPolicySnapshot({
    effectiveRules: ["rule-a", "rule-b"],
  });
  const res = validatePolicySnapshotBinding(snapshot);
  assert.equal(res.ok, true);
});

test("PolicySnapshot: validatePolicySnapshotBinding rejects forged snapshot_id with POLICY_SNAPSHOT_MISMATCH", () => {
  const snapshot = createPolicySnapshot({
    effectiveRules: ["rule-a", "rule-b"],
  });
  snapshot.snapshot_id = "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
  const res = validatePolicySnapshotBinding(snapshot);
  assert.equal(res.ok, false);
  assert.equal(res.reason_code, "POLICY_SNAPSHOT_MISMATCH");
});

test("PolicySnapshot: validatePolicySnapshotBinding rejects malformed snapshot_id with ILL_FORMED_SNAPSHOT_ID", () => {
  const snapshot = createPolicySnapshot({
    effectiveRules: ["rule-a"],
  });
  snapshot.snapshot_id = "malformed-id";
  const res = validatePolicySnapshotBinding(snapshot);
  assert.equal(res.ok, false);
  assert.equal(res.reason_code, "ILL_FORMED_SNAPSHOT_ID");
});

test("PolicySnapshot: validatePolicySnapshotBinding rejects non-object or null with INVALID_PAYLOAD", () => {
  assert.equal(validatePolicySnapshotBinding(null).reason_code, "INVALID_PAYLOAD");
  assert.equal(validatePolicySnapshotBinding("not-an-object").reason_code, "INVALID_PAYLOAD");
  assert.equal(validatePolicySnapshotBinding(undefined).reason_code, "INVALID_PAYLOAD");
});

test("PolicySnapshot: validatePolicySnapshotBinding rejects missing schema fields with INVALID_SCHEMA", () => {
  const invalid = {
    schema_version: 1,
    snapshot_id: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    // missing policy_bundle_digest, effective_rules, etc.
  };
  const res = validatePolicySnapshotBinding(invalid);
  assert.equal(res.ok, false);
  assert.equal(res.reason_code, "INVALID_SCHEMA");
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
