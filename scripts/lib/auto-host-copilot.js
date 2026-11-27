"use strict";

// The GitHub Copilot CLI host of an automatic run (E1.110, REQ-idd-031):
// `copilot` with the prompt on stdin and JSON events as transcript, resumed
// with `--resume <session id>`. Its assisted-approval judge denies every edit
// without an interactive user, so `--allow-all-tools` approves whatever its
// configuration does not deny, and `--add-dir` opens Copilot's own home, where
// ospec lives: without a user, Copilot denies any command naming a path
// outside the repository. Copilot reports no cost and gives tokens only
// on a session's first turn; each turn reports the session's AI credits so
// far, which the run caps, passing what is left to Copilot's own
// `--max-ai-credits` from its minimum of 30 credits. The conductor counts each
// turn end, so the run does not depend on the version of ospec's hook.

const os = require("node:os");
const path = require("node:path");

const { headlessTurn, resolveCli, sessionEnv } = require("./auto-hosts.js");
const { parseEvents, runProcess } = require("./headless-session.js");

const TURN_TIMEOUT_MS = 60 * 60 * 1000;
const MIN_CREDIT_CAP = 30;
const NANO = 1e9;
const QUOTA = /quota|rate limit|usage limit|monthly limit|premium requests?|out of (ai )?credits|insufficient/i;

function copilotTurnArgs({ home, model = null, sessionId = null, budgetCredits = null }) {
  return [
    "--output-format", "json",
    "--allow-all-tools",
    "--add-dir", home,
    "--no-ask-user",
    ...(model ? ["--model", model] : []),
    ...(sessionId ? ["--resume", sessionId] : []),
    ...(budgetCredits !== null && budgetCredits >= MIN_CREDIT_CAP ? ["--max-ai-credits", String(Math.floor(budgetCredits))] : []),
  ];
}

/** One turn's events: the session, its last message, its AI credits so far and its error. */
function summarizeCopilotTurn(bytes) {
  const events = parseEvents(bytes);
  const last = (type) => [...events].reverse().find((event) => event.type === type);
  const result = last("result");
  const sessionId = (result && result.sessionId) || events.find((event) => event.type === "session.start")?.data?.sessionId || null;
  const messages = events.filter((event) => event.type === "assistant.message" && typeof event.data?.content === "string" && event.data.content !== "");
  const text = messages.length > 0 ? messages[messages.length - 1].data.content : "";
  const nanoAiu = Number(last("session.usage_checkpoint")?.data?.totalNanoAiu);
  const credits = Number.isFinite(nanoAiu) ? nanoAiu / NANO : 0;
  const failure = last("session.error");
  if (failure) {
    const error = String(failure.data?.message || failure.data?.errorType || "error");
    return { session_id: sessionId, final_text: text, cost_usd: 0, session_credits: credits, is_error: true, error, quota_exhausted: QUOTA.test(error) };
  }
  if (!result) return { session_id: sessionId, final_text: text, cost_usd: 0, session_credits: credits, is_error: true, error: "no result event in the transcript", quota_exhausted: false };
  return { session_id: sessionId, final_text: text, cost_usd: 0, session_credits: credits, is_error: false, quota_exhausted: false };
}

function createCopilotHost({ model = null, baseEnv = process.env, resolveExecutable = () => resolveCli("copilot"), run = runProcess, turnTimeoutMs = TURN_TIMEOUT_MS } = {}) {
  let executable = null;
  const resolve = () => {
    executable = executable || resolveExecutable();
    return executable;
  };
  // Copilot's home: COPILOT_HOME, or .copilot in the user's home.
  const home = baseEnv.COPILOT_HOME || path.join(baseEnv.HOME || baseEnv.USERPROFILE || os.homedir(), ".copilot");
  const turn = ({ cwd, prompt, sessionId = null, transcriptPath, signal = null, budgetCredits = null, vars = {} }) =>
    headlessTurn({ run, executable: resolve(), args: copilotTurnArgs({ home, model, sessionId, budgetCredits }), cwd, env: sessionEnv(baseEnv, vars), input: prompt, transcriptPath, timeoutMs: turnTimeoutMs, signal }, summarizeCopilotTurn);
  return { name: "github-copilot", spend: "credits", reportsCost: false, reviewsActions: false, countsTurnEnds: false, resolve, turn, resumeCommand: (sessionId) => `copilot --resume ${sessionId}` };
}

module.exports = { copilotTurnArgs, createCopilotHost, summarizeCopilotTurn };
