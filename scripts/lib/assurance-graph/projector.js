"use strict";

const { sha256Fingerprint } = require("../canonical-json.js");

const ALLOWED_RELATIONS = Object.freeze(["verified-by", "satisfies", "derived-from", "invalidates"]);
const ALLOWED_NODE_KINDS = Object.freeze([
  "requirement",
  "graph-node",
  "work-order",
  "source",
  "candidate",
  "test-evidence",
  "verification-decision",
]);
const FORBIDDEN_NODE_KIND_MARKERS = Object.freeze([
  "finding",
  "attestation",
  "authorization",
  "evaluation-attestation",
  "reviewed-by",
]);

function fail(reason_code, error) {
  return { ok: false, reason_code, error: error || reason_code };
}

function cloneNode(node) {
  return { id: node.id, kind: node.kind };
}

function cloneEdge(edge) {
  return { from: edge.from, relation: edge.relation, to: edge.to };
}

function edgeKey(edge) {
  return `${edge.from}\0${edge.relation}\0${edge.to}`;
}

function canonicalize(nodes, edges) {
  const nodeMap = new Map();
  for (const node of nodes || []) {
    if (!node || typeof node.id !== "string") continue;
    nodeMap.set(`${node.id}\0${node.kind}`, cloneNode(node));
  }
  const canonicalNodes = [...nodeMap.values()].sort((a, b) => {
    const byId = a.id.localeCompare(b.id);
    return byId !== 0 ? byId : a.kind.localeCompare(b.kind);
  });

  const edgeMap = new Map();
  for (const edge of edges || []) {
    if (!edge) continue;
    edgeMap.set(edgeKey(edge), cloneEdge(edge));
  }
  const canonicalEdges = [...edgeMap.values()].sort((a, b) => edgeKey(a).localeCompare(edgeKey(b)));
  return { nodes: canonicalNodes, edges: canonicalEdges };
}

function rejectForbidden(nodes, edges) {
  for (const node of nodes || []) {
    if (!ALLOWED_NODE_KINDS.includes(node.kind)) {
      return fail("FORBIDDEN_RELATION", `forbidden node kind ${node.kind}`);
    }
    // Substring match on id+kind haystack: markers apply with includes() over
    // id or kind, not exact kind equality. ALLOWED_NODE_KINDS already covers
    // the exact kind allow-list above.
    const idAndKindHaystack = `${node.id} ${node.kind}`.toLowerCase();
    if (FORBIDDEN_NODE_KIND_MARKERS.some((marker) => idAndKindHaystack.includes(marker))) {
      return fail("FORBIDDEN_RELATION", `forbidden subject ${node.id}`);
    }
  }
  for (const edge of edges || []) {
    if (!ALLOWED_RELATIONS.includes(edge.relation)) {
      return fail("FORBIDDEN_RELATION", `forbidden relation ${edge.relation}`);
    }
  }
  return { ok: true };
}

function pushNode(nodes, id, kind) {
  if (!id) return;
  nodes.push({ id, kind });
}

function pushEdge(edges, from, relation, to) {
  if (!from || !to || !relation) return;
  edges.push({ from, relation, to });
}

/**
 * Derive a canonical Assurance Graph projection. Returns a new object.
 *
 * @param {object} input
 * @returns {{ ok: true, graph: object } | { ok: false, reason_code: string }}
 */
function projectAssuranceGraph(input = {}) {
  const candidate = input.candidate;
  if (!candidate || typeof candidate.candidate_id !== "string") {
    return fail("GRAPH_DIVERGENCE", "frozen candidate is required to project");
  }

  const nodes = [];
  const edges = [];
  const candidateId = candidate.candidate_id;
  pushNode(nodes, candidateId, "candidate");

  const graph = input.executionGraph;
  if (graph) {
    if (graph.source_snapshot_id) {
      pushNode(nodes, graph.source_snapshot_id, "source");
      pushEdge(edges, candidateId, "derived-from", graph.source_snapshot_id);
    }
    for (const node of graph.nodes || []) {
      if (node && node.node_id) {
        pushNode(nodes, node.node_id, "graph-node");
      }
    }
    for (const obligation of graph.obligations || []) {
      if (obligation && obligation.id) {
        pushNode(nodes, obligation.id, "requirement");
      }
    }
  }

  const evidenceItems = Array.isArray(input.evidence) ? input.evidence : [];
  for (const item of evidenceItems) {
    const record = item && item.evidence ? item.evidence : item;
    if (!record || !record.evidence_id) continue;
    pushNode(nodes, record.evidence_id, "test-evidence");
    pushEdge(edges, record.evidence_id, "derived-from", candidateId);
    const obligationIds = item.obligation_ids || record.obligation_ids || [];
    for (const obligationId of obligationIds) {
      pushNode(nodes, obligationId, "requirement");
      pushEdge(edges, record.evidence_id, "satisfies", obligationId);
    }
  }

  const verification = input.verification;
  if (verification && verification.verification_id) {
    pushNode(nodes, verification.verification_id, "verification-decision");
    pushEdge(edges, candidateId, "verified-by", verification.verification_id);
    for (const evidenceId of verification.evidence_ids || []) {
      pushEdge(edges, verification.verification_id, "verified-by", evidenceId);
    }
  }

  for (const extra of input.additionalEdges || []) {
    edges.push(extra);
  }
  for (const extra of input.additionalNodes || []) {
    nodes.push(extra);
  }

  const forbidden = rejectForbidden(nodes, edges);
  if (!forbidden.ok) return forbidden;

  const canonical = canonicalize(nodes, edges);
  const graphId = sha256Fingerprint("assurance-graph/v1", {
    candidate_id: candidateId,
    nodes: canonical.nodes,
    edges: canonical.edges,
  });

  return {
    ok: true,
    graph: {
      schema_version: 1,
      kind: "assurance-graph/v1",
      graph_id: graphId,
      candidate_id: candidateId,
      nodes: canonical.nodes.map(cloneNode),
      edges: canonical.edges.map(cloneEdge),
    },
  };
}

module.exports = {
  ALLOWED_RELATIONS,
  canonicalize,
  projectAssuranceGraph,
};
