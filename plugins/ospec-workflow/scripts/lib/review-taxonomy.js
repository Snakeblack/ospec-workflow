"use strict";

const QUALITY_DOMAINS = Object.freeze(["trust", "runtime", "evolution", "efficiency"]);
const LEGACY_DIMENSIONS = Object.freeze(["risk", "reliability", "resilience", "readability"]);

const ACTIVE_V2_REVIEWERS = Object.freeze({
  trust: "review-trust",
  runtime: "review-runtime",
  evolution: "review-evolution",
  efficiency: "review-efficiency",
});

const LEGACY_V1_REVIEWERS = Object.freeze({
  risk: "review-risk",
  reliability: "review-reliability",
  resilience: "review-resilience",
  readability: "review-readability",
});

const SHARED_GATES = Object.freeze(["clarify", "review-workload", "impact", "brownfield-advisory"]);
const ACTIVE_GATES = Object.freeze([...SHARED_GATES, "quality-review-gate"]);
const LEGACY_GATES = Object.freeze([...SHARED_GATES, "4r-review-gate"]);
const LEXICAL_GATES = Object.freeze([...new Set([...ACTIVE_GATES, ...LEGACY_GATES])].sort());

const ADMISSION_CONTEXTS = Object.freeze(["live-v2", "schema-v1", "legacy-reader"]);

function detectMixedTaxonomy({ domains = [], reviewers = [], lineageSchemaVersion = null } = {}) {
  const quality = domains.filter((id) => QUALITY_DOMAINS.includes(id));
  const legacy = domains.filter((id) => LEGACY_DIMENSIONS.includes(id));
  const qualityReviewers = reviewers.filter((name) => Object.values(ACTIVE_V2_REVIEWERS).includes(name));
  const legacyReviewers = reviewers.filter((name) => Object.values(LEGACY_V1_REVIEWERS).includes(name));
  if (quality.length && legacy.length) return { mixed: true, reason: "mixed-domain-ids" };
  if (qualityReviewers.length && legacyReviewers.length) return { mixed: true, reason: "mixed-reviewer-ids" };
  if (lineageSchemaVersion === 1 && quality.length) return { mixed: true, reason: "v1-lineage-with-quality-ids" };
  if (lineageSchemaVersion === 2 && legacy.length) return { mixed: true, reason: "v2-lineage-with-legacy-ids" };
  return { mixed: false, reason: null };
}

function detectMixedGateKeys(gates = {}) {
  if (!gates || typeof gates !== "object" || Array.isArray(gates)) {
    return { mixed: false, reason: null };
  }
  const hasV1 = Object.hasOwn(gates, "4r-review-gate");
  const hasV2 = Object.hasOwn(gates, "quality-review-gate");
  if (hasV1 && hasV2) return { mixed: true, reason: "both-review-gate-keys" };
  return { mixed: false, reason: null };
}

function admitGate(gateName, context) {
  if (!ADMISSION_CONTEXTS.includes(context)) throw new TypeError(`unknown admission context: ${context}`);
  if (!LEXICAL_GATES.includes(gateName)) return { admitted: false, reason: "unknown-gate" };
  if (context === "live-v2") {
    if (gateName === "4r-review-gate") return { admitted: false, reason: "legacy-gate-rejected-on-live-v2" };
    return { admitted: ACTIVE_GATES.includes(gateName), reason: ACTIVE_GATES.includes(gateName) ? null : "not-active-gate" };
  }
  if (context === "schema-v1") {
    if (gateName === "quality-review-gate") return { admitted: false, reason: "v2-gate-rejected-on-schema-v1" };
    return { admitted: LEGACY_GATES.includes(gateName), reason: LEGACY_GATES.includes(gateName) ? null : "not-legacy-gate" };
  }
  if (context === "legacy-reader") {
    return { admitted: LEGACY_GATES.includes(gateName) || gateName === "quality-review-gate", reason: null };
  }
  return { admitted: false, reason: "unsupported-context" };
}

function admitRouteGates(gateNames, context) {
  if (!Array.isArray(gateNames)) throw new TypeError("gateNames must be an array");
  const reviewGates = gateNames.filter((name) => name === "4r-review-gate" || name === "quality-review-gate");
  if (reviewGates.length > 1) return { valid: false, reason: "multiple-review-gates-on-route" };
  const results = gateNames.map((name) => ({ gate: name, ...admitGate(name, context) }));
  const invalid = results.filter((item) => !item.admitted);
  return invalid.length
    ? { valid: false, reason: invalid[0].reason, results }
    : { valid: true, reason: null, results };
}

function reviewerForDomain(domain, schemaVersion) {
  if (schemaVersion === 2 || schemaVersion === undefined) {
    if (!QUALITY_DOMAINS.includes(domain)) throw new TypeError(`unknown quality domain: ${domain}`);
    return ACTIVE_V2_REVIEWERS[domain];
  }
  if (schemaVersion === 1) {
    if (!LEGACY_DIMENSIONS.includes(domain)) throw new TypeError(`unknown legacy dimension: ${domain}`);
    return LEGACY_V1_REVIEWERS[domain];
  }
  throw new TypeError(`unsupported schema_version: ${schemaVersion}`);
}

function ownersForSchema(schemaVersion) {
  return schemaVersion === 2 ? [...QUALITY_DOMAINS] : [...LEGACY_DIMENSIONS];
}

function reviewersForSchema(schemaVersion) {
  return schemaVersion === 2 ? Object.values(ACTIVE_V2_REVIEWERS) : Object.values(LEGACY_V1_REVIEWERS);
}

module.exports = {
  QUALITY_DOMAINS,
  LEGACY_DIMENSIONS,
  ACTIVE_V2_REVIEWERS,
  LEGACY_V1_REVIEWERS,
  ACTIVE_GATES,
  LEGACY_GATES,
  LEXICAL_GATES,
  ADMISSION_CONTEXTS,
  detectMixedTaxonomy,
  detectMixedGateKeys,
  admitGate,
  admitRouteGates,
  reviewerForDomain,
  ownersForSchema,
  reviewersForSchema,
};
