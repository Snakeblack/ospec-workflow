"use strict";

const path = require("node:path");
const { sha256Fingerprint } = require("../canonical-json.js");
const { validateInstance, loadSchemaById } = require("../kernel-schema-validator.js");

const SHA256_REGEX = /^sha256:[a-f0-9]{64}$/;
const CANDIDATE_V2_SCHEMA_ID = "ospec://schemas/kernel/candidate/v2";
const DEFAULT_SCHEMA_ROOT = path.resolve(__dirname, "../../..");

const SOURCE_SNAPSHOT_V1_SCHEMA_ID = "ospec://schemas/kernel/source-snapshot/v1";
const WORK_ORDER_V2_SCHEMA_ID = "ospec://schemas/kernel/work-order/v2";
const WORK_ORDER_V1_SCHEMA_ID = "ospec://schemas/kernel/work-order/v1";
const WORK_RESULT_V1_SCHEMA_ID = "ospec://schemas/kernel/work-result/v1";

const EXPECTED_KINDS = Object.freeze({
  SourceSnapshot: Object.freeze(["source-snapshot/v1"]),
  WorkOrder: Object.freeze(["work-order/v2"]),
  WorkResult: Object.freeze(["work-result/v1"]),
  Candidate: Object.freeze(["candidate/v2"]),
  // EvaluationAttestation aliases CandidateEvaluationAttestation (same provisional kind strings)
  EvaluationAttestation: Object.freeze(["candidate-evaluation-attestation/v1"]),
  CandidateEvaluationAttestation: Object.freeze(["candidate-evaluation-attestation/v1"]),
  DeliveryAuthorization: Object.freeze(["delivery-authorization/v1"]),
});

let cachedCandidateV2Schema = null;
let cachedSourceSnapshotV1Schema = null;
let cachedWorkOrderV2Schema = null;
let cachedWorkOrderV1Schema = null;
let cachedWorkResultV1Schema = null;

function getSourceSnapshotV1Schema() {
  if (!cachedSourceSnapshotV1Schema) {
    cachedSourceSnapshotV1Schema = loadSchemaById(SOURCE_SNAPSHOT_V1_SCHEMA_ID, {
      rootDir: DEFAULT_SCHEMA_ROOT,
    });
  }
  return cachedSourceSnapshotV1Schema;
}

function getWorkOrderV2Schema() {
  if (!cachedWorkOrderV2Schema) {
    cachedWorkOrderV2Schema = loadSchemaById(WORK_ORDER_V2_SCHEMA_ID, {
      rootDir: DEFAULT_SCHEMA_ROOT,
    });
  }
  return cachedWorkOrderV2Schema;
}

function getWorkOrderV1Schema() {
  if (!cachedWorkOrderV1Schema) {
    cachedWorkOrderV1Schema = loadSchemaById(WORK_ORDER_V1_SCHEMA_ID, {
      rootDir: DEFAULT_SCHEMA_ROOT,
    });
  }
  return cachedWorkOrderV1Schema;
}

function getWorkResultV1Schema() {
  if (!cachedWorkResultV1Schema) {
    cachedWorkResultV1Schema = loadSchemaById(WORK_RESULT_V1_SCHEMA_ID, {
      rootDir: DEFAULT_SCHEMA_ROOT,
    });
  }
  return cachedWorkResultV1Schema;
}

function validateSourceSnapshotV1(snapshot) {
  if (!snapshot || typeof snapshot !== "object") return false;
  try {
    return validateInstance(getSourceSnapshotV1Schema(), snapshot).valid;
  } catch {
    return false;
  }
}

function validateWorkOrderSchema(workOrder) {
  if (!workOrder || typeof workOrder !== "object") return false;
  try {
    const isV2 = isWorkOrderV2(workOrder);
    const schema = isV2 ? getWorkOrderV2Schema() : getWorkOrderV1Schema();
    return validateInstance(schema, workOrder).valid;
  } catch {
    return false;
  }
}

