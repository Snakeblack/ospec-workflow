"use strict";

const path = require("node:path");
const { sha256Fingerprint } = require("../canonical-json.js");
const { validateInstance, loadSchemaById } = require("../kernel-schema-validator.js");

const SHA256_REGEX = /^sha256:[a-f0-9]{64}$/;
const POLICY_SNAPSHOT_V1_SCHEMA_ID = "ospec://schemas/kernel/policy-snapshot/v1";
const DEFAULT_SCHEMA_ROOT = path.resolve(__dirname, "../../..");

let cachedPolicySnapshotV1Schema = null;
function getPolicySnapshotV1Schema() {
  if (!cachedPolicySnapshotV1Schema) {
    cachedPolicySnapshotV1Schema = loadSchemaById(POLICY_SNAPSHOT_V1_SCHEMA_ID, {
      rootDir: DEFAULT_SCHEMA_ROOT,
    });
  }
  return cachedPolicySnapshotV1Schema;
}

const DEFAULT_VERSIONS = Object.freeze({
  compiler_version: "1.0.0",
  classifier_version: "1.0.0",
  runtime_version: "1.0.0",
});

/**
 * Computes deterministic PolicySnapshot digest.
 * @param {Object} snapshot
 * @returns {string} sha256:<64 hex>
 */
function computePolicySnapshotDigest(snapshot) {
  if (!snapshot || typeof snapshot !== "object") {
    throw new TypeError("snapshot must be an object");
  }

  const payload = {
    compiler_version: String(snapshot.compiler_version || DEFAULT_VERSIONS.compiler_version),
    classifier_version: String(snapshot.classifier_version || DEFAULT_VERSIONS.classifier_version),
    runtime_version: String(snapshot.runtime_version || DEFAULT_VERSIONS.runtime_version),
    policy_bundle_digest: String(snapshot.policy_bundle_digest || ""),
    effective_rules: Array.isArray(snapshot.effective_rules) ? [...snapshot.effective_rules].map(String) : [],
  };

  return sha256Fingerprint("policy-snapshot/v1", payload);
}

/**
 * Generates a PolicySnapshot with calculated effective rules and cryptographic digest.
 * @param {Object} [params]
 * @param {string} [params.policyBundleDigest]
 * @param {string} [params.compilerVersion]
 * @param {string} [params.classifierVersion]
 * @param {string} [params.runtimeVersion]
 * @param {string[]} [params.effectiveRules]
 * @returns {Object} PolicySnapshot instance conforming to ospec://schemas/kernel/policy-snapshot/v1
 */
function createPolicySnapshot(params = {}) {
  const compilerVersion = params.compilerVersion || params.compiler_version || DEFAULT_VERSIONS.compiler_version;
  const classifierVersion = params.classifierVersion || params.classifier_version || DEFAULT_VERSIONS.classifier_version;
  const runtimeVersion = params.runtimeVersion || params.runtime_version || DEFAULT_VERSIONS.runtime_version;
  const effectiveRules = Array.isArray(params.effectiveRules)
    ? [...params.effectiveRules]
    : Array.isArray(params.effective_rules)
      ? [...params.effective_rules]
      : [];

  const policyBundleDigest =
    params.policyBundleDigest ||
    params.policy_bundle_digest ||
    sha256Fingerprint("policy-bundle/v1", effectiveRules);

  const draft = {
    schema_version: 1,
    snapshot_id: "",
    policy_bundle_digest: policyBundleDigest,
    compiler_version: compilerVersion,
    classifier_version: classifierVersion,
    runtime_version: runtimeVersion,
    effective_rules: effectiveRules,
  };

  draft.snapshot_id = computePolicySnapshotDigest(draft);
  return draft;
}

/**
 * Validates cryptographic binding and schema of a PolicySnapshot record.
 * @param {Object} snapshot
 * @returns {{ ok: boolean, reason_code?: string, error?: string }}
 */
function validatePolicySnapshotBinding(snapshot) {
  if (!snapshot || typeof snapshot !== "object") {
    return { ok: false, reason_code: "INVALID_PAYLOAD", error: "PolicySnapshot must be a non-null object" };
  }
  let validation;
  try {
    validation = validateInstance(getPolicySnapshotV1Schema(), snapshot);
  } catch (err) {
    return { ok: false, reason_code: "INVALID_SCHEMA", error: err.message };
  }
  if (!validation.valid) {
    return { ok: false, reason_code: "INVALID_SCHEMA", error: validation.errors.map((e) => e.message).join("; ") };
  }
  if (typeof snapshot.snapshot_id !== "string" || !SHA256_REGEX.test(snapshot.snapshot_id)) {
    return { ok: false, reason_code: "ILL_FORMED_SNAPSHOT_ID", error: "snapshot_id must match sha256:<64 hex>" };
  }
  let expectedSnapshotId;
  try {
    expectedSnapshotId = computePolicySnapshotDigest(snapshot);
  } catch (err) {
    return { ok: false, reason_code: "POLICY_SNAPSHOT_MISMATCH", error: err.message };
  }
  if (snapshot.snapshot_id !== expectedSnapshotId) {
    return {
      ok: false,
      reason_code: "POLICY_SNAPSHOT_MISMATCH",
      error: `PolicySnapshot digest mismatch: declared ${snapshot.snapshot_id}, expected ${expectedSnapshotId}`,
    };
  }
  return { ok: true };
}

module.exports = {
  createPolicySnapshot,
  computePolicySnapshotDigest,
  validatePolicySnapshotBinding,
  DEFAULT_VERSIONS,
};
