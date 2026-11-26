"use strict";

// The GitHub Copilot CLI host of an automatic run (E1.110, REQ-idd-031).

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { copilotTurnArgs, createCopilotHost, summarizeCopilotTurn } = require("./auto-host-copilot.js");

const lines = (...events) => events.map((event) => JSON.stringify(event)).join("\n");
const started = (sessionId) => ({ type: "session.start", data: { sessionId } });
const message = (content) => ({ type: "assistant.message", data: { content } });
const usage = (totalNanoAiu) => ({ type: "session.usage_checkpoint", data: { totalNanoAiu, totalPremiumRequests: 1 } });
const result = (sessionId, exitCode = 0) => ({ type: "result", sessionId, exitCode, usage: { premiumRequests: 1 } });

test("[REQ-idd-031] a Copilot turn allows every tool and its own home, never asks, resumes its session and takes what is left of the credit cap from 30 credits up", () => {
  assert.deepEqual(copilotTurnArgs({ home: "/home/u/.copilot" }), ["--output-format", "json", "--allow-all-tools", "--add-dir", "/home/u/.copilot", "--no-ask-user"]);
  assert.deepEqual(copilotTurnArgs({ home: "/h", model: "gpt-5.5", sessionId: "e13d", budgetCredits: 41.7 }).slice(6), ["--model", "gpt-5.5", "--resume", "e13d", "--max-ai-credits", "41"]);
  // Copilot refuses a cap below 30 credits: the run checks it between turns.
  assert.deepEqual(copilotTurnArgs({ home: "/h", budgetCredits: 29.9 }), copilotTurnArgs({ home: "/h" }));
});

test("[REQ-idd-031] Copilot events give the session, the last message and the session's AI credits so far", () => {
  const ok = summarizeCopilotTurn(lines(started("e13d"), message(""), message("Working."), message("Done."), usage(376_700_000), result("e13d")));
  assert.deepEqual(ok, { session_id: "e13d", final_text: "Done.", cost_usd: 0, session_credits: 0.3767, is_error: false, quota_exhausted: false });
  assert.equal(summarizeCopilotTurn(lines(started("e13e"), message("ok"), result("e13e"))).session_credits, 0);
});

test("[REQ-idd-031] a failed Copilot turn reports its session error, and a spent allowance as the quota", () => {
  const failed = summarizeCopilotTurn(lines(started("7187"), { type: "session.error", data: { errorType: "query", message: 'Execution failed: Model "x" is not available.' } }, result("7187", 1)));
  assert.deepEqual([failed.session_id, failed.is_error, failed.error, failed.quota_exhausted], ["7187", true, 'Execution failed: Model "x" is not available.', false]);
  const quota = summarizeCopilotTurn(lines(started("7188"), { type: "session.error", data: { errorType: "quota", message: "You have reached your monthly limit of premium requests." } }, result("7188", 1)));
  assert.deepEqual([quota.is_error, quota.quota_exhausted], [true, true]);
  assert.equal(summarizeCopilotTurn(lines(started("7189"))).error, "no result event in the transcript");
});

test("[REQ-idd-031] a Copilot turn feeds the prompt on stdin, counts its own turn end and never reviews each action", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ospec-auto-copilot-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const calls = [];
  const run = async (options) => {
    calls.push(options);
    fs.writeFileSync(options.stdoutPath, lines(started("e13d"), message("ok"), usage(207_156_000), result("e13d")));
    return { code: 0, error: null, timedOut: false, aborted: false, stderr: "", wall_ms: 3 };
  };
  const host = createCopilotHost({ baseEnv: { PATH: "/bin", HOME: "/home/u", OSPEC_AUTO_RUN: "auto-1" }, resolveExecutable: () => "/usr/bin/copilot", run });
  const turn = await host.turn({ cwd: dir, prompt: "Fix it.", sessionId: "e13d", transcriptPath: path.join(dir, "t", "1.jsonl"), budgetCredits: 30 });
  assert.deepEqual([turn.session_id, turn.session_credits, turn.is_error], ["e13d", 0.207156, false]);
  assert.deepEqual([calls[0].executable, calls[0].input, calls[0].env, calls[0].args.slice(-4)], ["/usr/bin/copilot", "Fix it.", { PATH: "/bin", HOME: "/home/u" }, ["--resume", "e13d", "--max-ai-credits", "30"]]);
  assert.equal(calls[0].args[calls[0].args.indexOf("--add-dir") + 1], path.join("/home/u", ".copilot"));
  // COPILOT_HOME moves Copilot's home, and with it ospec's install.
  await createCopilotHost({ baseEnv: { HOME: "/home/u", COPILOT_HOME: "/opt/copilot" }, resolveExecutable: () => "copilot", run }).turn({ cwd: dir, prompt: "x", transcriptPath: path.join(dir, "2.jsonl") });
  assert.equal(calls[1].args[calls[1].args.indexOf("--add-dir") + 1], "/opt/copilot");
  assert.deepEqual([host.name, host.spend, host.reportsCost, host.reviewsActions, host.countsTurnEnds, host.resumeCommand("e13d")], ["github-copilot", "credits", false, false, false, "copilot --resume e13d"]);
});
