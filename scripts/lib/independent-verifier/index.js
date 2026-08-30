"use strict";

const { validateBindings } = require("./bindings.js");
const { selectStrategy, evaluateStrategy } = require("./strategy-policy.js");
const { normalizeEvidence, computeEvidenceId } = require("./evidence.js");
const { resolveEvidenceProvenance } = require("./collector-provenance.js");
const { emitVerification } = require("./verdict.js");
const { walkMustObligations } = require("./obligation-coverage.js");
const { readRunnerReceiptChannel } = require("./runner-receipt.js");
const assuranceGraph = require("../assurance-graph/index.js");
const { evaluateChallengeEvidence } = require("./challenge-evidence.js");

function fail(reason_code, error) {
  return { ok: false, reason_code, error: error || reason_code };
}

function channelCollector(input, index) {
  if (Array.isArray(input.collectors)) return input.collectors[index];
  return input.collector;
}

function mapProjectionFailure(projected) {
  if (projected.reason_code === "GRAPH_DIVERGENCE") {
    return fail("GRAPH_DIVERGENCE", projected.error);
  }
  return fail("GRAPH_PROJECTION_FAILED", projected.error || "GRAPH_PROJECTION_FAILED");
}

function bindCanonicalInputs(input, bound) {
  const provided = input.canonicalInputs;
  if (!provided || typeof provided !== "object") return { ok: true };
  const graph = bound.executionGraph;
  const contractDigest = graph.contract_digest || (input.contract && input.contract.contract_digest);
  const mismatches = [
    ["contract_digest", provided.contract_digest, contractDigest],
    ["policy_snapshot_id", provided.policy_snapshot_id, graph.policy_snapshot_id],
    ["execution_graph_digest", provided.execution_graph_digest, graph.graph_id],
  ];
  for (const [name, providedValue, boundValue] of mismatches) {
    if (typeof providedValue === "string" && boundValue && providedValue !== boundValue) {
      return fail("GRAPH_DIVERGENCE", `canonicalInputs.${name} does not match the bound graph/contract`);
    }
  }
  return { ok: true };
}

function rejectStaleEvidence(input, bound, evidence, rawBytes) {
  const predecessorId = bound.candidate && bound.candidate.predecessor_id;
  const graph = input.priorAssuranceGraph;
  if (predecessorId && !graph) {
    return fail("STALE_EVIDENCE", "predecessor-bound candidate requires prior Assurance Graph");
  }
  if (!graph) return { ok: true };
  if (assuranceGraph.isEvidenceTransitivelyInvalidated(graph, evidence.evidence_id)) {
    return fail("STALE_EVIDENCE", "evidence is reachable through a transitive invalidates edge");
  }
  if (predecessorId) {
    // Remint the evidence digest under the predecessor CandidateId. A copy of
    // invalidated predecessor bytes with a successor-bound evidence_id still
    // hits the prior graph or the invalidates closure and must fail STALE_EVIDENCE.
    const predecessorBoundId = computeEvidenceId({ ...evidence, candidate_id: predecessorId }, rawBytes);
    const priorIds = new Set((graph.nodes || []).map((node) => node && node.id));
    if (
      priorIds.has(predecessorBoundId) ||
      assuranceGraph.isEvidenceTransitivelyInvalidated(graph, predecessorBoundId)
    ) {
      return fail("STALE_EVIDENCE", "reminted predecessor digest remains stale under invalidates");
    }
  }
  return { ok: true };
}

function evaluateChallenges(input, bound) {
  if (
    input.challenge_budget_exhausted ||
    (input.challengeCausalFailure &&
      input.challengeCausalFailure.code === "CHALLENGE_BUDGET_EXHAUSTED")
  ) {
    return fail("CHALLENGE_BUDGET_EXHAUSTED", "challenge budget was exhausted during execution");
  }

  return evaluateChallengeEvidence(input, bound, { required: Boolean(input.requireChallengeVerification || input.require_challenge_verification) });
}

function getRunnerReceipts(input) {
  if (
    input &&
    (Object.prototype.hasOwnProperty.call(input, "runner_receipts") ||
      Object.prototype.hasOwnProperty.call(input, "receipts"))
  ) {
    return fail(
      "UNTRUSTED_RUNNER_RECEIPT",
      "runner receipt DTOs are untrusted; provide the opaque runnerReceiptChannel"
    );
  }
  return readRunnerReceiptChannel(input && input.runnerReceiptChannel);
}

/**
 * Verifica de forma independiente un Candidate v2 congelado.
 * La narrativa del worker no concede autoridad y Evidence permanece separada del veredicto.
 *
 * @param {object} input Candidate, grafo, observaciones, collector y canal de receipts.
 * @returns {{ ok: boolean, strategy?: string, evidence?: object[], replay_evidence?: object[], assessments?: object[], verification?: object, reason_code?: string }} Resultado fail-closed y material persistible de replay.
 */
