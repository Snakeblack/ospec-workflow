"use strict";

const VALID_EVIDENCE_LEVELS = new Set([
  "runtime-test",
  "static-proof",
  "static-lint",
  "inspection-proof",
  "manual-proof",
  "no-proof",
]);

/**
 * Classifies the evidence level of a test/check observation.
 * Enforces that textual/fixture inspection alone is classified as static-lint or static-proof,
 * while runtime-test requires invocation evidence.
 *
 * @param {{ invokedRuntime?: boolean, executesCode?: boolean, performsStaticCheck?: boolean, checksFileTextOnly?: boolean, testTitle?: string, observedOutcome?: any }} observation
 * @returns {"runtime-test" | "static-proof" | "static-lint" | "inspection-proof" | "manual-proof" | "no-proof"}
 */
function classifyEvidence(observation = {}) {
  if (!observation || typeof observation !== "object") {
    return "no-proof";
  }

  // Textual string matching or static fixture checks cannot be runtime-test
  if (observation.checksFileTextOnly === true) {
    return "static-lint";
  }

  if (observation.invokedRuntime === true || observation.executesCode === true) {
    return "runtime-test";
  }

  if (observation.performsStaticCheck === true) {
    return "static-proof";
  }

  if (observation.level && VALID_EVIDENCE_LEVELS.has(observation.level)) {
    // Overclaim guard: if declared level is runtime-test but no runtime invocation occurred
    if (observation.level === "runtime-test" && !observation.invokedRuntime && !observation.executesCode) {
      return observation.checksFileTextOnly ? "static-lint" : "static-proof";
    }
    return observation.level;
  }

  return "no-proof";
}

/**
 * Validates whether a requirement's evidence meets RFC 2119 requirement strength.
 *
 * @param {{ requirementId: string, strength: "MUST" | "SHOULD" | "MAY", describesRuntimeBehavior?: boolean, evidenceLevel: string }} req
 * @returns {{ valid: boolean, downgraded: boolean, effectiveLevel: string, reason?: string }}
 */
function validateRequirementEvidence(req) {
  if (!req || typeof req !== "object") {
    return { valid: false, downgraded: false, effectiveLevel: "no-proof", reason: "Invalid requirement object" };
  }

  const level = req.evidenceLevel || "no-proof";
  const strength = req.strength || "MUST";

  if (strength === "MUST") {
    if (req.describesRuntimeBehavior && level === "static-lint") {
      return {
        valid: false,
        downgraded: true,
        effectiveLevel: "static-lint",
        reason: "MUST scenario describing runtime behavior cannot be satisfied by static-lint evidence",
      };
    }
    if (level === "runtime-test" || level === "static-proof") {
      return { valid: true, downgraded: false, effectiveLevel: level };
    }
    return {
      valid: false,
      downgraded: true,
      effectiveLevel: level,
      reason: `MUST requirement requires runtime-test or static-proof (received ${level})`,
    };
  }

  if (strength === "SHOULD") {
    if (level === "runtime-test" || level === "static-proof" || level === "inspection-proof") {
      return { valid: true, downgraded: false, effectiveLevel: level };
    }
    return { valid: false, downgraded: true, effectiveLevel: level, reason: "SHOULD requirement lacks sufficient proof" };
  }

  return { valid: true, downgraded: false, effectiveLevel: level };
}

module.exports = {
  VALID_EVIDENCE_LEVELS,
  classifyEvidence,
  validateRequirementEvidence,
};
