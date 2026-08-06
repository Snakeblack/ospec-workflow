"use strict";

const { sha256Fingerprint } = require("../canonical-json.js");

/**
 * Compute SourceSnapshotId digest.
 * Domain prefix: "source-snapshot/v1"
 *
 * @param {{ repositoryId?: string, repository_id?: string, baseTreeDigest?: string, base_tree_digest?: string, projection: "workspace"|"staged"|"commit", dependencyDigests?: string[], dependency_digests?: string[] }} snapshot
 * @returns {string} sha256:...
 */
function computeSourceSnapshotId(snapshot) {
  if (!snapshot || typeof snapshot !== "object") {
    throw new TypeError("computeSourceSnapshotId requires a valid snapshot object");
  }
  const repositoryId = snapshot.repositoryId || snapshot.repository_id || "";
  const baseTreeDigest = snapshot.baseTreeDigest || snapshot.base_tree_digest || "";
  const projection = snapshot.projection || "";
  const dependencyDigests = snapshot.dependencyDigests || snapshot.dependency_digests || [];

  const canonicalPayload = {
    repository_id: repositoryId,
    base_tree_digest: baseTreeDigest,
    projection: projection,
    dependency_digests: Array.isArray(dependencyDigests) ? [...dependencyDigests].sort() : []
  };

  return sha256Fingerprint("source-snapshot/v1", canonicalPayload);
}

/**
 * Compute WorkOrderId digest.
 * Domain prefix: "work-order/v1"
 *
 * @param {{ sourceSnapshotId?: string, source_snapshot_id?: string, nodeId?: string, node_id?: string, role: string, operation?: string, objective?: string, allowedPaths?: string[], allowed_paths?: string[], invariants?: string[], budget?: object }} workOrder
 * @returns {string} sha256:...
 */
function computeWorkOrderId(workOrder) {
  if (!workOrder || typeof workOrder !== "object") {
    throw new TypeError("computeWorkOrderId requires a valid workOrder object");
  }
  const sourceSnapshotId = workOrder.sourceSnapshotId || workOrder.source_snapshot_id || "";
  const nodeId = workOrder.nodeId || workOrder.node_id || "";
  const role = workOrder.role || "";
  const operation = workOrder.operation || "";
  const objective = workOrder.objective || "";
  const allowedPaths = workOrder.allowedPaths || workOrder.allowed_paths || [];
  const invariants = workOrder.invariants || [];
  const budget = workOrder.budget || {};

  const canonicalPayload = {
    source_snapshot_id: sourceSnapshotId,
    node_id: nodeId,
    role: role,
    operation: operation,
    objective: objective,
    allowed_paths: Array.isArray(allowedPaths) ? [...allowedPaths].sort() : [],
    invariants: Array.isArray(invariants) ? [...invariants].sort() : [],
    budget: budget
  };

  return sha256Fingerprint("work-order/v1", canonicalPayload);
}

/**
 * Compute WorkResultId digest.
 * Domain prefix: "work-result/v1"
 *
 * @param {{ workOrderId?: string, work_order_id?: string, sourceSnapshotId?: string, source_snapshot_id?: string, patch: string, commands?: object[], logs?: string[], exitCode?: number, exit_code?: number, filesystemInventory?: object[], filesystem_inventory?: object[] }} workResult
 * @returns {string} sha256:...
 */
function computeWorkResultId(workResult) {
  if (!workResult || typeof workResult !== "object") {
    throw new TypeError("computeWorkResultId requires a valid workResult object");
  }
  const workOrderId = workResult.workOrderId || workResult.work_order_id || "";
  const sourceSnapshotId = workResult.sourceSnapshotId || workResult.source_snapshot_id || "";
  const patch = workResult.patch || "";
  const commands = workResult.commands || [];
  const logs = workResult.logs || [];
  const exitCode = workResult.exitCode !== undefined ? workResult.exitCode : (workResult.exit_code !== undefined ? workResult.exit_code : 0);
  const filesystemInventory = workResult.filesystemInventory || workResult.filesystem_inventory || [];

  const canonicalPayload = {
    work_order_id: workOrderId,
    source_snapshot_id: sourceSnapshotId,
    patch: patch,
    commands: commands,
    logs: logs,
    exit_code: exitCode,
    filesystem_inventory: filesystemInventory
  };

  return sha256Fingerprint("work-result/v1", canonicalPayload);
}

