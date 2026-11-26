"use strict";

// The hosts an automatic run drives (E1.108, REQ-idd-031): one headless turn
// at a time, a new session per item and `--resume` within it. Only Claude
// Code in this version; the other hosts come with E1.110, each once verified
// live. The session runs with the user's own configuration and plugin, in the
// `auto` permission mode, and never sees OSPEC_AUTO_RUN: only the conductor's
// own call to ospec carries it (ADR 0013).

const fs = require("node:fs");
const path = require("node:path");

const { resolveClaudeExecutable, runProcess, summarizeTurn } = require("./headless-session.js");

const HOSTS = Object.freeze(["claude"]);
const TURN_TIMEOUT_MS = 60 * 60 * 1000;
// What the session that launched the conductor leaves in the environment: the
// markers of a running Claude Code session, which a nested `claude -p` would
// take as its own, and the run's mark, which only the conductor's call holds.
const SESSION_MARKERS = Object.freeze([
  /^CLAUDECODE$/,
  /^CLAUDE_PID$/,
  /^CLAUDE_EFFORT$/,
  /^CLAUDE_CODE_(ENTRYPOINT|SESSION_ID|CHILD_SESSION|SESSION_ATTENDED|MESSAGING_SOCKET|MESSAGING_TOKEN|EXECPATH|CHILD_NOTES_DIR)$/,
  /^OSPEC_AUTO_RUN$/,
]);

function sessionEnv(baseEnv) {
  return Object.fromEntries(Object.entries(baseEnv).filter(([key]) => !SESSION_MARKERS.some((pattern) => pattern.test(key))));
}

// `--permission-mode auto` reviews every action with Claude Code's classifier;
// a prompt nobody can answer in `-p` is denied, never waited on.
function claudeTurnArgs({ model = null, sessionId = null } = {}) {
  return [
    "-p",
    "--output-format", "stream-json",
    "--verbose",
    "--permission-mode", "auto",
    ...(model ? ["--model", model] : []),
    ...(sessionId ? ["--resume", sessionId] : []),
  ];
}

function createClaudeHost({ model = null, baseEnv = process.env, resolveExecutable = resolveClaudeExecutable, run = runProcess, turnTimeoutMs = TURN_TIMEOUT_MS } = {}) {
  let executable = null;

  /** The claude binary; throws when it is not installed. */
  function resolve() {
    executable = executable || resolveExecutable();
    return executable;
  }

  async function turn({ cwd, prompt, sessionId = null, transcriptPath, signal = null }) {
    fs.mkdirSync(path.dirname(transcriptPath), { recursive: true });
    const process_ = await run({
      executable: resolve(),
      args: claudeTurnArgs({ model, sessionId }),
      cwd,
      env: sessionEnv(baseEnv),
      input: prompt,
      stdoutPath: transcriptPath,
      timeoutMs: turnTimeoutMs,
      signal,
    });
    const summary = summarizeTurn(fs.readFileSync(transcriptPath));
    const failure = process_.aborted ? "stopped" : process_.timedOut ? "timeout" : process_.error ? process_.error.message : process_.code !== 0 ? `exit ${process_.code}: ${process_.stderr.trim()}` : null;
    return {
      ...summary,
      aborted: process_.aborted === true,
      wall_ms: process_.wall_ms,
      ...(failure ? { is_error: true, error: summary.is_error ? `${failure} (${summary.error})` : failure } : {}),
    };
  }

  /** How the user opens the session to answer in it. */
  function resumeCommand(sessionId) {
    return `claude --resume ${sessionId}`;
  }

  return { name: "claude", resolve, turn, resumeCommand };
}

function createHost(name, options) {
  if (name === "claude") return createClaudeHost(options);
  return null;
}

module.exports = { HOSTS, claudeTurnArgs, createClaudeHost, createHost, sessionEnv };
