"use strict";

/**
 * Executes non-mutating shadow comparison between compiled graph decisions and fixed baseline.
 * Operates purely as a read-only observer with zero state/journal mutations across multiple dimensions:
 * invariants, obligations, dependencies, ownership, steps, and allowed_paths.
 *
 * @param {Object} params
 * @param {Object} params.contractInput - Input contract / state parameters
 * @param {Function} params.fixedBaselineFn - Synchronous or pure baseline route function
 * @param {Object} params.compiledGraph - ExecutionGraph instance
 * @returns {{ match: boolean, baselineRoute: Object, shadowRoute: Object, telemetryDiff: Object|null }}
 */
function compareShadowExecution({ contractInput, fixedBaselineFn, compiledGraph } = {}) {
  if (typeof fixedBaselineFn !== "function") {
    throw new TypeError("fixedBaselineFn must be a function");
  }
  if (!compiledGraph || typeof compiledGraph !== "object" || !Array.isArray(compiledGraph.nodes)) {
    throw new TypeError("compiledGraph must be a valid ExecutionGraph object");
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
    ? compiledGraph.obligations.map((o) => (typeof o === "string" ? o : o.id)).sort()
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

  // Compare steps/operations
  if (Array.isArray(baselineRoute.steps)) {
    if (JSON.stringify(baselineRoute.steps) !== JSON.stringify(shadowSteps)) {
      divergences.push({
        field: "steps",
        baseline: baselineRoute.steps,
        shadow: shadowSteps,
      });
    }
  }

  // Compare allowed paths if present in baseline
  if (Array.isArray(baselineRoute.allowed_paths)) {
    const baselinePaths = [...baselineRoute.allowed_paths].sort();
    if (JSON.stringify(baselinePaths) !== JSON.stringify(shadowAllowedPaths)) {
      divergences.push({
        field: "allowed_paths",
        baseline: baselinePaths,
        shadow: shadowAllowedPaths,
      });
    }
  }

  // Compare invariants if present in baseline
  if (Array.isArray(baselineRoute.invariants)) {
    const baselineInvariants = [...baselineRoute.invariants].sort();
    if (JSON.stringify(baselineInvariants) !== JSON.stringify(shadowInvariants)) {
      divergences.push({
        field: "invariants",
        baseline: baselineInvariants,
        shadow: shadowInvariants,
      });
    }
  }

  // Compare obligations if present in baseline
  if (Array.isArray(baselineRoute.obligations)) {
    const baselineObligations = baselineRoute.obligations
      .map((o) => (typeof o === "string" ? o : o.id))
      .sort();
    if (JSON.stringify(baselineObligations) !== JSON.stringify(shadowObligations)) {
      divergences.push({
        field: "obligations",
        baseline: baselineObligations,
        shadow: shadowObligations,
      });
    }
  }

  // Compare dependencies if present in baseline
  if (baselineRoute.dependencies !== undefined) {
    const normalizedBaselineDeps = Array.isArray(baselineRoute.dependencies)
      ? baselineRoute.dependencies
      : Object.entries(baselineRoute.dependencies).map(([node_id, deps]) => ({
          node_id,
          dependencies: Array.isArray(deps) ? [...deps].sort() : [],
        }));
    if (JSON.stringify(normalizedBaselineDeps) !== JSON.stringify(shadowDependencies)) {
      divergences.push({
        field: "dependencies",
        baseline: normalizedBaselineDeps,
        shadow: shadowDependencies,
      });
    }
  }

  // Compare ownership if present in baseline
  if (baselineRoute.ownership !== undefined) {
    const normalizedBaselineOwnership = Array.isArray(baselineRoute.ownership)
      ? baselineRoute.ownership
      : Object.entries(baselineRoute.ownership).map(([node_id, ownership]) => ({
          node_id,
          ownership,
        }));
    if (JSON.stringify(normalizedBaselineOwnership) !== JSON.stringify(shadowOwnership)) {
      divergences.push({
        field: "ownership",
        baseline: normalizedBaselineOwnership,
        shadow: shadowOwnership,
      });
    }
  }

  const match = divergences.length === 0;

  const telemetryDiff = match
    ? null
    : {
        timestamp: new Date().toISOString(),
        divergences,
        baselineSummary: baselineRoute,
        shadowSummary: shadowRoute,
      };

  return {
    match,
    baselineRoute,
    shadowRoute,
    telemetryDiff,
  };
}

const compareShadowDecisions = compareShadowExecution;

module.exports = {
  compareShadowExecution,
  compareShadowDecisions,
};

