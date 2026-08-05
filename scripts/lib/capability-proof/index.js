"use strict";

const { sha256Fingerprint } = require("../canonical-json.js");

const PROOF_DOMAIN = "capability-proof/v1";
const PROBE_DOMAIN = "capability-probe/v1";
const PROOF_KIND = "capability-proof/v1";

const REASON = Object.freeze({
  PROOF_MISSING: "proof-missing",
  PROOF_FIELD_MISSING: "proof-field-missing",
  EXPECTED_FIELD_MISSING: "expected-field-missing",
  FOREIGN_ADAPTER: "foreign-adapter",
  FOREIGN_ADAPTER_VERSION: "foreign-adapter-version",
  FOREIGN_HOST: "foreign-host",
  FIXTURE_DIGEST_NOT_LIVE_PROBE: "fixture-digest-not-live-probe",
  DIGEST_MISMATCH: "digest-mismatch",
  PROBE_DIGEST_MISMATCH: "probe-digest-mismatch",
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
 * Live probe digest — distinct domain from fixture evidence_digest.
 * @param {{capability_id:string, adapter_id:string, adapter_version:string, host_version:string, probe:*}} input
 * @returns {string}
 */
function createProbeDigest(input) {
  if (!input || typeof input !== "object") {
    const error = new Error("createProbeDigest requires an object");
    error.code = REASON.PROOF_FIELD_MISSING;
    throw error;
  }
  const { capability_id, adapter_id, adapter_version, host_version, probe } = input;
  for (const [key, value] of Object.entries({
    capability_id,
    adapter_id,
    adapter_version,
    host_version,
  })) {
    if (!nonEmptyString(value)) {
      const error = new Error(`missing or empty ${key}`);
      error.code = REASON.PROOF_FIELD_MISSING;
      error.path = `/${key}`;
      throw error;
    }
  }
  if (probe === undefined) {
    const error = new Error("missing probe");
    error.code = REASON.PROOF_FIELD_MISSING;
    error.path = "/probe";
    throw error;
  }
  return sha256Fingerprint(PROBE_DOMAIN, {
    capability_id,
    adapter_id,
    adapter_version,
    host_version,
    probe,
  });
}

/**
 * Object-form verify with required live expected identity + probe digest.
 * @param {{
 *   capabilityId:string,
 *   expectedAdapterId:string,
 *   expectedAdapterVersion:string,
 *   expectedHostRuntimeVersion:string,
 *   expectedProbeDigest:string,
 *   proof:object|null|undefined,
 *   evidence:*
 * }} opts
 * @returns {{ok:boolean, reason_code?:string, path?:string, evidence_digest?:string, probe_digest?:string}}
 */
function verifyCapabilityProof(opts) {
  if (opts == null || typeof opts !== "object" || Array.isArray(opts)) {
    return { ok: false, reason_code: REASON.EXPECTED_FIELD_MISSING, path: "/" };
  }

  const {
    capabilityId,
    expectedAdapterId,
    expectedAdapterVersion,
    expectedHostRuntimeVersion,
    expectedProbeDigest,
    proof,
    evidence: semanticEvidence,
  } = opts;

  if (!nonEmptyString(capabilityId)) {
    return { ok: false, reason_code: REASON.PROOF_FIELD_MISSING, path: "/capability_id" };
  }

  const expectedFields = [
    ["expectedAdapterId", expectedAdapterId],
    ["expectedAdapterVersion", expectedAdapterVersion],
    ["expectedHostRuntimeVersion", expectedHostRuntimeVersion],
    ["expectedProbeDigest", expectedProbeDigest],
  ];
  for (const [name, value] of expectedFields) {
    if (!nonEmptyString(value)) {
      return { ok: false, reason_code: REASON.EXPECTED_FIELD_MISSING, path: `/${name}` };
    }
  }

  if (proof == null || typeof proof !== "object" || Array.isArray(proof)) {
    return { ok: false, reason_code: REASON.PROOF_MISSING };
  }

  const required = [
    "adapter_id",
    "adapter_version",
    "host_version",
    "fixture",
    "evidence_digest",
    "probe_digest",
  ];
  for (const field of required) {
    if (!nonEmptyString(proof[field])) {
      return { ok: false, reason_code: REASON.PROOF_FIELD_MISSING, path: `/${field}` };
    }
  }

  if (proof.kind != null && proof.kind !== PROOF_KIND) {
    return { ok: false, reason_code: REASON.PROOF_VERIFICATION_FAILED, path: "/kind" };
  }

  if (proof.adapter_id !== expectedAdapterId) {
    return { ok: false, reason_code: REASON.FOREIGN_ADAPTER, path: "/adapter_id" };
  }
  if (proof.adapter_version !== expectedAdapterVersion) {
    return { ok: false, reason_code: REASON.FOREIGN_ADAPTER_VERSION, path: "/adapter_version" };
  }
  if (proof.host_version !== expectedHostRuntimeVersion) {
    return { ok: false, reason_code: REASON.FOREIGN_HOST, path: "/host_version" };
  }

  // Fixture digest must never substitute for the live probe digest.
  if (expectedProbeDigest === proof.evidence_digest) {
    return {
      ok: false,
      reason_code: REASON.FIXTURE_DIGEST_NOT_LIVE_PROBE,
      path: "/expectedProbeDigest",
    };
  }

  if (proof.probe_digest !== expectedProbeDigest) {
    return { ok: false, reason_code: REASON.PROBE_DIGEST_MISMATCH, path: "/probe_digest" };
  }

  let expectedEvidence;
  try {
    expectedEvidence = createEvidenceDigest({
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

  if (proof.evidence_digest !== expectedEvidence) {
    return { ok: false, reason_code: REASON.DIGEST_MISMATCH, path: "/evidence_digest" };
  }

  return {
    ok: true,
    evidence_digest: expectedEvidence,
    probe_digest: proof.probe_digest,
  };
}

/**
 * Enforcement eligibility: declaration alone is insufficient.
 * Promotion to enforced requires a verifying CapabilityProof with live bind.
 * @param {{
 *   capability_id:string,
 *   declared_state:string,
 *   proof?:object|null,
 *   semantic_evidence?:*,
 *   request_enforced?:boolean,
 *   expectedAdapterId?:string,
 *   expectedAdapterVersion?:string,
 *   expectedHostRuntimeVersion?:string,
 *   expectedProbeDigest?:string
 * }} input
 */
function evaluateEnforcementEligibility(input) {
  const capabilityId = input && input.capability_id;
  const declared = input && input.declared_state;
  if (!nonEmptyString(capabilityId)) {
    return { ok: false, enforced: false, reason_code: REASON.PROOF_FIELD_MISSING, path: "/capability_id" };
  }
  if (
    declared !== "enforced" &&
    declared !== "partial" &&
    declared !== "instructional" &&
    declared !== "unavailable"
  ) {
    return { ok: false, enforced: false, reason_code: "unknown-capability-state", path: "/declared_state" };
  }

  const wantsEnforced = input.request_enforced === true || declared === "enforced";
  if (!wantsEnforced) {
    return { ok: true, enforced: false, effective_state: declared };
  }

  const verification = verifyCapabilityProof({
    capabilityId,
    expectedAdapterId: input.expectedAdapterId,
    expectedAdapterVersion: input.expectedAdapterVersion,
    expectedHostRuntimeVersion: input.expectedHostRuntimeVersion,
    expectedProbeDigest: input.expectedProbeDigest,
    proof: input.proof,
    evidence: input.semantic_evidence,
  });
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
    probe_digest: verification.probe_digest,
  };
}

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
  PROBE_DOMAIN,
  PROOF_KIND,
  REASON,
  createEvidenceDigest,
  createProbeDigest,
  verifyCapabilityProof,
  evaluateEnforcementEligibility,
  selectEnforcementFailureReason,
};
