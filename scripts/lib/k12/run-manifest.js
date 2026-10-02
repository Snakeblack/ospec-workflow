"use strict";

const { createHash } = require("node:crypto");

const REQUIRED_RUN_MANIFEST_FIELDS = Object.freeze([
  "schema_version",
  "run_id",
  "cohort_id",
  "fixture_id",
  "stratum",
  "policy",
  "repetition_index",
  "repetitions_total",
  "order_seed",
  "worktree_path",
  "cache_namespace",
  "evaluator",
  "host",
  "catalog_digest",
  "outcome",
  "versions",
]);
const ALLOWED_TOP_LEVEL_KEYS = new Set([...REQUIRED_RUN_MANIFEST_FIELDS, "started_at", "completed_at"]);
const STRATA = new Set(["local-reversible", "behavior-repair", "multi-module", "adversarial"]);
// `fixed` is the control arm; `adaptive-repair-v1` is the fixed Adaptive Repair
// pilot arm. Recording an arm grants it no authority and changes no default.
const POLICIES = Object.freeze(["fixed", "adaptive-repair-v1"]);
const OUTCOME_STATUSES = new Set(["pass", "fail", "incomplete", "excluded"]);
const MEASUREMENT_FIELDS = [
  "phases_executed",
  "effects_executed",
  "events_recorded",
  "wall_ms",
  "interruptions",
  "recoveries",
];
const ORACLE_FIELDS = ["applied", "reason"];
const DEFECT_FIELDS = ["seeded", "detected", "escaped"];
const OUTCOME_FIELDS = new Set(["status", "note", "measurements", "oracle", "defects"]);
const CATALOG_DIGEST_PATTERN = /^[a-f0-9]{64}$/;
const RFC3339_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

class RunManifestError extends Error {
  constructor(message, code = "INVALID_RUN_MANIFEST") {
    super(message);
    this.name = "RunManifestError";
    this.code = code;
  }
}

function isPlainObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim() !== "";
}

function isIntegerAtLeast(value, minimum) {
  return Number.isInteger(value) && value >= minimum;
}

// Seeded-defect tally for one run: every seeded variant is either detected
// (the pipeline rejected it) or escaped (listed by id).
function defectErrors(defects) {
  if (!isPlainObject(defects)) return ["run manifest outcome defects must be an object"];
  const errors = [];
  for (const key of Object.keys(defects)) {
    if (!DEFECT_FIELDS.includes(key)) errors.push(`run manifest outcome defects contains unknown field "${key}"`);
  }
  for (const field of ["seeded", "detected"]) {
    if (!isIntegerAtLeast(defects[field], 0)) {
      errors.push(`run manifest outcome defects ${field} must be an integer greater than or equal to 0`);
    }
  }
  const { escaped } = defects;
  const escapedValid = Array.isArray(escaped) && escaped.every(isNonEmptyString)
    && new Set(escaped).size === escaped.length;
  if (!escapedValid) {
    errors.push("run manifest outcome defects escaped must be an array of unique non-empty strings");
  } else if (errors.length === 0 && defects.detected + escaped.length !== defects.seeded) {
    errors.push("run manifest outcome defects detected plus escaped must equal seeded");
  }
  return errors;
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  if (isPlainObject(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

function cloneValue(value) {
  if (Array.isArray(value)) return value.map((item) => cloneValue(item));
  if (isPlainObject(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneValue(item)]));
  }
  return value;
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value).forEach((item) => deepFreeze(item));
    Object.freeze(value);
  }
  return value;
}

function isValidRfc3339(value) {
  if (typeof value !== "string") return false;
  const match = RFC3339_PATTERN.exec(value);
  if (!match) return false;

  const [, yearText, monthText, dayText, hourText, minuteText, secondText, offset] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const offsetHour = offset === "Z" ? 0 : Number(offset.slice(1, 3));
  const offsetMinute = offset === "Z" ? 0 : Number(offset.slice(4, 6));
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();

  return month >= 1 && month <= 12
    && day >= 1 && day <= daysInMonth
    && hour <= 23
    && minute <= 59
    && second <= 60
    && offsetHour <= 23
    && offsetMinute <= 59
    && !Number.isNaN(Date.parse(value));
}

