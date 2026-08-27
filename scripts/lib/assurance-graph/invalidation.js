"use strict";

/**
 * Cycle-safe selective invalidation over the four K6b relations.
 *
 * `from --derived-from|verified-by|satisfies--> to` means `from` depends on `to`.
 * `from --invalidates--> to` means `from` directly invalidates `to`.
 *
 * @param {object} graph
 * @param {{ predecessorCandidate?: object, successorCandidate?: object, changedSubjectIds?: string[] }} [opts]
 * @returns {{ invalidated_node_ids: string[], preserved_evidence_ids: string[], edges: object[] }}
 */
function computeInvalidationClosure(graph, opts = {}) {
  const nodes = Array.isArray(graph && graph.nodes) ? graph.nodes : [];
  const edges = Array.isArray(graph && graph.edges) ? graph.edges : [];
  const evidenceIds = new Set(nodes.filter((node) => node.kind === "test-evidence").map((node) => node.id));

  const dependents = new Map();
  const invalidatesForward = new Map();
  function add(map, key, value) {
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(value);
  }
  for (const edge of edges) {
    if (!edge || !edge.from || !edge.to) continue;
    if (edge.relation === "invalidates") {
      add(invalidatesForward, edge.from, edge.to);
    } else if (
      edge.relation === "derived-from" ||
      edge.relation === "verified-by" ||
      edge.relation === "satisfies"
    ) {
      add(dependents, edge.to, edge.from);
    }
  }

  const seeds = new Set(opts.changedSubjectIds || []);
  if (opts.predecessorCandidate && opts.predecessorCandidate.candidate_id) {
    seeds.add(opts.predecessorCandidate.candidate_id);
  }
  if (opts.successorCandidate && opts.successorCandidate.candidate_id) {
    seeds.add(opts.successorCandidate.candidate_id);
  }

  const visited = new Set();
  const stack = [...seeds];
  while (stack.length > 0) {
    const current = stack.pop();
    if (visited.has(current)) continue;
    visited.add(current);
    for (const next of dependents.get(current) || []) stack.push(next);
    for (const next of invalidatesForward.get(current) || []) stack.push(next);
  }

  const invalidated = [...visited].sort();
  const preserved = [...evidenceIds].filter((id) => !visited.has(id)).sort();
  const affectedEdges = edges
    .filter((edge) => visited.has(edge.from) || visited.has(edge.to))
    .map((edge) => ({ from: edge.from, relation: edge.relation, to: edge.to }));

  return {
    invalidated_node_ids: invalidated,
    preserved_evidence_ids: preserved,
    edges: affectedEdges,
  };
}

/**
 * Walk the Assurance Graph to see if `evidenceId` sits in the invalidation
 * frontier used to reject stale reuse.
 *
 * Aligns with `computeInvalidationClosure`:
 * 1. Seeds are the destinations (`edge.to`) of `invalidates` edges, not the
 *    changed subjects / predecessor-successor candidate ids.
 * 2. The BFS then uses the same dependents + invalidatesForward pair as the
 *    closure (`from --derived-from|verified-by|satisfies--> to` makes `from`
 *    depend on `to`; `invalidates` walks forward).
 *
 * @param {object} graph
 * @param {string} evidenceId
 * @returns {boolean}
 */
function isEvidenceTransitivelyInvalidated(graph, evidenceId) {
  if (!graph || !evidenceId) return false;
  const invalidatesEdges = (graph.edges || []).filter((edge) => edge.relation === "invalidates");
  if (invalidatesEdges.length === 0) return false;
  const seeds = [...new Set(invalidatesEdges.map((edge) => edge.to).filter(Boolean))];
  const closure = computeInvalidationClosure(graph, { changedSubjectIds: seeds });
  return closure.invalidated_node_ids.includes(evidenceId);
}

module.exports = {
  computeInvalidationClosure,
  isEvidenceTransitivelyInvalidated,
};
