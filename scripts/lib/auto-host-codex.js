"use strict";

// The Codex host of an automatic run (E1.110, REQ-idd-031): `codex exec
// --json` with the prompt on stdin, resumed with `resume <thread id>`, which
// takes exec's options only before it. `--approve-for-me` routes each approval
// request through Codex's automatic review in the workspace-write sandbox.
// Codex reports the tokens of each turn and no cost, so the run caps tokens.
// `codex exec` runs only the hooks approved in `/hooks`, so the conductor
// counts each turn end itself. Codex logs to stderr, and its errors come in
// the events, so a failure leaves those log lines out.

const { headlessTurn, resolveCli, sessionEnv } = require("./auto-hosts.js");
const { parseEvents, runProcess } = require("./headless-session.js");

const TURN_TIMEOUT_MS = 60 * 60 * 1000;
const QUOTA = /usage[ _]limit|rate[ _]limit|quota|insufficient[ _]quota|"status":\s*429/i;
const LOG_LINE = /^\d{4}-\d{2}-\d{2}T\S+\s+(TRACE|DEBUG|INFO|WARN|ERROR)\s/;

function codexTurnArgs({ model = null, sessionId = null } = {}) {
  return [
    "exec",
    "--json",
    "--approve-for-me",
    ...(model ? ["--model", model] : []),
    ...(sessionId ? ["resume", sessionId] : []),
    "-",
  ];
}

// `turn.failed` carries the API's error as JSON text: its message, or the text.
function apiMessage(text) {
  try {
    const parsed = JSON.parse(text);
    const message = parsed?.error?.message || parsed?.message;
    return typeof message === "string" && message ? message : text;
  } catch {
    return text;
  }
}

/** One turn's events: the thread, its last message, its tokens and its failure. */
function summarizeCodexTurn(bytes) {
  const events = parseEvents(bytes);
  const sessionId = events.find((event) => event.type === "thread.started" && typeof event.thread_id === "string")?.thread_id || null;
  const messages = events.filter((event) => event.type === "item.completed" && event.item?.type === "agent_message" && typeof event.item.text === "string");
  const text = messages.length > 0 ? messages[messages.length - 1].item.text : "";
  const last = (type) => [...events].reverse().find((event) => event.type === type);
  const completed = last("turn.completed");
  const failure = last("turn.failed") || (completed ? null : last("error"));
  const usage = completed?.usage || {};
  // cached_input_tokens is part of input_tokens.
  const tokens = (Number(usage.input_tokens) || 0) + (Number(usage.output_tokens) || 0);
  if (failure) {
    const raw = String(failure.error?.message || failure.message || "error");
    return { session_id: sessionId, final_text: text, cost_usd: 0, tokens, is_error: true, error: apiMessage(raw), quota_exhausted: QUOTA.test(raw) };
  }
  if (!completed) return { session_id: sessionId, final_text: text, cost_usd: 0, tokens: 0, is_error: true, error: "no turn.completed event in the transcript", quota_exhausted: false };
  return { session_id: sessionId, final_text: text, cost_usd: 0, tokens, is_error: false, quota_exhausted: false };
}

function createCodexHost({ model = null, baseEnv = process.env, resolveExecutable = () => resolveCli("codex"), run = runProcess, turnTimeoutMs = TURN_TIMEOUT_MS } = {}) {
  let executable = null;
  const resolve = () => {
    executable = executable || resolveExecutable();
    return executable;
  };
  const withoutLogs = async (options) => {
    const result = await run(options);
    return { ...result, stderr: String(result.stderr || "").split("\n").filter((line) => !LOG_LINE.test(line)).join("\n") };
  };
  const turn = ({ cwd, prompt, sessionId = null, transcriptPath, signal = null, vars = {} }) =>
    headlessTurn({ run: withoutLogs, executable: resolve(), args: codexTurnArgs({ model, sessionId }), cwd, env: sessionEnv(baseEnv, vars), input: prompt, transcriptPath, timeoutMs: turnTimeoutMs, signal }, summarizeCodexTurn);
  return { name: "codex", reportsCost: false, reviewsActions: true, countsTurnEnds: false, resolve, turn, resumeCommand: (sessionId) => `codex resume ${sessionId}` };
}

module.exports = { codexTurnArgs, createCodexHost, summarizeCodexTurn };
