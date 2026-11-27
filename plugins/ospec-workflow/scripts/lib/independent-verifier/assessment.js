"use strict";

const path = require("node:path");
const { sha256Fingerprint } = require("../canonical-json.js");
const { validateInstance, loadSchemaById } = require("../kernel-schema-validator.js");

const ASSESSMENT_V1_ID = "ospec://schemas/kernel/assessment/v1";
const ASSESSMENT_V2_ID = "ospec://schemas/kernel/assessment/v2";
const DEFAULT_SCHEMA_ROOT = path.resolve(__dirname, "../../..");
const SHA256 = /^sha256:[a-f0-9]{64}$/;

const CANONICAL_ROLES = Object.freeze([
  "red",
  "green",
  "characterization-before",
  "characterization-after",
  "negative",
  "acceptance",
  "integration",
  "invariant",
  "smoke",
  "rollback",
  "dry-run",
]);

const ROLE_CANONICAL_MAP = Object.freeze({
  invariants: "invariant",
  contract: "integration",
  "no-behavior-change": "invariant",
  incompatibility: "negative",
  "idempotent-re-run": "invariant",
  "schema-parser": "integration",
  install: "integration",
  consume: "acceptance",
  "docs-only": "smoke",
  patch: "integration",
  annotation: "acceptance",
});

let cachedAssessmentV1Schema = null;
let cachedAssessmentV2Schema = null;

function fail(reason_code, error) {
  return { ok: false, reason_code, error: error || reason_code };
}

function getAssessmentSchema(version = 2) {
  if (version === 1) {
    if (!cachedAssessmentV1Schema) {
      cachedAssessmentV1Schema = loadSchemaById(ASSESSMENT_V1_ID, { rootDir: DEFAULT_SCHEMA_ROOT });
    }
    return cachedAssessmentV1Schema;
  }
  if (!cachedAssessmentV2Schema) {
    cachedAssessmentV2Schema = loadSchemaById(ASSESSMENT_V2_ID, { rootDir: DEFAULT_SCHEMA_ROOT });
  }
  return cachedAssessmentV2Schema;
}

function normalizeRole(role) {
  if (typeof role !== "string") return role;
  return ROLE_CANONICAL_MAP[role] || role;
}

function canonicalizeEvidenceRequirements(value) {
  if (!Array.isArray(value) || value.some((token) => typeof token !== "string" || token.length === 0)) {
    return null;
  }
  return [...new Set(value)].sort();
}

function computeAssessmentId(fields) {
  const version = fields && fields.schema_version === 1 ? 1 : 2;
  const kind = version === 1 ? "assessment/v1" : "assessment/v2";
  const role = normalizeRole(fields && fields.role);
  const coverage = canonicalizeEvidenceRequirements(fields && fields.evidence_requirements_satisfied) || [];
  const payload = {
    schema_version: version,
    kind,
    evidence_id: fields && fields.evidence_id,
    role,
    obligation_id: fields && fields.obligation_id,
    node_id: fields && fields.node_id,
    candidate_id: fields && fields.candidate_id,
    policy_snapshot_id: fields && fields.policy_snapshot_id,
  };
  if (version === 2 || (fields && fields.evidence_requirements_satisfied !== undefined)) {
    payload.evidence_requirements_satisfied = coverage;
  }
  return sha256Fingerprint(kind, payload);
}

function validateAssessment(record) {
  if (!record || typeof record !== "object") {
    return fail("INVALID_ASSESSMENT", "assessment must be an object");
  }
  if (Object.prototype.hasOwnProperty.call(record, "verdict")) {
    return fail("MIXED_ASSESSMENT_VERDICT", "assessment must not carry verdict");
  }
  const version = record.schema_version === 1 || record.kind === "assessment/v1" ? 1 : 2;
  const role = normalizeRole(record.role);

  if (version === 2) {
    const coverage = canonicalizeEvidenceRequirements(record.evidence_requirements_satisfied);
    if (!coverage || coverage.length === 0) {
      return fail("INVALID_ASSESSMENT", "evidence_requirements_satisfied must have at least one token for assessment/v2");
    }
    const normalized = { ...record, role, evidence_requirements_satisfied: coverage };
    const validation = validateInstance(getAssessmentSchema(2), normalized);
    if (!validation.valid) {
      return fail("INVALID_ASSESSMENT", validation.errors.map((e) => e.message).join("; "));
    }
    const expectedId = computeAssessmentId(normalized);
    if (normalized.assessment_id !== expectedId) {
      return fail("INVALID_ASSESSMENT", "assessment_id does not match canonical assessment fields");
    }
    return { ok: true, assessment: normalized };
  }

  // Version 1 validation
  const normalized = { ...record, role };
  const validation = validateInstance(getAssessmentSchema(1), normalized);
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
 * Emit an assessment/v2 binding (or v1 when schema_version 1 is requested). Verdict is forbidden.
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

  const version = input.schema_version === 1 || input.kind === "assessment/v1" ? 1 : 2;
  const role = normalizeRole(input.role);

  if (version === 2) {
    const coverage = canonicalizeEvidenceRequirements(input.evidence_requirements_satisfied);
    if (!coverage || coverage.length === 0) {
      return fail("INVALID_ASSESSMENT", "evidence_requirements_satisfied must have at least one token for assessment/v2");
    }
    const record = {
      schema_version: 2,
      kind: "assessment/v2",
      evidence_id: input.evidence_id,
      role,
      obligation_id: input.obligation_id,
      node_id: input.node_id,
      candidate_id: input.candidate_id,
      policy_snapshot_id: input.policy_snapshot_id,
      evidence_requirements_satisfied: coverage,
    };
    record.assessment_id = computeAssessmentId(record);

    if (!SHA256.test(record.assessment_id) || !SHA256.test(record.evidence_id) || !SHA256.test(record.candidate_id)) {
      return fail("INVALID_ASSESSMENT", "assessment digests must be sha256");
    }

    return validateAssessment(record);
  }

  // Version 1 emission
  const record = {
    schema_version: 1,
    kind: "assessment/v1",
    evidence_id: input.evidence_id,
    role,
    obligation_id: input.obligation_id,
    node_id: input.node_id,
    candidate_id: input.candidate_id,
    policy_snapshot_id: input.policy_snapshot_id,
  };
  record.assessment_id = computeAssessmentId(record);

  if (!SHA256.test(record.assessment_id) || !SHA256.test(record.evidence_id) || !SHA256.test(record.candidate_id)) {
    return fail("INVALID_ASSESSMENT", "assessment digests must be sha256");
  }

  return validateAssessment(record);
}

module.exports = {
  CANONICAL_ROLES,
  canonicalizeEvidenceRequirements,
  computeAssessmentId,
  emitAssessment,
  validateAssessment,
  normalizeRole,
};
