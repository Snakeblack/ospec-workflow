"use strict";

const path = require("node:path");
const { projectAssuranceGraph, rejectForbidden, canonicalize, computeGraphId } = require("./projector.js");
const { computeInvalidationClosure, isEvidenceTransitivelyInvalidated } = require("./invalidation.js");
const { validateAssessment } = require("../independent-verifier/assessment.js");
const { computeVerificationId } = require("../independent-verifier/verdict.js");
const {
  digestRawBytes,
  computeEvidenceId,
  evaluateProvenanceSufficiency,
} = require("../independent-verifier/evidence.js");
const { validateInstance, loadSchemaById } = require("../kernel-schema-validator.js");
const { readRunnerReceiptChannel } = require("../independent-verifier/runner-receipt.js");

const DEFAULT_SCHEMA_ROOT = path.resolve(__dirname, "../../..");
const EVIDENCE_V2_ID = "ospec://schemas/kernel/evidence/v2";
const VERIFICATION_V2_ID = "ospec://schemas/kernel/verification/v2";

let cachedEvidenceSchema = null;
let cachedVerificationSchema = null;

function getEvidenceSchema() {
  if (!cachedEvidenceSchema) {
    cachedEvidenceSchema = loadSchemaById(EVIDENCE_V2_ID, { rootDir: DEFAULT_SCHEMA_ROOT });
  }
  return cachedEvidenceSchema;
}

function getVerificationSchema() {
  if (!cachedVerificationSchema) {
    cachedVerificationSchema = loadSchemaById(VERIFICATION_V2_ID, { rootDir: DEFAULT_SCHEMA_ROOT });
  }
  return cachedVerificationSchema;
}

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
  if (!stored || typeof stored !== "object") {
    return fail("GRAPH_DIVERGENCE", "stored Assurance Graph does not recompute from canonical inputs");
  }
  if (stored.kind !== "assurance-graph/v1" || stored.schema_version !== 1) {
    return fail("GRAPH_DIVERGENCE", "stored graph kind or schema_version diverges");
  }
  if (!Array.isArray(stored.nodes) || !Array.isArray(stored.edges) || !stored.canonical_inputs) {
    return fail("GRAPH_DIVERGENCE", "stored graph payload is incomplete");
  }
  const canonicalStored = canonicalize(stored.nodes, stored.edges);
  const recomputedStoredId = computeGraphId({
    candidate_id: stored.candidate_id,
    canonical_inputs: stored.canonical_inputs,
    nodes: canonicalStored.nodes,
    edges: canonicalStored.edges,
  });
  if (stored.graph_id !== recomputedStoredId) {
    return fail("GRAPH_DIVERGENCE", "stored graph_id does not match its stored payload");
  }
  const fields = ["schema_version", "kind", "candidate_id", "graph_id", "nodes", "edges", "canonical_inputs"];
  for (const field of fields) {
    if (JSON.stringify(stored[field]) !== JSON.stringify(projected.graph[field])) {
      return fail("GRAPH_DIVERGENCE", `stored ${field} diverges from canonical projection`);
    }
  }
  return { ok: true, graph: projected.graph };
}

function isApprovedDeferred(obligation) {
  return Boolean(
    obligation && obligation.deferred && typeof obligation.deferred.reason === "string" && obligation.deferred.reason.trim() &&
    typeof obligation.deferred.approved_by === "string" && obligation.deferred.approved_by.trim()
  );
}

function resolveObservationBytes(item, record, persistable) {
  const inlineBytes = item && item.rawBytes !== undefined
    ? item.rawBytes
    : (item && item.bytes !== undefined
      ? item.bytes
      : (item && item.raw && (item.raw.rawBytes !== undefined ? item.raw.rawBytes : item.raw.bytes)));
  if (inlineBytes !== undefined) return { ok: true, bytes: inlineBytes };

  const blobId = item && item.observation_blob_id;
  if (typeof blobId !== "string" || blobId.length === 0) {
    return fail("GRAPH_DIVERGENCE", "replay evidence requires raw bytes or an observation blob reference");
  }
  if (blobId !== record.digest) {
    return fail("GRAPH_DIVERGENCE", "observation blob reference must equal the Evidence digest");
  }
  const blobs = persistable.observation_blobs;
  const bytes = blobs instanceof Map
    ? blobs.get(blobId)
    : (blobs && typeof blobs === "object" ? blobs[blobId] : undefined);
  if (bytes === undefined) {
    return fail("GRAPH_DIVERGENCE", `observation blob ${blobId} is not resolvable`);
  }
  return { ok: true, bytes };
}

