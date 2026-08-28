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
  const seq = item.execution_sequence;
  if (!seq || typeof seq !== "object") return null;
  if (typeof seq.run_id !== "string" || seq.run_id.trim() === "") return null;
  if (!Number.isInteger(seq.ordinal) || seq.ordinal < 1) return null;
  return seq;
}

function temporalRoles(strategyName) {
  if (strategyName === "strict-tdd") return ["red", "green"];
  if (strategyName === "bug") return ["red", "patch", "green"];
  if (strategyName === "refactor") return ["characterization-before", "characterization-after"];
  return [];
}

function assertCausalChain(items) {
  if (items.length === 0) return { ok: true };
  const sequenced = [];
  for (const item of items) {
    const sequence = getExecutionSequence(item);
    if (!sequence) {
      return fail("STRATEGY_SEQUENCE_VIOLATION", "missing or invalid execution_sequence for temporal strategy");
    }
    sequenced.push({ item, sequence });
  }
  const runId = sequenced[0].sequence.run_id;
  if (sequenced.some(({ sequence }) => sequence.run_id !== runId)) {
    return fail("STRATEGY_SEQUENCE_VIOLATION", "temporal evidence must use one consistent run_id");
  }
  sequenced.sort((left, right) => left.sequence.ordinal - right.sequence.ordinal);
  if (sequenced[0].sequence.previous_evidence_id) {
    return fail("STRATEGY_SEQUENCE_VIOLATION", "the causal chain root must not declare previous_evidence_id");
  }
  for (let index = 1; index < sequenced.length; index += 1) {
    const previous = sequenced[index - 1];
    const current = sequenced[index];
    if (current.sequence.ordinal <= previous.sequence.ordinal) {
      return fail("STRATEGY_SEQUENCE_VIOLATION", "temporal evidence ordinals must be strictly increasing");
    }
    const previousEvidenceId = previous.item.evidence && previous.item.evidence.evidence_id;
    if (!current.sequence.previous_evidence_id) {
      return fail("STRATEGY_SEQUENCE_VIOLATION", "previous_evidence_id is required for every causal transition");
    }
    if (current.sequence.previous_evidence_id !== previousEvidenceId) {
      return fail("STRATEGY_SEQUENCE_VIOLATION", "previous_evidence_id does not link to the prior Evidence");
    }
  }
  return { ok: true };
}

function assertRolePrecedes(items, earlierRole, laterRole) {
  const earlier = items.filter((item) => item.role === earlierRole);
  const later = items.filter((item) => item.role === laterRole);
  if (earlier.length === 0 || later.length === 0) return { ok: true };
  const latestEarlier = Math.max(...earlier.map((item) => getExecutionSequence(item).ordinal));
  const earliestLater = Math.min(...later.map((item) => getExecutionSequence(item).ordinal));
  if (latestEarlier >= earliestLater) {
    return fail(
      "STRATEGY_SEQUENCE_VIOLATION",
      `${laterRole} evidence must execute after ${earlierRole} evidence`
    );
  }
  return { ok: true };
}

function assertRoleOrder(strategyName, items) {
  const relevantRoles = temporalRoles(strategyName);
  if (relevantRoles.length === 0) return { ok: true };
  const temporalItems = (items || []).filter((item) => item && relevantRoles.includes(item.role));
  const chain = assertCausalChain(temporalItems);
  if (!chain.ok) return chain;

  const transitions = strategyName === "bug"
    ? [["red", "patch"], ["patch", "green"]]
    : strategyName === "refactor"
      ? [["characterization-before", "characterization-after"]]
      : [["red", "green"]];
  for (const [earlierRole, laterRole] of transitions) {
    const ordered = assertRolePrecedes(temporalItems, earlierRole, laterRole);
    if (!ordered.ok) return ordered;
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
