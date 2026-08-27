"use strict";

const { validateBindings } = require("./bindings.js");
const { selectStrategy, evaluateStrategy } = require("./strategy-policy.js");
const { normalizeEvidence } = require("./evidence.js");
const { emitVerification } = require("./verdict.js");
const {
  projectAssuranceGraph,
  emitEquivalenceManifest,
  isEvidenceTransitivelyInvalidated,
} = require("../assurance-graph/index.js");

function fail(reason_code, error) {
  return { ok: false, reason_code, error: error || reason_code };
}

/**
 * Independently verify a frozen Candidate v2.
 * Worker narrative is not authority. Evidence stays distinct from verdict.
 *
 * @param {object} input
 * @returns {{ ok: boolean, strategy?: string, evidence?: object[], verification?: object, reason_code?: string }}
 */
function verifyCandidate(input) {
  const bound = validateBindings(input);
  if (!bound.ok) return bound;

  const strategy = selectStrategy(input.declaredStrategy);
  const rawList = Array.isArray(input.rawEvidence) ? input.rawEvidence : [];
  const classified = [];

  for (const raw of rawList) {
    const normalized = normalizeEvidence(raw, bound.candidate, bound.executionGraph);
    if (!normalized.ok) return normalized;
    if (input.priorAssuranceGraph && isEvidenceTransitivelyInvalidated(input.priorAssuranceGraph, normalized.evidence.evidence_id)) {
      return fail("STALE_EVIDENCE", "evidence is reachable through a transitive invalidates edge");
    }
    classified.push(normalized);
  }

  const evaluated = evaluateStrategy(strategy, classified);
  if (!evaluated.ok) return evaluated;

  const evidenceRecords = classified.map((item) => item.evidence);
  const hasNonRuntimeExtra = classified.some(
    (item) => item.evidence.provenance === "external-unverified" || item.evidence.provenance === "human-decision"
  );
  const verdict = hasNonRuntimeExtra ? "PASS WITH WARNINGS" : "PASS";
  const verification = emitVerification({
    candidateId: bound.candidate.candidate_id,
    evidenceIds: evidenceRecords.map((record) => record.evidence_id),
    verdict,
  });

  const projected = projectAssuranceGraph({
    canonicalInputs: input.canonicalInputs || {
      contract: input.contract,
      sourceSnapshot: input.sourceSnapshot,
    },
    candidate: bound.candidate,
    executionGraph: bound.executionGraph,
    evidence: classified,
    verification,
  });

  const result = {
    ok: true,
    strategy,
    evidence: evidenceRecords,
    verification,
  };
  if (projected.ok) {
    result.assurance_graph = projected.graph;
    result.equivalence_manifest = emitEquivalenceManifest(projected.graph);
  }
  return result;
}

module.exports = {
  verifyCandidate,
  validateBindings: require("./bindings.js").validateBindings,
  selectStrategy: require("./strategy-policy.js").selectStrategy,
  evaluateStrategy: require("./strategy-policy.js").evaluateStrategy,
  normalizeEvidence: require("./evidence.js").normalizeEvidence,
  emitVerification,
};
