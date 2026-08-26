"use strict";

const { validateExecutionGraphBinding } = require("../execution-graph/binding.js");
const { hasCycle, topologicalSort, computeDescendantClosure } = require("../execution-graph/dag.js");
const { compileWorkOrdersV2 } = require("../execution-graph/work-order-compiler.js");
const workerWorkspace = require("../worker-workspace.js");
const workerExecutor = require("../worker-executor.js");

const EXECUTE_WORK_ORDER_OPTION_ALLOWLIST = Object.freeze([
  "commands",
  "command",
  "args",
  "signal",
  "declaredTargets",
]);

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Picks caller-supplied per-node execution inputs that cannot override K6a authority.
 * Any non-allowlisted key or function value fails closed with UNSAFE_EXECUTOR_OPTION.
 *
 * @param {Object|null|undefined} nodeOptions
 * @returns {Object}
 */
function pickAllowedNodeExecutionInputs(nodeOptions) {
  if (nodeOptions === undefined || nodeOptions === null) {
    return {};
  }
  if (!isPlainObject(nodeOptions)) {
    const err = new Error("executorOptionsByNode values must be plain objects");
    err.code = "UNSAFE_EXECUTOR_OPTION";
    throw err;
  }
  const picked = {};
  for (const key of Object.keys(nodeOptions)) {
    if (!EXECUTE_WORK_ORDER_OPTION_ALLOWLIST.includes(key) || typeof nodeOptions[key] === "function") {
      const err = new Error(`Unsafe executor option: ${key}`);
      err.code = "UNSAFE_EXECUTOR_OPTION";
      throw err;
    }
    picked[key] = nodeOptions[key];
  }
  return picked;
}

/**
 * Builds the frozen object-signature payload for K6a executeWorkOrder.
 * Allowlisted node inputs are copied first; orchestrator-owned authority is assigned after.
 *
 * @param {Object} params
 * @returns {Object}
 */
function buildExecuteWorkOrderInvocation(params = {}) {
  const allowed = pickAllowedNodeExecutionInputs(params.nodeOptions);
  return Object.freeze({
    ...allowed,
    workOrder: params.workOrder,
    workspace: params.workspace,
    transports: { worker: params.authorizedWorkerTransport },
    isolationCapability: "enforced",
    capabilityId: "WorkerTransport",
    capabilityProof: params.capabilityProof,
    semantic_evidence: params.semantic_evidence,
    expectedAdapterId: params.expectedAdapterId,
    expectedAdapterVersion: params.expectedAdapterVersion,
    expectedHostRuntimeVersion: params.expectedHostRuntimeVersion,
    expectedProbeDigest: params.expectedProbeDigest,
    workerIsolation: params.workerIsolation,
    strictIsolation: true,
  });
}

const {
  validateWorkOrderBinding,
  validateWorkResultBinding,
  computeSourceSnapshotId,
  computeWorkOrderId,
  computeWorkResultId,
  computeCandidateId,
} = require("../execution-identities/index.js");
const { integrateWorkResultPatches, detectPredecessorContextConflicts } = require("./patch-integrator.js");
const { compareShadowExecution } = require("./shadow-comparator.js");
const { buildEffectiveShadowBase } = require("./effective-shadow-base.js");
const { persistRepairShadowExecution } = require("./execution-record-store.js");

/**
 * Transitive predecessor closure of nodeId (does not include nodeId itself).
 *
 * @param {Array<Object>} nodes
 * @param {string} nodeId
 * @returns {Set<string>}
 */
function computePredecessorClosure(nodes, nodeId) {
  const nodeMap = new Map();
  for (const node of nodes) {
    if (node && node.node_id) nodeMap.set(node.node_id, node);
  }
  const visited = new Set();
  const stack = [...(Array.isArray(nodeMap.get(nodeId)?.dependencies) ? nodeMap.get(nodeId).dependencies : [])];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || visited.has(current) || !nodeMap.has(current)) continue;
    visited.add(current);
    const deps = Array.isArray(nodeMap.get(current).dependencies) ? nodeMap.get(current).dependencies : [];
    for (const dep of deps) stack.push(dep);
  }
  return visited;
}

/**
 * Validates 4-identity cryptographic lineage chain:
 * SourceSnapshotId -> WorkOrderId -> WorkResultId -> CandidateId.
 *
 * @param {Object} sourceSnapshot
 * @param {Array<Object>} workOrders
 * @param {Array<Object>} workResults
 * @param {Object} candidate
 * @returns {{ ok: boolean, error?: string, reason_code?: string }}
 */