function validateWorkResultV1(workResult) {
  if (!workResult || typeof workResult !== "object") return false;
  try {
    return validateInstance(getWorkResultV1Schema(), workResult).valid;
  } catch {
    return false;
  }
}

function isValidSha256(str) {
  return typeof str === "string" && SHA256_REGEX.test(str);
}

function assertValidSha256(str, fieldName) {
  if (!isValidSha256(str)) {
    throw new Error(`Field ${fieldName} must be a valid sha256 digest (sha256:<64 hex>). Received: ${str}`);
  }
}

function assertArrayField(value, fieldName) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    throw new TypeError(`Field ${fieldName} must be an array. Received: ${typeof value}`);
  }
  return value;
}

function resolveArrayField(primary, secondary, fieldName) {
  if (primary !== undefined) return assertArrayField(primary, fieldName);
  if (secondary !== undefined) return assertArrayField(secondary, fieldName);
  return [];
}

/**
 * Resolve WorkOrder digest domain. Fail closed when kind and schema_version disagree.
 * Domain is work-order/v2 only for a consistent v2 identity: when both fields are present
 * for a known work-order kind they must agree; otherwise a single present v2 signal selects
 * the domain (legacy single-field callers).
 *
 * @param {object} workOrder
 * @returns {boolean}
 */
function isWorkOrderV2(workOrder) {
  const kind = workOrder.kind;
  const schemaVersion = workOrder.schema_version;
  const hasKind = typeof kind === "string";
  const hasSchema = schemaVersion !== undefined && schemaVersion !== null;
  const kindSaysV2 = kind === "work-order/v2";
  const schemaSaysV2 = schemaVersion === 2;

  if (hasKind && hasSchema && (kind === "work-order/v1" || kind === "work-order/v2")) {
    if (kindSaysV2 !== schemaSaysV2) {
      throw new Error(
        `WorkOrder kind/schema_version disagreement: kind=${kind}, schema_version=${schemaVersion}`
      );
    }
    return kindSaysV2;
  }

  const hasV2Fields = workOrder.source_snapshot_id || workOrder.sourceSnapshotId;

  return kindSaysV2 || schemaSaysV2 || !!hasV2Fields;
}

/**
 * Validate a Candidate v2 record against the canonical schema (lazy-cached).
 * Schema-load infrastructure failures throw (fail closed, distinct from invalid instance).
 * Invalid candidate instances return false without throwing.
 * @param {object} candidate
 * @returns {boolean}
 */
function validateCandidateV2(candidate) {
  if (!candidate || typeof candidate !== "object") return false;
  if (!cachedCandidateV2Schema) {
    try {
      cachedCandidateV2Schema = loadSchemaById(CANDIDATE_V2_SCHEMA_ID, {
        rootDir: DEFAULT_SCHEMA_ROOT,
      });
    } catch (err) {
      const wrapped = new Error(`Candidate v2 schema load failed: ${err.message}`);
      wrapped.code = "CANDIDATE_V2_SCHEMA_LOAD_FAILED";
      wrapped.cause = err;
      throw wrapped;
    }
  }
  try {
    return validateInstance(cachedCandidateV2Schema, candidate).valid;
  } catch {
    // Instance validation threw — treat as invalid instance, not infra failure
    return false;
  }
}

function assertPlainObjectField(value, fieldName) {
  if (value === undefined) return {};
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`Field ${fieldName} must be a plain object. Received: ${value === null ? "null" : typeof value}`);
  }
  return value;
}

function isRelationSelector(value) {
  return (
    value &&
    typeof value === "object" &&
    value.kind === "candidate-relation-selector" &&
    (value.ambiguous === true || value.relation === "ambiguous" || value.relation === "unknown")
  );
}

