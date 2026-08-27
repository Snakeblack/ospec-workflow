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
const FORBIDDEN_KINDS = Object.freeze([
  "finding",
  "attestation",
  "authorization",
  "evaluation-attestation",
]);
const FORBIDDEN_NAMESPACES = Object.freeze([
  "finding",
  "attestation",
  "authorization",
  "evaluation-attestation",
]);
const SHA256 = /^sha256:[a-f0-9]{64}$/;

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

/**
 * Accept or reject subjects by structured kind/namespace. Never scan id substrings.
 *
 * @param {object[]} nodes
 * @param {object[]} edges
 * @returns {{ ok: true } | { ok: false, reason_code: string, error?: string }}
 */
function rejectForbidden(nodes, edges) {
  // One reason_code for kind, namespace, and relation; distinguish via error text.
  // FORBIDDEN_KINDS is defense-in-depth: checked before the allowlist so it is reachable.
  for (const node of nodes || []) {
    if (FORBIDDEN_KINDS.includes(node.kind)) {
      return fail("FORBIDDEN_RELATION", `forbidden kind ${node.kind}`);
    }
    if (!ALLOWED_NODE_KINDS.includes(node.kind)) {
      return fail("FORBIDDEN_RELATION", `forbidden node kind ${node.kind}`);
    }
    const namespace = typeof node.namespace === "string" ? node.namespace.toLowerCase() : "";
    if (namespace && FORBIDDEN_NAMESPACES.includes(namespace)) {
      return fail("FORBIDDEN_RELATION", `forbidden namespace ${node.namespace}`);
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

function resolveCanonicalInputDigests(input) {
  const provided = input.canonicalInputs && typeof input.canonicalInputs === "object" ? input.canonicalInputs : {};
  const graph = input.executionGraph || {};
  const contract = provided.contract && typeof provided.contract === "object" ? provided.contract : {};

  const contractDigest = provided.contract_digest || contract.contract_digest || graph.contract_digest || null;
  const policySnapshotId = provided.policy_snapshot_id || graph.policy_snapshot_id || null;
  const executionGraphDigest = provided.execution_graph_digest || graph.graph_id || null;
  const openspecInputDigest =
    provided.openspec_input_digest ||
    sha256Fingerprint("openspec-input/v1", {
      contract_digest: contractDigest,
      source_snapshot_id: graph.source_snapshot_id || (provided.sourceSnapshot && provided.sourceSnapshot.source_snapshot_id) || null,
    });

  return {
    contract_digest: contractDigest,
    policy_snapshot_id: policySnapshotId,
    execution_graph_digest: executionGraphDigest,
    openspec_input_digest: openspecInputDigest,
  };
}

function persistableCanonicalInputs(digests) {
  const persistable = {};
  for (const key of ["contract_digest", "policy_snapshot_id", "execution_graph_digest", "openspec_input_digest"]) {
    if (typeof digests[key] === "string" && SHA256.test(digests[key])) {
      persistable[key] = digests[key];
    }
  }
  return persistable;
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
    return fail("GRAPH_PROJECTION_FAILED", "frozen candidate is required to project");
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
  }

  // Persistable assessments become evidence→obligation `satisfies` edges.
  // Assessment is not a node; distinct roles of the same pair collapse via canonicalize.
  const assessments = Array.isArray(input.assessments) ? input.assessments : [];
  for (const assessment of assessments) {
    if (!assessment || !assessment.evidence_id || !assessment.obligation_id) continue;
    pushNode(nodes, assessment.evidence_id, "test-evidence");
    pushNode(nodes, assessment.obligation_id, "requirement");
    pushEdge(edges, assessment.evidence_id, "satisfies", assessment.obligation_id);
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
  const canonicalInputs = resolveCanonicalInputDigests(input);
  const graphId = sha256Fingerprint("assurance-graph/v1", {
    candidate_id: candidateId,
    contract_digest: canonicalInputs.contract_digest,
    policy_snapshot_id: canonicalInputs.policy_snapshot_id,
    execution_graph_digest: canonicalInputs.execution_graph_digest,
    openspec_input_digest: canonicalInputs.openspec_input_digest,
    nodes: canonical.nodes,
    edges: canonical.edges,
  });

  const resultGraph = {
    schema_version: 1,
    kind: "assurance-graph/v1",
    graph_id: graphId,
    candidate_id: candidateId,
    nodes: canonical.nodes.map(cloneNode),
    edges: canonical.edges.map(cloneEdge),
  };
  const persistedInputs = persistableCanonicalInputs(canonicalInputs);
  if (Object.keys(persistedInputs).length > 0) {
    resultGraph.canonical_inputs = persistedInputs;
  }

  return { ok: true, graph: resultGraph };
}

module.exports = {
  ALLOWED_RELATIONS,
  canonicalize,
  rejectForbidden,
  projectAssuranceGraph,
};
