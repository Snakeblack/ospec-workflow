"use strict";

// The OpenCode host of an automatic run (E1.110, REQ-idd-031): `opencode run
// --standalone`, with its own server, so stopping the process stops the agent,
// the prompt on stdin and the JSON events as transcript, resumed with
// `--session <id>`. OpenCode has no permission mode that reviews each action:
// `--auto` approves whatever its configuration does not deny. Its events leave
// out the cost of the turn's last step, so after each turn the session's cost
// so far comes from `opencode session export`.

const { headlessTurn, resolveCli, sessionEnv } = require("./auto-hosts.js");
const { parseEvents, runProcess } = require("./headless-session.js");

const TURN_TIMEOUT_MS = 60 * 60 * 1000;
const EXPORT_TIMEOUT_MS = 60 * 1000;
const QUOTA = /rate limit|usage limit|quota|\b429\b|insufficient (credits|balance)/i;

function opencodeTurnArgs({ model = null, sessionId = null } = {}) {
  return [
    "run",
    "--standalone",
    "--format", "json",
    "--auto",
    ...(model ? ["--model", model] : []),
    ...(sessionId ? ["--session", sessionId] : []),
  ];
}

/** One turn's events: the session, the text of its last step and its error. */
function summarizeOpencodeTurn(bytes) {
  const events = parseEvents(bytes);
  const sessionId = events.find((event) => typeof event.sessionID === "string")?.sessionID || null;
  const lastStep = events.map((event) => event.type).lastIndexOf("step_start");
  const text = events.slice(lastStep + 1).filter((event) => event.type === "text" && event.part && typeof event.part.text === "string").map((event) => event.part.text).join("");
  const failure = [...events].reverse().find((event) => event.type === "error");
  if (failure) {
    const message = String(failure.error?.message || failure.error?.type || "error");
    return { session_id: sessionId, final_text: text, cost_usd: 0, is_error: true, error: message, quota_exhausted: QUOTA.test(message) };
  }
  if (events.length === 0) return { session_id: null, final_text: "", cost_usd: 0, is_error: true, error: "no event in the transcript", quota_exhausted: false };
  return { session_id: sessionId, final_text: text, cost_usd: 0, is_error: false, quota_exhausted: false };
}

function createOpencodeHost({ model = null, baseEnv = process.env, resolveExecutable = () => resolveCli("opencode"), run = runProcess, turnTimeoutMs = TURN_TIMEOUT_MS } = {}) {
  let executable = null;
  const resolve = () => {
    executable = executable || resolveExecutable();
    return executable;
  };

  // The session's cost so far, in USD.
  async function sessionCost(cwd, env, sessionId) {
    const exported = await run({ executable: resolve(), args: ["session", "export", "--standalone", sessionId], cwd, env, input: "", timeoutMs: EXPORT_TIMEOUT_MS });
    if (exported.code !== 0) throw new Error(`opencode session export failed: ${exported.stderr.trim() || `exit ${exported.code}`}`);
    const cost = Number(JSON.parse(exported.stdout)?.info?.cost);
    if (!Number.isFinite(cost)) throw new Error("opencode session export gave no cost");
    return cost;
  }

  function turn({ cwd, prompt, sessionId = null, transcriptPath, signal = null, vars = {} }) {
    const env = sessionEnv(baseEnv, vars);
    return headlessTurn({ run, executable: resolve(), args: opencodeTurnArgs({ model, sessionId }), cwd, env, input: prompt, transcriptPath, timeoutMs: turnTimeoutMs, signal }, async (bytes) => {
      const summary = summarizeOpencodeTurn(bytes);
      if (!summary.session_id || signal?.aborted) return summary;
      try {
        return { ...summary, cost_usd: await sessionCost(cwd, env, summary.session_id) };
      } catch (error) {
        return { ...summary, is_error: true, error: summary.is_error ? `${summary.error}; ${error.message}` : error.message };
      }
    });
  }

  return { name: "opencode", reportsCost: true, reviewsActions: false, resolve, turn, resumeCommand: (sessionId) => `opencode --session ${sessionId}` };
}

module.exports = { createOpencodeHost, opencodeTurnArgs, summarizeOpencodeTurn };
