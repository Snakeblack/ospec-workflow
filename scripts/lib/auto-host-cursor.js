"use strict";

// The Cursor host of an automatic run (E1.110, REQ-idd-031): `cursor-agent
// -p` with the prompt on stdin and a stream-json transcript, resumed with
// `--resume <chat id>`. `--auto-review` lets Cursor's classifier run the safe
// actions; one it would ask about is denied, since nobody can answer in `-p`.
// Cursor reports the tokens of each turn and no cost, so the run caps tokens.
// `-p` runs `beforeSubmitPrompt` but never `stop`, so the conductor counts
// each turn end itself.

const { headlessTurn, resolveCli, sessionEnv } = require("./auto-hosts.js");
const { parseEvents, runProcess } = require("./headless-session.js");

const TURN_TIMEOUT_MS = 60 * 60 * 1000;
const USAGE_KEYS = Object.freeze(["inputTokens", "outputTokens", "cacheReadTokens", "cacheWriteTokens"]);
const QUOTA = /rate limit|usage limit|quota|out of (credits|requests)/i;

function cursorTurnArgs({ model = null, sessionId = null } = {}) {
  return [
    "-p",
    "--output-format", "stream-json",
    "--trust",
    "--auto-review",
    ...(model ? ["--model", model] : []),
    ...(sessionId ? ["--resume", sessionId] : []),
  ];
}

/** One turn's stream-json transcript: its final `result` event. */
function summarizeCursorTurn(bytes) {
  const events = parseEvents(bytes);
  const init = events.find((event) => event.type === "system" && event.subtype === "init");
  const result = [...events].reverse().find((event) => event.type === "result");
  if (!result) return { session_id: init ? init.session_id : null, final_text: "", cost_usd: 0, tokens: 0, is_error: true, error: "no result event in the transcript", quota_exhausted: false };
  const usage = result.usage || {};
  const text = typeof result.result === "string" ? result.result : "";
  const isError = result.is_error === true;
  return {
    session_id: result.session_id || (init && init.session_id) || null,
    final_text: text,
    cost_usd: 0,
    tokens: USAGE_KEYS.reduce((sum, key) => sum + (Number(usage[key]) || 0), 0),
    is_error: isError,
    quota_exhausted: isError && QUOTA.test(text),
    ...(isError ? { error: text || result.subtype || "error" } : {}),
  };
}

function createCursorHost({ model = null, baseEnv = process.env, resolveExecutable = () => resolveCli("cursor-agent"), run = runProcess, turnTimeoutMs = TURN_TIMEOUT_MS } = {}) {
  let executable = null;
  const resolve = () => {
    executable = executable || resolveExecutable();
    return executable;
  };
  const turn = ({ cwd, prompt, sessionId = null, transcriptPath, signal = null, vars = {} }) =>
    headlessTurn({ run, executable: resolve(), args: cursorTurnArgs({ model, sessionId }), cwd, env: sessionEnv(baseEnv, vars), input: prompt, transcriptPath, timeoutMs: turnTimeoutMs, signal }, summarizeCursorTurn);
  return { name: "cursor", reportsCost: false, reviewsActions: true, countsTurnEnds: false, resolve, turn, resumeCommand: (sessionId) => `cursor-agent --resume ${sessionId}` };
}

module.exports = { createCursorHost, cursorTurnArgs, summarizeCursorTurn };