function validate4IdentityLineage(sourceSnapshot, workOrders, workResults, candidate) {
  if (!sourceSnapshot || typeof sourceSnapshot !== "object") {
    return { ok: false, error: "Missing sourceSnapshot", reason_code: "LINEAGE_VERIFICATION_FAILED" };
  }
  if (!candidate || typeof candidate !== "object") {
    return { ok: false, error: "Missing candidate", reason_code: "LINEAGE_VERIFICATION_FAILED" };
  }

  // 1. SourceSnapshot verification
  try {
    const computedSnapshotId = computeSourceSnapshotId(sourceSnapshot);
    if (computedSnapshotId !== sourceSnapshot.source_snapshot_id) {
      return { ok: false, error: "SourceSnapshotId recompute mismatch", reason_code: "LINEAGE_VERIFICATION_FAILED" };
    }
  } catch (err) {
    return { ok: false, error: `SourceSnapshotId computation failed: ${err.message}`, reason_code: "LINEAGE_VERIFICATION_FAILED" };
  }

  // Map work orders by work_order_id
  const woMap = new Map();
  for (const wo of workOrders) {
    try {
      const computedWoId = computeWorkOrderId(wo);
      if (computedWoId !== wo.work_order_id) {
        return { ok: false, error: `WorkOrderId mismatch for node ${wo.node_id}`, reason_code: "LINEAGE_VERIFICATION_FAILED" };
      }
      const woBinding = validateWorkOrderBinding(sourceSnapshot, wo);
      if (!woBinding.ok) {
        return { ok: false, error: `WorkOrder binding invalid for node ${wo.node_id}`, reason_code: "LINEAGE_VERIFICATION_FAILED" };
      }
      woMap.set(wo.work_order_id, wo);
    } catch (err) {
      return { ok: false, error: `WorkOrder validation failed: ${err.message}`, reason_code: "LINEAGE_VERIFICATION_FAILED" };
    }
  }

  // Map work results and validate bindings
  for (const wr of workResults) {
    try {
      const computedWrId = computeWorkResultId(wr);
      if (computedWrId !== wr.work_result_id) {
        return { ok: false, error: `WorkResultId mismatch: declared ${wr.work_result_id}, computed ${computedWrId}`, reason_code: "LINEAGE_VERIFICATION_FAILED" };
      }
      const matchedWo = woMap.get(wr.work_order_id);
      if (!matchedWo) {
        return { ok: false, error: `No matching WorkOrder for WorkResult ${wr.work_result_id}`, reason_code: "LINEAGE_VERIFICATION_FAILED" };
      }
      const wrBinding = validateWorkResultBinding(matchedWo, wr);
      if (!wrBinding.ok) {
        return { ok: false, error: `WorkResult binding invalid: ${wrBinding.error || wrBinding.reason_code}`, reason_code: "LINEAGE_VERIFICATION_FAILED" };
      }
    } catch (err) {
      return { ok: false, error: `WorkResult validation failed: ${err.message}`, reason_code: "LINEAGE_VERIFICATION_FAILED" };
    }
  }

  // Candidate base_tree check and CandidateId recompute
  try {
    if (candidate.base_tree !== sourceSnapshot.base_tree_digest) {
      return { ok: false, error: `Candidate base_tree (${candidate.base_tree}) does not match SourceSnapshot base_tree_digest (${sourceSnapshot.base_tree_digest})`, reason_code: "LINEAGE_VERIFICATION_FAILED" };
    }
    const computedCandidateId = computeCandidateId(candidate);
    if (computedCandidateId !== candidate.candidate_id) {
      return { ok: false, error: "CandidateId recompute mismatch", reason_code: "LINEAGE_VERIFICATION_FAILED" };
    }
  } catch (err) {
    return { ok: false, error: `Candidate verification failed: ${err.message}`, reason_code: "LINEAGE_VERIFICATION_FAILED" };
  }

  return { ok: true };
}

/**
 * Orchestrates the full shadow execution of a Repair ExecutionGraph.
 *
 * @param {Object} executionGraph
 * @param {Object} [options]
 * @returns {Promise<Object>}
 */