/**
 * Compute CandidateId digest.
 * Domain prefix: "candidate/v1"
 *
 * @param {{ repositoryId?: string, repository_id?: string, projection: "workspace"|"staged", baseTree?: string, base_tree?: string, candidateTree?: string, candidate_tree?: string, diffHash?: string, diff_hash?: string, pathsDigest?: string[], paths?: string[], changedPathsModesDigest?: string, changed_paths_modes_digest?: string, intendedUntrackedDigest?: string|null, intended_untracked_digest?: string|null }} candidate
 * @returns {string} sha256:...
 */
function computeCandidateId(candidate) {
  if (!candidate || typeof candidate !== "object") {
    throw new TypeError("computeCandidateId requires a valid candidate object");
  }
  const repositoryId = candidate.repositoryId || candidate.repository_id || "";
  const projection = candidate.projection || "";
  const baseTree = candidate.baseTree || candidate.base_tree || "";
  const candidateTree = candidate.candidateTree || candidate.candidate_tree || "";
  const diffHash = candidate.diffHash || candidate.diff_hash || "";
  const paths = candidate.pathsDigest || candidate.paths || [];
  const changedPathsModesDigest = candidate.changedPathsModesDigest || candidate.changed_paths_modes_digest || "";
  const intendedUntrackedDigest = candidate.intendedUntrackedDigest !== undefined ? candidate.intendedUntrackedDigest : (candidate.intended_untracked_digest !== undefined ? candidate.intended_untracked_digest : null);

  const canonicalPayload = {
    repository_id: repositoryId,
    projection: projection,
    base_tree: baseTree,
    candidate_tree: candidateTree,
    diff_hash: diffHash,
    paths: Array.isArray(paths) ? [...paths].sort() : [],
    changed_paths_modes_digest: changedPathsModesDigest,
    intended_untracked_digest: intendedUntrackedDigest
  };

  return sha256Fingerprint("candidate/v1", canonicalPayload);
}

/**
 * Freeze a candidate into a Candidate object and compute CandidateId.
 * @param {{ repositoryId?: string, repository_id?: string, projection: "workspace"|"staged", baseTree?: string, base_tree?: string, candidateTree?: string, candidate_tree?: string, diffText?: string, diff_hash?: string, paths?: string[], fileModes?: Record<string, string>, changed_paths_modes_digest?: string, intendedUntracked?: Array<{path: string, hash: string}>|object, intended_untracked_digest?: string|null, predecessorId?: string, predecessor_id?: string }} input
 * @returns {object} CandidateRecord
 */
function freezeCandidate(input) {
  if (!input || typeof input !== "object") {
    throw new TypeError("freezeCandidate requires a valid input object");
  }
  const projection = input.projection;
  if (projection !== "workspace" && projection !== "staged") {
    throw new Error(`Candidate freeze restricts projections strictly to workspace or staged. Received: ${projection}`);
  }

  const repositoryId = input.repositoryId || input.repository_id || "";
  const baseTree = input.baseTree || input.base_tree || "";
  const candidateTree = input.candidateTree || input.candidate_tree || "";
  const rawDiff = input.diffText || input.diff_hash || "";
  const diffHash = rawDiff.startsWith("sha256:") ? rawDiff : sha256Fingerprint("candidate-diff/v1", rawDiff);

  const rawPaths = input.paths || [];
  const canonicalPaths = [...new Set(rawPaths.map((p) => p.replace(/\\/g, "/")))].sort();

  let modesDigest = input.changed_paths_modes_digest || "";
  if (!modesDigest && input.fileModes) {
    modesDigest = sha256Fingerprint("candidate-modes/v1", input.fileModes);
  } else if (!modesDigest) {
    modesDigest = sha256Fingerprint("candidate-modes/v1", {});
  }

  let untrackedDigest = input.intended_untracked_digest !== undefined ? input.intended_untracked_digest : null;
  if (untrackedDigest === null && input.intendedUntracked) {
    untrackedDigest = sha256Fingerprint("candidate-untracked/v1", input.intendedUntracked);
  }

  const predecessorId = input.predecessorId || input.predecessor_id || null;

  const candidateData = {
    repository_id: repositoryId,
    projection: projection,
    base_tree: baseTree,
    candidate_tree: candidateTree,
    diff_hash: diffHash,
    paths: canonicalPaths,
    changed_paths_modes_digest: modesDigest,
    intended_untracked_digest: untrackedDigest
  };

  const candidateId = computeCandidateId(candidateData);

  return {
    schema_version: 1,
    candidate_id: candidateId,
    repository_id: repositoryId,
    projection: projection,
    base_tree: baseTree,
    candidate_tree: candidateTree,
    diff_hash: diffHash,
    paths: canonicalPaths,
    changed_paths_modes_digest: modesDigest,
    intended_untracked_digest: untrackedDigest,
    predecessor_id: predecessorId,
    relation: "exact"
  };
}

