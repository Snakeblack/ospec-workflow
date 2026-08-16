"use strict";

const { validateExecutionGraphBinding } = require("./binding.js");

const ALL_DIMENSIONS = Object.freeze([
  "steps",
  "allowed_paths",
  "invariants",
  "obligations",
  "dependencies",
  "ownership",
]);

/**
 * Executes non-mutating shadow comparison between compiled graph decisions and fixed baseline.
 * Operates purely as a read-only observer with zero state/journal mutations across multiple dimensions:
 * invariants, obligations, dependencies, ownership, steps, and allowed_paths.
 *
 * @param {Object} params
 * @param {Object} params.contractInput - Input contract / state parameters
 * @param {Function} params.fixedBaselineFn - Synchronous or pure baseline route function
 * @param {Object} params.compiledGraph - ExecutionGraph instance
 * @returns {{ match: boolean, discrepancy_classification: string, evaluated_dimensions: string[], skipped_dimensions: string[], dimension_match_rates: Object, baselineRoute: Object, shadowRoute: Object, telemetryDiff: Object|null }}
 */
function compareShadowExecution({ contractInput, fixedBaselineFn, compiledGraph } = {}) {
  if (typeof fixedBaselineFn !== "function") {
    throw new TypeError("fixedBaselineFn must be a function");
  }
  if (!compiledGraph || typeof compiledGraph !== "object" || !Array.isArray(compiledGraph.nodes)) {
    throw new TypeError("compiledGraph must be a valid ExecutionGraph object");
  }

  // Pre-validate cryptographic binding of compiled graph
  const bindingCheck = validateExecutionGraphBinding(compiledGraph);
  if (!bindingCheck.ok) {
    const code = bindingCheck.reason_code === "GRAPH_ID_MISMATCH"
      ? "graph-id-mismatch"
      : (bindingCheck.reason_code || "invalid-graph-binding");
    const err = new Error(`ExecutionGraph binding validation failed: ${bindingCheck.error}`);
    err.code = code;
    throw err;
  }

  // Keep the active contract state isolated even when a legacy baseline mutates its input.
  const baselineRoute = fixedBaselineFn(structuredClone(contractInput));

  // Derive shadow route summary from compiled DAG
  const shadowSteps = compiledGraph.nodes.map((n) => n.operation);
  const shadowAllowedPaths = Array.from(
    new Set(compiledGraph.nodes.flatMap((n) => (Array.isArray(n.allowed_paths) ? n.allowed_paths : [])))
  ).sort();
  const shadowInvariants = Array.from(
    new Set(compiledGraph.nodes.flatMap((n) => (Array.isArray(n.invariants) ? n.invariants : [])))
  ).sort();
  const shadowObligations = Array.isArray(compiledGraph.obligations)
    ? compiledGraph.obligations.map((o) => ({
        id: typeof o === "string" ? o : o.id,
        criticality: typeof o === "string" ? "must" : (o.criticality || "must"),
        implemented_by: typeof o === "object" && Array.isArray(o.implemented_by) ? [...o.implemented_by].sort() : [],
        required_evidence: typeof o === "object" && Array.isArray(o.required_evidence) ? [...o.required_evidence].sort() : [],
        deferred: typeof o === "object" && o.deferred ? { reason: o.deferred.reason, approved_by: o.deferred.approved_by } : null,
      })).sort((a, b) => a.id.localeCompare(b.id))
    : [];
  const shadowDependencies = compiledGraph.nodes.map((n) => ({
    node_id: n.node_id,
    dependencies: Array.isArray(n.dependencies) ? [...n.dependencies].sort() : [],
  }));
  const shadowOwnership = compiledGraph.nodes.map((n) => ({
    node_id: n.node_id,
    ownership: n.ownership,
  }));

  const shadowRoute = {
    route: "repair",
    graph_id: compiledGraph.graph_id,
    steps: shadowSteps,
    allowed_paths: shadowAllowedPaths,
    invariants: shadowInvariants,
    obligations: shadowObligations,
    dependencies: shadowDependencies,
    ownership: shadowOwnership,
    nodes_count: compiledGraph.nodes.length,
    obligations_count: (compiledGraph.obligations || []).length,
  };

  const divergences = [];
  const evaluated_dimensions = [];
  const skipped_dimensions = [];
  const dimension_match_rates = {};

  // Compare steps/operations
  if (baselineRoute && Array.isArray(baselineRoute.steps)) {
    evaluated_dimensions.push("steps");
    const isMatch = JSON.stringify(baselineRoute.steps) === JSON.stringify(shadowSteps);
    dimension_match_rates.steps = isMatch ? 1 : 0;
    if (!isMatch) {
      divergences.push({
        field: "steps",
        baseline: baselineRoute.steps,
        shadow: shadowSteps,
      });
    }
  } else {
    skipped_dimensions.push("steps");
  }

  // Compare allowed paths if present in baseline
  if (baselineRoute && Array.isArray(baselineRoute.allowed_paths)) {
    evaluated_dimensions.push("allowed_paths");
    const baselinePaths = [...baselineRoute.allowed_paths].sort();
    const isMatch = JSON.stringify(baselinePaths) === JSON.stringify(shadowAllowedPaths);
    dimension_match_rates.allowed_paths = isMatch ? 1 : 0;
    if (!isMatch) {
      divergences.push({
        field: "allowed_paths",
        baseline: baselinePaths,
        shadow: shadowAllowedPaths,
      });
    }
  } else {
    skipped_dimensions.push("allowed_paths");
  }

  // Compare invariants if present in baseline
  if (baselineRoute && Array.isArray(baselineRoute.invariants)) {
    evaluated_dimensions.push("invariants");
    const baselineInvariants = [...baselineRoute.invariants].sort();
    const isMatch = JSON.stringify(baselineInvariants) === JSON.stringify(shadowInvariants);
    dimension_match_rates.invariants = isMatch ? 1 : 0;
    if (!isMatch) {
      divergences.push({
        field: "invariants",
        baseline: baselineInvariants,
        shadow: shadowInvariants,
      });
    }
  } else {
    skipped_dimensions.push("invariants");
  }

  // Compare obligations if present in baseline
  if (baselineRoute && Array.isArray(baselineRoute.obligations)) {
    evaluated_dimensions.push("obligations");
    const isStringBaseline = baselineRoute.obligations.length > 0 && typeof baselineRoute.obligations[0] === "string";
    const normalizedBaselineObligations = isStringBaseline
      ? baselineRoute.obligations.map((o) => (typeof o === "string" ? o : o.id)).sort()
      : baselineRoute.obligations
          .map((o) => ({
            id: typeof o === "string" ? o : o.id,
            criticality: typeof o === "string" ? "must" : (o.criticality || "must"),
            implemented_by: typeof o === "object" && Array.isArray(o.implemented_by) ? [...o.implemented_by].sort() : [],
            required_evidence: typeof o === "object" && Array.isArray(o.required_evidence) ? [...o.required_evidence].sort() : [],
            deferred: typeof o === "object" && o.deferred ? { reason: o.deferred.reason, approved_by: o.deferred.approved_by } : null,
          }))
          .sort((a, b) => a.id.localeCompare(b.id));

    const normalizedShadowObligations = isStringBaseline
      ? (Array.isArray(compiledGraph.obligations) ? compiledGraph.obligations.map((o) => (typeof o === "string" ? o : o.id)).sort() : [])
      : shadowObligations;

    const isMatch = JSON.stringify(normalizedBaselineObligations) === JSON.stringify(normalizedShadowObligations);
    dimension_match_rates.obligations = isMatch ? 1 : 0;
    if (!isMatch) {
      divergences.push({
        field: "obligations",
        baseline: normalizedBaselineObligations,
        shadow: normalizedShadowObligations,
      });
    }
  } else {
    skipped_dimensions.push("obligations");
  }

  // Compare dependencies if present in baseline
  if (baselineRoute && baselineRoute.dependencies !== undefined) {
    evaluated_dimensions.push("dependencies");
    const normalizedBaselineDeps = Array.isArray(baselineRoute.dependencies)
      ? baselineRoute.dependencies
      : Object.entries(baselineRoute.dependencies).map(([node_id, deps]) => ({
          node_id,
          dependencies: Array.isArray(deps) ? [...deps].sort() : [],
        }));
    const isMatch = JSON.stringify(normalizedBaselineDeps) === JSON.stringify(shadowDependencies);
    dimension_match_rates.dependencies = isMatch ? 1 : 0;
    if (!isMatch) {
      divergences.push({
        field: "dependencies",
        baseline: normalizedBaselineDeps,
        shadow: shadowDependencies,
      });
    }
  } else {
    skipped_dimensions.push("dependencies");
  }

  // Compare ownership if present in baseline
  if (baselineRoute && baselineRoute.ownership !== undefined) {
    evaluated_dimensions.push("ownership");
    const normalizedBaselineOwnership = Array.isArray(baselineRoute.ownership)
      ? baselineRoute.ownership
      : Object.entries(baselineRoute.ownership).map(([node_id, ownership]) => ({
          node_id,
          ownership,
        }));
    const isMatch = JSON.stringify(normalizedBaselineOwnership) === JSON.stringify(shadowOwnership);
    dimension_match_rates.ownership = isMatch ? 1 : 0;
    if (!isMatch) {
      divergences.push({
        field: "ownership",
        baseline: normalizedBaselineOwnership,
        shadow: shadowOwnership,
      });
    }
  } else {
    skipped_dimensions.push("ownership");
  }

  const match = divergences.length === 0;

  let discrepancy_classification = "full-match";
  if (!match) {
    discrepancy_classification = divergences.length === evaluated_dimensions.length && evaluated_dimensions.length > 0
      ? "diverged"
      : "partial-match";
  } else if (skipped_dimensions.length > 0) {
    discrepancy_classification = "partial-match";
  }

  const telemetryDiff = match
    ? null
    : {
        timestamp: new Date().toISOString(),
        divergences,
        evaluated_dimensions,
        skipped_dimensions,
        dimension_match_rates,
        discrepancy_classification,
        baselineSummary: baselineRoute,
        shadowSummary: shadowRoute,
      };

  return {
    match,
    discrepancy_classification,
    evaluated_dimensions,
    skipped_dimensions,
    dimension_match_rates,
    baselineRoute,
    shadowRoute,
    telemetryDiff,
  };
}

const compareShadowDecisions = compareShadowExecution;

module.exports = {
  ALL_DIMENSIONS,
  compareShadowExecution,
  compareShadowDecisions,
};