function isFrozenCandidateV2(value) {
  return (
    value &&
    typeof value === "object" &&
    value.kind === "candidate/v2" &&
    value.schema_version === 2 &&
    validateCandidateV2(value)
  );
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
  const repositoryId = snapshot.repositoryId || snapshot.repository_id;
  if (!repositoryId || typeof repositoryId !== "string" || repositoryId.length < 1) {
    throw new Error("computeSourceSnapshotId requires non-empty repository_id");
  }
  const baseTreeDigest = snapshot.baseTreeDigest || snapshot.base_tree_digest || "";
  if (!baseTreeDigest) {
    throw new Error("computeSourceSnapshotId requires base_tree_digest");
  }
  assertValidSha256(baseTreeDigest, "base_tree_digest");

  const projection = snapshot.projection;
  if (!projection || (projection !== "workspace" && projection !== "staged" && projection !== "commit")) {
    throw new Error(`computeSourceSnapshotId requires valid projection (workspace|staged|commit). Received: ${projection}`);
  }

  const dependencyDigests = resolveArrayField(
    snapshot.dependencyDigests,
    snapshot.dependency_digests,
    "dependency_digests"
  );
  for (const d of dependencyDigests) {
    assertValidSha256(d, "dependency_digests item");
  }

  const canonicalPayload = {
    repository_id: repositoryId,
    base_tree_digest: baseTreeDigest,
    projection: projection,
    dependency_digests: [...dependencyDigests].sort()
  };

  return sha256Fingerprint("source-snapshot/v1", canonicalPayload);
}

