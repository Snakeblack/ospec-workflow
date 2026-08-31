"use strict";

const { sha256Fingerprint } = require("../canonical-json.js");
const { validateChallengeResultSet } = require("../adversarial-challenges/integrity.js");

const ALLOWED_RELATIONS = Object.freeze(["verified-by", "satisfies", "derived-from", "invalidates"]);
const ALLOWED_NODE_KINDS = Object.freeze([
  "requirement",
  "graph-node",
  "work-order",
  "source",
  "candidate",
  "test-evidence",
  "verification-decision",
  "challenge-plan",
  "challenge-result",
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

function computeGraphId(payload) {
  return sha256Fingerprint("assurance-graph/v1", {
    candidate_id: payload.candidate_id,
    contract_digest: payload.canonical_inputs.contract_digest,
    policy_snapshot_id: payload.canonical_inputs.policy_snapshot_id,
    execution_graph_digest: payload.canonical_inputs.execution_graph_digest,
    openspec_input_digest: payload.canonical_inputs.openspec_input_digest,
    nodes: payload.nodes,
    edges: payload.edges,
  });
}

function resolveCanonicalInputDigests(input) {
  const provided = input.canonicalInputs && typeof input.canonicalInputs === "object" ? input.canonicalInputs : {};
  const graph = input.executionGraph || {};
  const contract = provided.contract && typeof provided.contract === "object" ? provided.contract : {};

  const contractDigest = provided.contract_digest || contract.contract_digest || graph.contract_digest || null;
  const policySnapshotId = provided.policy_snapshot_id || graph.policy_snapshot_id || null;
  const executionGraphDigest = provided.execution_graph_digest || graph.graph_id || null;

  const canonicalOpenspecDigest = sha256Fingerprint("openspec-input/v1", {
    contract_digest: contractDigest,
    source_snapshot_id: graph.source_snapshot_id || (provided.sourceSnapshot && provided.sourceSnapshot.source_snapshot_id) || null,
  });

  if (provided.openspec_input_digest && provided.openspec_input_digest !== canonicalOpenspecDigest) {
    return fail("GRAPH_DIVERGENCE", "provided openspec_input_digest contradicts canonical derivation");
  }

  const digests = {
    contract_digest: contractDigest,
    policy_snapshot_id: policySnapshotId,
    execution_graph_digest: executionGraphDigest,
    openspec_input_digest: canonicalOpenspecDigest,
  };
  for (const [key, value] of Object.entries(digests)) {
    if (typeof value !== "string" || !SHA256.test(value)) {
      return fail("GRAPH_DIVERGENCE", `canonical input ${key} must be a resolved sha256 digest`);
    }
  }
  const suppliedContract = provided.contract_digest || contract.contract_digest;
  if (suppliedContract && suppliedContract !== graph.contract_digest) {
    return fail("GRAPH_DIVERGENCE", "canonical contract digest contradicts Execution Graph");
  }
  if (provided.policy_snapshot_id && provided.policy_snapshot_id !== graph.policy_snapshot_id) {
    return fail("GRAPH_DIVERGENCE", "canonical policy snapshot contradicts Execution Graph");
  }
  if (provided.execution_graph_digest && provided.execution_graph_digest !== graph.graph_id) {
    return fail("GRAPH_DIVERGENCE", "canonical execution graph digest contradicts Execution Graph");
  }
  return { ok: true, canonical_inputs: digests };
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

  const challengePlan = input.challengePlan || input.challenge_plan;
  const challengeResults = Array.isArray(input.challengeResults) ? input.challengeResults : (Array.isArray(input.challenge_results) ? input.challenge_results : []);
  const challengesRequired = Boolean(input.requireChallengeVerification || input.require_challenge_verification);
  if (challengesRequired && !challengePlan) return fail("GRAPH_DIVERGENCE", "mandatory K6c challenge plan is absent");
  if (challengePlan || challengeResults.length > 0) {
    const gate = validateChallengeResultSet(challengePlan, challengeResults, {
      candidate,
      executionGraph: graph,
      policySnapshot: input.policySnapshot,
      evidenceStrategy: input.evidenceStrategy,
    });
    if (!gate.ok || challengeResults.some((result) => result.outcome !== "passed")) return fail("GRAPH_DIVERGENCE", (gate && gate.error) || "K6c challenge material is not accepted");
    pushNode(nodes, challengePlan.plan_id, "challenge-plan");
    pushEdge(edges, challengePlan.plan_id, "derived-from", candidateId);
    for (const result of challengeResults) {
      pushNode(nodes, result.result_id, "challenge-result");
      pushEdge(edges, result.result_id, "derived-from", challengePlan.plan_id);
      if (input.verification && input.verification.verification_id) pushEdge(edges, input.verification.verification_id, "verified-by", result.result_id);
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
  // Conditional projection: satisfies edge emitted ONLY when evidence_requirements_satisfied.length > 0
  const assessments = Array.isArray(input.assessments) ? input.assessments : [];
  for (const assessment of assessments) {
    if (!assessment || !assessment.evidence_id || !assessment.obligation_id) continue;
    pushNode(nodes, assessment.evidence_id, "test-evidence");
    pushNode(nodes, assessment.obligation_id, "requirement");
    const satisfied = assessment.evidence_requirements_satisfied;
    if (Array.isArray(satisfied) && satisfied.length > 0) {
      pushEdge(edges, assessment.evidence_id, "satisfies", assessment.obligation_id);
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
  const resolvedInputs = resolveCanonicalInputDigests(input);
  if (!resolvedInputs.ok) return resolvedInputs;
  const canonicalInputs = resolvedInputs.canonical_inputs;
  const graphId = computeGraphId({
    candidate_id: candidateId,
    canonical_inputs: canonicalInputs,
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
  resultGraph.canonical_inputs = canonicalInputs;

  return { ok: true, graph: resultGraph };
}

module.exports = {
  ALLOWED_RELATIONS,
  canonicalize,
  computeGraphId,
  resolveCanonicalInputDigests,
  rejectForbidden,
  projectAssuranceGraph,
};
