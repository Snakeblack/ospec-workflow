"use strict";

const { computeGraphId } = require("../execution-graph/compiler.js");
const { computePolicySnapshotDigest } = require("../execution-graph/policy-snapshot.js");
const { computeCandidateId } = require("../execution-identities/index.js");
const { computeRevision } = require("../authority-store/index.js");

const RECORD_KIND = "repair-shadow-execution/v1";
const RECORD_SCHEMA_VERSION = 1;

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function recordsByteIdentical(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

/**
 * Validates the required bindings of a repair-shadow-execution/v1 record.
 * Incomplete CandidateId / ExecutionGraph / PolicySnapshot bindings fail closed.
 *
 * @param {Object} record
 * @returns {{ ok: boolean, error?: string, reason_code?: string }}
 */
function validateRepairShadowExecutionRecord(record) {
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    return { ok: false, error: "record must be a plain object", reason_code: "INCOMPLETE_BINDINGS" };
  }
  if (record.kind !== RECORD_KIND) {
    return {
      ok: false,
      error: `kind must be ${RECORD_KIND}`,
      reason_code: "INCOMPLETE_BINDINGS",
    };
  }
  if (record.schema_version !== RECORD_SCHEMA_VERSION) {
    return {
      ok: false,
      error: "schema_version must be 1",
      reason_code: "INCOMPLETE_BINDINGS",
    };
  }
  if (typeof record.candidate_id !== "string" || record.candidate_id.trim() === "") {
    return {
      ok: false,
      error: "candidate_id binding is required",
      reason_code: "INCOMPLETE_BINDINGS",
    };
  }
  if (!record.execution_graph || typeof record.execution_graph !== "object" || Array.isArray(record.execution_graph)) {
    return {
      ok: false,
      error: "execution_graph binding is required",
      reason_code: "INCOMPLETE_BINDINGS",
    };
  }
  if (!record.policy_snapshot || typeof record.policy_snapshot !== "object" || Array.isArray(record.policy_snapshot)) {
    return {
      ok: false,
      error: "policy_snapshot binding is required",
      reason_code: "INCOMPLETE_BINDINGS",
    };
  }
  return { ok: true };
}

function recomputeIdentityBindings(record) {
  const graph = record.execution_graph;
  const policy = record.policy_snapshot;

  let computedGraphId;
  try {
    computedGraphId = computeGraphId(
      graph.contract_digest,
      graph.policy_snapshot_id,
      graph.policy_bundle_digest,
      graph.source_snapshot_id,
      graph.nodes,
      graph.obligations
    );
  } catch (err) {
    return {
      ok: false,
      error: `GraphId recompute failed: ${err.message}`,
      reason_code: "BINDING_MISMATCH",
    };
  }
  if (computedGraphId !== graph.graph_id) {
    return {
      ok: false,
      error: "GraphId recompute mismatch",
      reason_code: "BINDING_MISMATCH",
      mismatched_identity: "graph_id",
    };
  }

  let computedPolicyId;
  try {
    computedPolicyId = computePolicySnapshotDigest(policy);
  } catch (err) {
    return {
      ok: false,
      error: `PolicySnapshotId recompute failed: ${err.message}`,
      reason_code: "BINDING_MISMATCH",
    };
  }
  const declaredPolicyId = policy.snapshot_id || policy.policy_snapshot_id;
  if (computedPolicyId !== declaredPolicyId) {
    return {
      ok: false,
      error: "PolicySnapshotId recompute mismatch",
      reason_code: "BINDING_MISMATCH",
      mismatched_identity: "snapshot_id",
    };
  }
  if (graph.policy_snapshot_id !== declaredPolicyId) {
    return {
      ok: false,
      error: "PolicySnapshotId does not match ExecutionGraph binding",
      reason_code: "BINDING_MISMATCH",
    };
  }

  if (!isPlainObject(record.candidate)) {
    return {
      ok: false,
      error: "candidate binding is required to recompute CandidateId",
      reason_code: "INCOMPLETE_BINDINGS",
    };
  }
  let computedCandidateId;
  try {
    computedCandidateId = computeCandidateId(record.candidate);
  } catch (err) {
    return {
      ok: false,
      error: `CandidateId recompute failed: ${err.message}`,
      reason_code: "BINDING_MISMATCH",
    };
  }
  if (computedCandidateId !== record.candidate_id) {
    return {
      ok: false,
      error: "CandidateId recompute mismatch",
      reason_code: "BINDING_MISMATCH",
      mismatched_identity: "candidate_id",
    };
  }
  if (record.candidate.candidate_id && record.candidate.candidate_id !== record.candidate_id) {
    return {
      ok: false,
      error: "CandidateId does not match bound candidate",
      reason_code: "BINDING_MISMATCH",
    };
  }

  return { ok: true };
}

