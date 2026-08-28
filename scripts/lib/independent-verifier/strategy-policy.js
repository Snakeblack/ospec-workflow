"use strict";

const DECLARED_STRATEGIES = Object.freeze([
  "bug",
  "feature",
  "refactor",
  "migration",
  "config-docs",
]);

const RUNTIME_PROVENANCE = Object.freeze(["runtime-observed", "host-attested", "tool-produced"]);

const INCOMPATIBLE_ROLE_PAIRS = Object.freeze([
  ["red", "green"],
  ["characterization-before", "characterization-after"],
  ["negative", "acceptance"],
]);

const STRATEGY_TABLE = Object.freeze({
  bug: Object.freeze({
    minimumRoles: Object.freeze(["red", "patch", "green"]),
    forbiddenWithout: Object.freeze([{ role: "green", requires: "red" }]),
    admissible: Object.freeze({
      red: RUNTIME_PROVENANCE,
      green: RUNTIME_PROVENANCE,
      patch: Object.freeze(["tool-produced", "runtime-observed", "host-attested"]),
    }),
  }),
  feature: Object.freeze({
    minimumRoles: Object.freeze(["acceptance", "invariants"]),
    anyOf: Object.freeze([Object.freeze(["contract", "integration"])]),
    requiredNegativeRole: "negative",
    characterizationOnlyRoles: Object.freeze(["characterization-before", "characterization-after"]),
    admissible: Object.freeze({
      acceptance: RUNTIME_PROVENANCE,
      invariants: RUNTIME_PROVENANCE,
      invariant: RUNTIME_PROVENANCE,
      contract: RUNTIME_PROVENANCE,
      integration: RUNTIME_PROVENANCE,
      negative: RUNTIME_PROVENANCE,
    }),
  }),
  refactor: Object.freeze({
    minimumRoles: Object.freeze(["characterization-before", "characterization-after", "no-behavior-change"]),
    forbiddenRoles: Object.freeze(["behavioral-delta"]),
    admissible: Object.freeze({
      "characterization-before": RUNTIME_PROVENANCE,
      "characterization-after": RUNTIME_PROVENANCE,
      "no-behavior-change": RUNTIME_PROVENANCE,
    }),
  }),
  migration: Object.freeze({
    minimumRoles: Object.freeze(["dry-run", "rollback", "incompatibility", "idempotent-re-run"]),
    admissible: Object.freeze({
      "dry-run": RUNTIME_PROVENANCE,
      rollback: RUNTIME_PROVENANCE,
      incompatibility: RUNTIME_PROVENANCE,
      "idempotent-re-run": RUNTIME_PROVENANCE,
    }),
  }),
  "config-docs": Object.freeze({
    minimumRoles: Object.freeze(["schema-parser", "smoke"]),
    anyOf: Object.freeze([Object.freeze(["install", "consume"])]),
    forbiddenSoloRoles: Object.freeze(["docs-only"]),
    admissible: Object.freeze({
      "schema-parser": RUNTIME_PROVENANCE,
      smoke: RUNTIME_PROVENANCE,
      install: RUNTIME_PROVENANCE,
      consume: RUNTIME_PROVENANCE,
    }),
  }),
  "strict-tdd": Object.freeze({
    minimumRoles: Object.freeze(["red", "green"]),
    forbiddenWithout: Object.freeze([{ role: "green", requires: "red" }]),
    admissible: Object.freeze({
      red: Object.freeze(["runtime-observed"]),
      green: Object.freeze(["runtime-observed"]),
    }),
  }),
});

function fail(reason_code, error) {
  return { ok: false, reason_code, error: error || reason_code };
}

/**
 * Select exactly one declared strategy, or Strict TDD fallback.
 * Never mutates openspec/config.yaml.
 *
 * @param {string|undefined} declaredStrategy
 * @returns {string}
 */
function selectStrategy(declaredStrategy) {
  if (typeof declaredStrategy !== "string" || declaredStrategy.length === 0) {
    return "strict-tdd";
  }
  if (DECLARED_STRATEGIES.includes(declaredStrategy)) return declaredStrategy;
  return "strict-tdd";
}

