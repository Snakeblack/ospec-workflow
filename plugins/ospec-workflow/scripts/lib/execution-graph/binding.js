"use strict";

const path = require("node:path");
const { validateInstance, loadSchemaById } = require("../kernel-schema-validator.js");
const { validatePolicySnapshotBinding } = require("./policy-snapshot.js");

const SHA256_REGEX = /^sha256:[a-f0-9]{64}$/;
const EXECUTION_GRAPH_V1_SCHEMA_ID = "ospec://schemas/kernel/execution-graph/v1";
const DEFAULT_SCHEMA_ROOT = path.resolve(__dirname, "../../..");

let cachedExecutionGraphV1Schema = null;
function getExecutionGraphV1Schema() {
  if (!cachedExecutionGraphV1Schema) {
    cachedExecutionGraphV1Schema = loadSchemaById(EXECUTION_GRAPH_V1_SCHEMA_ID, {
      rootDir: DEFAULT_SCHEMA_ROOT,
    });
  }
  return cachedExecutionGraphV1Schema;
}

/**
 * Lazy resolve computeGraphId to prevent circular require issues.
 */
function getComputeGraphId() {
  const compiler = require("./compiler.js");
  return compiler.computeGraphId;
}

/**
 * Lazy resolve computeSourceSnapshotId to prevent circular require issues.
 */
function getComputeSourceSnapshotId() {
  const identities = require("../execution-identities/index.js");
  return identities.computeSourceSnapshotId;
}

/**
 * Cryptographic validation gate for ExecutionGraph records.
 * @param {Object} graph - ExecutionGraph instance
 * @param {Object} [options]
 * @param {Object} [options.policySnapshot] - Bound PolicySnapshot instance
 * @param {Object} [options.sourceSnapshot] - Bound SourceSnapshot instance
 * @param {string} [options.sourceSnapshotId] - Bound SourceSnapshot ID
 * @returns {{ ok: boolean, reason_code?: string, error?: string }}
 */
function validateExecutionGraphBinding(graph, options = {}) {
  if (!graph || typeof graph !== "object") {
    return {
      ok: false,
      reason_code: "INVALID_PAYLOAD",
      error: "ExecutionGraph must be a non-null object",
    };
  }

  let validation;
  try {
    validation = validateInstance(getExecutionGraphV1Schema(), graph);
  } catch (err) {
    return { ok: false, reason_code: "INVALID_SCHEMA", error: err.message };
  }
  if (!validation.valid) {
    return {
      ok: false,
      reason_code: "INVALID_SCHEMA",
      error: validation.errors.map((e) => e.message).join("; "),
    };
  }

  // Enforce duplicate node_id check on nodes
  if (Array.isArray(graph.nodes)) {
    const rawNodeIds = graph.nodes.map((n) => n && n.node_id);
    if (new Set(rawNodeIds).size !== rawNodeIds.length) {
      return {
        ok: false,
        reason_code: "DUPLICATE_NODE_ID",
        error: "Duplicate node_id detected in Execution Graph nodes",
      };
    }
  }

  if (
    typeof graph.policy_snapshot_id !== "string" ||
    !SHA256_REGEX.test(graph.policy_snapshot_id) ||
    typeof graph.source_snapshot_id !== "string" ||
    !SHA256_REGEX.test(graph.source_snapshot_id)
  ) {
    return {
      ok: false,
      reason_code: "ILL_FORMED_SNAPSHOT_ID",
      error: "Snapshot IDs must match sha256:<64 lowercase hex>",
    };
  }

  if (options.policySnapshot) {
    const psValidation = validatePolicySnapshotBinding(options.policySnapshot);
    if (!psValidation.ok || options.policySnapshot.snapshot_id !== graph.policy_snapshot_id) {
      return {
        ok: false,
        reason_code: "POLICY_SNAPSHOT_MISMATCH",
        error: "PolicySnapshot mismatch or invalid",
      };
    }
  }

  if (options.sourceSnapshot) {
    let computedSrcId;
    try {
      computedSrcId = getComputeSourceSnapshotId()(options.sourceSnapshot);
    } catch (err) {
      return {
        ok: false,
        reason_code: "SOURCE_SNAPSHOT_MISMATCH",
        error: `SourceSnapshot error: ${err.message}`,
      };
    }
    if (computedSrcId !== graph.source_snapshot_id) {
      return {
        ok: false,
        reason_code: "SOURCE_SNAPSHOT_MISMATCH",
        error: `SourceSnapshot digest mismatch: declared ${graph.source_snapshot_id}, expected ${computedSrcId}`,
      };
    }
  }

  if (options.sourceSnapshotId) {
    if (options.sourceSnapshotId !== graph.source_snapshot_id) {
      return {
        ok: false,
        reason_code: "SOURCE_SNAPSHOT_MISMATCH",
        error: `SourceSnapshotId mismatch: declared ${graph.source_snapshot_id}, expected ${options.sourceSnapshotId}`,
      };
    }
  }

  let expectedGraphId;
  try {
    expectedGraphId = getComputeGraphId()(
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
      reason_code: "GRAPH_ID_MISMATCH",
      error: `Failed to compute expected GraphId: ${err.message}`,
    };
  }

  if (graph.graph_id !== expectedGraphId) {
    return {
      ok: false,
      reason_code: "GRAPH_ID_MISMATCH",
      error: `GraphId mismatch: declared ${graph.graph_id}, expected ${expectedGraphId}`,
    };
  }

  return { ok: true };
}

module.exports = {
  validateExecutionGraphBinding,
};
