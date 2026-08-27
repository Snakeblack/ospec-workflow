"use strict";

const path = require("node:path");
const { sha256Fingerprint } = require("../canonical-json.js");
const { validateInstance, loadSchemaById } = require("../kernel-schema-validator.js");

const VERIFICATION_V2_ID = "ospec://schemas/kernel/verification/v2";
const DEFAULT_SCHEMA_ROOT = path.resolve(__dirname, "../../..");

let cachedVerificationSchema = null;

function getVerificationSchema() {
  if (!cachedVerificationSchema) {
    cachedVerificationSchema = loadSchemaById(VERIFICATION_V2_ID, { rootDir: DEFAULT_SCHEMA_ROOT });
  }
  return cachedVerificationSchema;
}

function computeVerificationId(candidateId, verdict, evidenceIds) {
  const unique = [...new Set(evidenceIds)].sort();
  return sha256Fingerprint("verification/v2", {
    candidate_id: candidateId,
    verdict,
    evidence_ids: unique,
  });
}

/**
 * Emit a verification/v2 record distinct from evidence.
 *
 * @param {{ candidateId: string, evidenceIds: string[], verdict: string }} input
 * @returns {object}
 */
function emitVerification({ candidateId, evidenceIds, verdict }) {
  const unique = [...new Set(evidenceIds || [])].sort();
  const record = {
    schema_version: 2,
    kind: "verification/v2",
    verification_id: computeVerificationId(candidateId, verdict, unique),
    candidate_id: candidateId,
    verdict,
    evidence_ids: unique,
  };
  const validation = validateInstance(getVerificationSchema(), record);
  if (!validation.valid) {
    const err = new Error(`verification/v2 invalid: ${validation.errors.map((e) => e.message).join("; ")}`);
    err.reason_code = "INVALID_VERIFICATION";
    throw err;
  }
  return record;
}

module.exports = {
  computeVerificationId,
  emitVerification,
};
