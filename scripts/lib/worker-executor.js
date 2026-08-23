"use strict";

const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { validateAllowedPaths } = require("./allowed-paths-validator.js");
const { inspectWorkspace, sha256 } = require("./worker-workspace.js");

/**
 * Computes cryptographic hash for WorkResult binding.
 *
 * @param {Object} payload
 * @returns {string}
 */
function computeWorkResultId(payload) {
  const boundPayload = {
    schema_version: 1,
    work_order_id: String(payload.work_order_id || ""),
    source_snapshot_id: String(payload.source_snapshot_id || ""),
    patch: String(payload.patch || ""),
    commands: Array.isArray(payload.commands) ? payload.commands : [],
    logs: Array.isArray(payload.logs) ? payload.logs : [],
    exit_code: typeof payload.exit_code === "number" ? payload.exit_code : 0,
    filesystem_inventory: Array.isArray(payload.filesystem_inventory) ? payload.filesystem_inventory : [],
    execution_usage: payload.execution_usage || {},
  };
  return sha256(JSON.stringify(boundPayload));
}

/**
 * Validates cryptographic binding between WorkOrder and WorkResult.
 *
 * @param {Object} workOrder
 * @param {Object} workResult
 * @returns {{ ok: boolean, reason?: string }}
 */
function validateWorkResultBinding(workOrder, workResult) {
  if (!workOrder || !workResult) {
    return { ok: false, reason: "missing-inputs" };
  }
  if (workResult.work_order_id !== workOrder.work_order_id) {
    return { ok: false, reason: "work-order-id-mismatch" };
  }
  if (workResult.source_snapshot_id !== workOrder.source_snapshot_id) {
    return { ok: false, reason: "source-snapshot-id-mismatch" };
  }
  const expectedId = computeWorkResultId(workResult);
  if (workResult.work_result_id !== expectedId) {
    return { ok: false, reason: "work-result-id-digest-mismatch" };
  }
  return { ok: true };
}

/**
 * Assembles and returns a validated WorkResult payload with zero CandidateId properties.
 *
 * @param {Object} options
 * @returns {Promise<Object>}
 */
async function captureWorkResult(options = {}) {
  const payload = {
    schema_version: 1,
    work_result_id: "",
    work_order_id: String(options.work_order_id || ""),
    source_snapshot_id: String(options.source_snapshot_id || ""),
    patch: typeof options.patch === "string" ? options.patch : "",
    commands: Array.isArray(options.commands) ? options.commands : [],
    logs: Array.isArray(options.logs) ? options.logs : [],
    exit_code: typeof options.exit_code === "number" ? options.exit_code : 0,
    filesystem_inventory: Array.isArray(options.filesystem_inventory) ? options.filesystem_inventory : [],
    execution_usage: options.execution_usage || {},
  };

  payload.work_result_id = computeWorkResultId(payload);
  return payload;
}

/**
 * Handles interrupted execution on timeouts or abort signals, preserving partial state.
 *
 * @param {Object} options
 * @returns {Promise<Object>}
 */
