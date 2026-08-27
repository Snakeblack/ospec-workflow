"use strict";

const { emitAssessment } = require("./assessment.js");
const { evaluateProvenanceSufficiency } = require("./evidence.js");

function fail(reason_code, error) {
  return { ok: false, reason_code, error: error || reason_code };
}

function isApprovedDeferred(obligation) {
  return Boolean(
    obligation &&
      obligation.deferred &&
      typeof obligation.deferred === "object" &&
      typeof obligation.deferred.reason === "string" &&
      obligation.deferred.reason.trim() !== "" &&
      typeof obligation.deferred.approved_by === "string" &&
      obligation.deferred.approved_by.trim() !== ""
  );
}

function isMust(obligation) {
  return String((obligation && obligation.criticality) || "must").toLowerCase() === "must";
}

function normalizedCoverage(item, requiredEvidence) {
  const supplied = item && (item.evidence_requirements_satisfied || (item.evidence && item.evidence.evidence_requirements_satisfied));
  const satisfied = Array.isArray(supplied)
    ? supplied.filter((token) => typeof token === "string")
    : [];
  const required = new Set(requiredEvidence);
  return [...new Set(satisfied.filter((token) => required.has(token)))].sort();
}

/**
 * Walk non-deferred MUST obligations after strategy evaluation.
 * Join key is persistable obligation_id, not K4a evidence tokens.
 *
 * @param {{ classified: object[], executionGraph: object, candidate: object, policySnapshotId: string }} input
 * @returns {{ ok: true, assessments: object[] } | { ok: false, reason_code: string, error?: string }}
 */
function walkMustObligations(input) {
  const classified = Array.isArray(input && input.classified) ? input.classified : [];
  const graph = input && input.executionGraph;
  const candidate = input && input.candidate;
  const policySnapshotId = input && input.policySnapshotId;
  if (!graph || !Array.isArray(graph.obligations)) {
    return fail("BINDING_MISMATCH", "executionGraph.obligations is required");
  }
  const obligations = graph.obligations;
  const byId = new Map();
  for (const obligation of obligations) {
    if (obligation && typeof obligation.id === "string") {
      byId.set(obligation.id, obligation);
    }
  }

  const assessments = [];

  for (const item of classified) {
    const obligationIds = Array.isArray(item.obligation_ids) ? item.obligation_ids : [];
    const nodeId = item.evidence && item.evidence.node_id;
    for (const obligationId of obligationIds) {
      const obligation = byId.get(obligationId);
      if (!obligation) {
        return fail("UNKNOWN_OBLIGATION_ID", `obligation_id ${obligationId} is not in the Obligation Manifest`);
      }
      const implementedBy = Array.isArray(obligation.implemented_by) ? obligation.implemented_by : [];
      if (!implementedBy.includes(nodeId)) {
        return fail(
          "WRONG_IMPLEMENTING_NODE",
          `node ${nodeId} does not implement obligation ${obligationId}`
        );
      }
    }
  }

  for (const obligation of obligations) {
    if (!isMust(obligation) || isApprovedDeferred(obligation)) continue;

    // Contract is non-empty presence of required_evidence, not token matching
    // against its contents. Empty or missing list fails closed as UNFULFILLED_MUST.
    const requiredEvidence = Array.isArray(obligation.required_evidence) ? obligation.required_evidence : [];
    if (requiredEvidence.length === 0) {
      return fail("UNFULFILLED_MUST", `MUST obligation ${obligation.id} has empty required_evidence`);
    }

    const implementedBy = Array.isArray(obligation.implemented_by) ? obligation.implemented_by : [];
    const matches = classified.filter((item) => {
      const ids = Array.isArray(item.obligation_ids) ? item.obligation_ids : [];
      return ids.includes(obligation.id) && implementedBy.includes(item.evidence && item.evidence.node_id);
    });

    const admissible = [];
    for (const item of matches) {
      const sufficiency = evaluateProvenanceSufficiency(item.evidence, { requireRuntime: true });
      if (sufficiency.ok) admissible.push(item);
    }
    if (admissible.length === 0) {
      const boundButInadmissible = matches.length > 0;
      if (boundButInadmissible) {
        // Linked evidence failed the runtime provenance gate.
        return fail("INSUFFICIENT_PROVENANCE", `MUST obligation ${obligation.id} lacks admissible provenance`);
      }
      return fail("UNFULFILLED_MUST", `MUST obligation ${obligation.id} has no admissible evidence`);
    }

    const satisfiedTokens = new Set();
    for (const item of admissible) {
      for (const token of normalizedCoverage(item, requiredEvidence)) satisfiedTokens.add(token);
    }
    const missingTokens = requiredEvidence.filter((token) => !satisfiedTokens.has(token));
    if (missingTokens.length > 0) {
      return fail("UNFULFILLED_MUST", `MUST obligation ${obligation.id} is missing required evidence: ${missingTokens.join(", ")}`);
    }

    for (const item of admissible) {
      const emitted = emitAssessment({
        evidence_id: item.evidence.evidence_id,
        role: item.role,
        obligation_id: obligation.id,
        node_id: item.evidence.node_id,
        candidate_id: candidate && candidate.candidate_id,
        policy_snapshot_id: policySnapshotId,
        evidence_requirements_satisfied: normalizedCoverage(item, requiredEvidence),
      });
      if (!emitted.ok) return emitted;
      assessments.push(emitted.assessment);
    }
  }

  return { ok: true, assessments };
}

module.exports = {
  isApprovedDeferred,
  normalizedCoverage,
  walkMustObligations,
};
