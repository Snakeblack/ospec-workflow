"use strict";

const { sha256Fingerprint } = require("../canonical-json.js");

/**
 * Compute SourceSnapshotId digest.
 * Domain prefix: "source-snapshot/v1"
 *
 * @param {{ repositoryId?: string, repository_id?: string, baseTreeDigest?: string, base_tree_digest?: string, projection: "workspace"|"staged"|"commit", dependencyDigests?: string[], dependency_digests?: string[] }} snapshot
 * @returns {string} sha256:...
 */
const SHA256_REGEX = /^sha256:[a-f0-9]{64}$/;

function isValidSha256(str) {
  return typeof str === "string" && SHA256_REGEX.test(str);
}

function assertValidSha256(str, fieldName) {
  if (!isValidSha256(str)) {
    throw new Error(`Field ${fieldName} must be a valid sha256 digest (sha256:<64 hex>). Received: ${str}`);
  }
}

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
  if (!baseTreeDigest) {
    throw new Error("computeSourceSnapshotId requires base_tree_digest");
  }
  assertValidSha256(baseTreeDigest, "base_tree_digest");

  const projection = snapshot.projection || "";
  if (!projection) {
    throw new Error("computeSourceSnapshotId requires projection");
  }

  const dependencyDigests = snapshot.dependencyDigests || snapshot.dependency_digests || [];
  if (Array.isArray(dependencyDigests)) {
    for (const d of dependencyDigests) {
      assertValidSha256(d, "dependency_digests item");
    }
  }

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
 * @param {{ sourceSnapshotId?: string, source_snapshot_id?: string, nodeId?: string, node_id?: string, role: string, operation?: string, objective?: string, dependencies?: string[], ownership?: object, allowedPaths?: string[], allowed_paths?: string[], invariants?: string[], requiredEvidence?: string[], required_evidence?: string[], budget?: object }} workOrder
 * @returns {string} sha256:...
 */
