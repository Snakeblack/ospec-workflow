"use strict";

const REQUIRED_DIMENSIONS = Object.freeze([
  "steps",
  "dependencies",
  "diffs",
  "inventory",
  "obligations",
  "invariants",
  "execution_metrics",
]);

const ALL_EVALUATED_DIMENSIONS = REQUIRED_DIMENSIONS;

function canonicalizeValue(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

function extractSteps(route) {
  if (!route) return [];
  if (Array.isArray(route.steps)) return route.steps.map(canonicalizeValue);
  if (Array.isArray(route.nodes)) return route.nodes.map((n) => canonicalizeValue(n.operation));
  if (Array.isArray(route.workResults)) {
    return route.workResults.map((wr) => canonicalizeValue(wr.work_order_id));
  }
  return [];
}

function extractDependencies(route) {
  if (!route) return [];
  if (Array.isArray(route.dependencies)) {
    return route.dependencies.map((d) => canonicalizeValue(d)).sort();
  }
  if (Array.isArray(route.nodes)) {
    return route.nodes
      .map((n) =>
        canonicalizeValue({
          node_id: n.node_id,
          dependencies: Array.isArray(n.dependencies) ? [...n.dependencies].sort() : [],
        })
      )
      .sort();
  }
  return [];
}

function extractDiffHash(route) {
  if (!route) return "";
  if (route.diff_hash) return String(route.diff_hash);
  if (route.candidate && route.candidate.diff_hash) return String(route.candidate.diff_hash);
  if (typeof route.combinedDiffText === "string") return route.combinedDiffText;
  if (typeof route.patch === "string") return route.patch;
  return "";
}

function extractInventory(route) {
  if (!route) return [];
  if (Array.isArray(route.inventory)) return [...route.inventory].map(canonicalizeValue).sort();
  if (route.candidate && Array.isArray(route.candidate.paths)) {
    return [...route.candidate.paths].map(canonicalizeValue).sort();
  }
  if (Array.isArray(route.paths)) return [...route.paths].map(canonicalizeValue).sort();
  if (Array.isArray(route.filesystem_inventory)) {
    return route.filesystem_inventory.map((item) => canonicalizeValue(typeof item === "string" ? item : item.path)).sort();
  }
  return [];
}

function extractObligations(route) {
  if (!route) return [];
  if (Array.isArray(route.obligations)) {
    return route.obligations.map((o) => (typeof o === "string" ? o : o.id || o.name || JSON.stringify(o))).sort();
  }
  return [];
}

function extractInvariants(route) {
  if (!route) return [];
  if (Array.isArray(route.invariants)) {
    return [...route.invariants].map(canonicalizeValue).sort();
  }
  return [];
}

const CLOCK_UNSTABLE_KEYS = new Set(["started_at", "finished_at", "duration_ms"]);

function stripClockFields(value) {
  if (Array.isArray(value)) return value.map(stripClockFields);
  if (value && typeof value === "object") {
    const out = {};
    for (const [key, nested] of Object.entries(value)) {
      if (!CLOCK_UNSTABLE_KEYS.has(key)) out[key] = stripClockFields(nested);
    }
    return out;
  }
  return value;
}

function extractExecutionMetrics(route) {
  if (!route) return [];
  if (Array.isArray(route.execution_metrics)) {
    return route.execution_metrics.map(canonicalizeValue).sort();
  }
  if (route.graph_telemetry && typeof route.graph_telemetry === "object") {
    return Object.keys(route.graph_telemetry)
      .sort()
      .map((nodeId) => canonicalizeValue({ node_id: nodeId, ...stripClockFields(route.graph_telemetry[nodeId] || {}) }));
  }
  return [];
}

function areArraysEqual(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function evaluateDimension(name, shadowValue, baselineValue, comparedEqual, evaluated, rates, divergences) {
  evaluated.push(name);
  const isMatch = comparedEqual(shadowValue, baselineValue);
  rates[name] = isMatch ? 1 : 0;
  if (!isMatch) {
    divergences.push({
      dimension: name,
      shadow: shadowValue,
      baseline: baselineValue,
    });
  }
}

/**
 * Compares shadow execution outcome against fixed baseline route in a non-mutating, read-only manner.
 * Always evaluates the seven required dimensions; empty extracted values are still evaluations
 * and MUST NOT appear in skipped_dimensions. Full-match cannot be claimed if any required
 * dimension was skipped.
 *
 * @param {Object} shadowResult
 * @param {Object} baselineResult
 * @returns {{
 *   match: boolean,
 *   discrepancy_classification: "full-match" | "partial-match" | "diverged",
 *   evaluated_dimensions: string[],
 *   skipped_dimensions: string[],
 *   dimension_match_rates: Record<string, number>,
 *   telemetryDiff: Object | null,
 *   shadowSummary: Object,
 *   baselineSummary: Object
 * }}
 */
function compareShadowExecution(shadowResult, baselineResult) {
  const shadow = shadowResult || {};
  const baseline = baselineResult || {};

  const evaluated_dimensions = [];
  const skipped_dimensions = [];
  const dimension_match_rates = {};
  const divergences = [];

  const shadowSteps = extractSteps(shadow);
  const baselineSteps = extractSteps(baseline);
  evaluateDimension("steps", shadowSteps, baselineSteps, areArraysEqual, evaluated_dimensions, dimension_match_rates, divergences);

  const shadowDependencies = extractDependencies(shadow);
  const baselineDependencies = extractDependencies(baseline);
  evaluateDimension("dependencies", shadowDependencies, baselineDependencies, areArraysEqual, evaluated_dimensions, dimension_match_rates, divergences);

  const shadowDiff = extractDiffHash(shadow);
  const baselineDiff = extractDiffHash(baseline);
  evaluateDimension("diffs", shadowDiff, baselineDiff, (a, b) => a === b, evaluated_dimensions, dimension_match_rates, divergences);

  const shadowInventory = extractInventory(shadow);
  const baselineInventory = extractInventory(baseline);
  evaluateDimension("inventory", shadowInventory, baselineInventory, areArraysEqual, evaluated_dimensions, dimension_match_rates, divergences);

  const shadowObligations = extractObligations(shadow);
  const baselineObligations = extractObligations(baseline);
  evaluateDimension("obligations", shadowObligations, baselineObligations, areArraysEqual, evaluated_dimensions, dimension_match_rates, divergences);

  const shadowInvariants = extractInvariants(shadow);
  const baselineInvariants = extractInvariants(baseline);
  evaluateDimension("invariants", shadowInvariants, baselineInvariants, areArraysEqual, evaluated_dimensions, dimension_match_rates, divergences);

  const shadowMetrics = extractExecutionMetrics(shadow);
  const baselineMetrics = extractExecutionMetrics(baseline);
  evaluateDimension("execution_metrics", shadowMetrics, baselineMetrics, areArraysEqual, evaluated_dimensions, dimension_match_rates, divergences);

  const skippedRequired = skipped_dimensions.filter((d) => REQUIRED_DIMENSIONS.includes(d));
  const allRequiredEvaluated = REQUIRED_DIMENSIONS.every((d) => evaluated_dimensions.includes(d));
  const allRequiredMatch = REQUIRED_DIMENSIONS.every((d) => dimension_match_rates[d] === 1);
  const match = allRequiredEvaluated && skippedRequired.length === 0 && allRequiredMatch;

  let discrepancy_classification;
  if (match) {
    discrepancy_classification = "full-match";
  } else {
    const matchCount = Object.values(dimension_match_rates).filter((rate) => rate === 1).length;
    discrepancy_classification = matchCount > 0 ? "partial-match" : "diverged";
  }

  const telemetryDiff = match
    ? null
    : {
        divergences,
        dimension_match_rates,
        divergence_count: divergences.length,
      };

  return {
    match,
    discrepancy_classification,
    evaluated_dimensions,
    skipped_dimensions,
    dimension_match_rates,
    telemetryDiff,
    shadowSummary: {
      steps_count: shadowSteps.length,
      has_diff: !!shadowDiff,
      obligations_count: shadowObligations.length,
      inventory_count: shadowInventory.length,
      dependencies_count: shadowDependencies.length,
      execution_metrics_count: shadowMetrics.length,
    },
    baselineSummary: {
      steps_count: baselineSteps.length,
      has_diff: !!baselineDiff,
      obligations_count: baselineObligations.length,
      inventory_count: baselineInventory.length,
      dependencies_count: baselineDependencies.length,
      execution_metrics_count: baselineMetrics.length,
    },
  };
}

module.exports = {
  compareShadowExecution,
  ALL_EVALUATED_DIMENSIONS,
  REQUIRED_DIMENSIONS,
};
