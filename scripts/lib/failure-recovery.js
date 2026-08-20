"use strict";

const ALLOWLISTED_TRANSITION_MATRIX = Object.freeze({
  code_defect: Object.freeze(["repair", "replan", "escalate", "stop"]),
  validation_gap: Object.freeze(["replan", "escalate", "stop"]),
  ambiguous_effect: Object.freeze(["escalate", "stop"]),
  cas_conflict: Object.freeze(["replan", "escalate", "stop"]),
  environment_tooling: Object.freeze(["replan", "escalate", "stop"]),
});

/**
 * Returns allowlisted recovery transitions for a causal category.
 * @param {string} category
 * @param {Object} [context]
 * @param {number} [context.remainingAttempts]
 * @returns {string[]} allowlisted operations
 */
function getAllowlistedTransitions(category, context = {}) {
  const normCategory = String(category || "code_defect");
  const base = ALLOWLISTED_TRANSITION_MATRIX[normCategory] || ["escalate", "stop"];

  if (normCategory === "code_defect" && context && context.remainingAttempts === 0) {
    return base.filter((op) => op !== "repair");
  }

  return [...base];
}

/**
 * Validates whether a target recovery operation is valid for a failure category.
 * @param {string} category
 * @param {string} operation
 * @param {Object} [context]
 * @returns {{ ok: boolean, code?: string, message?: string }}
 */
function validateRecoveryTransition(category, operation, context = {}) {
  const allowed = getAllowlistedTransitions(category, context);
  const op = String(operation || "");

  if (!allowed.includes(op)) {
    return {
      ok: false,
      code: "UNALLOWLISTED_RECOVERY_OPERATION",
      message: `Operation '${op}' is not allowlisted for category '${category}' (allowlisted: [${allowed.join(", ")}])`,
    };
  }

  return { ok: true };
}

/**
 * Validates that a repair operation mutates only within declared bounded scope.
 * Fails closed (ok: false) if scope is empty, undefined, or missing required bounding arrays
 * whenever targetNodeId, modifiedPaths, or resolvedFindingIds are present.
 *
 * @param {Object} params
 * @param {Object} params.scope - { node_ids: string[], allowed_paths: string[], finding_ids: string[] }
 * @param {string} [params.targetNodeId]
 * @param {string[]} [params.modifiedPaths]
 * @param {string[]} [params.resolvedFindingIds]
 * @returns {{ ok: boolean, violations: string[] }}
 */
function validateRepairScope({
  scope,
  targetNodeId,
  modifiedPaths = [],
  resolvedFindingIds = [],
} = {}) {
  if (!scope || typeof scope !== "object" || Array.isArray(scope)) {
    return {
      ok: false,
      violations: ["Scope must be a non-null object"],
    };
  }

  const violations = [];

  // Required structure checks on scope itself
  if (!Array.isArray(scope.node_ids) || scope.node_ids.length === 0) {
    violations.push("Scope missing required non-empty 'node_ids' array");
  } else if (targetNodeId && !scope.node_ids.includes(targetNodeId)) {
    violations.push(`Target node ID '${targetNodeId}' is not in allowlisted scope: [${scope.node_ids.join(", ")}]`);
  }

  if (!Array.isArray(scope.allowed_paths) || scope.allowed_paths.length === 0) {
    violations.push("Scope missing required non-empty 'allowed_paths' array");
  } else if (Array.isArray(modifiedPaths) && modifiedPaths.length > 0) {
    for (const modPath of modifiedPaths) {
      if (!isPathAllowed(modPath, scope.allowed_paths)) {
        violations.push(`Modified path '${modPath}' violates bounded scope globs: [${scope.allowed_paths.join(", ")}]`);
      }
    }
  }

  if (!Array.isArray(scope.finding_ids) || scope.finding_ids.length === 0) {
    violations.push("Scope missing required non-empty 'finding_ids' array");
  } else if (Array.isArray(resolvedFindingIds) && resolvedFindingIds.length > 0) {
    for (const fId of resolvedFindingIds) {
      if (!scope.finding_ids.includes(fId)) {
        violations.push(`Resolved finding ID '${fId}' is not in frozen finding scope: [${scope.finding_ids.join(", ")}]`);
      }
    }
  }

  return {
    ok: violations.length === 0,
    violations,
  };
}


function isPathAllowed(targetPath, allowedGlobs) {
  const normTarget = targetPath.replace(/\\/g, "/");
  return allowedGlobs.some((pattern) => matchGlobPattern(normTarget, pattern.replace(/\\/g, "/")));
}

function matchGlobPattern(str, pattern) {
  if (pattern === str || pattern === "*" || pattern === "**") return true;

  const regexPattern = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\/\*\*\//g, "/(?:.+/)?")
    .replace(/\*\*\//g, "(?:.+/)?")
    .replace(/\/\*\*/g, "(?:/.*)?")
    .replace(/\*\*/g, ".*")
    .replace(/\*/g, "[^/]*");

  const regex = new RegExp(`^${regexPattern}$`);
  return regex.test(str);
}

/**
 * Checks whether the causal failure category requires state reconciliation before mutation.
 * @param {string} category
 * @returns {boolean}
 */
function requiresReconciliation(category) {
  return category === "ambiguous_effect";
}

/**
 * Checks whether the causal failure category requires state re-synchronization before retry.
 * @param {string} category
 * @returns {boolean}
 */
function requiresStateResync(category) {
  return category === "cas_conflict";
}

module.exports = {
  ALLOWLISTED_TRANSITION_MATRIX,
  getAllowlistedTransitions,
  validateRecoveryTransition,
  validateRepairScope,
  requiresReconciliation,
  requiresStateResync,
};
