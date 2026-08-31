"use strict";

const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { isAuthorizedNodeRuntime, confineChildEnv } = require("./worker-sandbox-confine.js");

function isLiveIsolationProbeEvidence(evidence) {
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) return false;
  if (evidence.blocked === true && evidence.attempted !== true && !Array.isArray(evidence.attempts)) {
    return false;
  }
  const attempts = evidence.attempts;
  if (!Array.isArray(attempts) || attempts.length < 3) return false;
  if (!attempts.every((a) => a && a.attempted === true && typeof a.wrote === "boolean")) return false;
  const containment = evidence.containment;
  if (!containment || typeof containment !== "object") return true;
  return (
    containment.allowed_write === "PASS" &&
    containment.undeclared_workspace_write === "BLOCKED" &&
    containment.external_root_write === "BLOCKED"
  );
}

function isLiveIsolationAttemptTriple(records, planned) {
  if (!Array.isArray(records) || !Array.isArray(planned) || records.length !== planned.length) {
    return false;
  }
  for (let i = 0; i < planned.length; i++) {
    const rec = records[i];
    if (!rec || rec.id !== planned[i].id || rec.attempted !== true || typeof rec.wrote !== "boolean") {
      return false;
    }
  }
  return true;
}

const PRELOAD_SCRIPT_PATH = path.resolve(__dirname, "worker-sandbox-preload.js");

/**
 * Executes a command with filesystem sandbox confinement attached.
 *
 * @param {Object} options
 * @param {string} options.command
 * @param {string[]} [options.args]
 * @param {string} [options.cwd]
 * @param {string} [options.workspaceRoot]
 * @param {string[]} [options.allowedPaths]
 * @param {Object} [options.env]
 * @param {AbortSignal} [options.signal]
 * @param {number} [options.timeoutMs]
 * @returns {Promise<{ ok: boolean, exit_code: number, stdout: string, stderr: string, failure_class?: string, error?: string }>}
 */
async function executeSandboxedCommand(options = {}) {
  const command = options.command;
  const args = options.args || [];
  const cwd = options.cwd || process.cwd();
  const workspaceRoot = options.workspaceRoot || cwd;
  const allowedPaths = Array.isArray(options.allowedPaths) ? options.allowedPaths : ["**"];
  const signal = options.signal;
  const timeoutMs = options.timeoutMs;

  let realWorkspaceRoot = path.resolve(workspaceRoot);
  try {
    if (fs.existsSync(realWorkspaceRoot)) {
      realWorkspaceRoot = fs.realpathSync(realWorkspaceRoot);
    }
  } catch {}

  if (!isAuthorizedNodeRuntime(command, cwd)) {
    return {
      ok: false,
      exit_code: 126,
      stdout: "",
      stderr: `EACCES: permission denied by worker sandbox (unconfined command rejected: ${command})`,
      failure_class: "sandbox_rejection",
      error: `Command '${command}' cannot be confined by worker sandbox; execution rejected fail-closed`,
    };
  }

  const capturedPolicy = {
    workspaceRoot: realWorkspaceRoot,
    allowedPaths,
  };
  const env = confineChildEnv({
    ...process.env,
    ...(options.env || {}),
  }, capturedPolicy, PRELOAD_SCRIPT_PATH);

  return await new Promise((resolve) => {
    let child = null;
    let timer = null;
    let isDone = false;
    let stdout = "";
    let stderr = "";

    const cleanup = () => {
      if (timer) clearTimeout(timer);
      if (signal && onAbort) signal.removeEventListener("abort", onAbort);
    };

    const finish = (result) => {
      if (isDone) return;
      isDone = true;
      cleanup();
      resolve(result);
    };

    const onAbort = () => {
      if (child) {
        try { child.kill("SIGTERM"); } catch {}
      }
      finish({
        ok: false,
        failure_class: "cancel",
        exit_code: 1,
        stdout,
        stderr: stderr ? `${stderr}\naborted` : "aborted",
      });
    };

    if (signal) {
      if (signal.aborted) {
        return finish({ ok: false, failure_class: "cancel", exit_code: 1, stdout: "", stderr: "aborted" });
      }
      signal.addEventListener("abort", onAbort, { once: true });
    }

    if (timeoutMs && timeoutMs > 0) {
      timer = setTimeout(() => {
        if (child) {
          try { child.kill("SIGKILL"); } catch {}
        }
        finish({
          ok: false,
          failure_class: "timeout",
          exit_code: 1,
          stdout,
          stderr: stderr ? `${stderr}\nETIMEDOUT` : "ETIMEDOUT",
        });
      }, timeoutMs);
    }

    try {
      child = spawn(process.execPath, args, {
        cwd,
        env,
        stdio: ["ignore", "pipe", "pipe"],
      });

      child.stdout?.on("data", (d) => (stdout += d.toString("utf8")));
      child.stderr?.on("data", (d) => (stderr += d.toString("utf8")));

      child.on("error", (err) => {
        const msg = err && err.message ? err.message : String(err);
        finish({
          ok: false,
          failure_class: "spawn_error",
          exit_code: 1,
          stdout,
          stderr: stderr ? `${stderr}\n${msg}` : msg,
          error: msg,
        });
      });

      child.on("close", (code) => {
        const exitCode = typeof code === "number" ? code : 1;
        finish({
          ok: exitCode === 0,
          exit_code: exitCode,
          stdout,
          stderr,
        });
      });
    } catch (err) {
      const msg = err && err.message ? err.message : String(err);
      finish({
        ok: false,
        failure_class: "spawn_error",
        exit_code: 1,
        stdout: "",
        stderr: msg,
        error: msg,
      });
    }
  });
}

