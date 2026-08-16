"use strict";

const { sha256Fingerprint } = require("../canonical-json.js");
const { hasCycle } = require("./dag.js");
const { createPolicySnapshot, validatePolicySnapshotBinding } = require("./policy-snapshot.js");
const { validateObligationManifest } = require("./obligation-manifest.js");
const { validateExecutionGraphBinding } = require("./binding.js");

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
 * Derives a deterministic GraphId from contract digest, policy snapshot id, policy bundle digest, source snapshot id, nodes, and obligations.
 * @param {string} contractDigest
 * @param {string} policySnapshotId
 * @param {string} policyBundleDigest
 * @param {string} sourceSnapshotId
 * @param {Array<Object>} nodes
 * @param {Array<Object>} [obligations]
 * @returns {string} sha256:<64 hex>
 */
function computeGraphId(contractDigest, policySnapshotId, policyBundleDigest, sourceSnapshotId, nodes, obligations = []) {
  if (!contractDigest || typeof contractDigest !== "string") {
    throw new TypeError("contractDigest must be a non-empty string");
  }
  if (!policySnapshotId || typeof policySnapshotId !== "string" || !SHA256_DIGEST_PATTERN.test(policySnapshotId)) {
    throw new TypeError("policySnapshotId must be a valid SHA-256 digest");
  }
  if (!policyBundleDigest || typeof policyBundleDigest !== "string") {
    throw new TypeError("policyBundleDigest must be a non-empty string");
  }
  if (typeof sourceSnapshotId !== "string" || !SHA256_DIGEST_PATTERN.test(sourceSnapshotId)) {
    throw new TypeError("sourceSnapshotId must be a valid SHA-256 digest");
  }
  const nodesPayload = Array.isArray(nodes) ? nodes : [];
  const obligationsPayload = Array.isArray(obligations) ? obligations : [];
  return sha256Fingerprint("execution-graph/v1", {
    contract_digest: contractDigest,
    policy_snapshot_id: policySnapshotId,
    policy_bundle_digest: policyBundleDigest,
    source_snapshot_id: sourceSnapshotId,
    nodes: nodesPayload,
    obligations: obligationsPayload,
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

  let snapshot;
  if (policySnapshot && typeof policySnapshot === "object") {
    if (policySnapshot.snapshot_id !== undefined || policySnapshot.schema_version === 1) {
      const psValidation = validatePolicySnapshotBinding(policySnapshot);
      if (!psValidation.ok) {
        const err = new Error(
          `PolicySnapshot cryptographic binding validation failed: ${psValidation.error}`
        );
        err.code = psValidation.reason_code === "ILL_FORMED_SNAPSHOT_ID" ? "invalid-policy-snapshot-id" : "policy-snapshot-mismatch";
        throw err;
      }
      snapshot = policySnapshot;
    } else {
      snapshot = createPolicySnapshot(policySnapshot);
    }
  } else {
    snapshot = createPolicySnapshot({});
  }

  if (typeof snapshot.snapshot_id !== "string" || !SHA256_DIGEST_PATTERN.test(snapshot.snapshot_id)) {
    const err = new Error(
      `Missing or malformed policy_snapshot_id for Execution Graph: "${snapshot.snapshot_id}"`
    );
    err.code = "invalid-policy-snapshot-id";
    err.policy_snapshot_id = snapshot.snapshot_id;
    throw err;
  }

  const policySnapshotId = snapshot.snapshot_id;
  const policyBundleDigest = snapshot.policy_bundle_digest;

  let resolvedSourceSnapshotId;
  let boundSourceSnapshot = undefined;
  if (sourceSnapshot !== undefined) {
    if (!sourceSnapshot || typeof sourceSnapshot !== "object") {
      const err = new Error("sourceSnapshot must be a valid object");
      err.code = "invalid-source-snapshot";
      throw err;
    }
    const identities = require("../execution-identities/index.js");
    let computedSrcId;
    try {
      computedSrcId = identities.computeSourceSnapshotId(sourceSnapshot);
    } catch (e) {
      const err = new Error(`Failed to compute source snapshot digest: ${e.message}`);
      err.code = "invalid-source-snapshot-id";
      throw err;
    }
    const declaredSrcId = sourceSnapshot.source_snapshot_id || sourceSnapshot.sourceSnapshotId;
    if (declaredSrcId && declaredSrcId !== computedSrcId) {
      const err = new Error(`SourceSnapshot declared id "${declaredSrcId}" does not match recomputed id "${computedSrcId}"`);
      err.code = "source-snapshot-mismatch";
      throw err;
    }
    if (sourceSnapshotId !== undefined && sourceSnapshotId !== computedSrcId) {
      const err = new Error(`sourceSnapshotId "${sourceSnapshotId}" does not match sourceSnapshot digest "${computedSrcId}"`);
      err.code = "provenance-mismatch";
      throw err;
    }
    resolvedSourceSnapshotId = computedSrcId;
    boundSourceSnapshot = sourceSnapshot;
  } else if (sourceSnapshotId !== undefined) {
    if (typeof sourceSnapshotId !== "string" || !SHA256_DIGEST_PATTERN.test(sourceSnapshotId)) {
      const err = new Error(
        `Missing or malformed source_snapshot_id for Execution Graph: "${sourceSnapshotId}"`
      );
      err.code = "invalid-source-snapshot-id";
      err.source_snapshot_id = sourceSnapshotId;
      throw err;
    }
    resolvedSourceSnapshotId = sourceSnapshotId;
  } else {
    const cId = contract && contract.source_snapshot_id;
    if (typeof cId !== "string" || !SHA256_DIGEST_PATTERN.test(cId)) {
      const err = new Error(
        `Missing or malformed source_snapshot_id for Execution Graph: "${cId}"`
      );
      err.code = "invalid-source-snapshot-id";
      err.source_snapshot_id = cId;
      throw err;
    }
    resolvedSourceSnapshotId = cId;
  }

  // Resolve nodes (defensive copy)
  const inputNodes = Array.isArray(nodes)
    ? nodes
    : (contract.nodes && Array.isArray(contract.nodes))
      ? contract.nodes
      : [];
  const graphNodes = structuredClone(inputNodes);

  // Check duplicate node_id
  const rawNodeIds = graphNodes.map((n) => n && n.node_id);
  if (new Set(rawNodeIds).size !== rawNodeIds.length) {
    const err = new Error("Duplicate node_id detected in Execution Graph nodes");
    err.code = "duplicate-node-id";
    throw err;
  }

  // Check for dependency cycles
  if (hasCycle(graphNodes)) {
    const err = new Error("Dependency cycle detected in Execution Graph");
    err.code = "cyclic-dependency-detected";
    throw err;
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

  // Resolve obligations against authoritative contract.obligations with allowlist merge
  let rawObligations;
  const contractObligations = Array.isArray(contract.obligations) ? contract.obligations : [];
  if (Array.isArray(obligations) && obligations.length > 0) {
    const callerObligationMap = new Map(obligations.map((o) => [o.id, o]));
    const merged = [];
    const seenIds = new Set();
    for (const contractOb of contractObligations) {
      seenIds.add(contractOb.id);
      if (callerObligationMap.has(contractOb.id)) {
        const callerOb = callerObligationMap.get(contractOb.id);
        // Allowlist merge from contract authority:
        // Contract defines id, criticality, and deferred authority.
        // Caller only provides implemented_by and required_evidence mappings.
        merged.push({
          id: contractOb.id,
          criticality: contractOb.criticality,
          implemented_by: Array.isArray(callerOb.implemented_by) ? callerOb.implemented_by : (contractOb.implemented_by || []),
          required_evidence: Array.isArray(callerOb.required_evidence) ? callerOb.required_evidence : (contractOb.required_evidence || []),
          ...(contractOb.deferred ? { deferred: structuredClone(contractOb.deferred) } : {}),
        });
      } else {
        merged.push(structuredClone(contractOb));
      }
    }
    for (const callerOb of obligations) {
      if (!seenIds.has(callerOb.id)) {
        const isMust = callerOb.criticality === "must";
        const ob = {
          id: callerOb.id,
          criticality: callerOb.criticality || "should",
          implemented_by: Array.isArray(callerOb.implemented_by) ? callerOb.implemented_by : [],
          required_evidence: Array.isArray(callerOb.required_evidence) ? callerOb.required_evidence : [],
        };
        if (!isMust && callerOb.deferred) {
          ob.deferred = structuredClone(callerOb.deferred);
        }
        merged.push(ob);
      }
    }
    rawObligations = merged;
  } else {
    rawObligations = contractObligations.length > 0
      ? contractObligations
      : (Array.isArray(obligations) ? obligations : []);
  }

  const graphObligations = structuredClone(rawObligations);

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

  const graphId = computeGraphId(contractDigest, policySnapshotId, policyBundleDigest, resolvedSourceSnapshotId, graphNodes, graphObligations);

  const compiledGraph = {
    schema_version: 1,
    graph_id: graphId,
    contract_digest: contractDigest,
    policy_bundle_digest: policyBundleDigest,
    policy_snapshot_id: policySnapshotId,
    source_snapshot_id: resolvedSourceSnapshotId,
    nodes: structuredClone(graphNodes),
    obligations: structuredClone(graphObligations),
  };

  const bindingCheck = validateExecutionGraphBinding(compiledGraph, {
    policySnapshot: snapshot,
    sourceSnapshot: boundSourceSnapshot,
    sourceSnapshotId: resolvedSourceSnapshotId,
  });
  if (!bindingCheck.ok) {
    const err = new Error(`Compiled ExecutionGraph binding validation failed: ${bindingCheck.error}`);
    err.code = bindingCheck.reason_code || "graph-binding-invalid";
    throw err;
  }

  return compiledGraph;
}

module.exports = {
  FORBIDDEN_OPERATIONS,
  hasCycle,
  computeGraphId,
  compileExecutionGraph,
  validateExecutionGraphBinding,
};

