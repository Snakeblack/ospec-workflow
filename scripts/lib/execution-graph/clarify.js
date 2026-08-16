"use strict";

const { computeGraphId } = require("./compiler.js");
const { createPolicySnapshot } = require("./policy-snapshot.js");
const { hasCycle, computeDescendantClosure } = require("./dag.js");
const { validateExecutionGraphBinding } = require("./binding.js");

/**
 * Applies a ClarifyEvent to an Execution Graph, mutating affected nodes with clarification context,
 * computing transitive descendant closure invalidation and updating graph digests.
 * @param {Object} graph - ExecutionGraph instance
 * @param {Object} clarifyEvent - Typed ClarifyEvent record
 * @param {Object} [options] - Additional recompile options
 * @returns {{ graph: Object, invalidatedNodeIds: string[], preservedNodeIds: string[] }}
 */
function applyClarifyEvent(graph, clarifyEvent, options = {}) {
  if (!graph || typeof graph !== "object" || !Array.isArray(graph.nodes)) {
    throw new TypeError("graph must be a valid ExecutionGraph object with a nodes array");
  }
  if (!clarifyEvent || typeof clarifyEvent !== "object") {
    throw new TypeError("clarifyEvent must be an object");
  }

  // Pre-validate input graph cryptographic binding
  const preCheck = validateExecutionGraphBinding(graph);
  if (!preCheck.ok) {
    const err = new Error(`Input ExecutionGraph binding validation failed: ${preCheck.error}`);
    err.code = preCheck.reason_code === "GRAPH_ID_MISMATCH" ? "graph-id-mismatch" : (preCheck.reason_code || "invalid-graph");
    throw err;
  }

  const affectedNodes = Array.isArray(clarifyEvent.affected_nodes) ? clarifyEvent.affected_nodes : [];
  if (affectedNodes.length === 0) {
    const err = new Error("clarifyEvent must specify at least one affected node in affected_nodes");
    err.code = "missing-affected-nodes";
    throw err;
  }

  // Check for dependency cycles in the graph
  if (hasCycle(graph.nodes)) {
    const err = new Error("Dependency cycle detected in Execution Graph");
    err.code = "cyclic-dependency-detected";
    throw err;
  }

  const existingNodeIds = new Set(graph.nodes.map((n) => n.node_id));

  // Verify all affected nodes exist in graph
  for (const affectedId of affectedNodes) {
    if (!existingNodeIds.has(affectedId)) {
      const err = new Error(`ClarifyEvent references unknown node_id: "${affectedId}"`);
      err.code = "unknown-affected-node";
      err.node_id = affectedId;
      throw err;
    }
  }

  const invalidatedSet = computeDescendantClosure(graph.nodes, affectedNodes);
  const invalidatedNodeIds = Array.from(invalidatedSet);
  const preservedNodeIds = graph.nodes
    .map((n) => n.node_id)
    .filter((id) => !invalidatedSet.has(id));

  // Mutate affected nodes with clarify answer context
  const updatedNodes = graph.nodes.map((node) => {
    if (affectedNodes.includes(node.node_id)) {
      return {
        ...node,
        clarification_context: {
          event_id: clarifyEvent.event_id,
          question_id: clarifyEvent.question_id,
          answer: clarifyEvent.answer,
        },
      };
    }
    return { ...node };
  });

  let policySnapshotId = graph.policy_snapshot_id;
  let policyBundleDigest = graph.policy_bundle_digest;
  if (options.policySnapshot || options.effectiveRules) {
    const snapshot = createPolicySnapshot(options.policySnapshot || { effectiveRules: options.effectiveRules });
    policyBundleDigest = snapshot.policy_bundle_digest;
    policySnapshotId = snapshot.snapshot_id;
  }

  const updatedGraphId = computeGraphId(
    graph.contract_digest,
    policySnapshotId,
    policyBundleDigest,
    graph.source_snapshot_id,
    updatedNodes,
    graph.obligations
  );

  const updatedGraph = {
    ...graph,
    graph_id: updatedGraphId,
    policy_snapshot_id: policySnapshotId,
    policy_bundle_digest: policyBundleDigest,
    nodes: updatedNodes,
    obligations: graph.obligations ? structuredClone(graph.obligations) : [],
  };

  // Post-validate mutated graph cryptographic binding
  const postCheck = validateExecutionGraphBinding(updatedGraph);
  if (!postCheck.ok) {
    const err = new Error(`Clarified ExecutionGraph binding validation failed: ${postCheck.error}`);
    err.code = postCheck.reason_code || "invalid-graph";
    throw err;
  }

  return {
    graph: updatedGraph,
    invalidatedNodeIds,
    preservedNodeIds,
  };
}

const processClarifyEvent = applyClarifyEvent;
const calculateDescendantClosure = computeDescendantClosure;

module.exports = {
  hasCycle,
  computeDescendantClosure,
  calculateDescendantClosure,
  applyClarifyEvent,
  processClarifyEvent,
};

