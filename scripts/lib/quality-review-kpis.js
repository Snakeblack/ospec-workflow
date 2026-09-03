"use strict";

const FORMULA_VERSION = "quality-review-kpis/v1";
const KPI_NAMES = Object.freeze([
  "semantic_router_invocation_rate",
  "specialists_per_gate",
  "zero_model_gate_rate",
  "full_review_rate",
  "tokens_per_quality_gate",
  "tokens_per_finding",
  "router_delta_rate",
]);

const QUALITY_SPECIALIST_PHASES = /^review-(trust|runtime|evolution|efficiency)$/;
const QUALITY_GATE_PHASES = /^review-(trust|runtime|evolution|efficiency|change|correction)$/;

function envelope(name, value, { available = true, source = "runtime-derived", coverage = "full", reason_code = null } = {}) {
  return { name, value, available, source, coverage, reason_code, formula_version: FORMULA_VERSION };
}

function unavailable(name, source, reason_code) {
  return envelope(name, null, { available: false, source, coverage: "none", reason_code });
}

function deriveQualityReviewKpis({ gateAudit = {}, phaseCosts = [], cx0Records = [] } = {}) {
  const gates = Array.isArray(gateAudit.records) ? gateAudit.records : gateAudit ? [gateAudit] : [];
  const qualityRows = (Array.isArray(phaseCosts) ? phaseCosts : []).filter((row) =>
    row && QUALITY_GATE_PHASES.test(row.phase));
  const specialistRows = qualityRows.filter((row) => QUALITY_SPECIALIST_PHASES.test(row.phase));
  const reviewChangeRows = qualityRows.filter((row) => row.phase === "review-change");
  const totalGates = gates.length;
  let reviewChangeInvocations = reviewChangeRows.length;
  let routerDelta = reviewChangeRows.filter((row) => row.router_delta === true).length;
  if (reviewChangeInvocations === 0) {
    reviewChangeInvocations = gates.filter((g) => g.review_change_invoked === true || (g.router && typeof g.router === "object")).length;
    routerDelta = gates.filter((g) => g.router && g.router.classification_status === "sufficient" && Array.isArray(g.router.added_domains) && g.router.added_domains.length).length;
  }
  const semanticRouterGates = gates.filter((g) => g.router_invoked === true || g.review_change_invoked === true || (g.router && g.router.invoked === true)).length;
  const zeroModel = gates.filter((g) =>
    g.schema_version === 2 &&
    g.status === "done" &&
    g.classification_status === "sufficient" &&
    Array.isArray(g.selected_domains) &&
    g.selected_domains.length === 0).length;
  const fullReview = gates.filter((g) => {
    const domains = new Set(Array.isArray(g.dispatched_domains) ? g.dispatched_domains : (Array.isArray(g.selected_domains) ? g.selected_domains : []));
    return ["trust", "runtime", "evolution", "efficiency"].every((domain) => domains.has(domain));
  }).length;
  const specialistsPerGate = totalGates ? specialistRows.length / totalGates : null;
  const tokenTotal = qualityRows.reduce((sum, row) => sum + (Number.isFinite(row.tokens) ? row.tokens : 0), 0);
  const tokensPerGate = totalGates && qualityRows.length ? tokenTotal / totalGates : null;
  const blockingFindings = gates.reduce((sum, g) => sum + (Number.isInteger(g.blocking_findings) && g.blocking_findings > 0 ? g.blocking_findings : 0), 0);
  const tokensPerFinding = blockingFindings > 0 && qualityRows.length ? tokenTotal / blockingFindings : null;

  return {
    formula_version: FORMULA_VERSION,
    kpis: [
      totalGates
        ? envelope("semantic_router_invocation_rate", semanticRouterGates / totalGates, { source: "runtime-derived" })
        : unavailable("semantic_router_invocation_rate", "estimated", "insufficient-gate-audit"),
      specialistsPerGate !== null
        ? envelope("specialists_per_gate", specialistsPerGate, { source: "host-observed", coverage: specialistRows.length ? "partial" : "none" })
        : unavailable("specialists_per_gate", "estimated", "insufficient-gate-audit"),
      totalGates
        ? envelope("zero_model_gate_rate", zeroModel / totalGates, { source: "runtime-derived" })
        : unavailable("zero_model_gate_rate", "estimated", "insufficient-gate-audit"),
      totalGates
        ? envelope("full_review_rate", fullReview / totalGates, { source: "runtime-derived" })
        : unavailable("full_review_rate", "estimated", "insufficient-gate-audit"),
      tokensPerGate !== null
        ? envelope("tokens_per_quality_gate", tokensPerGate, { source: "host-observed" })
        : unavailable("tokens_per_quality_gate", "estimated", "host-field-unavailable"),
      tokensPerFinding !== null
        ? envelope("tokens_per_finding", tokensPerFinding, { source: "runtime-derived" })
        : unavailable("tokens_per_finding", "estimated", blockingFindings ? "host-field-unavailable" : "no-blocking-findings"),
      reviewChangeInvocations
        ? envelope("router_delta_rate", routerDelta / reviewChangeInvocations, { source: "runtime-derived" })
        : unavailable("router_delta_rate", "estimated", "insufficient-router-invocations"),
    ],
    cx0_records_seen: Array.isArray(cx0Records) ? cx0Records.length : 0,
  };
}

module.exports = { deriveQualityReviewKpis, FORMULA_VERSION, KPI_NAMES };
