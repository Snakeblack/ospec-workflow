"use strict";

const path = require("node:path");
const { sha256Fingerprint } = require("../canonical-json.js");
const { validateInstance, loadSchemaById } = require("../kernel-schema-validator.js");
const {
  computeSourceSnapshotId,
  computeWorkOrderId,
  validateIdentityKind,
} = require("../execution-identities/index.js");
const { FORBIDDEN_OPERATIONS } = require("./compiler.js");
const { hasCycle } = require("./clarify.js");
const { validateObligationManifest } = require("./obligation-manifest.js");
const { topologicalSort } = require("./replay-engine.js");

const DEFAULT_WORK_ORDER_BUDGET = Object.freeze({
  model_turns: 5,
  patches: 3,
  commands: 5,
  wall_time_minutes: 10,
  changed_lines: 100,
});

const SHA256_DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/;
const DEFAULT_SCHEMA_ROOT = path.resolve(__dirname, "../../..");
const EXECUTION_GRAPH_V1_SCHEMA_ID = "ospec://schemas/kernel/execution-graph/v1";
const WORK_ORDER_V2_SCHEMA_ID = "ospec://schemas/kernel/work-order/v2";

let cachedExecutionGraphV1Schema = null;
let cachedWorkOrderV2Schema = null;

function getExecutionGraphV1Schema() {
  if (!cachedExecutionGraphV1Schema) {
    cachedExecutionGraphV1Schema = loadSchemaById(EXECUTION_GRAPH_V1_SCHEMA_ID, {
      rootDir: DEFAULT_SCHEMA_ROOT,
    });
  }
  return cachedExecutionGraphV1Schema;
}

function getWorkOrderV2Schema() {
  if (!cachedWorkOrderV2Schema) {
    cachedWorkOrderV2Schema = loadSchemaById(WORK_ORDER_V2_SCHEMA_ID, {
      rootDir: DEFAULT_SCHEMA_ROOT,
    });
  }
  return cachedWorkOrderV2Schema;
}

function resolveVerifiedSourceSnapshotId(graph, context = {}) {
  const graphSnapshotId = graph.source_snapshot_id;
  if (typeof graphSnapshotId !== "string" || !SHA256_DIGEST_PATTERN.test(graphSnapshotId)) {
    const err = new Error("ExecutionGraph source_snapshot_id must be a valid SHA-256 digest");
    err.code = "invalid-source-snapshot-id";
    throw err;
  }

  if (context.sourceSnapshot !== undefined || context.sourceSnapshotId !== undefined) {
    const contextSnapshotId = context.sourceSnapshotId;
    if (typeof contextSnapshotId !== "string" || !SHA256_DIGEST_PATTERN.test(contextSnapshotId)) {
      throw new TypeError("sourceSnapshotId must be a valid SHA-256 digest");
    }

    const contextSnapshot = context.sourceSnapshot;
    if (!validateIdentityKind(contextSnapshot, "SourceSnapshot").ok) {
      throw new TypeError("sourceSnapshot must be a valid source-snapshot/v1");
    }

    const computed = computeSourceSnapshotId(contextSnapshot);
    if (contextSnapshot.source_snapshot_id !== computed) {
      throw new TypeError("sourceSnapshot must declare its canonical SourceSnapshot identity");
    }
    if (contextSnapshotId !== computed) {
      throw new TypeError("sourceSnapshotId must match the validated SourceSnapshot identity");
    }
    if (contextSnapshotId !== graphSnapshotId) {
      const err = new Error(
        `Provenance mismatch: context sourceSnapshotId "${contextSnapshotId}" does not match graph source_snapshot_id "${graphSnapshotId}"`
      );
      err.code = "provenance-mismatch";
      throw err;
    }
  }

  return graphSnapshotId;
}

/**
 * Compiles coarse semantic graph nodes into declarative WorkOrder v1 shapes.
 * Operates purely on declarative structure with ZERO execution authority tokens.
 *
 * @param {Object} graph - ExecutionGraph instance
 * @param {Object} [context] - Execution context
 * @param {string} [context.role] - Worker role (defaults to "repair-worker")
 * @param {Object} [context.budgets] - Map of nodeId -> budget object
 * @param {Object} [context.defaultBudget] - Fallback budget object
 * @returns {Array<Object>} Array of WorkOrder v1 objects (zero execution permits)
 */
