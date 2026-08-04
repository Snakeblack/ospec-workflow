"use strict";

const { sha256Fingerprint } = require("../canonical-json.js");

const PROOF_DOMAIN = "capability-proof/v1";
const PROOF_KIND = "capability-proof/v1";

const REASON = Object.freeze({
  PROOF_MISSING: "proof-missing",
  PROOF_FIELD_MISSING: "proof-field-missing",
  DIGEST_MISMATCH: "digest-mismatch",
  PROOF_VERIFICATION_FAILED: "proof-verification-failed",
  SILENT_PROMOTION_REFUSED: "silent-promotion-refused",
});

function nonEmptyString(value) {
  return typeof value === "string" && value.trim() !== "";
}

/**
 * @param {{capability_id:string, adapter_version:string, host_version:string, fixture:string, evidence:*}} input
 * @returns {string}
 */
function createEvidenceDigest(input) {
  if (!input || typeof input !== "object") {
    const error = new Error("createEvidenceDigest requires an object");
    error.code = REASON.PROOF_FIELD_MISSING;
    throw error;
  }
  const { capability_id, adapter_version, host_version, fixture, evidence } = input;
  for (const [key, value] of Object.entries({
    capability_id,
    adapter_version,
    host_version,
    fixture,
  })) {
    if (!nonEmptyString(value)) {
      const error = new Error(`missing or empty ${key}`);
      error.code = REASON.PROOF_FIELD_MISSING;
      error.path = `/${key}`;
      throw error;
    }
  }
  if (evidence === undefined) {
    const error = new Error("missing evidence");
    error.code = REASON.PROOF_FIELD_MISSING;
    error.path = "/evidence";
    throw error;
  }
  // Volatile timestamps must not appear in digest inputs (caller responsibility;
  // we reject common timestamp keys if present on a plain object evidence payload).
  if (evidence !== null && typeof evidence === "object" && !Array.isArray(evidence)) {
    for (const banned of ["timestamp", "created_at", "updated_at", "now", "wall_clock"]) {
      if (Object.prototype.hasOwnProperty.call(evidence, banned)) {
        const error = new Error(`volatile field "${banned}" forbidden in evidence digest inputs`);
        error.code = REASON.PROOF_VERIFICATION_FAILED;
        error.path = `/evidence/${banned}`;
        throw error;
      }
    }
  }
  return sha256Fingerprint(PROOF_DOMAIN, {
    capability_id,
    adapter_version,
    host_version,
    fixture,
    evidence,
  });
}

/**
 * @param {string} capabilityId
 * @param {object|null|undefined} proof
 * @param {*} semanticEvidence
 * @returns {{ok:boolean, reason_code?:string, path?:string, evidence_digest?:string}}
 */
function verifyCapabilityProof(capabilityId, proof, semanticEvidence) {
  if (!nonEmptyString(capabilityId)) {
    return { ok: false, reason_code: REASON.PROOF_FIELD_MISSING, path: "/capability_id" };
  }
  if (proof == null || typeof proof !== "object" || Array.isArray(proof)) {
    return { ok: false, reason_code: REASON.PROOF_MISSING };
  }

  const required = ["adapter_version", "host_version", "fixture", "evidence_digest"];
  for (const field of required) {
    if (!nonEmptyString(proof[field])) {
      return { ok: false, reason_code: REASON.PROOF_FIELD_MISSING, path: `/${field}` };
    }
  }

  if (proof.kind != null && proof.kind !== PROOF_KIND) {
    return { ok: false, reason_code: REASON.PROOF_VERIFICATION_FAILED, path: "/kind" };
  }

  let expected;
  try {
    expected = createEvidenceDigest({
      capability_id: capabilityId,
      adapter_version: proof.adapter_version,
      host_version: proof.host_version,
      fixture: proof.fixture,
      evidence: semanticEvidence,
    });
  } catch (err) {
    return {
      ok: false,
      reason_code: err.code || REASON.PROOF_VERIFICATION_FAILED,
      path: err.path,
    };
  }

  if (proof.evidence_digest !== expected) {
    return { ok: false, reason_code: REASON.DIGEST_MISMATCH, path: "/evidence_digest" };
  }

  return { ok: true, evidence_digest: expected };
}

/**
 * Enforcement eligibility: declaration alone is insufficient.
 * Promotion to enforced requires a verifying CapabilityProof.
 * @param {{capability_id:string, declared_state:string, proof?:object|null, semantic_evidence?:*, request_enforced?:boolean}} input
 */
function evaluateEnforcementEligibility(input) {
  const capabilityId = input && input.capability_id;
  const declared = input && input.declared_state;
  if (!nonEmptyString(capabilityId)) {
    return { ok: false, enforced: false, reason_code: REASON.PROOF_FIELD_MISSING, path: "/capability_id" };
  }
  if (declared !== "enforced" && declared !== "partial" && declared !== "instructional" && declared !== "unavailable") {
    return { ok: false, enforced: false, reason_code: "unknown-capability-state", path: "/declared_state" };
  }

  const wantsEnforced = input.request_enforced === true || declared === "enforced";
  if (!wantsEnforced) {
    return { ok: true, enforced: false, effective_state: declared };
  }

  const verification = verifyCapabilityProof(capabilityId, input.proof, input.semantic_evidence);
  if (!verification.ok) {
    return {
      ok: false,
      enforced: false,
      effective_state: declared === "enforced" ? "unavailable" : declared,
      reason_code: selectEnforcementFailureReason(
        declared,
        input.request_enforced === true,
        verification.reason_code
      ),
      path: verification.path,
    };
  }

  return {
    ok: true,
    enforced: true,
    effective_state: "enforced",
    evidence_digest: verification.evidence_digest,
  };
}

/**
 * Select reason_code for failed enforcement.
 * Matrix declared × request_enforced × proof.reason:
 * - not requesting enforced → silent-promotion-refused
 * - proof-missing → proof-missing (always when wants enforced)
 * - declared !== enforced (promotion attempt) → silent-promotion-refused
 * - declared === enforced → underlying verification.reason_code
 */
function selectEnforcementFailureReason(declared, requestEnforced, verificationReason) {
  const wantsEnforced = requestEnforced === true || declared === "enforced";
  if (!wantsEnforced) {
    return REASON.SILENT_PROMOTION_REFUSED;
  }
  if (verificationReason === REASON.PROOF_MISSING) {
    return REASON.PROOF_MISSING;
  }
  if (declared !== "enforced") {
    return REASON.SILENT_PROMOTION_REFUSED;
  }
  return verificationReason;
}

module.exports = {
  PROOF_DOMAIN,
  PROOF_KIND,
  REASON,
  createEvidenceDigest,
  verifyCapabilityProof,
  evaluateEnforcementEligibility,
  selectEnforcementFailureReason,
};