function containsTraversal(pathValue) {
  return pathValue.split(/[\\/]+/).some((segment) => segment === "..");
}

function validateRunManifestInternal(manifest, allowMissingRunId) {
  const errors = [];
  if (!isPlainObject(manifest)) {
    return ["run manifest must be a non-null object"];
  }

  for (const key of Object.keys(manifest)) {
    if (!ALLOWED_TOP_LEVEL_KEYS.has(key)) errors.push(`run manifest contains unknown field "${key}"`);
  }
  for (const field of REQUIRED_RUN_MANIFEST_FIELDS) {
    if (allowMissingRunId && field === "run_id" && !Object.hasOwn(manifest, field)) continue;
    if (!Object.hasOwn(manifest, field)) errors.push(`run manifest ${field} is required`);
  }

  if (manifest.schema_version !== 1) errors.push("run manifest schema_version must be 1");
  for (const field of [
    "run_id",
    "cohort_id",
    "fixture_id",
    "order_seed",
    "worktree_path",
    "cache_namespace",
    "evaluator",
    "host",
  ]) {
    if ((field !== "run_id" || Object.hasOwn(manifest, field) || !allowMissingRunId)
      && !isNonEmptyString(manifest[field])) {
      errors.push(`run manifest ${field} must be a non-empty string`);
    }
  }
  if (!STRATA.has(manifest.stratum)) errors.push("run manifest stratum is invalid");
  if (!POLICIES.includes(manifest.policy)) errors.push(`run manifest policy must be one of ${POLICIES.join(", ")}`);
  if (!isIntegerAtLeast(manifest.repetition_index, 0)) {
    errors.push("run manifest repetition_index must be an integer greater than or equal to 0");
  }
  if (!isIntegerAtLeast(manifest.repetitions_total, 1)) {
    errors.push("run manifest repetitions_total must be an integer greater than or equal to 1");
  }
  if (Number.isInteger(manifest.repetition_index) && Number.isInteger(manifest.repetitions_total)
    && manifest.repetition_index >= manifest.repetitions_total) {
    errors.push("run manifest repetition_index must be less than repetitions_total");
  }
  if (isNonEmptyString(manifest.worktree_path) && containsTraversal(manifest.worktree_path)) {
    errors.push("run manifest worktree_path must not contain '..' traversal segments");
  }
  if (typeof manifest.catalog_digest !== "string" || !CATALOG_DIGEST_PATTERN.test(manifest.catalog_digest)) {
    errors.push("run manifest catalog_digest must be 64 lowercase hexadecimal characters");
  }

  for (const field of ["started_at", "completed_at"]) {
    if (manifest[field] !== undefined && !isValidRfc3339(manifest[field])) {
      errors.push(`run manifest ${field} must be an RFC3339 timestamp`);
    }
  }
  if (isValidRfc3339(manifest.started_at) && isValidRfc3339(manifest.completed_at)
    && Date.parse(manifest.completed_at) < Date.parse(manifest.started_at)) {
    errors.push("run manifest completed_at must not be earlier than started_at");
  }

  if (!isPlainObject(manifest.outcome)) {
    errors.push("run manifest outcome must be an object");
  } else {
    for (const key of Object.keys(manifest.outcome)) {
      if (!OUTCOME_FIELDS.has(key)) {
        errors.push(`run manifest outcome contains unknown field "${key}"`);
      }
    }
    if (!OUTCOME_STATUSES.has(manifest.outcome.status)) errors.push("run manifest outcome status is invalid");
    if (manifest.outcome.note !== undefined && typeof manifest.outcome.note !== "string") {
      errors.push("run manifest outcome note must be a string");
    }
    if (Object.hasOwn(manifest.outcome, "measurements")) {
      const { measurements } = manifest.outcome;
      if (!isPlainObject(measurements)) {
        errors.push("run manifest outcome measurements must be an object");
      } else {
        for (const key of Object.keys(measurements)) {
          if (!MEASUREMENT_FIELDS.includes(key)) {
            errors.push(`run manifest outcome measurements contains unknown field "${key}"`);
          }
        }
        for (const field of MEASUREMENT_FIELDS) {
          const valid = field === "wall_ms"
            ? typeof measurements[field] === "number" && Number.isFinite(measurements[field]) && measurements[field] >= 0
            : isIntegerAtLeast(measurements[field], 0);
          if (!valid) {
            const type = field === "wall_ms" ? "a number" : "an integer";
            errors.push(`run manifest outcome measurements ${field} must be ${type} greater than or equal to 0`);
          }
        }
      }
    }
    if (Object.hasOwn(manifest.outcome, "oracle")) {
      const { oracle } = manifest.outcome;
      if (!isPlainObject(oracle)) {
        errors.push("run manifest outcome oracle must be an object");
      } else {
        for (const key of Object.keys(oracle)) {
          if (!ORACLE_FIELDS.includes(key)) {
            errors.push(`run manifest outcome oracle contains unknown field "${key}"`);
          }
        }
        if (typeof oracle.applied !== "boolean") {
          errors.push("run manifest outcome oracle applied must be a boolean");
        }
        if (!isNonEmptyString(oracle.reason)) {
          errors.push("run manifest outcome oracle reason must be a non-empty string");
        }
      }
    }
    if (Object.hasOwn(manifest.outcome, "defects")) errors.push(...defectErrors(manifest.outcome.defects));
  }

  if (!isPlainObject(manifest.versions)) {
    errors.push("run manifest versions must be an object");
  } else {
    if (!isNonEmptyString(manifest.versions.runner_version)) {
      errors.push("run manifest versions runner_version must be a non-empty string");
    }
    for (const [key, value] of Object.entries(manifest.versions)) {
      if (typeof value !== "string") errors.push(`run manifest versions ${key} must be a string`);
    }
  }

  return errors;
}

