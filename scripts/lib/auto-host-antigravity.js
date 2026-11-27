"use strict";

// The Antigravity host of an automatic run (E1.110, REQ-idd-031): `agy
// --print=<prompt>`, since print mode reads no stdin, with a stream-json
// transcript, resumed with `--conversation <id>`. `--mode auto` reviews each
// action where the account has it; elsewhere agy continues in its default
// mode, which in print mode runs every action its configuration does not deny,
// and the run's first line says so. Antigravity reports the tokens of each
// turn and no cost, so the run caps tokens. ospec's Stop hook counts each turn
// end in print mode. agy repeats its error on stderr after its warnings, with
// a list behind it, so a failure keeps only the error's line.

const { headlessTurn, resolveCli, sessionEnv } = require("./auto-hosts.js");
const { parseEvents, runProcess } = require("./headless-session.js");

const TURN_TIMEOUT_MS = 60 * 60 * 1000;
const QUOTA = /quota|rate limit|usage limit|resource[ _]exhausted|\b429\b/i;
const REVIEW_NOTE = "antigravity reviews each action only where the account has --mode auto, and otherwise runs every action its configuration does not deny";

function antigravityTurnArgs({ prompt, model = null, sessionId = null }) {
  return [
    `--print=${prompt}`,
    "--output-format", "stream-json",
    "--mode", "auto",
    ...(model ? ["--model", model] : []),
    ...(sessionId ? ["--conversation", sessionId] : []),
  ];
}

const firstLine = (text) => String(text).split("\n").map((line) => line.trim()).find(Boolean) || "";

/** One turn's events: the conversation, its response, its tokens and its error. */
function summarizeAntigravityTurn(bytes) {
  const events = parseEvents(bytes);
  const outcome = [...events].reverse().find((event) => event.event === "result")?.result;
  const conversation = (outcome && outcome.conversation_id) || events.find((event) => event.event === "init")?.conversation_id || null;
  if (!outcome) return { session_id: conversation, final_text: "", cost_usd: 0, tokens: 0, is_error: true, error: "no result event in the transcript", quota_exhausted: false };
  const tokens = Number(outcome.usage?.total_tokens) || 0;
  const text = typeof outcome.response === "string" ? outcome.response : "";
  if (outcome.status !== "SUCCESS") {
    const raw = String(outcome.error || text || outcome.status || "error");
    return { session_id: conversation, final_text: text, cost_usd: 0, tokens, is_error: true, error: firstLine(raw), quota_exhausted: QUOTA.test(raw) };
  }
  return { session_id: conversation, final_text: text, cost_usd: 0, tokens, is_error: false, quota_exhausted: false };
}

function createAntigravityHost({ model = null, baseEnv = process.env, resolveExecutable = () => resolveCli("agy"), run = runProcess, turnTimeoutMs = TURN_TIMEOUT_MS } = {}) {
  let executable = null;
  const resolve = () => {
    executable = executable || resolveExecutable();
    return executable;
  };
  // agy's warnings, such as a mode the account lacks, are no failure.
  const errorLine = async (options) => {
    const result = await run(options);
    return { ...result, stderr: firstLine(String(result.stderr || "").split("\n").filter((line) => !/^warning:/i.test(line.trim())).join("\n")) };
  };
  const turn = ({ cwd, prompt, sessionId = null, transcriptPath, signal = null }) =>
    headlessTurn({ run: errorLine, executable: resolve(), args: antigravityTurnArgs({ prompt, model, sessionId }), cwd, env: sessionEnv(baseEnv), input: "", transcriptPath, timeoutMs: turnTimeoutMs, signal }, summarizeAntigravityTurn);
  return { name: "antigravity", reportsCost: false, reviewsActions: false, reviewNote: REVIEW_NOTE, resolve, turn, resumeCommand: (sessionId) => `agy --conversation ${sessionId}` };
}

module.exports = { antigravityTurnArgs, createAntigravityHost, summarizeAntigravityTurn };
