"use strict";

const { validateExecutionGraphBinding } = require("../execution-graph/binding.js");
const { hasCycle, topologicalSort, computeDescendantClosure } = require("../execution-graph/dag.js");
const { compileWorkOrdersV2 } = require("../execution-graph/work-order-compiler.js");
const {
  createWorkspace,
  disposeWorkspace,
  materializeSourceSnapshot,
} = require("../worker-workspace.js");
const {
  executeWorkOrder,
} = require("../worker-executor.js");
const {
  validateWorkOrderBinding,
  validateWorkResultBinding,
  computeSourceSnapshotId,
  computeWorkOrderId,
  computeWorkResultId,
  computeCandidateId,
} = require("../execution-identities/index.js");
const { integrateWorkResultPatches } = require("./patch-integrator.js");
const { compareShadowExecution } = require("./shadow-comparator.js");

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
  let executionFailed = false;
  let failedNodeId = null;

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
      workspaceDescriptor = await createWorkspace({
        source_snapshot_id: workOrder.source_snapshot_id,
        baseDir: options.baseDir,
      });

      await materializeSourceSnapshot(workspaceDescriptor, workOrder, sourceSnapshot, {
        files: options.files,
        repositoryDir: options.repositoryDir,
      });

      let execResult;
      if (typeof options.executorFn === "function") {
        execResult = await options.executorFn(workOrder, workspaceDescriptor);
      } else {
        execResult = await executeWorkOrder(workOrder, workspaceDescriptor, {
          workerTransport: options.workerTransport,
          isolationCapability: declaredIsolation,
          workerIsolation: options.workerIsolation,
          capabilityProof: options.capabilityProof,
          ...(options.executorOptions || {}),
        });
      }

      if (!execResult || execResult.isolationReported !== "enforced") {
        throw new Error(`Isolation violation: reported "${execResult?.isolationReported}", expected "enforced"`);
      }

      if (!execResult.ok) {
        throw new Error(`WorkOrder execution failed with exit code ${execResult.workResult?.exit_code}`);
      }

      const workResult = execResult.workResult;
      capturedWorkResults.push(workResult);

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
        await disposeWorkspace(workspaceDescriptor);
      }
    }

    if (!nodeSuccess) {
      break;
    }
  }

  if (executionFailed) {
    return {
      ok: false,
      error: `Node ${failedNodeId} execution failed`,
      reason_code: "NODE_EXECUTION_FAILED",
      failed_node_id: failedNodeId,
      graph_telemetry: graphTelemetry,
      workResults: capturedWorkResults,
    };
  }

  // 7. Integrate WorkResult patches & freeze Candidate via K3
  const patchResult = await integrateWorkResultPatches(sourceSnapshot, capturedWorkResults, {
    files: options.files,
    allowed_paths: options.allowed_paths,
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

  return {
    ok: true,
    candidate,
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
}

module.exports = {
  orchestrateRepairShadow,
  validate4IdentityLineage,
};
