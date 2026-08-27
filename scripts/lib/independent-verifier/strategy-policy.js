"use strict";

const DECLARED_STRATEGIES = Object.freeze([
  "bug",
  "feature",
  "refactor",
  "migration",
  "config-docs",
]);

const RUNTIME_PROVENANCE = Object.freeze(["runtime-observed", "host-attested", "tool-produced"]);

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
  return new Set((items || []).map((item) => item.role).filter(Boolean));
}

function evidenceForRole(items, role) {
  return (items || []).filter((item) => item.role === role);
}

function provenanceAdmissible(policy, role, provenance) {
  const allowed = policy.admissible && policy.admissible[role];
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

function assertDistinctRoleEvidence(items) {
  const rolesByEvidenceId = new Map();
  for (const item of items || []) {
    const evidenceId = item && item.evidence && item.evidence.evidence_id;
    if (typeof evidenceId !== "string" || typeof item.role !== "string") continue;
    const roles = rolesByEvidenceId.get(evidenceId) || new Set();
    roles.add(item.role);
    rolesByEvidenceId.set(evidenceId, roles);
    if (roles.size > 1) {
      return fail("STRATEGY_EVIDENCE_ALIAS", `evidence_id ${evidenceId} cannot satisfy distinct strategy roles`);
    }
  }
  return { ok: true };
}

function assertRoleOrder(strategyName, items) {
  const positions = new Map();
  for (let index = 0; index < (items || []).length; index += 1) {
    const role = items[index] && items[index].role;
    if (!positions.has(role)) positions.set(role, []);
    positions.get(role).push(index);
  }
  const ordered = strategyName === "bug" ? ["red", "patch", "green"] : strategyName === "strict-tdd" ? ["red", "green"] : [];
  for (let index = 0; index < ordered.length - 1; index += 1) {
    const earlier = positions.get(ordered[index]) || [];
    const later = positions.get(ordered[index + 1]) || [];
    if (earlier.length > 0 && later.length > 0 && Math.max(...earlier) > Math.min(...later)) {
      return fail("STRATEGY_SEQUENCE_VIOLATION", `${ordered[index]} evidence must precede ${ordered[index + 1]} evidence`);
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

  const distinctEvidence = assertDistinctRoleEvidence(items);
  if (!distinctEvidence.ok) return distinctEvidence;
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
  selectStrategy,
  evaluateStrategy,
  assertDistinctRoleEvidence,
  assertRoleOrder,
};