function verifyCandidate(input) {
  const bound = validateBindings(input);
  if (!bound.ok) return bound;

  const canonicalBinding = bindCanonicalInputs(input, bound);
  if (!canonicalBinding.ok) return canonicalBinding;

  const strategy = selectStrategy(input.declaredStrategy);
  const rawList = Array.isArray(input.rawEvidence) ? input.rawEvidence : [];
  const classified = [];

  const graphNodesById = new Map((bound.executionGraph.nodes || []).map((n) => [n && n.node_id, n]));
  const graphObligations = bound.executionGraph.obligations || [];
  const receiptGate = getRunnerReceipts(input);
  if (!receiptGate.ok) return receiptGate;
  const runnerReceipts = receiptGate.receipts;
  const consumedReceiptIds = new Set();

  for (let index = 0; index < rawList.length; index += 1) {
    const raw = rawList[index];
    const channel = channelCollector(input, index);
    const provenanceGate = resolveEvidenceProvenance(raw, channel);
    if (!provenanceGate.ok) return provenanceGate;
    const normalized = normalizeEvidence(raw, bound.candidate, bound.executionGraph, channel);
    if (!normalized.ok) return normalized;
    const stale = rejectStaleEvidence(
      input,
      bound,
      normalized.evidence,
      raw.bytes !== undefined ? raw.bytes : raw.rawBytes
    );
    if (!stale.ok) return stale;

    const node = graphNodesById.get(normalized.evidence.node_id);
    const matchingReceipts = runnerReceipts.filter(
      (receipt) => receipt.evidence_id === normalized.evidence.evidence_id
    );
    if (matchingReceipts.length !== 1) {
      return fail(
        "RUNNER_RECEIPT_BINDING_MISMATCH",
        `evidence_id ${normalized.evidence.evidence_id} requires exactly one bound runner receipt`
      );
    }
    const receipt = matchingReceipts[0];
    if (
      receipt.candidate_id !== bound.candidate.candidate_id ||
      receipt.node_id !== normalized.evidence.node_id
    ) {
      return fail(
        "RUNNER_RECEIPT_BINDING_MISMATCH",
        "runner receipt Candidate or node binding disagrees with Evidence"
      );
    }
    consumedReceiptIds.add(receipt.receipt_id);

    let resolvedRole;
    if (node && node.role) {
      if (node.role !== receipt.role) {
        return fail(
          "RUNNER_RECEIPT_BINDING_MISMATCH",
          "runner receipt role disagrees with the Execution Graph node role"
        );
      }
      resolvedRole = node.role;
    } else {
      resolvedRole = receipt.role;
    }

    const resolvedObligationIds = node
      ? graphObligations
        .filter((obligation) => (
          Array.isArray(obligation.implemented_by) && obligation.implemented_by.includes(node.node_id)
        ))
        .map((obligation) => obligation.id)
      : [];

    classified.push({
      ...normalized,
      execution_sequence: receipt.execution_sequence || null,
      role: resolvedRole,
      obligation_ids: resolvedObligationIds,
      evidence_requirements_satisfied: receipt.satisfied_tokens,
    });
  }

  if (consumedReceiptIds.size !== runnerReceipts.length) {
    return fail(
      "RUNNER_RECEIPT_BINDING_MISMATCH",
      "runner receipt set contains an orphan or duplicate Evidence binding"
    );
  }

  const evaluated = evaluateStrategy(strategy, classified);
  if (!evaluated.ok) return evaluated;

  const coverage = walkMustObligations({
    classified,
    executionGraph: bound.executionGraph,
    candidate: bound.candidate,
    policySnapshotId: bound.executionGraph.policy_snapshot_id,
  });
  if (!coverage.ok) return coverage;

  const challengeGate = evaluateChallenges(input, bound);
  if (!challengeGate.ok) return challengeGate;

  const evidenceRecords = classified.map((item) => item.evidence);
  const replayEvidence = classified.map((item, index) => ({
    evidence: item.evidence,
    bytes: item.raw.bytes !== undefined ? item.raw.bytes : item.raw.rawBytes,
    runner_receipt_id: runnerReceipts.find(
      (receipt) => receipt.evidence_id === item.evidence.evidence_id
    ).receipt_id,
  }));
  // human-decision and external-unverified extras keep a passing verification at
  // PASS WITH WARNINGS. model-reported is omitted here: it cannot satisfy a runtime MUST.
  const hasNonRuntimeExtra = classified.some(
    (item) => item.evidence.provenance === "external-unverified" || item.evidence.provenance === "human-decision"
  );
  const verdict = hasNonRuntimeExtra ? "PASS WITH WARNINGS" : "PASS";
  const verification = emitVerification({
    candidateId: bound.candidate.candidate_id,
    evidenceIds: evidenceRecords.map((record) => record.evidence_id),
    verdict,
  });

  const projected = assuranceGraph.projectAssuranceGraph({
    canonicalInputs: input.canonicalInputs || {
      contract: input.contract,
      sourceSnapshot: input.sourceSnapshot,
    },
    candidate: bound.candidate,
    executionGraph: bound.executionGraph,
    evidence: classified,
    assessments: coverage.assessments,
    verification,
    challenge_verification: challengeGate.challenge_verification,
    replay_challenges: challengeGate.replay_challenges,
  });
  if (!projected.ok) {
    return mapProjectionFailure(projected);
  }

  return {
    ok: true,
    strategy,
    evidence: evidenceRecords,
    replay_evidence: replayEvidence,
    assessments: coverage.assessments,
    verification,
    challengePlan: challengeGate.replay_challenges && challengeGate.replay_challenges.plan,
    challengeResults: challengeGate.replay_challenges && challengeGate.replay_challenges.results,
    assurance_graph: projected.graph,
    equivalence_manifest: assuranceGraph.emitEquivalenceManifest(projected.graph),
  };
}

module.exports = {
  verifyCandidate,
  validateBindings: require("./bindings.js").validateBindings,
  selectStrategy: require("./strategy-policy.js").selectStrategy,
  evaluateStrategy: require("./strategy-policy.js").evaluateStrategy,
  normalizeEvidence: require("./evidence.js").normalizeEvidence,
  emitVerification,
  verifyCandidateWithChallenges(input) {
    return verifyCandidate({ ...input, requireChallengeVerification: true });
  },
};
