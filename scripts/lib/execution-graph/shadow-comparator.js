"use strict";

/**
 * Executes non-mutating shadow comparison between compiled graph decisions and fixed baseline.
 * Operates purely as a read-only observer with zero state/journal mutations.
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

  const shadowRoute = {
    route: "repair",
    graph_id: compiledGraph.graph_id,
    steps: shadowSteps,
    allowed_paths: shadowAllowedPaths,
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
