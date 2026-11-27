"use strict";

// The hosts an automatic run drives (E1.108, E1.110, REQ-idd-031): one
// headless turn at a time, a new session per item, resumed by its id within
// it. The session runs with the user's own configuration and the host's ospec
// install, in the host's permission mode that reviews each action where it has
// one, and never sees OSPEC_AUTO_RUN: only the conductor's own call to ospec
// carries it (ADR 0013). Each turn carries instead the marks of the run's
// permission policy (scripts/lib/auto-permission.js), which only make ospec's
// guard stricter. A host is listed in HOSTS once a run closed a change on it
// live; any other names why it cannot run.

const fs = require("node:fs");
const path = require("node:path");

const { resolveBinFromPath, isWindowsInteropPath } = require("./claude-bin.js");
const { resolveClaudeExecutable, runProcess, summarizeTurn } = require("./headless-session.js");

const HOSTS = Object.freeze(["claude", "cursor", "opencode", "codex", "github-copilot", "antigravity"]);
const UNAVAILABLE = Object.freeze({
  vscode: "VS Code has no headless mode: its agent runs only inside the editor",
});
const TURN_TIMEOUT_MS = 60 * 60 * 1000;
// What the session that launched the conductor leaves in the environment: the
// markers of a running Claude Code session, which a nested `claude -p` would
// take as its own, and the run's mark, which only the conductor's call holds.
const SESSION_MARKERS = Object.freeze([
  /^CLAUDECODE$/,
  /^CLAUDE_PID$/,
  /^CLAUDE_EFFORT$/,
  /^CLAUDE_CODE_(ENTRYPOINT|SESSION_ID|CHILD_SESSION|SESSION_ATTENDED|MESSAGING_SOCKET|MESSAGING_TOKEN|EXECPATH|CHILD_NOTES_DIR)$/,
  /^OSPEC_AUTO_(RUN|SESSION|ALLOW)$/,
]);

/** The session's environment: `baseEnv` without those markers, plus the turn's own `vars`. */
function sessionEnv(baseEnv, vars = {}) {
  return { ...Object.fromEntries(Object.entries(baseEnv).filter(([key]) => !SESSION_MARKERS.some((pattern) => pattern.test(key)))), ...vars };
}

/** Why `name` cannot drive a run, or null when it can. */
function unavailableReason(name) {
  if (HOSTS.includes(name)) return null;
  return UNAVAILABLE[name] || `it is not a host ospec knows (${[...HOSTS, ...Object.keys(UNAVAILABLE)].join(", ")})`;
}

/** The host's CLI on the PATH; throws when it is missing or cannot be spawned without a shell. */
function resolveCli(bin) {
  const found = resolveBinFromPath(bin);
  if (!found || isWindowsInteropPath(found)) throw new Error(`${bin} CLI not found on PATH`);
  if (/\.(cmd|bat)$/i.test(found)) throw new Error(`${found} is a shell shim, which the run cannot start without a shell`);
  return found;
}

/**
 * Runs one headless turn of a host and reads its transcript with
 * `summarize`. A stopped, timed-out or failed process is an error, whatever
 * the transcript says.
 */
async function headlessTurn({ run, executable, args, cwd, env, input, transcriptPath, timeoutMs, signal }, summarize) {
  fs.mkdirSync(path.dirname(transcriptPath), { recursive: true });
  const process_ = await run({ executable, args, cwd, env, input, stdoutPath: transcriptPath, timeoutMs, signal });
  const summary = await summarize(fs.readFileSync(transcriptPath));
  const stderr = process_.stderr.trim();
  const failure = process_.aborted ? "stopped" : process_.timedOut ? "timeout" : process_.error ? process_.error.message : process_.code !== 0 ? `exit ${process_.code}${stderr ? `: ${stderr}` : ""}` : null;
  return {
    ...summary,
    aborted: process_.aborted === true,
    wall_ms: process_.wall_ms,
    ...(failure ? { is_error: true, error: summary.is_error ? `${failure} (${summary.error})` : failure } : {}),
  };
}

// `--permission-mode auto` reviews every action with Claude Code's classifier;
// a prompt nobody can answer in `-p` is denied, never waited on.
// `--max-budget-usd` caps what this invocation spends, inside the turn.
function claudeTurnArgs({ model = null, sessionId = null, budgetUsd = null } = {}) {
  return [
    "-p",
    "--output-format", "stream-json",
    "--verbose",
    "--permission-mode", "auto",
    ...(model ? ["--model", model] : []),
    ...(sessionId ? ["--resume", sessionId] : []),
    ...(budgetUsd !== null ? ["--max-budget-usd", budgetUsd.toFixed(4)] : []),
  ];
}

function createClaudeHost({ model = null, baseEnv = process.env, resolveExecutable = resolveClaudeExecutable, run = runProcess, turnTimeoutMs = TURN_TIMEOUT_MS } = {}) {
  let executable = null;

  /** The claude binary; throws when it is not installed. */
  function resolve() {
    executable = executable || resolveExecutable();
    return executable;
  }

  function turn({ cwd, prompt, sessionId = null, transcriptPath, signal = null, budgetUsd = null, vars = {} }) {
    return headlessTurn({ run, executable: resolve(), args: claudeTurnArgs({ model, sessionId, budgetUsd }), cwd, env: sessionEnv(baseEnv, vars), input: prompt, transcriptPath, timeoutMs: turnTimeoutMs, signal }, summarizeTurn);
  }

  /** How the user opens the session to answer in it. */
  function resumeCommand(sessionId) {
    return `claude --resume ${sessionId}`;
  }

  return { name: "claude", reportsCost: true, reviewsActions: true, resolve, turn, resumeCommand };
}

function createHost(name, options) {
  if (name === "claude") return createClaudeHost(options);
  if (name === "cursor") return require("./auto-host-cursor.js").createCursorHost(options);
  if (name === "opencode") return require("./auto-host-opencode.js").createOpencodeHost(options);
  if (name === "codex") return require("./auto-host-codex.js").createCodexHost(options);
  if (name === "github-copilot") return require("./auto-host-copilot.js").createCopilotHost(options);
  if (name === "antigravity") return require("./auto-host-antigravity.js").createAntigravityHost(options);
  return null;
}

module.exports = { HOSTS, UNAVAILABLE, claudeTurnArgs, createClaudeHost, createHost, headlessTurn, resolveCli, sessionEnv, unavailableReason };