/**
 * Comprehensive revalidation for replay:
 * 1. evidence/v2 schema, candidate_id, digest, computeEvidenceId, provenance sufficiency, no verdict
 * 2. verification/v2 schema, verification_id, candidate_id, subset of evidence IDs
 * 3. assessment/v2 schema, assessment_id, candidate_id, policy_snapshot_id, evidence_id, obligation_id, node_id, non-empty coverage
 */
function validateReplayRecords(persistable) {
  if (!persistable || typeof persistable !== "object") {
    return fail("GRAPH_DIVERGENCE", "persistable replay bundle must be an object");
  }
  const assessments = Array.isArray(persistable.assessments) ? persistable.assessments : [];
  const evidence = Array.isArray(persistable.evidence) ? persistable.evidence : [];
  const graph = persistable.executionGraph;
  const candidate = persistable.candidate;
  const verification = persistable.verification;

  if (!graph || !candidate || !Array.isArray(graph.obligations) || !Array.isArray(graph.nodes)) {
    return fail("GRAPH_DIVERGENCE", "persistable graph, candidate, nodes, and obligations are required for replay");
  }

  const receiptGate = readRunnerReceiptChannel(persistable.runnerReceiptChannel);
  if (!receiptGate.ok) {
    return fail("GRAPH_DIVERGENCE", "replay requires trusted runner receipt authority");
  }
  const receiptsById = new Map(
    receiptGate.receipts.map((receipt) => [receipt.receipt_id, receipt])
  );
  const consumedReceiptIds = new Set();

  // 1. Revalidate evidence/v2 records
  const evidenceById = new Map();
  const receiptByEvidenceId = new Map();
  for (const item of evidence) {
    const record = item && item.evidence ? item.evidence : item;
    if (!record || typeof record !== "object") {
      return fail("GRAPH_DIVERGENCE", "persisted evidence must be an object");
    }
    if (Object.prototype.hasOwnProperty.call(record, "verdict")) {
      return fail("GRAPH_DIVERGENCE", "evidence must not carry verdict");
    }
    if (record.candidate_id !== candidate.candidate_id) {
      return fail("GRAPH_DIVERGENCE", "persisted evidence candidate_id does not match graph subject");
    }
    const evidenceValidation = validateInstance(getEvidenceSchema(), record);
    if (!evidenceValidation.valid) {
      return fail("GRAPH_DIVERGENCE", `evidence failed schema validation: ${evidenceValidation.errors.map((e) => e.message).join("; ")}`);
    }
    const observation = resolveObservationBytes(item, record, persistable);
    if (!observation.ok) return observation;
    const computedDigest = digestRawBytes(observation.bytes);
    if (record.digest !== computedDigest) {
      return fail("GRAPH_DIVERGENCE", "evidence digest does not match raw bytes");
    }
    const recomputedEvidenceId = computeEvidenceId(record, observation.bytes);
    if (record.evidence_id !== recomputedEvidenceId) {
      return fail("GRAPH_DIVERGENCE", "evidence_id does not match recomputed computeEvidenceId");
    }
    const receiptId = item && item.runner_receipt_id;
    const receipt = typeof receiptId === "string" ? receiptsById.get(receiptId) : null;
    if (
      !receipt ||
      consumedReceiptIds.has(receiptId) ||
      receipt.candidate_id !== candidate.candidate_id ||
      receipt.evidence_id !== record.evidence_id ||
      receipt.node_id !== record.node_id
    ) {
      return fail("GRAPH_DIVERGENCE", "replay evidence is not exactly bound to a trusted runner receipt");
    }
    const sufficiency = evaluateProvenanceSufficiency(record, { requireRuntime: true });
    if (!sufficiency.ok) {
      return fail("GRAPH_DIVERGENCE", sufficiency.error || "insufficient provenance during replay");
    }
    consumedReceiptIds.add(receiptId);
    evidenceById.set(record.evidence_id, record);
    receiptByEvidenceId.set(record.evidence_id, receipt);
  }
  if (consumedReceiptIds.size !== receiptGate.receipts.length) {
    return fail("GRAPH_DIVERGENCE", "trusted runner receipt set contains an orphan replay binding");
  }

  // 2. Revalidate verification/v2 record if present
  if (verification) {
    if (typeof verification !== "object" || verification.candidate_id !== candidate.candidate_id) {
      return fail("GRAPH_DIVERGENCE", "persisted verification candidate_id does not match graph subject");
    }
    const verificationValidation = validateInstance(getVerificationSchema(), verification);
    if (!verificationValidation.valid) {
      return fail("GRAPH_DIVERGENCE", `verification failed schema validation: ${verificationValidation.errors.map((e) => e.message).join("; ")}`);
    }
    const expectedVerificationId = computeVerificationId(
      verification.candidate_id,
      verification.verdict,
      verification.evidence_ids || []
    );
    if (verification.verification_id !== expectedVerificationId) {
      return fail("GRAPH_DIVERGENCE", "persisted verification_id does not match recomputed identity");
    }
    for (const evId of verification.evidence_ids || []) {
      if (!evidenceById.has(evId)) {
        return fail("GRAPH_DIVERGENCE", `verification references non-existent evidence_id ${evId}`);
      }
    }
  }

  // 3. Revalidate assessment/v2 records
  const obligations = new Map(graph.obligations.map((obligation) => [obligation && obligation.id, obligation]));
  const coveredByObligation = new Map();
  for (const assessment of assessments) {
    const valid = validateAssessment(assessment);
    if (!valid.ok) return fail("GRAPH_DIVERGENCE", valid.error);
    const record = valid.assessment;
    const obligation = obligations.get(record.obligation_id);
    const evidenceRecord = evidenceById.get(record.evidence_id);
    const runnerReceipt = receiptByEvidenceId.get(record.evidence_id);
    if (
      !obligation ||
      !evidenceRecord ||
      record.candidate_id !== candidate.candidate_id ||
      record.policy_snapshot_id !== graph.policy_snapshot_id ||
      record.node_id !== evidenceRecord.node_id ||
      !Array.isArray(obligation.implemented_by) ||
      !obligation.implemented_by.includes(record.node_id)
    ) {
      return fail("GRAPH_DIVERGENCE", "persisted assessment binding diverges from evidence, Candidate, policy, or obligation");
    }
    if (Array.isArray(record.evidence_requirements_satisfied)) {
      if (record.evidence_requirements_satisfied.length === 0) {
        return fail("GRAPH_DIVERGENCE", "assessment evidence_requirements_satisfied cannot be empty for satisfaction claims");
      }
      const required = new Set(Array.isArray(obligation.required_evidence) ? obligation.required_evidence : []);
      if (record.evidence_requirements_satisfied.some((token) => !required.has(token))) {
        return fail("GRAPH_DIVERGENCE", "assessment coverage contains a token outside the obligation requirement");
      }
      const receiptTokens = new Set(runnerReceipt.satisfied_tokens);
      if (record.evidence_requirements_satisfied.some((token) => !receiptTokens.has(token))) {
        return fail("GRAPH_DIVERGENCE", "assessment coverage is not attested by its trusted runner receipt");
      }
      const coverage = coveredByObligation.get(record.obligation_id) || new Set();
      for (const token of record.evidence_requirements_satisfied) coverage.add(token);
      coveredByObligation.set(record.obligation_id, coverage);
    }
  }

  // 4. Revalidate MUST obligations coverage
  for (const obligation of graph.obligations) {
    if (!obligation || String(obligation.criticality || "must").toLowerCase() !== "must" || isApprovedDeferred(obligation)) continue;
    const required = Array.isArray(obligation.required_evidence) ? obligation.required_evidence : [];
    const covered = coveredByObligation.get(obligation.id) || new Set();
    if (required.length === 0 || required.some((token) => !covered.has(token))) {
      return fail("GRAPH_DIVERGENCE", `persisted assessments do not satisfy MUST obligation ${obligation.id}`);
    }
  }

  return { ok: true };
}

/**
 * Reproduce una proyección desde assessments, Evidence con material de observación,
 * Verification e inputs canónicos persistibles. Nunca consume obligation_ids efímeros.
 *
 * @param {object} persistable Bundle persistible con bytes inline o blobs resolubles.
 * @returns {{ ok: true, graph: object } | { ok: false, reason_code: string }} Grafo reproducido o divergencia fail-closed.
 */
function replayAssuranceGraph(persistable = {}) {
  let validation;
  try {
    validation = validateReplayRecords(persistable);
  } catch (error) {
    return fail("GRAPH_DIVERGENCE", `replay validation failed closed: ${error.message}`);
  }
  if (!validation.ok) return validation;
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
  validateReplayAssessments: validateReplayRecords,
  validateReplayRecords,
  rejectForbidden,
  computeInvalidationClosure,
  isEvidenceTransitivelyInvalidated,
  emitEquivalenceManifest,
  rejectAuthorityMisuse,
};