function rolesOf(items) {
  const result = new Set();
  for (const item of items || []) {
    if (!item || !item.role) continue;
    result.add(item.role);
    if (item.role === "invariants") result.add("invariant");
    if (item.role === "invariant") result.add("invariants");
  }
  return result;
}

function evidenceForRole(items, role) {
  return (items || []).filter((item) => {
    if (!item || !item.role) return false;
    if (item.role === role) return true;
    if ((role === "invariants" || role === "invariant") && (item.role === "invariants" || item.role === "invariant")) {
      return true;
    }
    return false;
  });
}

function provenanceAdmissible(policy, role, provenance) {
  const allowed = policy.admissible && (policy.admissible[role] || (role === "invariants" && policy.admissible.invariant) || (role === "invariant" && policy.admissible.invariants));
  if (!allowed) return true;
  return allowed.includes(provenance);
}

function failIfInadmissible(policy, role, items, message) {
  for (const item of evidenceForRole(items, role)) {
    if (!provenanceAdmissible(policy, role, item.evidence.provenance)) {
      return fail("INSUFFICIENT_PROVENANCE", message);
    }
  }
  return null;
}

/**
 * Matriz formal de incompatibilidad de roles:
 * red <-> green, characterization-before <-> characterization-after, negative <-> acceptance
 * Non-conflicting roles (such as integration + acceptance, invariant + integration, smoke + acceptance) may share evidence_id.
 */
function assertCompatibleRoleSharing(items) {
  const rolesByEvidenceId = new Map();
  for (const item of items || []) {
    const evidenceId = item && item.evidence && item.evidence.evidence_id;
    const role = item && item.role;
    if (!evidenceId || !role) continue;
    const roles = rolesByEvidenceId.get(evidenceId) || new Set();
    roles.add(role);
    rolesByEvidenceId.set(evidenceId, roles);
  }

  for (const [evidenceId, roles] of rolesByEvidenceId.entries()) {
    for (const [roleA, roleB] of INCOMPATIBLE_ROLE_PAIRS) {
      if (roles.has(roleA) && roles.has(roleB)) {
        return fail(
          "STRATEGY_EVIDENCE_ALIAS",
          `evidence_id ${evidenceId} cannot satisfy incompatible roles ${roleA} and ${roleB}`
        );
      }
    }
  }
  return { ok: true };
}

// Preserve alias for existing consumers if any
const assertDistinctRoleEvidence = assertCompatibleRoleSharing;

function getExecutionSequence(item) {
  if (!item) return null;
  const seq = item.execution_sequence || (item.raw && item.raw.execution_sequence);
  if (!seq || typeof seq !== "object") return null;
  if (typeof seq.ordinal !== "number") return null;
  return seq;
}