function compileWorkOrdersV1(graph, context = {}) {
  if (!graph || typeof graph !== "object" || !Array.isArray(graph.nodes)) {
    throw new TypeError("graph must be an ExecutionGraph object with a nodes array");
  }

  const role = context.role || "repair-worker";
  const defaultBudget = context.defaultBudget || DEFAULT_WORK_ORDER_BUDGET;
  const budgets = context.budgets || {};

  const workOrders = [];

  for (const node of graph.nodes) {
    if (!node || typeof node !== "object") continue;

    const workOrderId = sha256Fingerprint("work-order/v1", {
      graph_id: graph.graph_id,
      node_id: node.node_id,
    });

    const budget = budgets[node.node_id] || defaultBudget;

    const workOrder = {
      schema_version: 1,
      work_order_id: workOrderId,
      node_id: String(node.node_id),
      role: String(role),
      status: "pending",
      operation: String(node.operation),
      objective: String(node.objective),
      dependencies: Array.isArray(node.dependencies) ? [...node.dependencies] : [],
      ownership: node.ownership && typeof node.ownership === "object"
        ? { owner: String(node.ownership.owner), mode: String(node.ownership.mode) }
        : { owner: "agent:repair", mode: "exclusive" },
      allowed_paths: Array.isArray(node.allowed_paths) ? [...node.allowed_paths] : [],
      invariants: Array.isArray(node.invariants) ? [...node.invariants] : [],
      required_evidence: Array.isArray(node.required_evidence) ? [...node.required_evidence] : [],
      budget: {
        model_turns: Number(budget.model_turns ?? DEFAULT_WORK_ORDER_BUDGET.model_turns),
        patches: Number(budget.patches ?? DEFAULT_WORK_ORDER_BUDGET.patches),
        commands: Number(budget.commands ?? DEFAULT_WORK_ORDER_BUDGET.commands),
        wall_time_minutes: Number(budget.wall_time_minutes ?? DEFAULT_WORK_ORDER_BUDGET.wall_time_minutes),
        changed_lines: Number(budget.changed_lines ?? DEFAULT_WORK_ORDER_BUDGET.changed_lines),
      },
    };

    workOrders.push(workOrder);
  }

  return workOrders;
}

/**
 * Compiles coarse semantic graph nodes into declarative WorkOrder v2 shapes.
 * Performs fail-closed atomic validation of graph and provenance before emission,
 * resolves topological dependencies to canonical WorkOrderId sha256 digests,
 * and validates each emitted WorkOrder against work-order/v2 schema.
 *
 * @param {Object} graph - ExecutionGraph instance
 * @param {Object} [context] - Declarative compilation context
 * @returns {Array<Object>} Array of WorkOrder v2 objects
 */