/**
 * Compute WorkOrderId digest.
 * Domain: work-order/v1 or work-order/v2 based on kind/schema_version.
 *
 * @param {object} workOrder
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

  // Determine domain early to validate kind/schema_version agreement before field checks
  const isV2 = isWorkOrderV2(workOrder);

  if (typeof workOrder.operation !== "string" || workOrder.operation.length < 1) {
    throw new Error("computeWorkOrderId requires non-empty operation");
  }
  const operation = workOrder.operation;

  if (typeof workOrder.objective !== "string" || workOrder.objective.length < 1) {
    throw new Error("computeWorkOrderId requires non-empty objective");
  }
  const objective = workOrder.objective;

  if (workOrder.dependencies === undefined) {
    throw new Error("computeWorkOrderId requires dependencies array");
  }
  const dependencies = resolveArrayField(workOrder.dependencies, undefined, "dependencies");
  for (const dep of dependencies) {
    assertValidSha256(dep, "dependencies item");
  }

  if (workOrder.ownership === undefined) {
    throw new Error("computeWorkOrderId requires ownership object");
  }
  const ownership = assertPlainObjectField(workOrder.ownership, "ownership");
  if (typeof ownership.owner !== "string" || (ownership.mode !== undefined && typeof ownership.mode !== "string")) {
    throw new Error("computeWorkOrderId requires ownership.owner and ownership.mode strings");
  }

  const rawAllowedPaths = workOrder.allowedPaths !== undefined ? workOrder.allowedPaths : workOrder.allowed_paths;
  if (rawAllowedPaths === undefined) {
    throw new Error("computeWorkOrderId requires allowed_paths array");
  }
  const allowedPaths = resolveArrayField(
    workOrder.allowedPaths,
    workOrder.allowed_paths,
    "allowed_paths"
  );

  if (workOrder.invariants === undefined) {
    throw new Error("computeWorkOrderId requires invariants array");
  }
  const invariants = resolveArrayField(workOrder.invariants, undefined, "invariants");

  const rawReqEv = workOrder.requiredEvidence !== undefined ? workOrder.requiredEvidence : workOrder.required_evidence;
  if (rawReqEv === undefined) {
    throw new Error("computeWorkOrderId requires required_evidence array");
  }
  const requiredEvidence = resolveArrayField(
    workOrder.requiredEvidence,
    workOrder.required_evidence,
    "required_evidence"
  );

  if (workOrder.budget === undefined) {
    throw new Error("computeWorkOrderId requires budget object");
  }
  const budget = assertPlainObjectField(workOrder.budget, "budget");
  if (Object.keys(budget).length === 0) {
    throw new Error("computeWorkOrderId requires non-empty budget object");
  }
  const budgetFields = ["model_turns", "patches", "commands", "wall_time_minutes", "changed_lines"];
  for (const field of budgetFields) {
    const val = budget[field];
    if (val !== undefined && (typeof val !== "number" || !Number.isFinite(val))) {
      throw new Error(`computeWorkOrderId requires numeric budget.${field}`);
    }
  }

  const canonicalPayload = {
    source_snapshot_id: sourceSnapshotId,
    node_id: nodeId,
    role: role,
    operation: operation,
    objective: objective,
    dependencies: [...dependencies].sort(),
    ownership: ownership,
    allowed_paths: [...allowedPaths].sort(),
    invariants: [...invariants].sort(),
    required_evidence: [...requiredEvidence].sort(),
    budget: budget
  };

  const domain = isV2 ? "work-order/v2" : "work-order/v1";
  return sha256Fingerprint(domain, canonicalPayload);
}

/**
 * Compute WorkResultId digest.
 * Domain prefix: "work-result/v1"
 *
 * @param {object} workResult
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

  // Reject missing patch — empty string is a valid explicit patch value; undefined is not.
  if (workResult.patch === undefined) {
    throw new Error("computeWorkResultId requires patch");
  }
  const patch = workResult.patch;
  if (typeof patch !== "string") {
    throw new TypeError(`computeWorkResultId requires string patch. Received: ${typeof patch}`);
  }

  if (workResult.commands === undefined) {
    throw new Error("computeWorkResultId requires commands array");
  }
  const commands = resolveArrayField(workResult.commands, undefined, "commands");
  for (const cmd of commands) {
    if (!cmd || typeof cmd !== "object" || typeof cmd.command !== "string" || typeof cmd.exit_code !== "number" || !Number.isInteger(cmd.exit_code) || typeof cmd.duration_ms !== "number" || !Number.isFinite(cmd.duration_ms)) {
      throw new Error("computeWorkResultId requires commands array elements with command string, exit_code integer, and duration_ms number");
    }
  }

  if (workResult.logs === undefined) {
    throw new Error("computeWorkResultId requires logs array");
  }
  const logs = resolveArrayField(workResult.logs, undefined, "logs");
  for (const log of logs) {
    if (typeof log === "string") continue;
    if (!log || typeof log !== "object" || typeof log.stream !== "string" || (log.stream !== "stdout" && log.stream !== "stderr") || typeof log.content !== "string") {
      throw new Error("computeWorkResultId requires logs array elements with stream ('stdout'|'stderr') and content string");
    }
  }

  const hasExitCode =
    workResult.exitCode !== undefined || workResult.exit_code !== undefined;
  if (!hasExitCode) {
    throw new Error("computeWorkResultId requires exit_code");
  }
  const exitCode = workResult.exitCode !== undefined ? workResult.exitCode : workResult.exit_code;
  if (exitCode === null || typeof exitCode !== "number" || !Number.isInteger(exitCode)) {
    throw new Error(
      `computeWorkResultId requires integer exit_code. Received: ${exitCode === null ? "null" : typeof exitCode}`
    );
  }

  const rawFsInv = workResult.filesystemInventory !== undefined ? workResult.filesystemInventory : workResult.filesystem_inventory;
  if (rawFsInv === undefined) {
    throw new Error("computeWorkResultId requires filesystem_inventory array");
  }
  const filesystemInventory = resolveArrayField(
    workResult.filesystemInventory,
    workResult.filesystem_inventory,
    "filesystem_inventory"
  );
  for (const item of filesystemInventory) {
    if (!item || typeof item !== "object" || typeof item.path !== "string" || !isValidSha256(item.sha256) || (typeof item.mode !== "string" && typeof item.mode !== "number")) {
      throw new Error("computeWorkResultId requires filesystem_inventory array elements with path string, valid sha256, and mode");
    }
  }

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
 * Domain prefix: "candidate/v1" (payload domain; record kind may be candidate/v2).
 *
 * @param {object} candidate
 * @returns {string} sha256:...
 */