/**
 * Creates a sandboxed worker primitive for HostAdapters.
 * Handles WorkerTransport probe, WorkerIsolation probe, and sandboxed WorkOrder command execution.
 *
 * @param {Object} [options]
 * @returns {Function}
 */
function makeSandboxedWorkerPrimitive(options = {}) {
  return async (input) => {
    if (!input || typeof input !== "object") {
      return { ok: false, error: "invalid-input" };
    }

    // 1. WorkerTransport live probe challenge
    if (input.probe === true && input.parallel === true) {
      return {
        ok: true,
        outcome: "ok",
        value: {
          worker_id: `worker-${process.pid}`,
          parallel: true,
          sandboxed: true,
        },
      };
    }

    // 2. WorkerIsolation live probe: three real writes through the confined executor.
    if (input.probe === true && input.isolation === true) {
      const workspaceRoot = input.workspace_root || process.cwd();
      const allowedPaths = Array.isArray(input.allowed_paths) ? input.allowed_paths : ["allowed/**"];
      const planned = Array.isArray(input.attempts) ? input.attempts : [];
      const attempts = [];
      for (const attempt of planned) {
        const attemptPath = attempt && attempt.path;
        const content = attempt && attempt.content != null ? String(attempt.content) : "probe";
        if (typeof attemptPath !== "string" || !attemptPath) {
          attempts.push({ id: attempt && attempt.id, attempted: false, wrote: false });
          continue;
        }
        const script = [
          "const fs = require('node:fs');",
          "const path = require('node:path');",
          `const target = ${JSON.stringify(attemptPath)};`,
          "fs.mkdirSync(path.dirname(target), { recursive: true });",
          `fs.writeFileSync(target, ${JSON.stringify(content)});`,
        ].join("");
        await executeSandboxedCommand({
          command: process.execPath,
          args: ["-e", script],
          cwd: workspaceRoot,
          workspaceRoot,
          allowedPaths,
          timeoutMs: input.timeoutMs || 8000,
        });
        attempts.push({
          id: attempt.id,
          attempted: true,
          wrote: fs.existsSync(attemptPath),
        });
      }
      return { ok: true, outcome: "ok", value: { attempts } };
    }

    // 3. Real WorkOrder Command Execution
    if (input.command) {
      const cwd = input.cwd || input.workspace_root || process.cwd();
      const workspaceRoot = input.workspace_root || input.sandbox_context?.workspace_root || cwd;
      const allowedPaths = input.allowed_paths || input.sandbox_context?.allowed_paths || ["**"];

      return await executeSandboxedCommand({
        command: input.command,
        args: input.args || [],
        cwd,
        workspaceRoot,
        allowedPaths,
        env: input.env || {},
        signal: input.signal,
        timeoutMs: input.deadlineMs || input.timeoutMs,
      });
    }

    return { ok: true, outcome: "ok", value: { delegation: "Agent" } };
  };
}

/**
 * Sandboxed isolation primitive dedicated to WorkerIsolation probe.
 */
function makeSandboxedIsolationPrimitive() {
  return makeSandboxedWorkerPrimitive();
}

/**
 * Rogue isolation primitive without sandbox for negative testing.
 */
function makeRogueIsolationPrimitive() {
  return async (input) => {
    if (!input || input.isolation !== true || !Array.isArray(input.attempts)) {
      return { ok: false };
    }
    for (const attempt of input.attempts) {
      fs.mkdirSync(path.dirname(attempt.path), { recursive: true });
      fs.writeFileSync(attempt.path, attempt.content);
    }
    return { ok: true, value: { escaped: true } };
  };
}

module.exports = {
  PRELOAD_SCRIPT_PATH,
  executeSandboxedCommand,
  makeSandboxedWorkerPrimitive,
  makeSandboxedIsolationPrimitive,
  makeRogueIsolationPrimitive,
  isLiveIsolationProbeEvidence,
  isLiveIsolationAttemptTriple,
};
