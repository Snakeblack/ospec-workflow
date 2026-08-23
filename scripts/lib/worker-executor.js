"use strict";

const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { validateAllowedPaths } = require("./allowed-paths-validator.js");
const { inspectWorkspace, getWorkspaceRecord } = require("./worker-workspace.js");
const { computeWorkResultId, validateWorkResultBinding } = require("./execution-identities/index.js");
const { invokeTransportAsync, resolveCapabilityState } = require("./host-contract/index.js");

/**
 * Computes mutation delta (created, modified, deleted) against baselineInventory.
 *
 * @param {Array} baselineInventory
 * @param {Array} postInventory
 * @returns {{ created: string[], modified: string[], deleted: string[], allMutations: string[] }}
 */
function computeMutationDelta(baselineInventory = [], postInventory = []) {
  const baselineMap = new Map((baselineInventory || []).map((f) => [f.path, f]));
  const postMap = new Map((postInventory || []).map((f) => [f.path, f]));

  const created = [];
  const modified = [];
  const deleted = [];

  for (const [p, postEntry] of postMap.entries()) {
    if (!baselineMap.has(p)) {
      created.push(p);
    } else if (baselineMap.get(p).sha256 !== postEntry.sha256) {
      modified.push(p);
    }
  }

  for (const [p] of baselineMap.entries()) {
    if (!postMap.has(p)) {
      deleted.push(p);
    }
  }

  return {
    created: created.sort(),
    modified: modified.sort(),
    deleted: deleted.sort(),
    allMutations: [...new Set([...created, ...modified, ...deleted])].sort(),
  };
}

/**
 * Splits text into an array of lines without carriage returns and removes trailing empty line.
 *
 * @param {string|Buffer} text
 * @returns {string[]}
 */
function splitLines(text) {
  if (text === null || text === undefined) return [];
  const normalized = String(text).replace(/\r\n/g, "\n");
  if (normalized === "") return [];
  const lines = normalized.split("\n");
  if (lines.length > 0 && lines[lines.length - 1] === "") {
    lines.pop();
  }
  return lines;
}

/**
 * Computes longest common subsequence line-by-line diff edits.
 *
 * @param {string[]} oldLines
 * @param {string[]} newLines
 * @returns {Array<{ type: "keep"|"delete"|"insert", line: string }>}
 */
