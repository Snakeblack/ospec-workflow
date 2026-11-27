"use strict";

// The Antigravity host of an automatic run (E1.110, REQ-idd-031).

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { antigravityTurnArgs, createAntigravityHost, summarizeAntigravityTurn } = require("./auto-host-antigravity.js");

const lines = (...events) => events.map((event) => JSON.stringify(event)).join("\n");
const init = (id) => ({ event: "init", conversation_id: id, init: { cwd: "/repo" } });
const usage = { input_tokens: 19505, output_tokens: 244, thinking_tokens: 236, cache_read_tokens: 15029, total_tokens: 19749 };
const result = (id, extra = {}) => ({ event: "result", result: { conversation_id: id, status: "SUCCESS", response: "Done.\n", num_turns: 2, usage, ...extra } });

test("[REQ-idd-031] an Antigravity turn passes the prompt to --print, asks for --mode auto and resumes its conversation", () => {
  assert.deepEqual(antigravityTurnArgs({ prompt: "- Fix it." }), ["--print=- Fix it.", "--output-format", "stream-json", "--mode", "auto"]);
  assert.deepEqual(antigravityTurnArgs({ prompt: "x", model: "Gemini 3.8 Flash (High)", sessionId: "3d02" }).slice(5), ["--model", "Gemini 3.8 Flash (High)", "--conversation", "3d02"]);
});

test("[REQ-idd-031] Antigravity events give the conversation, the response and the turn's total tokens", () => {
  assert.deepEqual(summarizeAntigravityTurn(lines(init("3d02"), result("3d02"))), { session_id: "3d02", final_text: "Done.\n", cost_usd: 0, tokens: 19749, is_error: false, quota_exhausted: false });
});

test("[REQ-idd-031] a failed Antigravity turn reports the first line of its error, and an exhausted quota as such", () => {
  const failed = summarizeAntigravityTurn(lines(result("", { status: "ERROR", response: "", error: "invalid model selection (--model \"x\"): model x is not recognized\nAvailable models:\n  Gemini 4 Neon (High)", usage: { total_tokens: 0 }, finished_reason: "error" })));
  assert.deepEqual([failed.session_id, failed.is_error, failed.error, failed.quota_exhausted], [null, true, 'invalid model selection (--model "x"): model x is not recognized', false]);
  const quota = summarizeAntigravityTurn(lines(init("3d03"), result("3d03", { status: "ERROR", error: "RESOURCE_EXHAUSTED: quota exceeded for this account" })));
  assert.deepEqual([quota.session_id, quota.is_error, quota.quota_exhausted], ["3d03", true, true]);
  assert.equal(summarizeAntigravityTurn(lines(init("3d04"))).error, "no result event in the transcript");
});

test("[REQ-idd-031] an Antigravity turn sends no stdin, keeps only the error line of stderr and warns that it reviews only with --mode auto", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ospec-auto-agy-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const calls = [];
  let outcome = { code: 0, stderr: "warning: --mode auto is not available for this account; continuing in the default mode.\n" };
  let transcript = lines(init("3d02"), result("3d02"));
  const run = async (options) => {
    calls.push(options);
    fs.writeFileSync(options.stdoutPath, transcript);
    return { error: null, timedOut: false, aborted: false, wall_ms: 3, ...outcome };
  };
  const host = createAntigravityHost({ baseEnv: { PATH: "/bin", OSPEC_AUTO_RUN: "auto-1" }, resolveExecutable: () => "/usr/bin/agy", run });
  const turn = await host.turn({ cwd: dir, prompt: "Fix it.", sessionId: "3d02", transcriptPath: path.join(dir, "t", "1.jsonl") });
  assert.deepEqual([turn.session_id, turn.tokens, turn.is_error], ["3d02", 19749, false]);
  assert.deepEqual([calls[0].executable, calls[0].input, calls[0].env, calls[0].args[0]], ["/usr/bin/agy", "", { PATH: "/bin" }, "--print=Fix it."]);
  assert.deepEqual([host.name, host.reportsCost, host.reviewsActions, host.countsTurnEnds, host.resumeCommand("3d02")], ["antigravity", false, false, undefined, "agy --conversation 3d02"]);
  assert.match(host.reviewNote, /reviews each action only where the account has --mode auto/);

  outcome = { code: 1, stderr: "warning: --mode auto is not available for this account; continuing in the default mode.\nError: invalid model selection: model x is not recognized\nAvailable models:\n  Gemini 4 Neon (High)\n" };
  transcript = lines(result("", { status: "ERROR", error: "invalid model selection: model x is not recognized\nAvailable models:" }));
  const failed = await host.turn({ cwd: dir, prompt: "x", transcriptPath: path.join(dir, "2.jsonl") });
  assert.equal(failed.error, "exit 1: Error: invalid model selection: model x is not recognized (invalid model selection: model x is not recognized)");
});