/**
 * Evaluate relation between a baseline Candidate and a target Candidate or selector.
 * @param {object} baseline
 * @param {object} target
 * @returns {{ relation: "exact"|"changed"|"ambiguous"|"unknown", action: "validate"|"re-evaluate"|"decide"|"stop", reason?: string }}
 */
function evaluateCandidateRelation(baseline, target) {
  if (!baseline || !target) {
    return {
      relation: "unknown",
      action: "stop",
      reason: "Missing baseline or target candidate"
    };
  }

  if (baseline.ambiguous || baseline.relation === "ambiguous" || target.ambiguous || target.relation === "ambiguous") {
    return {
      relation: "ambiguous",
      action: "decide",
      reason: "Baseline or target selector or candidate state is ambiguous"
    };
  }

  if (baseline.relation === "unknown" || target.relation === "unknown") {
    return {
      relation: "unknown",
      action: "stop",
      reason: "Baseline or target candidate relation is unknown"
    };
  }

  const baseId = baseline.candidate_id || computeCandidateId(baseline);
  const targetId = target.candidate_id || computeCandidateId(target);

  if (baseId === targetId) {
    return {
      relation: "exact",
      action: "validate"
    };
  }

  return {
    relation: "changed",
    action: "re-evaluate"
  };
}

/**
 * Assert strict identity separation & reject aliased or mutable targets.
 * @param {object} payload
 * @param {"SourceSnapshot"|"WorkOrder"|"WorkResult"|"Candidate"|"EvaluationAttestation"|"DeliveryAuthorization"} expectedKind
 * @returns {{ ok: boolean, reason_code?: string }}
 */
function validateIdentityKind(payload, expectedKind) {
  if (!payload || typeof payload !== "object") {
    return { ok: false, reason_code: "INVALID_PAYLOAD" };
  }

  // Reject mutable git branch references or unintegrated working tree paths for attestations / authorizations
  if (expectedKind === "EvaluationAttestation" || expectedKind === "CandidateEvaluationAttestation" || expectedKind === "DeliveryAuthorization") {
    if (typeof payload.targetRef === "string" && (payload.targetRef.startsWith("refs/heads/") || ["main", "master", "develop"].includes(payload.targetRef))) {
      return { ok: false, reason_code: "MUTABLE_TARGET_REJECTED" };
    }
    if (typeof payload.targetPath === "string" && (payload.targetPath.startsWith("./") || payload.targetPath.startsWith("/"))) {
      return { ok: false, reason_code: "MUTABLE_TARGET_REJECTED" };
    }
    if (payload.candidate_id && !payload.attestation_id && !payload.authorization_id) {
      return { ok: false, reason_code: "KIND_MISMATCH" };
    }
  }

  if (expectedKind === "Candidate") {
    if (payload.work_result_id || payload.patch) {
      return { ok: false, reason_code: "KIND_MISMATCH" };
    }
  }

  return { ok: true };
}

module.exports = {
  computeSourceSnapshotId,
  computeWorkOrderId,
  computeWorkResultId,
  computeCandidateId,
  freezeCandidate,
  evaluateCandidateRelation,
  validateIdentityKind
};