function computeLineDiff(oldLines, newLines) {
  const m = oldLines.length;
  const n = newLines.length;

  const dp = Array.from({ length: m + 1 }, () => new Uint32Array(n + 1));
  for (let i = 0; i < m; i++) {
    for (let j = 0; j < n; j++) {
      if (oldLines[i] === newLines[j]) {
        dp[i + 1][j + 1] = dp[i][j] + 1;
      } else {
        dp[i + 1][j + 1] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  let i = m;
  let j = n;
  const edits = [];
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      edits.push({ type: "keep", line: oldLines[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      edits.push({ type: "insert", line: newLines[j - 1] });
      j--;
    } else if (i > 0 && (j === 0 || dp[i][j - 1] < dp[i - 1][j])) {
      edits.push({ type: "delete", line: oldLines[i - 1] });
      i--;
    }
  }
  edits.reverse();
  return edits;
}

/**
 * Generates an applicable standard unified diff patch representing exact modifications.
 *
 * @param {string} workspaceRoot
 * @param {Array} baselineInventory
 * @param {Array} postInventory
 * @param {Map<string, string>|Object} [baselineContents]
 * @returns {string}
 */
function generateUnifiedDiff(workspaceRoot, baselineInventory = [], postInventory = [], baselineContents = new Map()) {
  const baselineMap = new Map((baselineInventory || []).map((f) => [f.path, f]));
  const postMap = new Map((postInventory || []).map((f) => [f.path, f]));
  const contentsMap =
    baselineContents instanceof Map
      ? baselineContents
      : (baselineContents && typeof baselineContents === "object"
          ? new Map(Object.entries(baselineContents))
          : new Map());

  const chunks = [];

  // Created and Modified files
  for (const [p, postEntry] of postMap.entries()) {
    const absPath = path.resolve(workspaceRoot, p);
    let newContent = "";
    try {
      if (fs.existsSync(absPath)) {
        newContent = fs.readFileSync(absPath, "utf8");
      }
    } catch {
      newContent = "";
    }

    if (!baselineMap.has(p)) {
      // Created file
      const lines = splitLines(newContent);
      const header = `--- /dev/null\n+++ b/${p}\n@@ -0,0 +1,${lines.length} @@\n`;
      const body = lines.map((l) => `+${l}\n`).join("");
      chunks.push(header + body);
    } else {
      const baseEntry = baselineMap.get(p);
      if (baseEntry.sha256 !== postEntry.sha256) {
        // Modified file
        const oldContent = contentsMap.get(p) !== undefined ? contentsMap.get(p) : "";
        const oldLines = splitLines(oldContent);
        const newLines = splitLines(newContent);

        const header = `--- a/${p}\n+++ b/${p}\n@@ -1,${oldLines.length} +1,${newLines.length} @@\n`;
        const edits = computeLineDiff(oldLines, newLines);
        let body = "";
        for (const edit of edits) {
          if (edit.type === "keep") {
            body += ` ${edit.line}\n`;
          } else if (edit.type === "delete") {
            body += `-${edit.line}\n`;
          } else if (edit.type === "insert") {
            body += `+${edit.line}\n`;
          }
        }
        chunks.push(header + body);
      }
    }
  }

  // Deleted files
  for (const [p] of baselineMap.entries()) {
    if (!postMap.has(p)) {
      const oldContent = contentsMap.get(p) !== undefined ? contentsMap.get(p) : "";
      const oldLines = splitLines(oldContent);
      const header = `--- a/${p}\n+++ /dev/null\n@@ -1,${oldLines.length} +0,0 @@\n`;
      const body = oldLines.map((l) => `-${l}\n`).join("");
      chunks.push(header + body);
    }
  }

  return chunks.join("");
}

/**
 * Assembles and returns a validated canonical WorkResult payload with zero CandidateId properties.
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
  const record = workspace ? getWorkspaceRecord(workspace.workspace_id) : null;
  const baselineInventory = (record && record.baselineInventory) || options.baselineInventory || [];
  const delta = computeMutationDelta(baselineInventory, inventory);

  return {
    status: "interrupted",
    reason,
    workspace_id: workspace ? workspace.workspace_id : "",
    work_order_id: workOrder.work_order_id || "",
    source_snapshot_id: workOrder.source_snapshot_id || (workspace ? workspace.source_snapshot_id : ""),
    partial_logs: partialLogs,
    modified_inventory: inventory,
    mutation_delta: delta,
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

  const workerTransport = options.transports?.worker || options.workerTransport || options.transport;

  // Capability resolution via resolveCapabilityState
  let isolationReported = "unavailable";
  const declaredCap = options.isolationCapability || "unavailable";
  const capabilityId = options.capabilityId || "WorkerTransport";
  if (declaredCap === "enforced" || options.capabilityProof) {
    const capRes = resolveCapabilityState({
      capability_id: capabilityId,
      declared_state: declaredCap,
      proof: options.capabilityProof,
      semantic_evidence: options.semantic_evidence,
      expectedAdapterId: options.expectedAdapterId,
      expectedAdapterVersion: options.expectedAdapterVersion,
      expectedHostRuntimeVersion: options.expectedHostRuntimeVersion,
      expectedProbeDigest: options.expectedProbeDigest,
    });
    if (capRes.ok && capRes.effective_state === "enforced") {
      if (workerTransport) {
        isolationReported = "enforced";
      } else {
        return {
          ok: false,
          isolationReported: "unavailable",
          error: "Enforced isolation capability requires verified WorkerTransport port",
        };
      }
    } else {
      if (declaredCap === "enforced") {
        return {
          ok: false,
          isolationReported: capRes.effective_state || "unavailable",
          error: "Enforced isolation capability proof failed",
        };
      }
      isolationReported = capRes.effective_state || "unavailable";
    }
  } else if (declaredCap === "partial") {
    isolationReported = "partial";
  } else {
    isolationReported = "unavailable";
  }

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

  const record = getWorkspaceRecord(workspace.workspace_id);
  const baselineInventory = (record && record.baselineInventory) || options.baselineInventory || (await inspectWorkspace(workspace));

  const budget = options.budget || (options.options && options.options.budget) || workOrder.budget || {};
  const timeoutMs = budget.wall_time_ms !== undefined
    ? budget.wall_time_ms
    : (budget.wall_time_minutes !== undefined ? budget.wall_time_minutes * 60 * 1000 : undefined);

  const maxCommands = typeof budget.commands === "number" ? budget.commands : Infinity;

  const commandList = [];
  if (Array.isArray(options.commands)) {
    commandList.push(...options.commands);
  } else if (options.command) {
    commandList.push({ command: options.command, args: options.args || [] });
  } else {
    commandList.push({ command: process.execPath, args: ["-v"] });
  }

  if (commandList.length > maxCommands) {
    const recovery = await recoverInterruptedExecution({
      workspace,
      workOrder,
      partialLogs: [`error: budget.commands quota exceeded (${commandList.length} > ${maxCommands})`],
      reason: "budget_commands_exceeded",
      baselineInventory,
    });
    return { ok: false, interrupted: true, recovery, isolationReported };
  }

  const logs = [];
  const commandOutcomes = [];
  let overallExitCode = 0;
  const startTime = Date.now();

  const signal = options.signal;

  for (const cmdItem of commandList) {
    if (signal && signal.aborted) {
      const recovery = await recoverInterruptedExecution({
        workspace,
        workOrder,
        partialLogs: logs,
        reason: "abort",
        baselineInventory,
      });
      return { ok: false, interrupted: true, recovery, isolationReported };
    }

    const cmdStr = typeof cmdItem === "string" ? cmdItem : `${cmdItem.command} ${(cmdItem.args || []).join(" ")}`.trim();
    const cmdBinary = typeof cmdItem === "string" ? cmdItem : cmdItem.command;
    const cmdArgs = typeof cmdItem === "string" ? [] : (cmdItem.args || []);

    const cmdStart = Date.now();
    let exitCode = 0;
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let aborted = false;

    if (workerTransport) {
      const transportOutcome = await invokeTransportAsync(workerTransport, {
        signal,
        deadlineMs: timeoutMs,
        input: {
          command: cmdBinary,
          args: cmdArgs,
          cwd: workspace.root_path,
          env: workOrder.environment || options.environment || {},
        },
      });

      const cmdDuration = Date.now() - cmdStart;

      if (!transportOutcome.ok) {
        if (transportOutcome.failure_class === "timeout") {
          timedOut = true;
        } else if (transportOutcome.failure_class === "cancel") {
          aborted = true;
        } else {
          exitCode = typeof transportOutcome.exit_code === "number" ? transportOutcome.exit_code : 1;
        }
        stderr = transportOutcome.error || transportOutcome.reason || "";
      } else {
        exitCode = typeof transportOutcome.exit_code === "number"
          ? transportOutcome.exit_code
          : (transportOutcome.value && typeof transportOutcome.value.exit_code === "number" ? transportOutcome.value.exit_code : 0);
        stdout = transportOutcome.stdout || (transportOutcome.value && transportOutcome.value.stdout) || "";
        stderr = transportOutcome.stderr || (transportOutcome.value && transportOutcome.value.stderr) || "";
      }

      if (stdout) logs.push(`stdout: ${String(stdout).trim()}`);
      if (stderr) logs.push(`stderr: ${String(stderr).trim()}`);

      commandOutcomes.push({
        command: cmdStr,
        exit_code: exitCode,
        duration_ms: cmdDuration,
      });
    } else {
      const outcome = await new Promise((resolve) => {
        let timer = null;
        let killTimer = null;
        let child = null;
        let isDone = false;
        let wasAborted = false;
        let wasTimedOut = false;
        let outChunks = "";
        let errChunks = "";

        const cleanup = () => {
          if (timer) clearTimeout(timer);
          if (killTimer) clearTimeout(killTimer);
          if (signal && onAbort) signal.removeEventListener("abort", onAbort);
        };

        const finish = (res) => {
          if (isDone) return;
          isDone = true;
          cleanup();
          resolve(res);
        };

        const terminateChild = () => {
          if (!child || child.killed) return;
          try {
            child.kill("SIGTERM");
          } catch {}
          killTimer = setTimeout(() => {
            if (child && !isDone) {
              try { child.kill("SIGKILL"); } catch {}
            }
          }, 500);
        };

        const onAbort = () => {
          wasAborted = true;
          if (child) {
            terminateChild();
          } else {
            finish({ aborted: true, exitCode: 1, stdout: outChunks, stderr: errChunks });
          }
        };

        if (signal) {
          if (signal.aborted) {
            return finish({ aborted: true, exitCode: 1, stdout: "", stderr: "" });
          }
          signal.addEventListener("abort", onAbort, { once: true });
        }

        if (timeoutMs != null && timeoutMs > 0) {
          timer = setTimeout(() => {
            wasTimedOut = true;
            if (child) {
              terminateChild();
            } else {
              finish({ timedOut: true, exitCode: 1, stdout: outChunks, stderr: "ETIMEDOUT" });
            }
          }, timeoutMs);
        }

        try {
          child = spawn(cmdBinary, cmdArgs, {
            cwd: workspace.root_path,
            env: { ...process.env, ...(workOrder.environment || options.environment || {}) },
          });

          child.stdout?.on("data", (data) => { outChunks += data.toString("utf8"); });
          child.stderr?.on("data", (data) => { errChunks += data.toString("utf8"); });

          child.on("error", (err) => {
            finish({ error: err, exitCode: 1, stdout: outChunks, stderr: errChunks + (err.message || "") });
          });

          child.on("close", (code) => {
            finish({
              aborted: wasAborted,
              timedOut: wasTimedOut,
              exitCode: typeof code === "number" ? code : (wasAborted || wasTimedOut ? 1 : 0),
              stdout: outChunks,
              stderr: wasTimedOut && !errChunks.includes("ETIMEDOUT") ? (errChunks ? `${errChunks}\nETIMEDOUT` : "ETIMEDOUT") : errChunks,
            });
          });
        } catch (err) {
          finish({ error: err, exitCode: 1, stdout: "", stderr: err.message || "" });
        }
      });

      const cmdDuration = Date.now() - cmdStart;
      exitCode = outcome.exitCode;
      stdout = outcome.stdout;
      stderr = outcome.stderr;
      timedOut = outcome.timedOut;
      aborted = outcome.aborted;

      if (stdout) logs.push(`stdout: ${stdout.trim()}`);
      if (stderr) logs.push(`stderr: ${stderr.trim()}`);
      if (outcome.error) logs.push(`error: ${outcome.error.message}`);

      commandOutcomes.push({
        command: cmdStr,
        exit_code: exitCode,
        duration_ms: cmdDuration,
      });
    }

    if (exitCode !== 0 && overallExitCode === 0) {
      overallExitCode = exitCode;
    }

    if (aborted || (signal && signal.aborted)) {
      const recovery = await recoverInterruptedExecution({
        workspace,
        workOrder,
        partialLogs: logs,
        reason: "abort",
        baselineInventory,
      });
      return { ok: false, interrupted: true, recovery, isolationReported };
    }

    if (timedOut) {
      const recovery = await recoverInterruptedExecution({
        workspace,
        workOrder,
        partialLogs: logs,
        reason: "timeout",
        baselineInventory,
      });
      return { ok: false, interrupted: true, recovery, isolationReported };
    }
  }

  // Post-flight inventory & mutation delta calculation
  const postInventory = await inspectWorkspace(workspace);
  const mutationDelta = computeMutationDelta(baselineInventory, postInventory);

  // Validate containment strictly on the mutation delta
  const containment = validateAllowedPaths(mutationDelta, allowedPaths, {
    workspaceRoot: workspace.root_path,
    workspace_id: workspace.workspace_id,
    work_order_id: workOrder.work_order_id,
  });

  if (!containment.ok) {
    return { ok: false, violation: containment.violation, isolationReported };
  }

  const duration = Date.now() - startTime;
  const baselineContents = (record && record.baselineContents) || options.baselineContents || new Map();
  const patch = generateUnifiedDiff(workspace.root_path, baselineInventory, postInventory, baselineContents);

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

  const execution_usage = {
    wall_time_ms: duration,
    memory_peak_bytes: 0,
  };

  return {
    ok: overallExitCode === 0,
    workResult,
    execution_usage,
    isolationReported,
  };
}

module.exports = {
  executeWorkOrder,
  captureWorkResult,
  recoverInterruptedExecution,
  validateWorkResultBinding,
  computeWorkResultId,
  computeMutationDelta,
  generateUnifiedDiff,
};