function assertRoleOrder(strategyName, items) {
  const temporalStrategies = ["strict-tdd", "bug", "refactor"];
  if (!temporalStrategies.includes(strategyName)) {
    return { ok: true };
  }

  const roleItems = (role) => (items || []).filter((it) => it && it.role === role);

  if (strategyName === "strict-tdd") {
    const redItems = roleItems("red");
    const greenItems = roleItems("green");

    if (redItems.length > 0 && greenItems.length > 0) {
      for (const item of [...redItems, ...greenItems]) {
        const seq = getExecutionSequence(item);
        if (!seq) {
          return fail("STRATEGY_SEQUENCE_VIOLATION", "missing execution_sequence for temporal strategy");
        }
      }

      for (const red of redItems) {
        const redSeq = getExecutionSequence(red);
        const redId = red.evidence && red.evidence.evidence_id;
        for (const green of greenItems) {
          const greenSeq = getExecutionSequence(green);
          if (greenSeq.ordinal <= redSeq.ordinal) {
            return fail("STRATEGY_SEQUENCE_VIOLATION", "green evidence ordinal must be greater than red evidence ordinal");
          }
          if (greenSeq.previous_evidence_id && redId && greenSeq.previous_evidence_id !== redId) {
            return fail("STRATEGY_SEQUENCE_VIOLATION", "green previous_evidence_id does not link to red evidence");
          }
        }
      }
    }
  }

  if (strategyName === "bug") {
    const redItems = roleItems("red");
    const patchItems = roleItems("patch");
    const greenItems = roleItems("green");

    const hasMultipleTemporalRoles =
      (redItems.length > 0 && patchItems.length > 0) ||
      (patchItems.length > 0 && greenItems.length > 0) ||
      (redItems.length > 0 && greenItems.length > 0);

    if (hasMultipleTemporalRoles) {
      const allBugItems = [...redItems, ...patchItems, ...greenItems];
      for (const item of allBugItems) {
        const seq = getExecutionSequence(item);
        if (!seq) {
          return fail("STRATEGY_SEQUENCE_VIOLATION", "missing execution_sequence for temporal strategy");
        }
      }
    }

    if (redItems.length > 0 && patchItems.length > 0) {
      for (const red of redItems) {
        const redSeq = getExecutionSequence(red);
        const redId = red.evidence && red.evidence.evidence_id;
        for (const patch of patchItems) {
          const patchSeq = getExecutionSequence(patch);
          if (patchSeq.ordinal <= redSeq.ordinal) {
            return fail("STRATEGY_SEQUENCE_VIOLATION", "patch evidence ordinal must be greater than red evidence ordinal");
          }
          if (patchSeq.previous_evidence_id && redId && patchSeq.previous_evidence_id !== redId) {
            return fail("STRATEGY_SEQUENCE_VIOLATION", "patch previous_evidence_id does not link to red evidence");
          }
        }
      }
    }

    if (patchItems.length > 0 && greenItems.length > 0) {
      for (const patch of patchItems) {
        const patchSeq = getExecutionSequence(patch);
        const patchId = patch.evidence && patch.evidence.evidence_id;
        for (const green of greenItems) {
          const greenSeq = getExecutionSequence(green);
          if (greenSeq.ordinal <= patchSeq.ordinal) {
            return fail("STRATEGY_SEQUENCE_VIOLATION", "green evidence ordinal must be greater than patch evidence ordinal");
          }
          if (greenSeq.previous_evidence_id && patchId && greenSeq.previous_evidence_id !== patchId) {
            return fail("STRATEGY_SEQUENCE_VIOLATION", "green previous_evidence_id does not link to patch evidence");
          }
        }
      }
    }

    if (redItems.length > 0 && greenItems.length > 0) {
      for (const red of redItems) {
        const redSeq = getExecutionSequence(red);
        for (const green of greenItems) {
          const greenSeq = getExecutionSequence(green);
          if (greenSeq.ordinal <= redSeq.ordinal) {
            return fail("STRATEGY_SEQUENCE_VIOLATION", "green evidence ordinal must be greater than red evidence ordinal");
          }
        }
      }
    }
  }

  if (strategyName === "refactor") {
    const beforeItems = roleItems("characterization-before");
    const afterItems = roleItems("characterization-after");

    if (beforeItems.length > 0 && afterItems.length > 0) {
      for (const item of [...beforeItems, ...afterItems]) {
        const seq = getExecutionSequence(item);
        if (!seq) {
          return fail("STRATEGY_SEQUENCE_VIOLATION", "missing execution_sequence for temporal strategy");
        }
      }

      for (const before of beforeItems) {
        const beforeSeq = getExecutionSequence(before);
        const beforeId = before.evidence && before.evidence.evidence_id;
        for (const after of afterItems) {
          const afterSeq = getExecutionSequence(after);
          if (afterSeq.ordinal <= beforeSeq.ordinal) {
            return fail("STRATEGY_SEQUENCE_VIOLATION", "characterization-after ordinal must be greater than characterization-before ordinal");
          }
          if (afterSeq.previous_evidence_id && beforeId && afterSeq.previous_evidence_id !== beforeId) {
            return fail("STRATEGY_SEQUENCE_VIOLATION", "characterization-after previous_evidence_id does not link to characterization-before");
          }
        }
      }
    }
  }

  return { ok: true };
}

