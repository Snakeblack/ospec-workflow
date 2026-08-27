"use strict";

const path = require("node:path");
const { sha256Fingerprint } = require("../canonical-json.js");
const { validateInstance, loadSchemaById } = require("../kernel-schema-validator.js");

const ASSESSMENT_V1_ID = "ospec://schemas/kernel/assessment/v1";
const DEFAULT_SCHEMA_ROOT = path.resolve(__dirname, "../../..");
const SHA256 = /^sha256:[a-f0-9]{64}$/;

let cachedAssessmentSchema = null;

function fail(reason_code, error) {
  return { ok: false, reason_code, error: error || reason_code };
}

function getAssessmentSchema() {
  if (!cachedAssessmentSchema) {
    cachedAssessmentSchema = loadSchemaById(ASSESSMENT_V1_ID, { rootDir: DEFAULT_SCHEMA_ROOT });
  }
  return cachedAssessmentSchema;
}

function canonicalizeEvidenceRequirements(value) {
  if (!Array.isArray(value) || value.some((token) => typeof token !== "string" || token.length === 0)) {
    return null;
  }
  return [...new Set(value)].sort();
}

function computeAssessmentId(fields) {
  const coverage = canonicalizeEvidenceRequirements(fields.evidence_requirements_satisfied) || [];
  return sha256Fingerprint("assessment/v1", {
    schema_version: fields.schema_version,
    kind: fields.kind,
    evidence_id: fields.evidence_id,
    role: fields.role,
    obligation_id: fields.obligation_id,
    node_id: fields.node_id,
    candidate_id: fields.candidate_id,
    policy_snapshot_id: fields.policy_snapshot_id,
    evidence_requirements_satisfied: coverage,
  });
}

function validateAssessment(record) {
  if (!record || typeof record !== "object") {
    return fail("INVALID_ASSESSMENT", "assessment must be an object");
  }
  if (Object.prototype.hasOwnProperty.call(record, "verdict")) {
    return fail("MIXED_ASSESSMENT_VERDICT", "assessment must not carry verdict");
  }
  const coverage = canonicalizeEvidenceRequirements(record.evidence_requirements_satisfied);
  if (!coverage) {
    return fail("INVALID_ASSESSMENT", "evidence_requirements_satisfied must be a string array");
  }
  const normalized = { ...record, evidence_requirements_satisfied: coverage };
  const validation = validateInstance(getAssessmentSchema(), normalized);
  if (!validation.valid) {
    return fail("INVALID_ASSESSMENT", validation.errors.map((e) => e.message).join("; "));
  }
  const expectedId = computeAssessmentId(normalized);
  if (normalized.assessment_id !== expectedId) {
    return fail("INVALID_ASSESSMENT", "assessment_id does not match canonical assessment fields");
  }
  return { ok: true, assessment: normalized };
}

/**
 * Emit an assessment/v1 binding. Verdict is forbidden.
 *
 * @param {object} input
 * @returns {{ ok: true, assessment: object } | { ok: false, reason_code: string, error?: string }}
 */
function emitAssessment(input) {
  if (!input || typeof input !== "object") {
    return fail("INVALID_ASSESSMENT", "assessment input must be an object");
  }
  if (Object.prototype.hasOwnProperty.call(input, "verdict")) {
    return fail("MIXED_ASSESSMENT_VERDICT", "assessment must not carry verdict");
  }

  const record = {
    schema_version: 1,
    kind: "assessment/v1",
    evidence_id: input.evidence_id,
    role: input.role,
    obligation_id: input.obligation_id,
    node_id: input.node_id,
    candidate_id: input.candidate_id,
    policy_snapshot_id: input.policy_snapshot_id,
    evidence_requirements_satisfied: canonicalizeEvidenceRequirements(input.evidence_requirements_satisfied),
  };
  if (!record.evidence_requirements_satisfied) {
    return fail("INVALID_ASSESSMENT", "evidence_requirements_satisfied must be a string array");
  }
  record.assessment_id = computeAssessmentId(record);

  if (!SHA256.test(record.assessment_id) || !SHA256.test(record.evidence_id) || !SHA256.test(record.candidate_id)) {
    return fail("INVALID_ASSESSMENT", "assessment digests must be sha256");
  }

  return validateAssessment(record);
}

module.exports = {
  canonicalizeEvidenceRequirements,
  computeAssessmentId,
  emitAssessment,
  validateAssessment,
};
