"use strict";

const { sha256Fingerprint } = require("./canonical-json.js");

const ROUTE_RANK = Object.freeze({
  direct: 1,
  repair: 2,
  bounded: 3,
  planned: 4,
  critical: 5,
});

const HARD_FLOORS = Object.freeze([
  { evidenceKey: "data_migration", floor: "critical", reason: "hard_floor.data_migration" },
  { evidenceKey: "auth_security", floor: "critical", reason: "hard_floor.auth_security" },
  { evidenceKey: "public_api", floor: "planned", reason: "hard_floor.public_api" },
  { evidenceKey: "localized_reproducible_bug", floor: "repair", reason: "hard_floor.repair" },
  { evidenceKey: "mechanical_no_behavior", floor: "direct", reason: "hard_floor.direct" },
]);

/**
 * Guarantee tiers and ineligible routes per K1 impact floor.
 */
const FLOOR_GUARANTEES = Object.freeze({
  critical: Object.freeze({
    minTier: "full-sdd",
    ineligibleRoutes: Object.freeze(["lite", "hotfix", "repair", "direct"]),
    requiredPhases: Object.freeze([
      "sdd-propose", "sdd-spec", "sdd-design", "sdd-tasks",
      "sdd-apply", "sdd-verify", "sdd-archive"
    ]),
    fallbackRoute: "standard",
  }),
  planned: Object.freeze({
    minTier: "spec-design",
    ineligibleRoutes: Object.freeze(["lite", "hotfix", "repair", "direct"]),
    requiredPhases: Object.freeze(["sdd-spec", "sdd-design"]),
    fallbackRoute: "standard",
  }),
  bounded: Object.freeze({
    minTier: "bounded",
    ineligibleRoutes: Object.freeze([]),
    requiredPhases: Object.freeze([
      "sdd-propose", "sdd-tasks", "sdd-apply", "sdd-verify", "sdd-archive"
    ]),
    fallbackRoute: null,
  }),
  repair: Object.freeze({
    minTier: "repair",
    ineligibleRoutes: Object.freeze([]),
    requiredPhases: Object.freeze(["sdd-explore", "sdd-tasks", "sdd-apply", "sdd-verify", "sdd-archive"]),
    fallbackRoute: null,
  }),
  direct: Object.freeze({
    minTier: "direct",
    ineligibleRoutes: Object.freeze([]),
    requiredPhases: Object.freeze([]),
    fallbackRoute: null,
  }),
});

/**
 * Returns the guarantee specification for a given risk floor.
 * @param {string} floor - "critical" | "planned" | "bounded" | "repair" | "direct"
 * @returns {object} Floor guarantee record
 */
function resolveFloorGuarantees(floor) {
  if (typeof floor === "string" && Object.prototype.hasOwnProperty.call(FLOOR_GUARANTEES, floor)) {
    return FLOOR_GUARANTEES[floor];
  }
  return FLOOR_GUARANTEES.bounded;
}


/**
 * Pure classifier: publishes route hard floors + fingerprint.
 * Does NOT wire into fixed/default routing (K1 out of scope).
 *
 * @param {{
 *   impact?: Record<string, boolean|string|number>,
 *   uncertainty?: object,
 *   execution?: object,
 *   candidate_route?: string
 * }} normalizedEvidence
 */
function classifyChange(normalizedEvidence) {
  const evidence = normalizeEvidence(normalizedEvidence);
  const impact = normalizeAxisInput(evidence, "impact");
  const uncertainty = normalizeAxisInput(evidence, "uncertainty");
  const execution = normalizeAxisInput(evidence, "execution");
  const candidateRoute = normalizeCandidateRoute(evidence);

  const reasons = [];
  let route = null;
  let floorSource = null;

  for (const rule of HARD_FLOORS) {
    if (
      Object.prototype.hasOwnProperty.call(impact, rule.evidenceKey) &&
      impact[rule.evidenceKey] === true
    ) {
      if (route == null || ROUTE_RANK[rule.floor] > ROUTE_RANK[route]) {
        route = rule.floor;
        floorSource = rule.reason;
      }
      if (!reasons.includes(rule.reason)) reasons.push(rule.reason);
    }
  }

  // Candidate route may raise but never lower a hard floor.
  if (candidateRoute !== null) {
    if (route == null || ROUTE_RANK[candidateRoute] > ROUTE_RANK[route]) {
      route = candidateRoute;
      floorSource = `candidate_route.${candidateRoute}`;
      if (!reasons.includes(floorSource)) reasons.push(floorSource);
    }
  }

  if (route == null) {
    if (Object.prototype.hasOwnProperty.call(impact, "docs_only") && impact.docs_only === true) {
      route = "direct";
      floorSource = "evidence.docs_only";
      reasons.push(floorSource);
    } else {
      route = "bounded";
      floorSource = "default.bounded";
      reasons.push(floorSource);
    }
  }

  const risk = {
    ...impact,
    floor: route,
    floor_source: floorSource,
  };

  const fingerprintPayload = {
    risk: normalizeAxis(risk),
    uncertainty: normalizeAxis(uncertainty),
    execution: normalizeAxis(execution),
    route,
    reasons: [...reasons].sort(),
  };

  return {
    schema_version: 1,
    risk,
    uncertainty: { ...uncertainty },
    execution: { ...execution },
    route,
    reasons,
    fingerprint: sha256Fingerprint("change-classification", fingerprintPayload),
  };
}

function normalizeEvidence(value) {
  if (value === undefined) return {};
  if (!isPlainRecord(value)) {
    throw new TypeError("classification evidence must be an object");
  }
  return value;
}

function normalizeAxisInput(evidence, field) {
  if (!Object.prototype.hasOwnProperty.call(evidence, field) || evidence[field] === undefined) {
    return {};
  }
  if (!isPlainRecord(evidence[field])) {
    throw new TypeError(`classification ${field} must be an object when provided`);
  }
  return evidence[field];
}

function normalizeCandidateRoute(evidence) {
  if (
    !Object.prototype.hasOwnProperty.call(evidence, "candidate_route") ||
    evidence.candidate_route === undefined
  ) {
    return null;
  }
  if (
    typeof evidence.candidate_route !== "string" ||
    !Object.prototype.hasOwnProperty.call(ROUTE_RANK, evidence.candidate_route)
  ) {
    throw new TypeError("classification candidate_route must be a known route");
  }
  return evidence.candidate_route;
}

function isPlainRecord(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function normalizeAxis(axis) {
  if (!axis || typeof axis !== "object") return {};
  const out = {};
  for (const key of Object.keys(axis).sort()) {
    out[key] = axis[key];
  }
  return out;
}

module.exports = {
  classifyChange,
  HARD_FLOORS,
  ROUTE_RANK,
  FLOOR_GUARANTEES,
  resolveFloorGuarantees,
};
