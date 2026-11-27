"use strict";

/**
 * Detects cycles in the DAG using DFS 3-state coloring algorithm.
 * @param {Array<Object>} nodes
 * @returns {boolean} true if cycle detected
 */
function hasCycle(nodes) {
  if (!Array.isArray(nodes) || nodes.length === 0) {
    return false;
  }

  const ids = [];
  for (const node of nodes) {
    if (node && node.node_id) {
      ids.push(node.node_id);
    }
  }
  if (new Set(ids).size !== ids.length) {
    const err = new Error("Duplicate node_id detected in DAG nodes");
    err.code = "duplicate-node-id";
    throw err;
  }

  const nodeMap = new Map();
  for (const node of nodes) {
    if (node && node.node_id) {
      nodeMap.set(node.node_id, node);
    }
  }

  // 0: unvisited, 1: visiting, 2: visited
  const state = new Map();
  for (const node of nodes) {
    if (node && node.node_id) {
      state.set(node.node_id, 0);
    }
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

  for (const [nodeId] of nodeMap) {
    if (state.get(nodeId) === 0) {
      if (dfs(nodeId)) return true;
    }
  }

  return false;
}

/**
 * Topologically sorts DAG nodes using Kahn's algorithm with cycle guard.
 * @param {Array<Object>} nodes
 * @returns {Array<Object>} sorted nodes in dependency order
 */
function topologicalSort(nodes) {
  if (!Array.isArray(nodes) || nodes.length === 0) {
    return [];
  }

  const ids = [];
  for (const node of nodes) {
    if (node && node.node_id) {
      ids.push(node.node_id);
    }
  }
  if (new Set(ids).size !== ids.length) {
    const err = new Error("Duplicate node_id detected in DAG nodes");
    err.code = "duplicate-node-id";
    throw err;
  }

  const inDegree = new Map();
  const adj = new Map();
  const nodeMap = new Map();

  for (const node of nodes) {
    if (!node || !node.node_id) continue;
    nodeMap.set(node.node_id, node);
    inDegree.set(node.node_id, 0);
    adj.set(node.node_id, []);
  }

  for (const node of nodes) {
    if (!node || !node.node_id) continue;
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
 * Computes the transitive descendant closure for a set of affected nodes in a DAG.
 * @param {Array<Object>} nodes - All semantic nodes in the DAG
 * @param {string[]|Set<string>} affectedNodeIds - Initial set of directly affected node IDs
 * @returns {Set<string>} Transitive closure of invalidated node IDs (including affectedNodeIds)
 */
function computeDescendantClosure(nodes, affectedNodeIds) {
  if (!Array.isArray(nodes) || nodes.length === 0) {
    return new Set(affectedNodeIds || []);
  }

  const ids = [];
  for (const node of nodes) {
    if (node && node.node_id) {
      ids.push(node.node_id);
    }
  }
  if (new Set(ids).size !== ids.length) {
    const err = new Error("Duplicate node_id detected in DAG nodes");
    err.code = "duplicate-node-id";
    throw err;
  }

  // Build reverse adjacency list: parent -> children (nodes that depend on parent)
  const childrenMap = new Map();
  for (const node of nodes) {
    if (!node || !node.node_id) continue;
    childrenMap.set(node.node_id, new Set());
  }

  for (const node of nodes) {
    if (!node || !node.node_id) continue;
    const deps = Array.isArray(node.dependencies) ? node.dependencies : [];
    for (const depId of deps) {
      if (childrenMap.has(depId)) {
        childrenMap.get(depId).add(node.node_id);
      }
    }
  }

  const invalidated = new Set();
  const queue = Array.isArray(affectedNodeIds)
    ? [...affectedNodeIds]
    : Array.from(affectedNodeIds || []);

  for (const id of queue) {
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

module.exports = {
  hasCycle,
  topologicalSort,
  computeDescendantClosure,
};