function isUsableStore(store) {
  return store && typeof store.load === "function" && typeof store.commit === "function";
}

/**
 * Persists a repair-shadow-execution/v1 record via filesystem-store CAS
 * on state.repair_shadow_executions[candidate_id].
 *
 * @param {Object} store
 * @param {Object} record
 * @returns {Promise<{ ok: boolean, candidate_id?: string, idempotent?: boolean, error?: string, reason_code?: string }>}
 */
async function persistRepairShadowExecution(store, record) {
  const validation = validateRepairShadowExecutionRecord(record);
  if (!validation.ok) {
    return validation;
  }
  const bindings = recomputeIdentityBindings(record);
  if (!bindings.ok) {
    return bindings;
  }
  if (!isUsableStore(store)) {
    return {
      ok: false,
      error: "filesystem-store with load/commit is required",
      reason_code: "STORE_UNAVAILABLE",
    };
  }

  const toStore = cloneJson(record);
  let loaded;
  try {
    loaded = await store.load();
  } catch (err) {
    return {
      ok: false,
      error: `store load failed: ${err.message}`,
      reason_code: "STORE_UNAVAILABLE",
    };
  }

  const state = loaded.state && typeof loaded.state === "object" ? loaded.state : {};
  const index = isPlainObject(state.repair_shadow_executions) ? state.repair_shadow_executions : {};
  const existing = index[record.candidate_id];
  if (existing) {
    if (recordsByteIdentical(existing, toStore)) {
      return { ok: true, candidate_id: record.candidate_id, idempotent: true };
    }
    return {
      ok: false,
      error: "CAS conflict: divergent record for candidate_id",
      reason_code: "CAS_CONFLICT",
    };
  }

  const expectedRevision = computeRevision(loaded.state, loaded.journal, loaded.authority);
  const nextState = {
    ...cloneJson(state),
    repair_shadow_executions: {
      ...cloneJson(index),
      [record.candidate_id]: toStore,
    },
  };

  let committed;
  try {
    committed = await store.commit({
      state: nextState,
      journal: loaded.journal,
      authority: loaded.authority,
      budgets: loaded.budgets,
      expectedRevision,
    });
  } catch (err) {
    return {
      ok: false,
      error: `store commit failed: ${err.message}`,
      reason_code: "CAS_CONFLICT",
    };
  }

  if (committed && committed.ok === false) {
    return {
      ok: false,
      error: "CAS conflict writing repair-shadow-execution/v1",
      reason_code: "CAS_CONFLICT",
    };
  }

  return { ok: true, candidate_id: record.candidate_id };
}

/**
 * Loads a previously persisted repair-shadow-execution/v1 record by CandidateId.
 * Returns a defensive copy so callers cannot mutate store state in place.
 *
 * @param {Object} store
 * @param {string} candidateId
 * @returns {Promise<{ ok: boolean, record?: Object, error?: string, reason_code?: string }>}
 */
async function loadRepairShadowExecution(store, candidateId) {
  if (typeof candidateId !== "string" || candidateId.trim() === "") {
    return {
      ok: false,
      error: "candidateId is required",
      reason_code: "INCOMPLETE_BINDINGS",
    };
  }
  if (!isUsableStore(store)) {
    return {
      ok: false,
      error: "filesystem-store with load/commit is required",
      reason_code: "STORE_UNAVAILABLE",
    };
  }

  let loaded;
  try {
    loaded = await store.load();
  } catch (err) {
    return {
      ok: false,
      error: `store load failed: ${err.message}`,
      reason_code: "STORE_UNAVAILABLE",
    };
  }

  const record = loaded && loaded.state && loaded.state.repair_shadow_executions
    ? loaded.state.repair_shadow_executions[candidateId]
    : undefined;
  if (!record) {
    return {
      ok: false,
      error: "execution record not found",
      reason_code: "NOT_FOUND",
    };
  }
  return { ok: true, record: cloneJson(record) };
}

module.exports = {
  persistRepairShadowExecution,
  loadRepairShadowExecution,
  validateRepairShadowExecutionRecord,
  RECORD_KIND,
  RECORD_SCHEMA_VERSION,
};