function computeCandidateId(candidate) {
  if (!candidate || typeof candidate !== "object") {
    throw new TypeError("computeCandidateId requires a valid candidate object");
  }
  const repositoryId = candidate.repositoryId || candidate.repository_id;
  if (!repositoryId || typeof repositoryId !== "string" || repositoryId.length < 1) {
    throw new Error("computeCandidateId requires non-empty repository_id");
  }
  const projection = candidate.projection;
  if (projection !== "workspace" && projection !== "staged") {
    throw new Error(`computeCandidateId requires valid projection (workspace|staged). Received: ${projection}`);
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

  const rawPaths = candidate.paths !== undefined ? candidate.paths : candidate.pathsDigest;
  if (rawPaths === undefined) {
    throw new Error("computeCandidateId requires paths array");
  }
  const paths = resolveArrayField(candidate.pathsDigest, candidate.paths, "paths");
  for (const item of paths) {
    if (typeof item !== "string") {
      throw new TypeError(`Field paths array items must be strings. Received: ${typeof item}`);
    }
  }

  const changedPathsModesDigest = candidate.changedPathsModesDigest || candidate.changed_paths_modes_digest;
  if (!changedPathsModesDigest) {
    throw new Error("computeCandidateId requires changed_paths_modes_digest");
  }
  assertValidSha256(changedPathsModesDigest, "changed_paths_modes_digest");

  const intendedUntrackedDigest = candidate.intendedUntrackedDigest !== undefined
    ? candidate.intendedUntrackedDigest
    : (candidate.intended_untracked_digest !== undefined ? candidate.intended_untracked_digest : null);
  if (intendedUntrackedDigest === "") {
    throw new Error("Field intended_untracked_digest must be sha256 digest or null, never empty string");
  }
  if (intendedUntrackedDigest) {
    assertValidSha256(intendedUntrackedDigest, "intended_untracked_digest");
  }

  const canonicalPayload = {
    repository_id: repositoryId,
    projection: projection,
    base_tree: baseTree,
    candidate_tree: candidateTree,
    diff_hash: diffHash,
    paths: [...paths].sort(),
    changed_paths_modes_digest: changedPathsModesDigest,
    intended_untracked_digest: intendedUntrackedDigest
  };

  return sha256Fingerprint("candidate/v1", canonicalPayload);
}

/**
 * Freeze a candidate into a Candidate/v2 object and compute CandidateId.
 * @param {object} input
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
  if (typeof repositoryId !== "string" || repositoryId.length < 1) {
    throw new Error("freezeCandidate requires non-empty repository_id");
  }

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
  if (diffText !== undefined && typeof diffText !== "string") {
    throw new TypeError("freezeCandidate diffText must be a string");
  }
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

  const rawPaths = input.paths !== undefined ? assertArrayField(input.paths, "paths") : [];
  for (const path of rawPaths) {
    if (typeof path !== "string" || path.length === 0) {
      throw new TypeError("Candidate paths must be non-empty strings");
    }
  }
  const canonicalPaths = [...new Set(rawPaths.map((p) => p.replace(/\\/g, "/")))].sort();

  let modesDigest = input.changed_paths_modes_digest || "";
  if (modesDigest) {
    assertValidSha256(modesDigest, "changed_paths_modes_digest");
  } else if (input.fileModes) {
    modesDigest = sha256Fingerprint("candidate-modes/v1", input.fileModes);
  } else {
    modesDigest = sha256Fingerprint("candidate-modes/v1", {});
  }

  let untrackedDigest = input.intended_untracked_digest !== undefined
    ? input.intended_untracked_digest
    : (input.intendedUntrackedDigest !== undefined ? input.intendedUntrackedDigest : null);

  if (untrackedDigest === "") {
    throw new Error("Field intended_untracked_digest must be sha256 digest or null, never empty string");
  }
  if (untrackedDigest !== null && untrackedDigest !== undefined) {
    assertValidSha256(untrackedDigest, "intended_untracked_digest");
  } else if ((untrackedDigest === null || untrackedDigest === undefined) && input.intendedUntracked) {
    untrackedDigest = sha256Fingerprint("candidate-untracked/v1", input.intendedUntracked);
  } else {
    untrackedDigest = null;
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

  const frozenRecord = {
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

  if (!validateCandidateV2(frozenRecord)) {
    throw new Error("freezeCandidate produced invalid Candidate v2");
  }

  return frozenRecord;
}

/**
 * Validate WorkOrder binding fail-closed with cryptographic recompute.
 * @param {object} sourceSnapshot
 * @param {object} workOrder
 * @returns {{ ok: boolean, reason_code?: string, error?: string }}
 */
function validateWorkOrderBinding(sourceSnapshot, workOrder) {
  if (workOrder === undefined && sourceSnapshot && typeof sourceSnapshot === "object" &&
      (sourceSnapshot.source_snapshot_id || sourceSnapshot.sourceSnapshotId || sourceSnapshot.work_order_id)) {
    // Legacy one-arg call: treat first arg as workOrder without snapshot
    return {
      ok: false,
      reason_code: "INVALID_PAYLOAD",
      error: "validateWorkOrderBinding requires (sourceSnapshot, workOrder)"
    };
  }

  if (!sourceSnapshot || typeof sourceSnapshot !== "object") {
    return {
      ok: false,
      reason_code: "INVALID_PAYLOAD",
      error: "validateWorkOrderBinding requires a valid sourceSnapshot object"
    };
  }
  if (!workOrder || typeof workOrder !== "object") {
    return {
      ok: false,
      reason_code: "INVALID_WORK_ORDER",
      error: "WorkOrder must be a valid object"
    };
  }

  if (!validateSourceSnapshotV1(sourceSnapshot)) {
    return {
      ok: false,
      reason_code: "INVALID_SCHEMA",
      error: "sourceSnapshot fails source-snapshot/v1 JSON schema validation"
    };
  }
  if (!validateWorkOrderSchema(workOrder)) {
    return {
      ok: false,
      reason_code: "INVALID_SCHEMA",
      error: "workOrder fails work-order JSON schema validation"
    };
  }

  const declaredSnapshotId = workOrder.sourceSnapshotId || workOrder.source_snapshot_id;
  // ILL_FORMED_SNAPSHOT_ID: declared id missing/malformed (not a recompute mismatch).
  // SOURCE_SNAPSHOT_MISMATCH: recomputed SourceSnapshotId ≠ declared id.
  if (!declaredSnapshotId || !isValidSha256(declaredSnapshotId)) {
    return {
      ok: false,
      reason_code: "ILL_FORMED_SNAPSHOT_ID",
      error: "WorkOrder source_snapshot_id is missing or ill-formed"
    };
  }

  let recomputedSnapshotId;
  try {
    recomputedSnapshotId = computeSourceSnapshotId(sourceSnapshot);
  } catch (err) {
    return {
      ok: false,
      reason_code: "SOURCE_SNAPSHOT_MISMATCH",
      error: `Failed to recompute SourceSnapshotId: ${err.message}`
    };
  }

  const ownSnapshotId = sourceSnapshot.source_snapshot_id || sourceSnapshot.sourceSnapshotId;
  if (ownSnapshotId && ownSnapshotId !== recomputedSnapshotId) {
    return {
      ok: false,
      reason_code: "SOURCE_SNAPSHOT_ID_MISMATCH",
      error: "SourceSnapshot declared source_snapshot_id does not match recomputed computeSourceSnapshotId"
    };
  }

  if (recomputedSnapshotId !== declaredSnapshotId) {
    return {
      ok: false,
      reason_code: "SOURCE_SNAPSHOT_MISMATCH",
      error: "Recomputed SourceSnapshotId does not match declared source_snapshot_id"
    };
  }

  const declaredOrderId = workOrder.workOrderId || workOrder.work_order_id;
  if (!declaredOrderId || !isValidSha256(declaredOrderId)) {
    return {
      ok: false,
      reason_code: "WORK_ORDER_MISMATCH",
      error: "WorkOrder work_order_id is missing or ill-formed"
    };
  }

  let recomputedOrderId;
  try {
    recomputedOrderId = computeWorkOrderId(workOrder);
  } catch (err) {
    return {
      ok: false,
      reason_code: "DIGEST_MISMATCH",
      error: `Failed to recompute WorkOrderId: ${err.message}`
    };
  }
  if (recomputedOrderId !== declaredOrderId) {
    return {
      ok: false,
      reason_code: "WORK_ORDER_MISMATCH",
      error: "Recomputed WorkOrderId does not match declared work_order_id"
    };
  }

  return { ok: true };
}

/**
 * Validate WorkResult binding against WorkOrder fail-closed with recompute.
 * @param {object} workOrder
 * @param {object} workResult
 * @returns {{ ok: boolean, reason_code?: string, error?: string }}
 */
function validateWorkResultBinding(workOrder, workResult) {
  if (!workOrder || typeof workOrder !== "object" || !workResult || typeof workResult !== "object") {
    return { ok: false, reason_code: "INVALID_PAYLOAD", error: "workOrder and workResult must be valid objects" };
  }

  if (!validateWorkOrderSchema(workOrder)) {
    return {
      ok: false,
      reason_code: "INVALID_SCHEMA",
      error: "workOrder fails work-order JSON schema validation"
    };
  }
  if (!validateWorkResultV1(workResult)) {
    return {
      ok: false,
      reason_code: "INVALID_SCHEMA",
      error: "workResult fails work-result/v1 JSON schema validation"
    };
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

  let recomputedOrderId;
  try {
    recomputedOrderId = computeWorkOrderId(workOrder);
  } catch (err) {
    return {
      ok: false,
      reason_code: "DIGEST_MISMATCH",
      error: `Failed to recompute WorkOrderId: ${err.message}`
    };
  }
  if (expectedOrderId !== recomputedOrderId) {
    return {
      ok: false,
      reason_code: "WORK_ORDER_MISMATCH",
      error: "Declared WorkOrderId does not match recomputed WorkOrderId"
    };
  }

  const declaredResultId = workResult.workResultId || workResult.work_result_id;
  if (!declaredResultId || !isValidSha256(declaredResultId)) {
    return {
      ok: false,
      reason_code: "DIGEST_MISMATCH",
      error: "WorkResult work_result_id is missing or ill-formed"
    };
  }

  let recomputedResultId;
  try {
    recomputedResultId = computeWorkResultId(workResult);
  } catch (err) {
    return {
      ok: false,
      reason_code: "DIGEST_MISMATCH",
      error: `Failed to recompute WorkResultId: ${err.message}`
    };
  }
  if (recomputedResultId !== declaredResultId) {
    return {
      ok: false,
      reason_code: "DIGEST_MISMATCH",
      error: "Recomputed WorkResultId does not match declared work_result_id"
    };
  }

  return { ok: true };
}

/**
 * Evaluate relation between a baseline Candidate and a target Candidate or selector.
 * Freeze gate / typed-selector check runs before ambiguous/unknown short-circuit so
 * forged markers like `{ambiguous:true}` cannot bypass INVALID_FROZEN_CANDIDATE.
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

  const baselineSelector = isRelationSelector(baseline);
  const targetSelector = isRelationSelector(target);
  const baselineFrozen = baselineSelector ? false : isFrozenCandidateV2(baseline);
  const targetFrozen = targetSelector ? false : isFrozenCandidateV2(target);

  if (!baselineSelector && !baselineFrozen) {
    return {
      relation: "unknown",
      action: "stop",
      reason: "Baseline or target is not a valid frozen Candidate v2",
      reason_code: "INVALID_FROZEN_CANDIDATE"
    };
  }
  if (!targetSelector && !targetFrozen) {
    return {
      relation: "unknown",
      action: "stop",
      reason: "Baseline or target is not a valid frozen Candidate v2",
      reason_code: "INVALID_FROZEN_CANDIDATE"
    };
  }

  // Typed selector short-circuit (only after positive kind check above)
  if (baselineSelector || targetSelector) {
    if (
      baseline.ambiguous ||
      baseline.relation === "ambiguous" ||
      target.ambiguous ||
      target.relation === "ambiguous"
    ) {
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
 * Assert strict identity separation via positive EXPECTED_KINDS discrimination.
 * @param {object} payload
 * @param {"SourceSnapshot"|"WorkOrder"|"WorkResult"|"Candidate"|"EvaluationAttestation"|"CandidateEvaluationAttestation"|"DeliveryAuthorization"} expectedKind
 * @returns {{ ok: boolean, reason_code?: string }}
 */
function validateIdentityKind(payload, expectedKind) {
  if (!payload || typeof payload !== "object") {
    return { ok: false, reason_code: "INVALID_PAYLOAD" };
  }

  const expected = EXPECTED_KINDS[expectedKind];
  if (!expected) {
    return { ok: false, reason_code: "KIND_MISMATCH" };
  }

  const kind = payload.kind;
  const isV1SnapshotOrResult = (expectedKind === "SourceSnapshot" || expectedKind === "WorkResult") && kind === undefined;
  if (isV1SnapshotOrResult) {
    const isValidSchema = expectedKind === "SourceSnapshot" ? validateSourceSnapshotV1(payload) : validateWorkResultV1(payload);
    if (!isValidSchema) {
      return { ok: false, reason_code: "INVALID_SCHEMA" };
    }
  } else if (typeof kind !== "string" || kind.length === 0 || !expected.includes(kind)) {
    return { ok: false, reason_code: "KIND_MISMATCH" };
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
    if (payload.work_result_id || payload.patch || payload.source_snapshot_id || payload.base_tree_digest) {
      return { ok: false, reason_code: "KIND_MISMATCH" };
    }
  }

  if (expectedKind === "SourceSnapshot") {
    if (payload.candidate_id || payload.work_order_id || payload.work_result_id) {
      return { ok: false, reason_code: "KIND_MISMATCH" };
    }
  }

  if (expectedKind === "WorkOrder") {
    if (payload.candidate_id || payload.work_result_id) {
      return { ok: false, reason_code: "KIND_MISMATCH" };
    }
  }

  if (expectedKind === "WorkResult") {
    if (payload.candidate_id) {
      return { ok: false, reason_code: "KIND_MISMATCH" };
    }
  }

  if (expectedKind === "SourceSnapshot") {
    if (!validateSourceSnapshotV1(payload)) {
      return { ok: false, reason_code: "INVALID_SCHEMA" };
    }
  } else if (expectedKind === "WorkOrder") {
    if (!validateWorkOrderSchema(payload)) {
      return { ok: false, reason_code: "INVALID_SCHEMA" };
    }
  } else if (expectedKind === "WorkResult") {
    if (!validateWorkResultV1(payload)) {
      return { ok: false, reason_code: "INVALID_SCHEMA" };
    }
  } else if (expectedKind === "Candidate") {
    if (!validateCandidateV2(payload)) {
      return { ok: false, reason_code: "INVALID_SCHEMA" };
    }
  }

  return { ok: true };
}

module.exports = {
  EXPECTED_KINDS,
  validateCandidateV2,
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
