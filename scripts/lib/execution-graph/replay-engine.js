"use strict";

const { sha256Fingerprint } = require("../canonical-json.js");
const { hasCycle } = require("./clarify.js");

/**
 * Topologically sorts DAG nodes.
 * @param {Array<Object>} nodes
 * @returns {Array<Object>}
 */
function topologicalSort(nodes) {
  const inDegree = new Map();
  const adj = new Map();
  const nodeMap = new Map();

  for (const node of nodes) {
    nodeMap.set(node.node_id, node);
    inDegree.set(node.node_id, 0);
    adj.set(node.node_id, []);
  }

  for (const node of nodes) {
    const deps = Array.isArray(node.dependencies) ? node.dependencies : [];
    for (const dep of deps) {
      if (adj.has(dep)) {
        adj.get(dep).push(node.node_id);
        inDegree.set(node.node_id, inDegree.get(node.node_id) + 1);
      }
    }
  }

  const queue = [];
  for (const [nodeId, degree] of inDegree.entries()) {
    if (degree === 0) queue.push(nodeId);
  }

  const sorted = [];
  while (queue.length > 0) {
    const u = queue.shift();
    sorted.push(nodeMap.get(u));

    for (const v of adj.get(u) || []) {
      inDegree.set(v, inDegree.get(v) - 1);
      if (inDegree.get(v) === 0) queue.push(v);
    }
  }

  if (sorted.length !== nodes.length) {
    const err = new Error("Dependency cycle detected during topological sort");
    err.code = "cyclic-dependency-detected";
    throw err;
  }

  return sorted;
}

/**
 * Executes a deterministic fixture-based replay on the Execution Graph.
 * Operates purely on pre-recorded fixtures without live network or worker invocations.
 *
 * @param {Object} graph - ExecutionGraph instance
 * @param {Object} [fixtureResults] - Map of nodeId -> recorded worker result
 * @returns {{ ok: boolean, completedNodes: string[], failedNodes: string[], blockedNodes: string[], finalStateDigest: string, trace: Array<Object>, counterexample: Object|null }}
 */
function replayExecutionGraph(graph, fixtureResults = {}) {
  if (!graph || typeof graph !== "object" || !Array.isArray(graph.nodes)) {
    throw new TypeError("graph must be an ExecutionGraph object with a nodes array");
  }

  if (hasCycle(graph.nodes)) {
    const err = new Error("Dependency cycle detected in Execution Graph");
    err.code = "cyclic-dependency-detected";
    throw err;
  }

  const sortedNodes = topologicalSort(graph.nodes);

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

    if (recorded.ok === false || recorded.outcome === "failed") {
      failedNodes.add(nodeId);
      nodeOutcomes[nodeId] = { status: "failed", error: recorded.error || "Execution recorded failure" };
      trace.push({
        node_id: nodeId,
        action: "execute",
        status: "failed",
        error: recorded.error || "failed",
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