async function recoverInterruptedExecution(options = {}) {
  const workspace = options.workspace;
  const workOrder = options.workOrder || {};
  const partialLogs = Array.isArray(options.partialLogs)
    ? options.partialLogs
    : Array.isArray(options.logs)
    ? options.logs
    : [];
  const reason = options.reason || "timeout";

  if (workspace) {
    workspace.status = "interrupted";
  }

  const inventory = workspace ? await inspectWorkspace(workspace) : [];

  return {
    status: "interrupted",
    reason,
    workspace_id: workspace ? workspace.workspace_id : "",
    work_order_id: workOrder.work_order_id || "",
    source_snapshot_id: workOrder.source_snapshot_id || "",
    partial_logs: partialLogs,
    modified_inventory: inventory,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Executes work order commands in isolated workspace, capturing telemetry and enforcing containment.
 *
 * @param {Object} options
 * @returns {Promise<Object>}
 */
async function executeWorkOrder(options = {}) {
  const workOrder = options.workOrder || {};
  const workspace = options.workspace;
  if (!workspace || !workspace.root_path) {
    throw new Error("executeWorkOrder requires a valid workspace descriptor");
  }

  const isolationReported = options.isolationCapability || "unavailable";
  const allowedPaths = Array.isArray(workOrder.allowed_paths) ? workOrder.allowed_paths : ["**"];

  // Pre-flight containment check on declared write targets (if supplied)
  if (Array.isArray(options.declaredTargets)) {
    const preFlight = validateAllowedPaths(options.declaredTargets, allowedPaths, {
      workspaceRoot: workspace.root_path,
      workspace_id: workspace.workspace_id,
      work_order_id: workOrder.work_order_id,
    });
    if (!preFlight.ok) {
      return { ok: false, violation: preFlight.violation, isolationReported };
    }
  }

  const commandList = [];
  if (Array.isArray(options.commands)) {
    commandList.push(...options.commands);
  } else if (options.command) {
    commandList.push({ command: options.command, args: options.args || [] });
  } else {
    commandList.push({ command: process.execPath, args: ["-v"] });
  }

  const logs = [];
  const commandOutcomes = [];
  let overallExitCode = 0;
  const startTime = Date.now();

  const budget = options.budget || (options.options && options.options.budget) || workOrder.budget || {};

  for (const cmdItem of commandList) {
    const cmdStr = typeof cmdItem === "string" ? cmdItem : `${cmdItem.command} ${(cmdItem.args || []).join(" ")}`.trim();
    const cmdBinary = typeof cmdItem === "string" ? cmdItem : cmdItem.command;
    const cmdArgs = typeof cmdItem === "string" ? [] : (cmdItem.args || []);

    const cmdStart = Date.now();
    let procResult;
    try {
      procResult = spawnSync(cmdBinary, cmdArgs, {
        cwd: workspace.root_path,
        encoding: "utf8",
        timeout: budget && budget.wall_time_ms ? budget.wall_time_ms : undefined,
      });
    } catch (err) {
      procResult = {
        status: 1,
        stdout: "",
        stderr: err.message,
        error: err,
      };
    }

    const cmdDuration = Date.now() - cmdStart;

    if (procResult.stdout) {
      logs.push(`stdout: ${procResult.stdout.trim()}`);
    }
    if (procResult.stderr) {
      logs.push(`stderr: ${procResult.stderr.trim()}`);
    }
    if (procResult.error && (!procResult.stderr || !procResult.stderr.includes(procResult.error.message))) {
      logs.push(`error: ${procResult.error.message}`);
    }

    const exitCode = typeof procResult.status === "number" ? procResult.status : 1;
    if (exitCode !== 0 && overallExitCode === 0) {
      overallExitCode = exitCode;
    }

    commandOutcomes.push({
      command: cmdStr,
      exit_code: exitCode,
      duration_ms: cmdDuration,
    });

    if (options.signal && options.signal.aborted) {
      const recovery = await recoverInterruptedExecution({
        workspace,
        workOrder,
        partialLogs: logs,
        reason: "abort",
      });
      return { ok: false, interrupted: true, recovery, isolationReported };
    }

    if (procResult.error && procResult.error.code === "ETIMEDOUT") {
      const recovery = await recoverInterruptedExecution({
        workspace,
        workOrder,
        partialLogs: logs,
        reason: "timeout",
      });
      return { ok: false, interrupted: true, recovery, isolationReported };
    }
  }

  // Post-flight containment validation
  const postInventory = await inspectWorkspace(workspace);
  const modifiedPaths = postInventory.map((f) => f.path);
  const containment = validateAllowedPaths(modifiedPaths, allowedPaths, {
    workspaceRoot: workspace.root_path,
    workspace_id: workspace.workspace_id,
    work_order_id: workOrder.work_order_id,
  });

  if (!containment.ok) {
    return { ok: false, violation: containment.violation, isolationReported };
  }

  const duration = Date.now() - startTime;

  // Build patch summary
  const patch = modifiedPaths.map((p) => `--- a/${p}\n+++ b/${p}\n`).join("\n");

  const workResult = await captureWorkResult({
    work_order_id: workOrder.work_order_id,
    source_snapshot_id: workOrder.source_snapshot_id || workspace.source_snapshot_id,
    patch,
    commands: commandOutcomes,
    logs,
    exit_code: overallExitCode,
    filesystem_inventory: postInventory,
    execution_usage: {
      wall_time_ms: duration,
      memory_peak_bytes: 0,
    },
  });

  return {
    ok: overallExitCode === 0,
    workResult,
    isolationReported,
  };
}

module.exports = {
  executeWorkOrder,
  captureWorkResult,
  recoverInterruptedExecution,
  validateWorkResultBinding,
  computeWorkResultId,
};
