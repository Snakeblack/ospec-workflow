"use strict";

// Dependency-free validator/extractor for the strict `json:result-envelope` fence
// defined in skills/_shared/sdd-phase-common.md §D. Mirrored byte-for-byte in Go
// by internal/resultenvelope (see decisions/adr-003.md). Never throws — every
// public function degrades to a safe, structured result on malformed input.

const STATUS_ENUM = new Set(["success", "partial", "blocked"]);
const REVERSIBILITY_ENUM = new Set(["low", "high"]);
const BLOCKER_TYPE_ENUM = new Set([
  "needs_user_decision",
  "design-mismatch",
  "spec-change-required",
  "workload-escalation",
]);
const REQUIRED_FIELDS = [
  "status",
  "executive_summary",
  "artifacts",
  "next_recommended",
  "risks",
  "skill_resolution",
];
const ASSUMPTION_REQUIRED_FIELDS = ["id", "phase", "statement", "reversibility", "basis"];

const FENCE_RE = /```json:result-envelope\r?\n([\s\S]*?)```/;

/**
 * Locates the strict `json:result-envelope` fenced block inside arbitrary text
 * and attempts to JSON.parse its content. Never throws.
 *
 * @param {*} text - typically the phase agent's full return text
 * @returns {{found: boolean, raw?: string, value?: (object|null)}}
 *   - found:false            -> no fence present at all
 *   - found:true, value:null -> fence present but its content is not valid JSON
 *   - found:true, value:{}   -> fence present and parsed successfully
 */
function extractEnvelope(text) {
  if (typeof text !== "string") {
    return { found: false };
  }

  const match = text.match(FENCE_RE);

  if (!match) {
    return { found: false };
  }

  const raw = match[1];

  try {
    return { found: true, raw, value: JSON.parse(raw) };
  } catch {
    return { found: true, raw, value: null };
  }
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isArtifactsValid(value) {
  return value === "inline" || Array.isArray(value);
}

function isRisksValid(value) {
  return isNonEmptyString(value) || Array.isArray(value);
}

function validateAssumptionEntry(entry, index, errors) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    errors.push(`assumptions[${index}] must be an object`);
    return;
  }

  for (const field of ASSUMPTION_REQUIRED_FIELDS) {
    if (!isNonEmptyString(entry[field])) {
      errors.push(`assumptions[${index}].${field} must be a non-empty string`);
    }
  }

  if (
    Object.prototype.hasOwnProperty.call(entry, "reversibility") &&
    isNonEmptyString(entry.reversibility) &&
    !REVERSIBILITY_ENUM.has(entry.reversibility)
  ) {
    errors.push(
      `assumptions[${index}].reversibility must be one of: ${[...REVERSIBILITY_ENUM].join(", ")}`,
    );
  }
}

/**
 * Validates a parsed envelope object against the canonical §D schema. Never throws.
 *
 * @param {*} obj
 * @returns {{valid: boolean, errors: string[]}}
 */
function validateEnvelope(obj) {
  const errors = [];

  if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
    return { valid: false, errors: ["envelope must be a JSON object"] };
  }

  for (const field of REQUIRED_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(obj, field)) {
      errors.push(`missing required field: ${field}`);
    }
  }

  if (Object.prototype.hasOwnProperty.call(obj, "status")) {
    if (!STATUS_ENUM.has(obj.status)) {
      errors.push(`status must be one of: ${[...STATUS_ENUM].join(", ")}`);
    }
  }

  if (
    Object.prototype.hasOwnProperty.call(obj, "executive_summary") &&
    !isNonEmptyString(obj.executive_summary)
  ) {
    errors.push("executive_summary must be a non-empty string");
  }

  if (
    Object.prototype.hasOwnProperty.call(obj, "artifacts") &&
    !isArtifactsValid(obj.artifacts)
  ) {
    errors.push('artifacts must be an array of paths or the literal string "inline"');
  }

  if (
    Object.prototype.hasOwnProperty.call(obj, "next_recommended") &&
    !isNonEmptyString(obj.next_recommended)
  ) {
    errors.push("next_recommended must be a non-empty string");
  }

  if (Object.prototype.hasOwnProperty.call(obj, "risks") && !isRisksValid(obj.risks)) {
    errors.push("risks must be a non-empty string or an array");
  }

  if (
    Object.prototype.hasOwnProperty.call(obj, "skill_resolution") &&
    !isNonEmptyString(obj.skill_resolution)
  ) {
    errors.push("skill_resolution must be a non-empty string");
  }

  if (
    Object.prototype.hasOwnProperty.call(obj, "blocker_type") &&
    !BLOCKER_TYPE_ENUM.has(obj.blocker_type)
  ) {
    errors.push(`blocker_type must be one of: ${[...BLOCKER_TYPE_ENUM].join(", ")}`);
  }

  if (obj.status === "blocked" && !obj.question_gate) {
    errors.push("question_gate is required when status is blocked");
  }

  if (Object.prototype.hasOwnProperty.call(obj, "assumptions")) {
    if (!Array.isArray(obj.assumptions)) {
      errors.push("assumptions must be an array");
    } else {
      obj.assumptions.forEach((entry, index) => validateAssumptionEntry(entry, index, errors));
    }
  }

  return { valid: errors.length === 0, errors };
}

module.exports = {
  extractEnvelope,
  validateEnvelope,
};
