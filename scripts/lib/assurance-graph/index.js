"use strict";

const { projectAssuranceGraph, rejectForbidden } = require("./projector.js");
const { computeInvalidationClosure, isEvidenceTransitivelyInvalidated } = require("./invalidation.js");

function fail(reason_code, error) {
  return { ok: false, reason_code, error: error || reason_code };
}

/**
 * Recompute the projection from persistable outputs and fail closed on divergence.
 *
 * @param {object} stored
 * @param {object} canonicalInput
 * @returns {{ ok: true, graph: object } | { ok: false, reason_code: string }}
 */
function reconcileAssuranceGraph(stored, canonicalInput) {
  const projected = projectAssuranceGraph(canonicalInput);
  if (!projected.ok) return projected;
  if (!stored || typeof stored !== "object" || stored.graph_id !== projected.graph.graph_id) {
    return fail("GRAPH_DIVERGENCE", "stored Assurance Graph does not recompute from canonical inputs");
  }
  const storedEdges = JSON.stringify((stored.edges || []).map((e) => [e.from, e.relation, e.to]).sort());
  const projectedEdges = JSON.stringify(
    projected.graph.edges.map((e) => [e.from, e.relation, e.to]).sort()
  );
  if (storedEdges !== projectedEdges) {
    return fail("GRAPH_DIVERGENCE", "stored edges diverge from canonical projection");
  }
  return { ok: true, graph: projected.graph };
}

/**
 * Replay a projection from persistable assessments, evidence, verification, and canonical_inputs.
 * Never consumes ephemeral projector obligation_ids.
 *
 * @param {object} persistable
 * @returns {{ ok: true, graph: object } | { ok: false, reason_code: string }}
 */
function replayAssuranceGraph(persistable = {}) {
  return projectAssuranceGraph({
    canonicalInputs: persistable.canonical_inputs || persistable.canonicalInputs,
    candidate: persistable.candidate,
    executionGraph: persistable.executionGraph,
    evidence: persistable.evidence,
    assessments: persistable.assessments,
    verification: persistable.verification,
  });
}

function emitEquivalenceManifest(graph) {
  if (!graph || typeof graph.graph_id !== "string" || typeof graph.candidate_id !== "string") {
    return fail("GRAPH_DIVERGENCE", "manifest requires graph_id and candidate_id");
  }
  return {
    kind: "equivalence-manifest/v1",
    graph_id: graph.graph_id,
    candidate_id: graph.candidate_id,
  };
}

/**
 * Assurance Graph never grants lifecycle, approval, or delivery authority.
 *
 * @param {object} [_intent]
 * @returns {{ ok: false, reason_code: string, error: string }}
 */
function rejectAuthorityMisuse(_intent) {
  return fail(
    "GRAPH_AUTHORITY_MISUSE",
    "Assurance Graph is a derived projection; OpenSpec/Git/Candidate remain sole semantic authority"
  );
}

module.exports = {
  projectAssuranceGraph,
  reconcileAssuranceGraph,
  replayAssuranceGraph,
  rejectForbidden,
  computeInvalidationClosure,
  isEvidenceTransitivelyInvalidated,
  emitEquivalenceManifest,
  rejectAuthorityMisuse,
};
