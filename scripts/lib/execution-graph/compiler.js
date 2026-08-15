"use strict";

const { sha256Fingerprint } = require("../canonical-json.js");
const { createPolicySnapshot } = require("./policy-snapshot.js");
const { validateObligationManifest } = require("./obligation-manifest.js");

const FORBIDDEN_OPERATIONS = Object.freeze([
  "read",
  "edit",
  "test",
  "file_edit",
  "bash_run",
  "grep",
]);

const SHA256_DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/;

/**
 * Derives a deterministic GraphId from contract digest, policy bundle digest, source snapshot id, and nodes.
 * @param {string} contractDigest
 * @param {string} policyBundleDigest
 * @param {string} sourceSnapshotId
 * @param {Array<Object>} nodes
 * @returns {string} sha256:<64 hex>
 */
function computeGraphId(contractDigest, policyBundleDigest, sourceSnapshotId, nodes) {
  if (!contractDigest || typeof contractDigest !== "string") {
    throw new TypeError("contractDigest must be a non-empty string");
  }
  if (!policyBundleDigest || typeof policyBundleDigest !== "string") {
    throw new TypeError("policyBundleDigest must be a non-empty string");
  }
  if (typeof sourceSnapshotId !== "string" || !SHA256_DIGEST_PATTERN.test(sourceSnapshotId)) {
    throw new TypeError("sourceSnapshotId must be a valid SHA-256 digest");
  }
  const nodesPayload = Array.isArray(nodes) ? nodes : [];
  return sha256Fingerprint("execution-graph/v1", {
    contract_digest: contractDigest,
    policy_bundle_digest: policyBundleDigest,
    source_snapshot_id: sourceSnapshotId,
    nodes: nodesPayload,
  });
}

/**
 * Compiles a change contract for a localized Repair route into a validated Execution Graph DAG.
 * @param {Object} params
 * @param {Object} params.contract - Validated change contract object
 * @param {Object} [params.policySnapshot] - Active PolicySnapshot object or params
 * @param {string} [params.sourceSnapshotId] - Bound SourceSnapshot ID
 * @param {Object} [params.sourceSnapshot] - Bound SourceSnapshot instance
 * @param {Object} [params.classification] - Route classification object
 * @param {Array<Object>} [params.nodes] - Semantic DAG nodes
 * @param {Array<Object>} [params.obligations] - Obligation manifest items
 * @returns {Object} ExecutionGraph conforming to ospec://schemas/kernel/execution-graph/v1
 */
function compileExecutionGraph({ contract, policySnapshot, sourceSnapshotId, sourceSnapshot, classification, nodes, obligations } = {}) {
  if (!contract || typeof contract !== "object") {
    throw new TypeError("contract must be an object");
  }

  const contractDigest =
    contract.contract_digest ||
    sha256Fingerprint("contract/v1", contract);

  const snapshot =
    policySnapshot && policySnapshot.snapshot_id
      ? policySnapshot
      : createPolicySnapshot(policySnapshot || {});

  const policyBundleDigest = snapshot.policy_bundle_digest;

  const resolvedSourceSnapshotId =
    sourceSnapshotId ||
    (contract && contract.source_snapshot_id) ||
    (sourceSnapshot && sourceSnapshot.source_snapshot_id);

  if (typeof resolvedSourceSnapshotId !== "string" || !SHA256_DIGEST_PATTERN.test(resolvedSourceSnapshotId)) {
    const err = new Error(
      `Missing or malformed source_snapshot_id for Execution Graph: "${resolvedSourceSnapshotId}"`
    );
    err.code = "invalid-source-snapshot-id";
    err.source_snapshot_id = resolvedSourceSnapshotId;
    throw err;
  }

  // Resolve nodes
  const graphNodes = Array.isArray(nodes) ? nodes : [];
  if (graphNodes.length === 0 && contract.nodes && Array.isArray(contract.nodes)) {
    graphNodes.push(...contract.nodes);
  }

  // Reject microscopic nodes fail-closed
  for (const node of graphNodes) {
    if (!node || typeof node !== "object") {
      const err = new Error("Graph node must be an object");
      err.code = "invalid-node";
      throw err;
    }
    const op = String(node.operation || "");
    if (FORBIDDEN_OPERATIONS.includes(op)) {
      const err = new Error(`Microscopic worker action nodes are forbidden in Execution Graph: ${op} (node_id: ${node.node_id})`);
      err.code = "microscopic-node-rejected";
      err.operation = op;
      err.node_id = node.node_id;
      throw err;
    }

    for (const field of ["objective", "ownership", "required_evidence"]) {
      const value = node[field];
      const isMissing =
        value === undefined ||
        value === null ||
        value === "" ||
        (Array.isArray(value) && value.length === 0);
      if (isMissing) {
        const err = new Error(`Graph node is missing required field: ${field} (node_id: ${node.node_id})`);
        err.code = "missing-required-node-field";
        err.field = field;
        err.node_id = node.node_id;
        throw err;
      }
    }
  }

  const nodeIds = new Set(graphNodes.map((node) => node.node_id));
  for (const node of graphNodes) {
    const dependencies = Array.isArray(node.dependencies) ? node.dependencies : [];
    for (const dependency of dependencies) {
      if (!nodeIds.has(dependency)) {
        const err = new Error(`Graph node dependency does not exist: ${dependency} (node_id: ${node.node_id})`);
        err.code = "unknown-node-dependency";
        err.node_id = node.node_id;
        err.dependency = dependency;
        throw err;
      }
    }
  }

  // Resolve obligations
  const graphObligations = Array.isArray(obligations)
    ? obligations
    : Array.isArray(contract.obligations)
      ? contract.obligations
      : [];

  // Validate obligation manifest coverage
  const obligationValidation = validateObligationManifest(graphObligations, graphNodes);
  if (!obligationValidation.valid) {
    const err = new Error(
      `Obligation manifest validation failed: ${obligationValidation.errors.join("; ")}`
    );
    err.code = "obligation-manifest-incomplete";
    err.unmapped = obligationValidation.unmapped;
    err.missingEvidence = obligationValidation.missingEvidence;
    err.errors = obligationValidation.errors;
    throw err;
  }

  const graphId = computeGraphId(contractDigest, policyBundleDigest, resolvedSourceSnapshotId, graphNodes);

  return {
    schema_version: 1,
    graph_id: graphId,
    contract_digest: contractDigest,
    policy_bundle_digest: policyBundleDigest,
    source_snapshot_id: resolvedSourceSnapshotId,
    nodes: graphNodes,
    obligations: graphObligations,
  };
}

module.exports = {
  FORBIDDEN_OPERATIONS,
  computeGraphId,
  compileExecutionGraph,
};
