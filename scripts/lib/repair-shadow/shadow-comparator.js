"use strict";

const { topologicalSort } = require("../execution-graph/dag.js");

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
const PROJECTION_KIND = "repair-shadow-comparison-projection/v1";

function canonicalizeValue(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
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

function invalidProjectionResult() {
  return {
    ok: false,
    match: false,
    reason_code: "INVALID_COMPARISON_PROJECTION",
    discrepancy_classification: "diverged",
    evaluated_dimensions: [],
    skipped_dimensions: [...REQUIRED_DIMENSIONS],
    dimension_match_rates: {},
    telemetryDiff: {
      divergences: [],
      dimension_match_rates: {},
      divergence_count: 0,
      reason_code: "INVALID_COMPARISON_PROJECTION",
    },
    shadowSummary: {},
    baselineSummary: {},
  };
}

function isValidComparisonProjection(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  if (value.kind !== PROJECTION_KIND) return false;
  for (const key of REQUIRED_DIMENSIONS) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) return false;
  }
  if (!Array.isArray(value.steps)) return false;
  for (const step of value.steps) {
    if (typeof step !== "string" || step.length < 1) return false;
  }
  return true;
}

/**
 * Builds a canonical comparison projection from graph-bound artifacts.
 * `steps` is the topological node_id sequence and MUST NOT use operation or WorkOrderId.
 *
 * @param {{ executionGraph: object, candidate?: object, workResults?: object[], graphTelemetry?: object }} input
 * @returns {object}
 */
function buildComparisonProjection(input = {}) {
  const executionGraph = input.executionGraph;
  const candidate = input.candidate || {};
  const workResults = Array.isArray(input.workResults) ? input.workResults : [];
  const graphTelemetry = input.graphTelemetry || input.graph_telemetry || {};

  if (!executionGraph || !Array.isArray(executionGraph.nodes)) {
    const projection = {
      kind: PROJECTION_KIND,
    };
    return projection;
  }

  const sorted = topologicalSort(executionGraph.nodes);
  const steps = sorted.map((node) => String(node.node_id));
  const dependencies = sorted.map((node) => canonicalizeValue({
    node_id: node.node_id,
    dependencies: Array.isArray(node.dependencies) ? [...node.dependencies].sort() : [],
  }));
  const invariants = sorted.flatMap((node) =>
    Array.isArray(node.invariants) ? node.invariants.map(canonicalizeValue) : []
  );
  const obligations = Array.isArray(executionGraph.obligations)
    ? executionGraph.obligations.map((o) => (typeof o === "string" ? o : o.id || o.name || JSON.stringify(o))).sort()
    : [];
  const inventory = Array.isArray(candidate.paths) ? [...candidate.paths].map(canonicalizeValue).sort() : [];
  const diffs = candidate.diff_hash
    ? String(candidate.diff_hash)
    : workResults.map((wr) => wr && wr.patch ? wr.patch : "").join("\n");
  const execution_metrics = steps.map((nodeId) =>
    canonicalizeValue({
      node_id: nodeId,
      ...stripClockFields(graphTelemetry[nodeId] || {}),
    })
  );

  return {
    kind: PROJECTION_KIND,
    steps,
    dependencies,
    diffs,
    inventory,
    obligations,
    invariants,
    execution_metrics,
  };
}

/**
 * Compares shadow and baseline canonical projections. Non-projection inputs fail closed.
 *
 * @param {Object} shadowResult
 * @param {Object} baselineResult
 * @returns {Object}
 */
function compareShadowExecution(shadowResult, baselineResult) {
  if (!isValidComparisonProjection(shadowResult) || !isValidComparisonProjection(baselineResult)) {
    return invalidProjectionResult();
  }

  const evaluated_dimensions = [];
  const skipped_dimensions = [];
  const dimension_match_rates = {};
  const divergences = [];

  evaluateDimension("steps", shadowResult.steps, baselineResult.steps, areArraysEqual, evaluated_dimensions, dimension_match_rates, divergences);
  evaluateDimension("dependencies", shadowResult.dependencies, baselineResult.dependencies, areArraysEqual, evaluated_dimensions, dimension_match_rates, divergences);
  evaluateDimension("diffs", canonicalizeValue(shadowResult.diffs), canonicalizeValue(baselineResult.diffs), (a, b) => a === b, evaluated_dimensions, dimension_match_rates, divergences);
  evaluateDimension("inventory", shadowResult.inventory, baselineResult.inventory, areArraysEqual, evaluated_dimensions, dimension_match_rates, divergences);
  evaluateDimension("obligations", shadowResult.obligations, baselineResult.obligations, areArraysEqual, evaluated_dimensions, dimension_match_rates, divergences);
  evaluateDimension("invariants", shadowResult.invariants, baselineResult.invariants, areArraysEqual, evaluated_dimensions, dimension_match_rates, divergences);
  evaluateDimension("execution_metrics", shadowResult.execution_metrics, baselineResult.execution_metrics, areArraysEqual, evaluated_dimensions, dimension_match_rates, divergences);

  const allRequiredEvaluated = REQUIRED_DIMENSIONS.every((d) => evaluated_dimensions.includes(d));
  const allRequiredMatch = REQUIRED_DIMENSIONS.every((d) => dimension_match_rates[d] === 1);
  const match = allRequiredEvaluated && skipped_dimensions.length === 0 && allRequiredMatch;

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
    ok: true,
    match,
    discrepancy_classification,
    evaluated_dimensions,
    skipped_dimensions,
    dimension_match_rates,
    telemetryDiff,
    shadowSummary: {
      steps_count: shadowResult.steps.length,
      has_diff: !!shadowResult.diffs,
      obligations_count: Array.isArray(shadowResult.obligations) ? shadowResult.obligations.length : 0,
      inventory_count: Array.isArray(shadowResult.inventory) ? shadowResult.inventory.length : 0,
      dependencies_count: Array.isArray(shadowResult.dependencies) ? shadowResult.dependencies.length : 0,
      execution_metrics_count: Array.isArray(shadowResult.execution_metrics) ? shadowResult.execution_metrics.length : 0,
    },
    baselineSummary: {
      steps_count: baselineResult.steps.length,
      has_diff: !!baselineResult.diffs,
      obligations_count: Array.isArray(baselineResult.obligations) ? baselineResult.obligations.length : 0,
      inventory_count: Array.isArray(baselineResult.inventory) ? baselineResult.inventory.length : 0,
      dependencies_count: Array.isArray(baselineResult.dependencies) ? baselineResult.dependencies.length : 0,
      execution_metrics_count: Array.isArray(baselineResult.execution_metrics) ? baselineResult.execution_metrics.length : 0,
    },
  };
}

module.exports = {
  compareShadowExecution,
  buildComparisonProjection,
  isValidComparisonProjection,
  ALL_EVALUATED_DIMENSIONS,
  REQUIRED_DIMENSIONS,
  PROJECTION_KIND,
};
