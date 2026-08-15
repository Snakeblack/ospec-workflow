"use strict";

const { computeGraphId } = require("./compiler.js");
const { createPolicySnapshot } = require("./policy-snapshot.js");

/**
 * Detects cycles in the DAG using Tarjan's or DFS coloring algorithm.
 * @param {Array<Object>} nodes
 * @returns {boolean} true if cycle detected
 */
function hasCycle(nodes) {
  const nodeMap = new Map();
  for (const node of nodes) {
    nodeMap.set(node.node_id, node);
  }

  // 0: unvisited, 1: visiting, 2: visited
  const state = new Map();
  for (const node of nodes) {
    state.set(node.node_id, 0);
  }

  function dfs(nodeId) {
    state.set(nodeId, 1);
    const node = nodeMap.get(nodeId);
    const deps = (node && Array.isArray(node.dependencies)) ? node.dependencies : [];

    for (const depId of deps) {
      if (!nodeMap.has(depId)) continue;
      const depState = state.get(depId);
      if (depState === 1) return true; // back-edge = cycle
      if (depState === 0) {
        if (dfs(depId)) return true;
      }
    }

    state.set(nodeId, 2);
    return false;
  }

  for (const node of nodes) {
    if (state.get(node.node_id) === 0) {
      if (dfs(node.node_id)) return true;
    }
  }

  return false;
}

/**
 * Computes the transitive descendant closure for a set of affected nodes in a DAG.
 * @param {Array<Object>} nodes - All semantic nodes in the DAG
 * @param {string[]} affectedNodeIds - Initial set of directly affected node IDs
 * @returns {Set<string>} Transitive closure of invalidated node IDs (including affectedNodeIds)
 */
function computeDescendantClosure(nodes, affectedNodeIds) {
  // Build reverse adjacency list: parent -> children (nodes that depend on parent)
  const childrenMap = new Map();
  for (const node of nodes) {
    childrenMap.set(node.node_id, new Set());
  }

  for (const node of nodes) {
    const deps = Array.isArray(node.dependencies) ? node.dependencies : [];
    for (const depId of deps) {
      if (childrenMap.has(depId)) {
        childrenMap.get(depId).add(node.node_id);
      }
    }
  }

  const invalidated = new Set();
  const queue = [...affectedNodeIds];

  for (const id of affectedNodeIds) {
    invalidated.add(id);
  }

  while (queue.length > 0) {
    const currentId = queue.shift();
    const children = childrenMap.get(currentId) || new Set();

    for (const childId of children) {
      if (!invalidated.has(childId)) {
        invalidated.add(childId);
        queue.push(childId);
      }
    }
  }

  return invalidated;
}

/**
 * Applies a ClarifyEvent to an Execution Graph, computing transitive descendant closure
 * invalidation and updating graph digests.
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

  let policyBundleDigest = graph.policy_bundle_digest;
  if (options.policySnapshot || options.effectiveRules) {
    const snapshot = createPolicySnapshot(options.policySnapshot || { effectiveRules: options.effectiveRules });
    policyBundleDigest = snapshot.policy_bundle_digest;
  }

  const updatedGraphId = computeGraphId(
    graph.contract_digest,
    policyBundleDigest,
    graph.source_snapshot_id,
    graph.nodes
  );

  const updatedGraph = {
    ...graph,
    graph_id: updatedGraphId,
    policy_bundle_digest: policyBundleDigest,
  };

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
