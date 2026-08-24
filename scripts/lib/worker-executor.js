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
 * Detects content changes (sha256 mismatch) and permission mode changes (baseline.mode !== post.mode).
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
    } else {
      const baseEntry = baselineMap.get(p);
      const contentChanged = baseEntry.sha256 !== postEntry.sha256;
      const modeChanged =
        baseEntry.mode !== undefined &&
        postEntry.mode !== undefined &&
        baseEntry.mode !== postEntry.mode;
      if (contentChanged || modeChanged) {
        modified.push(p);
      }
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
 * Analyzes string content to split into lines and retain trailing newline status.
 *
 * @param {string|Buffer} content
 * @returns {{ lines: string[], hasTrailingNewline: boolean }}
 */
function analyzeLines(content) {
  if (content === null || content === undefined || content === "") {
    return { lines: [], hasTrailingNewline: true };
  }
  const normalized = String(content).replace(/\r\n/g, "\n");
  const hasTrailingNewline = normalized.endsWith("\n");
  const lines = normalized.split("\n");
  if (hasTrailingNewline && lines[lines.length - 1] === "") {
    lines.pop();
  }
  return { lines, hasTrailingNewline };
}

/**
 * Splits text into an array of lines without carriage returns and removes trailing empty line.
 *
 * @param {string|Buffer} text
 * @returns {string[]}
 */
function splitLines(text) {
  return analyzeLines(text).lines;
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
 * Formats a numeric or string mode into standard 6-digit octal representation (e.g. 100644, 100755).
 *
 * @param {number|string} mode
 * @returns {string}
 */
function formatOctalMode(mode) {
  if (typeof mode === "string") {
    return mode.length <= 6 ? mode.padStart(6, "0") : mode;
  }
  if (typeof mode === "number") {
    return (mode & 0o777777).toString(8).padStart(6, "0");
  }
  return "100644";
}

/**
 * Generates an applicable standard unified diff patch representing exact modifications.
 * Preserves trailing newline distinctions, emits standard EOF markers, and includes git mode change headers.
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
      const { lines, hasTrailingNewline } = analyzeLines(newContent);
      const header = `--- /dev/null\n+++ b/${p}\n@@ -0,0 +1,${lines.length} @@\n`;
      let body = "";
      for (let i = 0; i < lines.length; i++) {
        body += `+${lines[i]}\n`;
        if (i === lines.length - 1 && !hasTrailingNewline) {
          body += "\\ No newline at end of file\n";
        }
      }
      chunks.push(header + body);
    } else {
      const baseEntry = baselineMap.get(p);
      const contentChanged = baseEntry.sha256 !== postEntry.sha256;
      const modeChanged =
        baseEntry.mode !== undefined &&
        postEntry.mode !== undefined &&
        baseEntry.mode !== postEntry.mode;

      if (contentChanged || modeChanged) {
        let modeHeader = "";
        if (modeChanged) {
          modeHeader = `old mode ${formatOctalMode(baseEntry.mode)}\nnew mode ${formatOctalMode(postEntry.mode)}\n`;
        }

        if (contentChanged) {
          // Modified file with content changes
          const oldContent = contentsMap.get(p) !== undefined ? contentsMap.get(p) : "";
          const oldAnalysis = analyzeLines(oldContent);
          const newAnalysis = analyzeLines(newContent);
          const oldLines = oldAnalysis.lines;
          const newLines = newAnalysis.lines;

          let edits = computeLineDiff(oldLines, newLines);

          if (oldAnalysis.hasTrailingNewline !== newAnalysis.hasTrailingNewline) {
            if (edits.length > 0 && edits[edits.length - 1].type === "keep") {
              const lastKeep = edits.pop();
              edits.push({ type: "delete", line: lastKeep.line });
              edits.push({ type: "insert", line: lastKeep.line });
            }
          }

          const header = `--- a/${p}\n+++ b/${p}\n${modeHeader}@@ -1,${oldLines.length} +1,${newLines.length} @@\n`;

          let lastOldIndex = -1;
          let lastNewIndex = -1;
          for (let i = edits.length - 1; i >= 0; i--) {
            if (lastOldIndex === -1 && (edits[i].type === "keep" || edits[i].type === "delete")) {
              lastOldIndex = i;
            }
            if (lastNewIndex === -1 && (edits[i].type === "keep" || edits[i].type === "insert")) {
              lastNewIndex = i;
            }
            if (lastOldIndex !== -1 && lastNewIndex !== -1) break;
          }

          let body = "";
          for (let i = 0; i < edits.length; i++) {
            const edit = edits[i];
            if (edit.type === "keep") {
              body += ` ${edit.line}\n`;
              if (
                i === lastOldIndex &&
                !oldAnalysis.hasTrailingNewline &&
                i === lastNewIndex &&
                !newAnalysis.hasTrailingNewline
              ) {
                body += "\\ No newline at end of file\n";
              }
            } else if (edit.type === "delete") {
              body += `-${edit.line}\n`;
              if (i === lastOldIndex && !oldAnalysis.hasTrailingNewline) {
                body += "\\ No newline at end of file\n";
              }
            } else if (edit.type === "insert") {
              body += `+${edit.line}\n`;
              if (i === lastNewIndex && !newAnalysis.hasTrailingNewline) {
                body += "\\ No newline at end of file\n";
              }
            }
          }
          chunks.push(header + body);
        } else if (modeChanged) {
          // File with only permission mode change
          const header = `--- a/${p}\n+++ b/${p}\n${modeHeader}`;
          chunks.push(header);
        }
      }
    }
  }

  // Deleted files
  for (const [p] of baselineMap.entries()) {
    if (!postMap.has(p)) {
      const oldContent = contentsMap.get(p) !== undefined ? contentsMap.get(p) : "";
      const { lines, hasTrailingNewline } = analyzeLines(oldContent);
      const header = `--- a/${p}\n+++ /dev/null\n@@ -1,${lines.length} +0,0 @@\n`;
      let body = "";
      for (let i = 0; i < lines.length; i++) {
        body += `-${lines[i]}\n`;
        if (i === lines.length - 1 && !hasTrailingNewline) {
          body += "\\ No newline at end of file\n";
        }
      }
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
 * Resolves workspace strictly from the private registry.
 *
 * @param {Object} options
 * @returns {Promise<Object>}
 */
async function recoverInterruptedExecution(options = {}) {
  const workspaceId =
    typeof options.workspace === "string"
      ? options.workspace
      : (options.workspace?.workspace_id || options.workspace_id);

  const record = getWorkspaceRecord(workspaceId);
  const workOrder = options.workOrder || {};
  const partialLogs = Array.isArray(options.partialLogs)
    ? options.partialLogs
    : Array.isArray(options.logs)
    ? options.logs
    : [];
  const reason = options.reason || "timeout";

  if (record && record.descriptor) {
    record.descriptor.status = "interrupted";
  }
  if (options.workspace && typeof options.workspace === "object") {
    options.workspace.status = "interrupted";
  }

  const inventory = workspaceId ? await inspectWorkspace(workspaceId) : [];
  const baselineInventory = (record && record.baselineInventory) || options.baselineInventory || [];
  const delta = computeMutationDelta(baselineInventory, inventory);

  return {
    status: "interrupted",
    reason,
    workspace_id: workspaceId || "",
    work_order_id: workOrder.work_order_id || "",
    source_snapshot_id: (record && record.descriptor && record.descriptor.source_snapshot_id) || workOrder.source_snapshot_id || "",
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
  const workspaceId = typeof workspace === "string" ? workspace : (workspace ? workspace.workspace_id : "");
  const record = getWorkspaceRecord(workspaceId);

  if (!record || !record.rootPath || !fs.existsSync(record.rootPath)) {
    return {
      ok: false,
      reason: "workspace-not-registered",
      error: `Workspace ${workspaceId || "unspecified"} is not registered in runtime registry`,
    };
  }

  const authoritativeRootPath = record.rootPath;
  const authoritativeWorkspace = {
    ...(typeof workspace === "object" ? workspace : {}),
    workspace_id: (record.descriptor && record.descriptor.workspace_id) || workspaceId,
    root_path: authoritativeRootPath,
    source_snapshot_id: (record.descriptor && record.descriptor.source_snapshot_id) || (typeof workspace === "object" ? workspace.source_snapshot_id : undefined),
  };

  // 3-Way binding check between workOrder and workspace
  if (
    workOrder.source_snapshot_id &&
    authoritativeWorkspace.source_snapshot_id &&
    workOrder.source_snapshot_id !== authoritativeWorkspace.source_snapshot_id
  ) {
    return {
      ok: false,
      reason: "source-snapshot-mismatch",
      error: `WorkOrder source_snapshot_id (${workOrder.source_snapshot_id}) does not match workspace source_snapshot_id (${authoritativeWorkspace.source_snapshot_id})`,
    };
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
      const transportAdapterId = workerTransport?.adapter_id || workerTransport?.adapterId;
      const transportProbeDigest = workerTransport?.probe_digest || workerTransport?.probeDigest;
      const matchesProof =
        Boolean(workerTransport) &&
        (!options.capabilityProof ||
          (Boolean(transportAdapterId) &&
           transportAdapterId === options.capabilityProof.adapter_id &&
           Boolean(transportProbeDigest) &&
           transportProbeDigest === options.capabilityProof.probe_digest));

      if (matchesProof) {
        isolationReported = "enforced";
      } else {
        return {
          ok: false,
          isolationReported: "unavailable",
          error: "Enforced isolation capability requires verified WorkerTransport matching capability proof",
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

  const requiresStrict = options.strictIsolation === true;
  if (requiresStrict && isolationReported !== "enforced") {
    return {
      ok: false,
      reason: "strict-isolation-unfulfilled",
      error: "Commands require verified host isolation; fallback execution rejected",
    };
  }

  const allowedPaths = Array.isArray(workOrder.allowed_paths) ? workOrder.allowed_paths : ["**"];

  // Pre-flight containment check on declared write targets (if supplied)
  if (Array.isArray(options.declaredTargets)) {
    const preFlight = validateAllowedPaths(options.declaredTargets, allowedPaths, {
      workspaceRoot: authoritativeRootPath,
      workspace_id: authoritativeWorkspace.workspace_id,
      work_order_id: workOrder.work_order_id,
    });
    if (!preFlight.ok) {
      return { ok: false, violation: preFlight.violation, isolationReported };
    }
  }

  const baselineInventory = (record && record.baselineInventory) || options.baselineInventory || (await inspectWorkspace(authoritativeWorkspace));

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
    if (workspace) workspace.status = "interrupted";
    const recovery = await recoverInterruptedExecution({
      workspace: authoritativeWorkspace,
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
      if (workspace) workspace.status = "interrupted";
      const recovery = await recoverInterruptedExecution({
        workspace: authoritativeWorkspace,
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
          cwd: authoritativeRootPath,
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
          const safeEnv = {
            PATH: process.env.PATH || "",
            SystemRoot: process.env.SystemRoot || "",
            TEMP: process.env.TEMP || "",
            TMP: process.env.TMP || "",
            HOME: process.env.HOME || "",
            USERPROFILE: process.env.USERPROFILE || "",
            ...(workOrder.environment || options.environment || {}),
          };
          child = spawn(cmdBinary, cmdArgs, {
            cwd: authoritativeRootPath,
            env: safeEnv,
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
      if (workspace) workspace.status = "interrupted";
      const recovery = await recoverInterruptedExecution({
        workspace: authoritativeWorkspace,
        workOrder,
        partialLogs: logs,
        reason: "abort",
        baselineInventory,
      });
      return { ok: false, interrupted: true, recovery, isolationReported };
    }

    if (timedOut) {
      if (workspace) workspace.status = "interrupted";
      const recovery = await recoverInterruptedExecution({
        workspace: authoritativeWorkspace,
        workOrder,
        partialLogs: logs,
        reason: "timeout",
        baselineInventory,
      });
      return { ok: false, interrupted: true, recovery, isolationReported };
    }
  }

  // Post-flight inventory & mutation delta calculation
  const postInventory = await inspectWorkspace(authoritativeWorkspace);
  const mutationDelta = computeMutationDelta(baselineInventory, postInventory);

  // Validate containment strictly on the mutation delta
  const containment = validateAllowedPaths(mutationDelta, allowedPaths, {
    workspaceRoot: authoritativeRootPath,
    workspace_id: authoritativeWorkspace.workspace_id,
    work_order_id: workOrder.work_order_id,
  });

  if (!containment.ok) {
    return { ok: false, violation: containment.violation, isolationReported };
  }

  const duration = Date.now() - startTime;
  const baselineContents = (record && record.baselineContents) || options.baselineContents || new Map();
  const patch = generateUnifiedDiff(authoritativeRootPath, baselineInventory, postInventory, baselineContents);

  const workResult = await captureWorkResult({
    work_order_id: workOrder.work_order_id,
    source_snapshot_id: workOrder.source_snapshot_id || authoritativeWorkspace.source_snapshot_id,
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
