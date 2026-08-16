"use strict";

const { sha256Fingerprint } = require("../canonical-json.js");
const { hasCycle, topologicalSort } = require("./dag.js");
const { validateExecutionGraphBinding } = require("./binding.js");

/**
 * Executes a deterministic fixture-based replay on the Execution Graph.
 * Operates purely on pre-recorded fixtures without live network or worker invocations.
 *
 * @param {Object} graph - ExecutionGraph instance
 * @param {Object} [fixtureResults] - Map of nodeId -> recorded worker result
 * @param {Object} [options] - Replay options
 * @param {string[]|Set<string>} [options.invalidatedNodeIds] - Transitive invalidated node IDs
 * @returns {{ ok: boolean, completedNodes: string[], failedNodes: string[], blockedNodes: string[], finalStateDigest: string, trace: Array<Object>, counterexample: Object|null }}
 */
function replayExecutionGraph(graph, fixtureResults = {}, options = {}) {
  if (!graph || typeof graph !== "object" || !Array.isArray(graph.nodes)) {
    throw new TypeError("graph must be an ExecutionGraph object with a nodes array");
  }

  // Pre-validate cryptographic binding of execution graph
  const bindingCheck = validateExecutionGraphBinding(graph, options);
  if (!bindingCheck.ok) {
    const code = bindingCheck.reason_code === "GRAPH_ID_MISMATCH"
      ? "graph-id-mismatch"
      : (bindingCheck.reason_code || "invalid-graph-binding");
    const err = new Error(`ExecutionGraph binding validation failed: ${bindingCheck.error}`);
    err.code = code;
    throw err;
  }

  if (hasCycle(graph.nodes)) {
    const err = new Error("Dependency cycle detected in Execution Graph");
    err.code = "cyclic-dependency-detected";
    throw err;
  }

  const invalidatedSet = new Set(options.invalidatedNodeIds || []);
  for (const nodeId of invalidatedSet) {
    if (fixtureResults && fixtureResults[nodeId] !== undefined) {
      const err = new Error(`Stale fixture result supplied for invalidated node "${nodeId}"`);
      err.code = "stale-fixture-rejected";
      err.node_id = nodeId;
      throw err;
    }
  }

  const sortedNodes = topologicalSort(graph.nodes);

  let compiledWorkOrdersMap = null;
  function getWorkOrdersMap() {
    if (!compiledWorkOrdersMap) {
      try {
        const { compileWorkOrdersV2 } = require("./work-order-compiler.js");
        const orders = compileWorkOrdersV2(graph);
        compiledWorkOrdersMap = new Map(orders.map((wo) => [wo.node_id, wo]));
      } catch {
        compiledWorkOrdersMap = new Map();
      }
    }
    return compiledWorkOrdersMap;
  }

  const completedNodes = new Set();
  const failedNodes = new Set();
  const blockedNodes = new Set();
  const collectedEvidence = new Map(); // evidenceId -> evidenceData
  const trace = [];
  const nodeOutcomes = {};

  for (const node of sortedNodes) {
    const nodeId = node.node_id;
    const deps = Array.isArray(node.dependencies) ? node.dependencies : [];

    // Check if any prerequisite failed or was blocked
    const unfulfilledDeps = deps.filter((d) => !completedNodes.has(d));
    if (unfulfilledDeps.length > 0) {
      blockedNodes.add(nodeId);
      nodeOutcomes[nodeId] = { status: "blocked", reason: `Prerequisite dependencies not completed: ${unfulfilledDeps.join(", ")}` };
      trace.push({
        node_id: nodeId,
        action: "evaluate",
        status: "blocked",
        unfulfilled_dependencies: unfulfilledDeps,
      });
      continue;
    }

    const recorded = fixtureResults[nodeId];
    if (!recorded || typeof recorded !== "object") {
      blockedNodes.add(nodeId);
      nodeOutcomes[nodeId] = { status: "unfulfilled", reason: "No fixture result recorded for node" };
      trace.push({
        node_id: nodeId,
        action: "evaluate",
        status: "unfulfilled",
        note: "missing fixture result",
      });
      continue;
    }

    // Verify fixture graph/order provenance if declared in fixture
    if (recorded.graph_id && recorded.graph_id !== graph.graph_id) {
      const err = new Error(`Stale fixture result with mismatched graph_id "${recorded.graph_id}" for node "${nodeId}" (expected "${graph.graph_id}")`);
      err.code = "stale-fixture-rejected";
      err.node_id = nodeId;
      throw err;
    }

    if (recorded.work_order_id) {
      const woMap = getWorkOrdersMap();
      const expectedWo = woMap.get(nodeId);
      if (expectedWo && expectedWo.work_order_id !== recorded.work_order_id) {
        const err = new Error(`Stale fixture result with mismatched work_order_id "${recorded.work_order_id}" for node "${nodeId}" (expected "${expectedWo.work_order_id}")`);
        err.code = "stale-fixture-rejected";
        err.node_id = nodeId;
        throw err;
      }
    }

    const hasStatus = recorded.status !== undefined && recorded.status !== null;
    const hasOutcome = recorded.outcome !== undefined && recorded.outcome !== null;
    const isExplicitlyOkFalse = recorded.ok === false;

    const isCancelled = recorded.status === "cancelled" || recorded.outcome === "cancelled";
    const isFailed = recorded.status === "failed" || recorded.outcome === "failed";
    const hasContradiction =
      (hasStatus && hasOutcome && recorded.status !== recorded.outcome) ||
      (isExplicitlyOkFalse && (recorded.status === "completed" || recorded.outcome === "completed")) ||
      (isCancelled && (recorded.status === "completed" || recorded.outcome === "completed")) ||
      (isFailed && (recorded.status === "completed" || recorded.outcome === "completed"));

    const isCompleted =
      !isExplicitlyOkFalse &&
      !isCancelled &&
      !isFailed &&
      !hasContradiction &&
      ((hasStatus && recorded.status === "completed") || (hasOutcome && recorded.outcome === "completed"));

    if (!isCompleted) {
      const statusValue = isCancelled ? "cancelled" : (hasContradiction ? "failed" : (recorded.status || recorded.outcome || "failed"));
      const errorMsg = recorded.error || (isCancelled ? "Execution recorded cancelled" : (hasContradiction ? "Contradictory status/outcome recorded in fixture" : "Execution failed or incomplete status"));
      failedNodes.add(nodeId);
      nodeOutcomes[nodeId] = { status: statusValue, error: errorMsg };
      trace.push({
        node_id: nodeId,
        action: "execute",
        status: statusValue,
        error: errorMsg,
      });
      continue;
    }

    // Node required evidence verification
    const nodeRequiredEvidence = Array.isArray(node.required_evidence) ? node.required_evidence : [];
    const recordedEvidenceKeys = recorded.evidence && typeof recorded.evidence === "object"
      ? Object.keys(recorded.evidence)
      : [];
    const missingNodeEvidence = nodeRequiredEvidence.filter((evKey) => !recordedEvidenceKeys.includes(evKey));

    if (missingNodeEvidence.length > 0) {
      const errorMsg = `Node "${nodeId}" missing required evidence: ${missingNodeEvidence.join(", ")}`;
      failedNodes.add(nodeId);
      nodeOutcomes[nodeId] = {
        status: "failed",
        error: errorMsg,
        missing_evidence: missingNodeEvidence,
      };
      trace.push({
        node_id: nodeId,
        action: "execute",
        status: "failed",
        error: errorMsg,
        missing_evidence: missingNodeEvidence,
      });
      continue;
    }

    // Completed node
    completedNodes.add(nodeId);
    nodeOutcomes[nodeId] = { status: "completed", evidence: recorded.evidence || {} };
    if (recorded.evidence && typeof recorded.evidence === "object") {
      for (const [evId, evData] of Object.entries(recorded.evidence)) {
        collectedEvidence.set(evId, evData);
      }
    }
    trace.push({
      node_id: nodeId,
      action: "execute",
      status: "completed",
      evidence_keys: Object.keys(recorded.evidence || {}),
    });
  }

  // Obligation verification
  const unfulfilledObligations = [];
  const obligations = Array.isArray(graph.obligations) ? graph.obligations : [];

  for (const obligation of obligations) {
    if (obligation.criticality === "must") {
      if (obligation.deferred && obligation.deferred.reason && obligation.deferred.approved_by) {
        continue;
      }

      const implementedBy = Array.isArray(obligation.implemented_by) ? obligation.implemented_by : [];
      const requiredEvidence = Array.isArray(obligation.required_evidence) ? obligation.required_evidence : [];

      const allImplementedCompleted =
        implementedBy.length > 0 && implementedBy.every((id) => completedNodes.has(id));
      const allEvidenceCollected =
        requiredEvidence.length > 0 && requiredEvidence.every((id) => collectedEvidence.has(id));

      if (!allImplementedCompleted || !allEvidenceCollected) {
        unfulfilledObligations.push({
          id: obligation.id,
          allImplementedCompleted,
          allEvidenceCollected,
          missingEvidence: requiredEvidence.filter((id) => !collectedEvidence.has(id)),
        });
      }
    }
  }

  const allCompleted =
    failedNodes.size === 0 &&
    blockedNodes.size === 0 &&
    completedNodes.size === graph.nodes.length &&
    unfulfilledObligations.length === 0;

  const finalStateDigest = sha256Fingerprint("execution-graph-replay/v1", {
    graph_id: graph.graph_id,
    completedNodes: Array.from(completedNodes).sort(),
    failedNodes: Array.from(failedNodes).sort(),
    blockedNodes: Array.from(blockedNodes).sort(),
    nodeOutcomes,
  });

  let counterexample = null;
  if (!allCompleted) {
    let failureReason = "Replay did not complete all graph nodes";
    let firstFailedNode = null;
    if (failedNodes.size > 0) {
      firstFailedNode = Array.from(failedNodes)[0];
      failureReason = `Node "${firstFailedNode}" failed execution: ${nodeOutcomes[firstFailedNode]?.error || "unknown"}`;
    } else if (unfulfilledObligations.length > 0) {
      failureReason = `MUST obligations lacked required evidence: ${unfulfilledObligations.map((o) => o.id).join(", ")}`;
    } else if (blockedNodes.size > 0) {
      failureReason = `Nodes were blocked or unfulfilled: ${Array.from(blockedNodes).join(", ")}`;
    }

    counterexample = {
      graph_id: graph.graph_id,
      reason: failureReason,
      failed_node: firstFailedNode,
      blocked_nodes: Array.from(blockedNodes),
      unfulfilled_obligations: unfulfilledObligations,
      trace,
    };
  }

  return {
    ok: allCompleted,
    completedNodes: Array.from(completedNodes),
    failedNodes: Array.from(failedNodes),
    blockedNodes: Array.from(blockedNodes),
    finalStateDigest,
    trace,
    counterexample,
  };
}

module.exports = {
  topologicalSort,
  replayExecutionGraph,
};