/**
 * Check anyOf role groups and their provenance admission.
 * Extracted so evaluateStrategy stays at most three control-flow levels.
 *
 * @param {object} policy
 * @param {Array<{ role: string, evidence: { provenance: string } }>} items
 * @param {Set<string>} roles
 * @returns {{ ok: true } | { ok: false, reason_code: string, error?: string }}
 */
function assertAdmissibleProvenance(policy, items, roles) {
  for (const group of policy.anyOf || []) {
    if (!group.some((role) => roles.has(role))) {
      return fail("MISSING_STRATEGY_MINIMUM", `missing one of ${group.join("|")}`);
    }
    for (const role of group) {
      const denied = failIfInadmissible(policy, role, items, `${role} provenance is not admissible`);
      if (denied) return denied;
    }
  }
  return { ok: true };
}

/**
 * Evaluate strategy minimums, negatives, and provenance admission.
 *
 * @param {string} strategyName
 * @param {Array<{ role: string, evidence: { provenance: string } }>} items
 * @returns {{ ok: true, strategy: string } | { ok: false, reason_code: string, error?: string }}
 */
function evaluateStrategy(strategyName, items) {
  const policy = STRATEGY_TABLE[strategyName];
  if (!policy) return fail("MISSING_STRATEGY_MINIMUM", `unknown strategy ${strategyName}`);
  const roles = rolesOf(items);

  const compatibleRoleSharing = assertCompatibleRoleSharing(items);
  if (!compatibleRoleSharing.ok) return compatibleRoleSharing;
  const roleOrder = assertRoleOrder(strategyName, items);
  if (!roleOrder.ok) return roleOrder;

  if (strategyName === "feature" && policy.characterizationOnlyRoles) {
    const hasChar = policy.characterizationOnlyRoles.some((role) => roles.has(role));
    const hasFeatureMin = roles.has("acceptance");
    if (hasChar && !hasFeatureMin) {
      return fail("MISSING_STRATEGY_MINIMUM", "characterization-only evidence cannot satisfy feature");
    }
  }

  if (strategyName === "config-docs" && roles.has("docs-only") && !roles.has("schema-parser")) {
    return fail("MISSING_NEGATIVE", "docs-only claim without parser/smoke");
  }

  for (const role of policy.minimumRoles || []) {
    const matches = evidenceForRole(items, role);
    if (matches.length === 0) {
      return fail("MISSING_STRATEGY_MINIMUM", `missing ${role} evidence`);
    }
    const denied = failIfInadmissible(
      policy,
      role,
      items,
      `${role} provenance ${matches[0].evidence.provenance} is not admissible`
    );
    if (denied) return denied;
  }

  const anyOf = assertAdmissibleProvenance(policy, items, roles);
  if (!anyOf.ok) return anyOf;

  if (policy.requiredNegativeRole && !roles.has(policy.requiredNegativeRole)) {
    return fail("MISSING_NEGATIVE", `missing ${policy.requiredNegativeRole} case`);
  }
  if (policy.requiredNegativeRole) {
    const denied = failIfInadmissible(
      policy,
      policy.requiredNegativeRole,
      items,
      "negative provenance is not admissible"
    );
    if (denied) return denied;
  }

  for (const rule of policy.forbiddenWithout || []) {
    if (roles.has(rule.role) && !roles.has(rule.requires)) {
      return fail("MISSING_NEGATIVE", `${rule.role} without ${rule.requires}`);
    }
  }

  for (const role of policy.forbiddenRoles || []) {
    if (roles.has(role)) {
      return fail("MISSING_NEGATIVE", `forbidden role ${role}`);
    }
  }

  return { ok: true, strategy: strategyName };
}

module.exports = {
  DECLARED_STRATEGIES,
  STRATEGY_TABLE,
  INCOMPATIBLE_ROLE_PAIRS,
  selectStrategy,
  evaluateStrategy,
  assertCompatibleRoleSharing,
  assertDistinctRoleEvidence,
  assertRoleOrder,
};