function computeWorkOrderId(workOrder) {
  if (!workOrder || typeof workOrder !== "object") {
    throw new TypeError("computeWorkOrderId requires a valid workOrder object");
  }
  const sourceSnapshotId = workOrder.sourceSnapshotId || workOrder.source_snapshot_id || "";
  if (!sourceSnapshotId) {
    throw new Error("computeWorkOrderId requires source_snapshot_id");
  }
  assertValidSha256(sourceSnapshotId, "source_snapshot_id");

  const nodeId = workOrder.nodeId || workOrder.node_id || "";
  if (!nodeId) {
    throw new Error("computeWorkOrderId requires node_id");
  }
  const role = workOrder.role || "";
  if (!role) {
    throw new Error("computeWorkOrderId requires role");
  }

  const operation = workOrder.operation || "";
  const objective = workOrder.objective || "";
  const dependencies = workOrder.dependencies || [];
  const ownership = workOrder.ownership || {};
  const allowedPaths = workOrder.allowedPaths || workOrder.allowed_paths || [];
  const invariants = workOrder.invariants || [];
  const requiredEvidence = workOrder.requiredEvidence || workOrder.required_evidence || [];
  const budget = workOrder.budget || {};

  const canonicalPayload = {
    source_snapshot_id: sourceSnapshotId,
    node_id: nodeId,
    role: role,
    operation: operation,
    objective: objective,
    dependencies: Array.isArray(dependencies) ? [...dependencies].sort() : [],
    ownership: ownership,
    allowed_paths: Array.isArray(allowedPaths) ? [...allowedPaths].sort() : [],
    invariants: Array.isArray(invariants) ? [...invariants].sort() : [],
    required_evidence: Array.isArray(requiredEvidence) ? [...requiredEvidence].sort() : [],
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
  if (!workOrderId) {
    throw new Error("computeWorkResultId requires work_order_id");
  }
  assertValidSha256(workOrderId, "work_order_id");

  const sourceSnapshotId = workResult.sourceSnapshotId || workResult.source_snapshot_id || "";
  if (!sourceSnapshotId) {
    throw new Error("computeWorkResultId requires source_snapshot_id");
  }
  assertValidSha256(sourceSnapshotId, "source_snapshot_id");

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
  if (!projection) {
    throw new Error("computeCandidateId requires projection");
  }

  const baseTree = candidate.baseTree || candidate.base_tree || "";
  if (!baseTree) {
    throw new Error("computeCandidateId requires base_tree");
  }
  assertValidSha256(baseTree, "base_tree");

  const candidateTree = candidate.candidateTree || candidate.candidate_tree || "";
  if (!candidateTree) {
    throw new Error("computeCandidateId requires candidate_tree");
  }
  assertValidSha256(candidateTree, "candidate_tree");

  const diffHash = candidate.diffHash || candidate.diff_hash || "";
  if (!diffHash) {
    throw new Error("computeCandidateId requires diff_hash");
  }
  assertValidSha256(diffHash, "diff_hash");

  const paths = candidate.pathsDigest || candidate.paths || [];
  const changedPathsModesDigest = candidate.changedPathsModesDigest || candidate.changed_paths_modes_digest || "";
  if (changedPathsModesDigest) {
    assertValidSha256(changedPathsModesDigest, "changed_paths_modes_digest");
  }

  const intendedUntrackedDigest = candidate.intendedUntrackedDigest !== undefined ? candidate.intendedUntrackedDigest : (candidate.intended_untracked_digest !== undefined ? candidate.intended_untracked_digest : null);
  if (intendedUntrackedDigest) {
    assertValidSha256(intendedUntrackedDigest, "intended_untracked_digest");
  }

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
 * Freeze a candidate into a Candidate/v2 object and compute CandidateId.
 * @param {{ repositoryId?: string, repository_id?: string, projection: "workspace"|"staged", baseTree?: string, base_tree?: string, candidateTree?: string, candidate_tree?: string, diffText?: string, diffHash?: string, diff_hash?: string, paths?: string[], fileModes?: Record<string, string>, changed_paths_modes_digest?: string, intendedUntracked?: Array<{path: string, hash: string}>|object, intended_untracked_digest?: string|null, predecessorId?: string, predecessor_id?: string }} input
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
  if (!baseTree) {
    throw new Error("freezeCandidate requires base_tree");
  }
  assertValidSha256(baseTree, "base_tree");

  const candidateTree = input.candidateTree || input.candidate_tree || "";
  if (!candidateTree) {
    throw new Error("freezeCandidate requires candidate_tree");
  }
  assertValidSha256(candidateTree, "candidate_tree");

  const diffText = input.diffText;
  const rawDiffHash = input.diffHash || input.diff_hash;

  let diffHash = "";
  if (diffText !== undefined && rawDiffHash !== undefined) {
    const computed = sha256Fingerprint("candidate-diff/v1", diffText);
    if (rawDiffHash !== computed) {
      throw new Error(`Conflict between diffText and diff_hash: diffText hashes to ${computed} but diff_hash is ${rawDiffHash}`);
    }
    diffHash = computed;
  } else if (diffText !== undefined) {
    diffHash = sha256Fingerprint("candidate-diff/v1", diffText);
  } else if (rawDiffHash !== undefined) {
    assertValidSha256(rawDiffHash, "diff_hash");
    diffHash = rawDiffHash;
  } else {
    throw new Error("freezeCandidate requires diffText or diff_hash");
  }

  const rawPaths = input.paths || [];
  const canonicalPaths = [...new Set(rawPaths.map((p) => p.replace(/\\/g, "/")))].sort();

  let modesDigest = input.changed_paths_modes_digest || "";
  if (modesDigest) {
    assertValidSha256(modesDigest, "changed_paths_modes_digest");
  } else if (input.fileModes) {
    modesDigest = sha256Fingerprint("candidate-modes/v1", input.fileModes);
  } else {
    modesDigest = sha256Fingerprint("candidate-modes/v1", {});
  }

  let untrackedDigest = input.intended_untracked_digest !== undefined ? input.intended_untracked_digest : null;
  if (untrackedDigest !== null && untrackedDigest !== undefined && untrackedDigest !== "") {
    assertValidSha256(untrackedDigest, "intended_untracked_digest");
  } else if (untrackedDigest === null && input.intendedUntracked) {
    untrackedDigest = sha256Fingerprint("candidate-untracked/v1", input.intendedUntracked);
  }

  const predecessorId = input.predecessorId || input.predecessor_id || null;
  if (predecessorId) {
    assertValidSha256(predecessorId, "predecessor_id");
  }

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
    kind: "candidate/v2",
    schema_version: 2,
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
 * Validate WorkOrder binding fail-closed.
 * @param {object} workOrder
 * @returns {{ ok: boolean, reason_code?: string, error?: string }}
 */
function validateWorkOrderBinding(workOrder) {
  if (!workOrder || typeof workOrder !== "object") {
    return { ok: false, reason_code: "INVALID_WORK_ORDER", error: "WorkOrder must be a valid object" };
  }
  const snapshotId = workOrder.sourceSnapshotId || workOrder.source_snapshot_id;
  if (!snapshotId || !isValidSha256(snapshotId)) {
    return { ok: false, reason_code: "SNAPSHOT_MISMATCH", error: "WorkOrder source_snapshot_id is missing or ill-formed" };
  }
  return { ok: true };
}

/**
 * Validate WorkResult binding against WorkOrder fail-closed.
 * @param {object} workOrder
 * @param {object} workResult
 * @returns {{ ok: boolean, reason_code?: string, error?: string }}
 */
function validateWorkResultBinding(workOrder, workResult) {
  if (!workOrder || typeof workOrder !== "object" || !workResult || typeof workResult !== "object") {
    return { ok: false, reason_code: "INVALID_PAYLOAD", error: "workOrder and workResult must be valid objects" };
  }
  const orderIdInResult = workResult.workOrderId || workResult.work_order_id;
  const expectedOrderId = workOrder.workOrderId || workOrder.work_order_id;
  if (!orderIdInResult || !expectedOrderId || orderIdInResult !== expectedOrderId) {
    return { ok: false, reason_code: "WORK_ORDER_MISMATCH", error: "WorkResult work_order_id does not match WorkOrder work_order_id" };
  }

  const snapInResult = workResult.sourceSnapshotId || workResult.source_snapshot_id;
  const expectedSnapId = workOrder.sourceSnapshotId || workOrder.source_snapshot_id;
  if (!snapInResult || !expectedSnapId || snapInResult !== expectedSnapId) {
    return { ok: false, reason_code: "SOURCE_SNAPSHOT_MISMATCH", error: "WorkResult source_snapshot_id does not match WorkOrder source_snapshot_id" };
  }

  return { ok: true };
}

/**
 * Evaluate relation between a baseline Candidate and a target Candidate or selector.
 * Recomputes candidate digests from canonical frozen payloads, ignoring declared candidate_id.
 *
 * @param {object} baseline
 * @param {object} target
 * @returns {{ relation: "exact"|"changed"|"ambiguous"|"unknown", action: "validate"|"re-evaluate"|"decide"|"stop", reason?: string, reason_code?: string }}
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

  let computedBaseId = "";
  try {
    computedBaseId = computeCandidateId(baseline);
  } catch (err) {
    return {
      relation: "unknown",
      action: "stop",
      reason: `Failed to compute baseline candidate digest: ${err.message}`
    };
  }

  let computedTargetId = "";
  try {
    computedTargetId = computeCandidateId(target);
  } catch (err) {
    return {
      relation: "unknown",
      action: "stop",
      reason: `Failed to compute target candidate digest: ${err.message}`
    };
  }

  if (baseline.candidate_id && baseline.candidate_id !== computedBaseId) {
    return {
      relation: "unknown",
      action: "stop",
      reason: "candidate-id-mismatch",
      reason_code: "DECLARED_ID_MISMATCH"
    };
  }

  if (target.candidate_id && target.candidate_id !== computedTargetId) {
    return {
      relation: "unknown",
      action: "stop",
      reason: "candidate-id-mismatch",
      reason_code: "DECLARED_ID_MISMATCH"
    };
  }

  if (computedBaseId === computedTargetId) {
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
 * @param {"SourceSnapshot"|"WorkOrder"|"WorkResult"|"Candidate"|"EvaluationAttestation"|"CandidateEvaluationAttestation"|"DeliveryAuthorization"} expectedKind
 * @returns {{ ok: boolean, reason_code?: string }}
 */
function validateIdentityKind(payload, expectedKind) {
  if (!payload || typeof payload !== "object") {
    return { ok: false, reason_code: "INVALID_PAYLOAD" };
  }

  if (expectedKind === "EvaluationAttestation" || expectedKind === "CandidateEvaluationAttestation" || expectedKind === "DeliveryAuthorization") {
    const targetRef = payload.targetRef || payload.target_ref;
    if (typeof targetRef === "string" && (targetRef.startsWith("refs/heads/") || ["main", "master", "develop"].includes(targetRef))) {
      return { ok: false, reason_code: "MUTABLE_TARGET_REJECTED" };
    }
    const targetPath = payload.targetPath || payload.target_path;
    if (typeof targetPath === "string" && (targetPath.startsWith("./") || targetPath.startsWith("/"))) {
      return { ok: false, reason_code: "MUTABLE_TARGET_REJECTED" };
    }

    if ((payload.candidate_id || payload.kind === "candidate/v2" || payload.kind === "candidate/v1") && !payload.attestation_id && !payload.authorization_id) {
      return { ok: false, reason_code: "KIND_MISMATCH" };
    }

    const targetCandidateId = payload.target || payload.target_id || payload.target_candidate_id || payload.candidate_id || payload.candidateId;
    if (!targetCandidateId || !isValidSha256(targetCandidateId)) {
      return { ok: false, reason_code: "INVALID_TARGET_CANDIDATE_ID" };
    }
  }

  if (expectedKind === "Candidate") {
    if (payload.kind && payload.kind !== "candidate/v2" && payload.kind !== "candidate/v1") {
      return { ok: false, reason_code: "KIND_MISMATCH" };
    }
    if (payload.work_result_id || payload.patch || payload.source_snapshot_id || payload.base_tree_digest) {
      return { ok: false, reason_code: "KIND_MISMATCH" };
    }
  }

  if (expectedKind === "SourceSnapshot") {
    if (payload.kind && payload.kind !== "source-snapshot/v1") {
      return { ok: false, reason_code: "KIND_MISMATCH" };
    }
    if (payload.candidate_id || payload.work_order_id || payload.work_result_id) {
      return { ok: false, reason_code: "KIND_MISMATCH" };
    }
  }

  if (expectedKind === "WorkOrder") {
    if (payload.kind && payload.kind !== "work-order/v2" && payload.kind !== "work-order/v1") {
      return { ok: false, reason_code: "KIND_MISMATCH" };
    }
    if (payload.candidate_id || payload.work_result_id) {
      return { ok: false, reason_code: "KIND_MISMATCH" };
    }
  }

  if (expectedKind === "WorkResult") {
    if (payload.kind && payload.kind !== "work-result/v1") {
      return { ok: false, reason_code: "KIND_MISMATCH" };
    }
    if (payload.candidate_id) {
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
  validateWorkOrderBinding,
  validateWorkResultBinding,
  evaluateCandidateRelation,
  validateIdentityKind
};