async function orchestrateRepairShadow(executionGraph, options = {}) {
  if (!executionGraph || typeof executionGraph !== "object" || !Array.isArray(executionGraph.nodes)) {
    return { ok: false, error: "executionGraph must be a valid object with nodes", reason_code: "INVALID_EXECUTION_GRAPH" };
  }

  const sourceSnapshot = options.sourceSnapshot;
  if (!sourceSnapshot || typeof sourceSnapshot !== "object") {
    return { ok: false, error: "sourceSnapshot option is required", reason_code: "MISSING_SOURCE_SNAPSHOT" };
  }

  // 1. Check for DAG cycles
  if (hasCycle(executionGraph.nodes)) {
    return {
      ok: false,
      error: "Dependency cycle detected in ExecutionGraph",
      reason_code: "CYCLIC_DEPENDENCY_DETECTED",
    };
  }

  // 2. Validate ExecutionGraph binding against SourceSnapshot
  const bindingRes = validateExecutionGraphBinding(executionGraph, { sourceSnapshot });
  if (!bindingRes.ok) {
    return {
      ok: false,
      error: `ExecutionGraph binding validation failed: ${bindingRes.error || bindingRes.reason_code}`,
      reason_code: bindingRes.reason_code || "GRAPH_BINDING_MISMATCH",
    };
  }

  // 3. Check isolation gate
  const declaredIsolation = options.isolationCapability || "enforced";
  if (declaredIsolation !== "enforced") {
    return {
      ok: false,
      error: `Enforced worker isolation is required for shadow repair execution (received "${declaredIsolation}")`,
      reason_code: "ISOLATION_NOT_ENFORCED",
    };
  }

  // 4. Compile WorkOrders v2
  let workOrders;
  try {
    workOrders = compileWorkOrdersV2(executionGraph, {
      sourceSnapshot,
      sourceSnapshotId: options.sourceSnapshotId || sourceSnapshot.source_snapshot_id,
    });
  } catch (err) {
    return {
      ok: false,
      error: `WorkOrder compilation failed: ${err.message}`,
      reason_code: err.code || "WORK_ORDER_COMPILATION_FAILED",
    };
  }

  const workOrderMap = new Map(workOrders.map((wo) => [wo.node_id, wo]));

  if (
    options.executorOptionsByNode !== undefined &&
    options.executorOptionsByNode !== null &&
    !isPlainObject(options.executorOptionsByNode)
  ) {
    return {
      ok: false,
      error: "executorOptionsByNode must be a plain object keyed by node id",
      reason_code: "UNSAFE_EXECUTOR_OPTION",
    };
  }
  const executorOptionsByNode = options.executorOptionsByNode || {};
  try {
    for (const nodeId of Object.keys(executorOptionsByNode)) {
      pickAllowedNodeExecutionInputs(executorOptionsByNode[nodeId]);
    }
  } catch (err) {
    if (err.code === "UNSAFE_EXECUTOR_OPTION") {
      return {
        ok: false,
        error: err.message,
        reason_code: "UNSAFE_EXECUTOR_OPTION",
      };
    }
    throw err;
  }

  // 5. Sequence DAG in topological order and initialize telemetry
  const sortedNodes = topologicalSort(executionGraph.nodes);
  const nodeStates = new Map();
  const graphTelemetry = {};

  for (const node of executionGraph.nodes) {
    nodeStates.set(node.node_id, "pending");
    graphTelemetry[node.node_id] = {
      node_id: node.node_id,
      status: "pending",
      commands: [],
      logs: [],
      work_order_id: workOrderMap.get(node.node_id)?.work_order_id,
      work_result_id: null,
    };
  }

  // 6. Execute nodes in topological order
  const capturedWorkResults = [];
  const nodeIntegrations = new Map();
  let executionFailed = false;
  let failedNodeId = null;
  let failedReasonCode = "NODE_EXECUTION_FAILED";
  let failedError = null;

  for (const node of sortedNodes) {
    const currentStatus = nodeStates.get(node.node_id);
    if (currentStatus === "blocked") {
      continue;
    }

    nodeStates.set(node.node_id, "in_flight");
    graphTelemetry[node.node_id].status = "in_flight";
    const startTime = Date.now();
    graphTelemetry[node.node_id].started_at = new Date(startTime).toISOString();

    const workOrder = workOrderMap.get(node.node_id);
    let workspaceDescriptor = null;
    let nodeSuccess = false;

    try {
      const predecessorIds = computePredecessorClosure(executionGraph.nodes, node.node_id);
      const predecessorNodes = sortedNodes.filter((n) => predecessorIds.has(n.node_id));
      let effectiveBase = null;

      if (predecessorNodes.length > 0) {
        const predResults = predecessorNodes
          .map((n) => nodeIntegrations.get(n.node_id)?.workResult)
          .filter(Boolean);
        const conflict = detectPredecessorContextConflicts(predResults);
        if (!conflict.ok) {
          const err = new Error(conflict.error);
          err.code = conflict.reason_code;
          throw err;
        }
        const derived = await integrateWorkResultPatches(sourceSnapshot, predResults, {
          files: options.files,
          file_modes: options.file_modes || options.fileModes,
          workOrders,
          freeze: false,
          predecessor_node_ids: predecessorNodes.map((n) => n.node_id),
        });
        if (!derived.ok) {
          const err = new Error(derived.error);
          err.code = derived.reason_code;
          throw err;
        }
        effectiveBase = derived.effectiveBase;
      }

      workspaceDescriptor = await workerWorkspace.createWorkspace({
        source_snapshot_id: workOrder.source_snapshot_id,
        baseDir: options.baseDir,
      });

      const materializeOptions = {
        files: options.files,
        repositoryDir: options.repositoryDir,
      };
      if (effectiveBase) {
        materializeOptions.effectiveBase = effectiveBase;
      }
      await workerWorkspace.materializeSourceSnapshot(
        workspaceDescriptor,
        workOrder,
        sourceSnapshot,
        materializeOptions
      );

      const invocation = buildExecuteWorkOrderInvocation({
        workOrder,
        workspace: workspaceDescriptor,
        nodeOptions: executorOptionsByNode[node.node_id],
        authorizedWorkerTransport: options.workerTransport,
        capabilityProof: options.capabilityProof,
        semantic_evidence: options.semantic_evidence,
        expectedAdapterId: options.expectedAdapterId,
        expectedAdapterVersion: options.expectedAdapterVersion,
        expectedHostRuntimeVersion: options.expectedHostRuntimeVersion,
        expectedProbeDigest: options.expectedProbeDigest,
        workerIsolation: options.workerIsolation,
      });
      const execResult = await workerExecutor.executeWorkOrder(invocation);

      if (!execResult || execResult.isolationReported !== "enforced") {
        throw new Error(`Isolation violation: reported "${execResult?.isolationReported}", expected "enforced"`);
      }

      if (!execResult.ok) {
        const detail = execResult.error
          || execResult.reason
          || (execResult.violation && (execResult.violation.error || execResult.violation.reason_code || JSON.stringify(execResult.violation)))
          || `exit code ${execResult.workResult?.exit_code}`;
        const err = new Error(`WorkOrder execution failed: ${detail}`);
        throw err;
      }

      const workResult = execResult.workResult;
      capturedWorkResults.push(workResult);

      const nodeIntegrate = await integrateWorkResultPatches(sourceSnapshot, [workResult], {
        files: effectiveBase ? effectiveBase.files : options.files,
        file_modes: effectiveBase ? effectiveBase.file_modes : (options.file_modes || options.fileModes),
        workOrders,
        freeze: false,
        predecessor_node_ids: predecessorNodes.map((n) => n.node_id),
      });
      if (!nodeIntegrate.ok) {
        const err = new Error(nodeIntegrate.error);
        err.code = nodeIntegrate.reason_code;
        throw err;
      }
      nodeIntegrations.set(node.node_id, {
        workResult,
        effectiveBase: nodeIntegrate.effectiveBase,
        candidateFiles: nodeIntegrate.candidateFiles,
        fileModes: nodeIntegrate.fileModes,
      });

      nodeStates.set(node.node_id, "completed");
      graphTelemetry[node.node_id].status = "completed";
      graphTelemetry[node.node_id].work_result_id = workResult.work_result_id;
      graphTelemetry[node.node_id].commands = workResult.commands || [];
      graphTelemetry[node.node_id].logs = workResult.logs || [];
      nodeSuccess = true;
    } catch (err) {
      nodeStates.set(node.node_id, "failed");
      graphTelemetry[node.node_id].status = "failed";
      graphTelemetry[node.node_id].error = err.message;
      executionFailed = true;
      failedNodeId = node.node_id;
      if (err.code && err.code !== "UNSAFE_EXECUTOR_OPTION") {
        failedReasonCode = err.code;
        failedError = err.message;
      }

      const descendants = computeDescendantClosure(executionGraph.nodes, [node.node_id]);
      for (const descId of descendants) {
        if (descId !== node.node_id && nodeStates.get(descId) === "pending") {
          nodeStates.set(descId, "blocked");
          graphTelemetry[descId].status = "blocked";
          graphTelemetry[descId].blocked_by = node.node_id;
        }
      }
    } finally {
      const finishTime = Date.now();
      graphTelemetry[node.node_id].finished_at = new Date(finishTime).toISOString();
      graphTelemetry[node.node_id].duration_ms = finishTime - startTime;

      if (workspaceDescriptor) {
        await workerWorkspace.disposeWorkspace(workspaceDescriptor);
      }
    }

    if (!nodeSuccess) {
      break;
    }
  }

  if (executionFailed) {
    return {
      ok: false,
      error: failedError || `Node ${failedNodeId} execution failed`,
      reason_code: failedReasonCode,
      failed_node_id: failedNodeId,
      graph_telemetry: graphTelemetry,
      workResults: capturedWorkResults,
    };
  }

  // 7. Integrate WorkResult patches & freeze Candidate via K3 (anchored to original S0)
  const initialBase = buildEffectiveShadowBase({
    sourceSnapshot,
    files: options.files,
    file_modes: options.file_modes || options.fileModes,
  });
  const patchResult = await integrateWorkResultPatches(sourceSnapshot, capturedWorkResults, {
    files: initialBase.files,
    file_modes: initialBase.file_modes,
    workOrders,
    repository_id: sourceSnapshot.repository_id,
    predecessorCandidate: options.predecessorCandidate,
  });

  if (!patchResult.ok) {
    return {
      ok: false,
      error: patchResult.error,
      reason_code: patchResult.reason_code || "PATCH_INTEGRATION_FAILED",
      graph_telemetry: graphTelemetry,
      workResults: capturedWorkResults,
    };
  }

  const candidate = patchResult.candidate;

  // 8. 4-Identity Cryptographic Lineage Check
  const lineageRes = validate4IdentityLineage(sourceSnapshot, workOrders, capturedWorkResults, candidate);
  if (!lineageRes.ok) {
    return {
      ok: false,
      error: lineageRes.error,
      reason_code: lineageRes.reason_code || "LINEAGE_VERIFICATION_FAILED",
      graph_telemetry: graphTelemetry,
      workResults: capturedWorkResults,
    };
  }

  // 9. Shadow Comparison if baseline provided
  let shadow_comparison;
  if (options.baselineResult || typeof options.fixedBaselineFn === "function") {
    const baseline = options.baselineResult || options.fixedBaselineFn();
    shadow_comparison = compareShadowExecution(
      { candidate, workResults: capturedWorkResults, graph_telemetry: graphTelemetry },
      baseline
    );
  }

  const successPayload = {
    ok: true,
    promoted: false,
    candidate,
    candidateFiles: patchResult.candidateFiles,
    workResults: capturedWorkResults,
    graph_telemetry: graphTelemetry,
    lineage_verification: {
      ok: true,
      lineage: [
        sourceSnapshot.source_snapshot_id,
        ...capturedWorkResults.map((w) => w.work_order_id),
        ...capturedWorkResults.map((w) => w.work_result_id),
        candidate.candidate_id,
      ],
    },
    ...(shadow_comparison ? { shadow_comparison } : {}),
  };

  // 10. Persist auditable repair-shadow-execution/v1 — mandatory after freeze+lineage.
  if (!options.store) {
    return {
      ok: false,
      promoted: false,
      error: "execution store is required to persist repair-shadow-execution/v1",
      reason_code: "MISSING_EXECUTION_STORE",
      candidate,
      workResults: capturedWorkResults,
      graph_telemetry: graphTelemetry,
    };
  }

  const persistRes = await persistRepairShadowExecution(options.store, {
    kind: "repair-shadow-execution/v1",
    schema_version: 1,
    candidate_id: candidate.candidate_id,
    candidate,
    source_snapshot_id: sourceSnapshot.source_snapshot_id,
    execution_graph: executionGraph,
    policy_snapshot: options.policySnapshot,
    work_order_ids: workOrders.map((wo) => wo.work_order_id),
    work_result_ids: capturedWorkResults.map((wr) => wr.work_result_id),
    graph_telemetry: graphTelemetry,
    shadow_comparison,
    created_at: options.createdAt || new Date().toISOString(),
  });
  if (!persistRes.ok) {
    return {
      ok: false,
      promoted: false,
      error: persistRes.error,
      reason_code: persistRes.reason_code || "EXECUTION_RECORD_PERSIST_FAILED",
      candidate,
      workResults: capturedWorkResults,
      graph_telemetry: graphTelemetry,
    };
  }
  successPayload.execution_record_id = persistRes.candidate_id;

  return successPayload;
}

module.exports = {
  orchestrateRepairShadow,
  validate4IdentityLineage,
  pickAllowedNodeExecutionInputs,
  buildExecuteWorkOrderInvocation,
  EXECUTE_WORK_ORDER_OPTION_ALLOWLIST,
};