function compileWorkOrdersV2(graph, context = {}) {
  if (!graph || typeof graph !== "object") {
    throw new TypeError("graph must be an ExecutionGraph object");
  }

  // 1. Schema Pre-validation
  const graphValidation = validateInstance(getExecutionGraphV1Schema(), graph);
  if (!graphValidation.valid) {
    const err = new Error(
      `ExecutionGraph failed schema validation: ${graphValidation.errors.map((e) => e.message).join("; ")}`
    );
    err.code = "invalid-graph-schema";
    throw err;
  }

  // 2. Provenance verification
  const sourceSnapshotId = resolveVerifiedSourceSnapshotId(graph, context);

  // 3. Validate coarse semantic nodes
  for (const node of graph.nodes) {
    if (!node || typeof node !== "object") {
      const err = new Error("Graph node must be an object");
      err.code = "invalid-node";
      throw err;
    }
    if (!node.node_id || typeof node.node_id !== "string") {
      const err = new Error("Graph node node_id is required");
      err.code = "missing-required-node-field";
      throw err;
    }
    const op = String(node.operation || "");
    if (FORBIDDEN_OPERATIONS.includes(op)) {
      const err = new Error(
        `Microscopic worker action nodes are forbidden in Execution Graph: ${op} (node_id: ${node.node_id})`
      );
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

  // 4. Validate dependencies exist
  const nodeIds = new Set(graph.nodes.map((n) => n.node_id));
  for (const node of graph.nodes) {
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

  // 5. Validate acyclic
  if (hasCycle(graph.nodes)) {
    const err = new Error("Dependency cycle detected in Execution Graph");
    err.code = "cyclic-dependency-detected";
    throw err;
  }

  // 6. Validate Obligation Manifest
  const obligationValidation = validateObligationManifest(graph.obligations, graph.nodes);
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

  // 7. Topological Sort and Canonical WorkOrderId Resolution
  const sortedNodes = topologicalSort(graph.nodes);
  const nodeIdToWorkOrderId = new Map();
  const workOrders = [];
  const woSchema = getWorkOrderV2Schema();

  const role = context.role || "repair-worker";
  const defaultBudget = context.defaultBudget || DEFAULT_WORK_ORDER_BUDGET;
  const budgets = context.budgets || {};

  for (const node of sortedNodes) {
    const rawDeps = Array.isArray(node.dependencies) ? node.dependencies : [];
    const resolvedDeps = rawDeps.map((depNodeId) => {
      const parentWorkOrderId = nodeIdToWorkOrderId.get(depNodeId);
      if (!parentWorkOrderId) {
        const err = new Error(
          `Unresolved dependency WorkOrderId for node "${depNodeId}" (dependent: "${node.node_id}")`
        );
        err.code = "unresolved-dependency-digest";
        throw err;
      }
      return parentWorkOrderId;
    });

    const budget = budgets[node.node_id] || defaultBudget;
    const normalizedBudget = {
      model_turns: Number(budget.model_turns ?? DEFAULT_WORK_ORDER_BUDGET.model_turns),
      patches: Number(budget.patches ?? DEFAULT_WORK_ORDER_BUDGET.patches),
      commands: Number(budget.commands ?? DEFAULT_WORK_ORDER_BUDGET.commands),
      wall_time_minutes: Number(budget.wall_time_minutes ?? DEFAULT_WORK_ORDER_BUDGET.wall_time_minutes),
      changed_lines: Number(budget.changed_lines ?? DEFAULT_WORK_ORDER_BUDGET.changed_lines),
    };

    const workOrderPayload = {
      schema_version: 2,
      kind: "work-order/v2",
      source_snapshot_id: sourceSnapshotId,
      node_id: String(node.node_id),
      role: String(role),
      operation: String(node.operation),
      objective: String(node.objective),
      dependencies: resolvedDeps,
      ownership: node.ownership && typeof node.ownership === "object"
        ? { owner: String(node.ownership.owner), mode: String(node.ownership.mode) }
        : { owner: "agent:repair", mode: "exclusive" },
      allowed_paths: Array.isArray(node.allowed_paths) ? [...node.allowed_paths] : [],
      invariants: Array.isArray(node.invariants) ? [...node.invariants] : [],
      required_evidence: Array.isArray(node.required_evidence) ? [...node.required_evidence] : [],
      budget: normalizedBudget,
    };

    const workOrderId = computeWorkOrderId(workOrderPayload);
    const workOrder = {
      ...workOrderPayload,
      work_order_id: workOrderId,
      status: "pending",
    };

    // 8. WorkOrder v2 Schema Post-validation
    const woValidation = validateInstance(woSchema, workOrder);
    if (!woValidation.valid) {
      const err = new Error(
        `Emitted WorkOrder failed schema validation: ${woValidation.errors.map((e) => e.message).join("; ")}`
      );
      err.code = "invalid-work-order-schema";
      throw err;
    }

    nodeIdToWorkOrderId.set(node.node_id, workOrderId);
    workOrders.push(workOrder);
  }

  return workOrders;
}

const compileWorkOrders = compileWorkOrdersV2;

module.exports = {
  DEFAULT_WORK_ORDER_BUDGET,
  compileWorkOrders,
  compileWorkOrdersV1,
  compileWorkOrdersV2,
};