/**
 * Validates a RunManifest v1 record without throwing.
 * @param {object} manifest
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateRunManifest(manifest) {
  const errors = validateRunManifestInternal(manifest, false);
  return { valid: errors.length === 0, errors };
}

/**
 * Builds an immutable, validated RunManifest v1 record.
 * @param {object} input
 * @returns {object}
 * @throws {RunManifestError} When the record is invalid.
 */
function buildRunManifest(input) {
  const draftErrors = validateRunManifestInternal(input, true);
  if (draftErrors.length > 0) throw new RunManifestError(draftErrors.join("; "));

  const manifest = cloneValue(input);
  if (!Object.hasOwn(manifest, "run_id")) {
    manifest.run_id = sha256(manifest).slice(0, 32);
  }

  const validation = validateRunManifest(manifest);
  if (!validation.valid) throw new RunManifestError(validation.errors.join("; "));
  return deepFreeze(manifest);
}

/**
 * Produces a canonical sorted-key SHA-256 digest for a validated RunManifest.
 * @param {object} manifest
 * @returns {string} Lowercase hexadecimal SHA-256 digest.
 * @throws {RunManifestError} When the record is invalid.
 */
function runManifestDigest(manifest) {
  const validation = validateRunManifest(manifest);
  if (!validation.valid) throw new RunManifestError(validation.errors.join("; "));
  return sha256(manifest);
}

module.exports = {
  POLICIES,
  REQUIRED_RUN_MANIFEST_FIELDS,
  RunManifestError,
  buildRunManifest,
  runManifestDigest,
  validateRunManifest,
};
