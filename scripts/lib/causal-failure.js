"use strict";

const CAUSAL_CATEGORIES = Object.freeze({
  ENVIRONMENT_TOOLING: "environment_tooling",
  CAS_CONFLICT: "cas_conflict",
  AMBIGUOUS_EFFECT: "ambiguous_effect",
  VALIDATION_GAP: "validation_gap",
  CODE_DEFECT: "code_defect",
});

const CAUSAL_PRIORITY = Object.freeze({
  environment_tooling: 1,
  cas_conflict: 2,
  ambiguous_effect: 3,
  validation_gap: 4,
  code_defect: 5,
});

/**
 * Constructs a canonical CausalFailure descriptor.
 * @param {Object} params
 * @param {string} params.failure_id
 * @param {string} params.category
 * @param {string} params.code
 * @param {string} params.blocking_fingerprint
 * @param {Object} [params.details]
 * @returns {Object} CausalFailure payload
 */
function createCausalFailure({
  failure_id,
  category,
  code,
  blocking_fingerprint,
  details = {},
}) {
  const normCategory = String(category || "code_defect");
  const priority = CAUSAL_PRIORITY[normCategory] || 5;

  return {
    schema_version: 1,
    failure_id: String(failure_id || `fail-${Date.now()}`),
    category: normCategory,
    code: String(code || "GENERIC_FAILURE"),
    priority,
    blocking_fingerprint: String(blocking_fingerprint || ""),
    details: details && typeof details === "object" ? { ...details } : {},
  };
}

/**
 * Maps legacy verify routing tags to canonical causal category and code.
 * @param {string} legacyTag
 * @returns {{ category: string, code: string }}
 */
function mapLegacyRoutingTag(legacyTag) {
  const tag = String(legacyTag || "").trim().toLowerCase();
  switch (tag) {
    case "spec":
      return {
        category: CAUSAL_CATEGORIES.VALIDATION_GAP,
        code: "SPEC_REQUIREMENTS_AMBIGUOUS",
      };
    case "design":
      return {
        category: CAUSAL_CATEGORIES.VALIDATION_GAP,
        code: "DESIGN_CONTRACT_MISMATCH",
      };
    case "tasks":
      return {
        category: CAUSAL_CATEGORIES.VALIDATION_GAP,
        code: "TASK_DECOMPOSITION_GAP",
      };
    case "code":
      return {
        category: CAUSAL_CATEGORIES.CODE_DEFECT,
        code: "CODE_IMPLEMENTATION_DEFECT",
      };
    case "evidence-format":
      return {
        category: CAUSAL_CATEGORIES.VALIDATION_GAP,
        code: "VERIFY_EVIDENCE_FORMAT_INVALID",
      };
    case "code-bug":
      return {
        category: CAUSAL_CATEGORIES.CODE_DEFECT,
        code: "CODE_IMPLEMENTATION_DEFECT",
      };
    case "spec-gap":
      return {
        category: CAUSAL_CATEGORIES.VALIDATION_GAP,
        code: "SPEC_REQUIREMENTS_AMBIGUOUS",
      };
    case "design-gap":
      return {
        category: CAUSAL_CATEGORIES.VALIDATION_GAP,
        code: "DESIGN_CONTRACT_MISMATCH",
      };
    case "tasks-gap":
      return {
        category: CAUSAL_CATEGORIES.VALIDATION_GAP,
        code: "TASK_DECOMPOSITION_GAP",
      };
    default:
      return {
        category: CAUSAL_CATEGORIES.VALIDATION_GAP,
        code: "UNKNOWN_ROUTING_TAG",
      };
  }
}

/**
 * Deterministically resolves the primary failure from a mixed set of failures.
 * Priority: environment_tooling (1) > cas_conflict (2) > ambiguous_effect (3) > validation_gap (4) > code_defect (5)
 * Tie-breaker: failure_id ascending, code ascending.
 * @param {Array<Object>} failures
 * @returns {Object|null} primaryFailure
 */
function resolvePrimaryFailure(failures) {
  if (!Array.isArray(failures) || failures.length === 0) {
    return null;
  }

  const validFailures = failures.filter((f) => f && typeof f === "object");
  if (validFailures.length === 0) {
    return null;
  }

  const sorted = [...validFailures].sort((a, b) => {
    const pA = Number(a.priority ?? CAUSAL_PRIORITY[a.category] ?? 99);
    const pB = Number(b.priority ?? CAUSAL_PRIORITY[b.category] ?? 99);
    if (pA !== pB) {
      return pA - pB;
    }

    const idA = String(a.failure_id || "");
    const idB = String(b.failure_id || "");
    const cmpId = idA.localeCompare(idB);
    if (cmpId !== 0) {
      return cmpId;
    }

    const codeA = String(a.code || "");
    const codeB = String(b.code || "");
    return codeA.localeCompare(codeB);
  });

  return sorted[0];
}

module.exports = {
  CAUSAL_CATEGORIES,
  CAUSAL_PRIORITY,
  createCausalFailure,
  mapLegacyRoutingTag,
  resolvePrimaryFailure,
};
