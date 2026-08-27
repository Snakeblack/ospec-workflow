"use strict";

const { validateCandidateV2, computeCandidateId } = require("../execution-identities/index.js");
const { validateExecutionGraphBinding } = require("../execution-graph/index.js");
const { computeTreeDigest } = require("../worker-workspace.js");

function fail(reason_code, error) {
  return { ok: false, reason_code, error: error || reason_code };
}

function looksLikeWorkResult(value) {
  if (!value || typeof value !== "object") return false;
  if (value.kind === "work-result/v1" || value.kind === "work-result-execution-payload/v1") return true;
  if (typeof value.work_result_id === "string" && value.patch !== undefined) return true;
  return false;
}

/**
 * Fail-closed Candidate / Execution Graph / repository binding gate.
 * Rejects WorkResult subjects and unfrozen candidates before strategy selection.
 *
 * @param {object} input
 * @returns {{ ok: true, candidate: object, executionGraph: object } | { ok: false, reason_code: string, error?: string }}
 */
function validateBindings(input) {
  if (!input || typeof input !== "object") {
    return fail("INVALID_PAYLOAD", "verifyCandidate input must be an object");
  }

  if (
    input.workResult ||
    input.work_result ||
    input.workResultId ||
    input.work_result_id ||
    input.subject === "WorkResult" ||
    input.subject_kind === "work-result" ||
    looksLikeWorkResult(input.candidate) ||
    looksLikeWorkResult(input.subject)
  ) {
    return fail("WORK_RESULT_SUBJECT", "WorkResult cannot be the verification subject");
  }

  const candidate = input.candidate;
  if (!candidate || typeof candidate !== "object") {
    return fail("UNFROZEN_CANDIDATE", "frozen Candidate v2 is required");
  }
  if (candidate.kind !== "candidate/v2" || candidate.schema_version !== 2) {
    return fail("UNFROZEN_CANDIDATE", "candidate must be frozen Candidate v2");
  }
  if (!validateCandidateV2(candidate)) {
    return fail("UNFROZEN_CANDIDATE", "candidate failed Candidate v2 schema validation");
  }

  let recomputedId;
  try {
    recomputedId = computeCandidateId(candidate);
  } catch (err) {
    return fail("UNFROZEN_CANDIDATE", err.message);
  }
  if (candidate.candidate_id !== recomputedId) {
    return fail("BINDING_MISMATCH", "candidate_id does not match recomputed digest");
  }

  const executionGraph = input.executionGraph;
  if (!executionGraph || typeof executionGraph !== "object") {
    return fail("BINDING_MISMATCH", "Execution Graph is required");
  }
  const graphBinding = validateExecutionGraphBinding(executionGraph, {
    policySnapshot: input.policySnapshot,
    sourceSnapshot: input.sourceSnapshot,
    sourceSnapshotId: input.sourceSnapshotId,
  });
  if (!graphBinding.ok) {
    return fail("BINDING_MISMATCH", graphBinding.error || graphBinding.reason_code);
  }

  const repository = input.repository;
  if (!repository || typeof repository !== "object" || !repository.files) {
    return fail("BINDING_MISMATCH", "repository bytes are required");
  }
  let treeDigest;
  try {
    treeDigest = computeTreeDigest(repository.files);
  } catch (err) {
    return fail("BINDING_MISMATCH", err.message);
  }
  if (!treeDigest || treeDigest !== candidate.candidate_tree) {
    return fail("BINDING_MISMATCH", "repository tree does not match candidate_tree");
  }

  return { ok: true, candidate, executionGraph };
}

module.exports = {
  validateBindings,
};
