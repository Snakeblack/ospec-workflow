"use strict";

// The Codex host of an automatic run (E1.110, REQ-idd-031).

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { codexTurnArgs, createCodexHost, summarizeCodexTurn } = require("./auto-host-codex.js");

const lines = (...events) => events.map((event) => JSON.stringify(event)).join("\n");
const started = (id) => ({ type: "thread.started", thread_id: id });
const message = (text) => ({ type: "item.completed", item: { type: "agent_message", text } });
const completed = (usage) => ({ type: "turn.completed", usage });
const apiError = (status, code, text) => JSON.stringify({ type: "error", status, error: { type: "invalid_request_error", message: text, code } });

test("[REQ-idd-031] a Codex turn runs codex exec with --approve-for-me and resumes its session with the options before resume", () => {
  assert.deepEqual(codexTurnArgs(), ["exec", "--json", "--approve-for-me", "-"]);
  assert.deepEqual(codexTurnArgs({ model: "gpt-5.5-codex", sessionId: "01a2" }), ["exec", "--json", "--approve-for-me", "--model", "gpt-5.5-codex", "resume", "01a2", "-"]);
});

test("[REQ-idd-031] Codex events give the session, the last message and the turn's tokens, cached input counted once", () => {
  const ok = summarizeCodexTurn(lines(started("01a2"), { type: "turn.started" }, message("Working."), message("Done."), completed({ input_tokens: 64263, cached_input_tokens: 41216, output_tokens: 60, reasoning_output_tokens: 0 })));
  assert.deepEqual(ok, { session_id: "01a2", final_text: "Done.", cost_usd: 0, tokens: 64323, is_error: false, quota_exhausted: false });
  // A warning item, or an error event the turn recovered from, is no failure.
  const recovered = summarizeCodexTurn(lines(started("01a3"), { type: "item.completed", item: { type: "error", message: "Model metadata not found" } }, { type: "error", message: "Reconnecting... 1/5" }, message("ok"), completed({ input_tokens: 10, output_tokens: 2 })));
  assert.deepEqual([recovered.is_error, recovered.tokens], [false, 12]);
});

test("[REQ-idd-031] a failed Codex turn reports the API's message, and a spent usage limit as the quota", () => {
  const failed = summarizeCodexTurn(lines(started("01a4"), { type: "turn.started" }, { type: "turn.failed", error: { message: apiError(400, "model_not_found", "The 'x' model is not supported when using Codex with a ChatGPT account.") } }));
  assert.deepEqual([failed.session_id, failed.is_error, failed.error, failed.quota_exhausted], ["01a4", true, "The 'x' model is not supported when using Codex with a ChatGPT account.", false]);
  const quota = summarizeCodexTurn(lines(started("01a5"), { type: "turn.failed", error: { message: apiError(429, "usage_limit_reached", "The usage limit has been reached") } }));
  assert.deepEqual([quota.is_error, quota.quota_exhausted], [true, true]);
  const plain = summarizeCodexTurn(lines(started("01a6"), { type: "turn.failed", error: { message: "stream disconnected" } }));
  assert.equal(plain.error, "stream disconnected");
  const cut = summarizeCodexTurn(lines(started("01a7"), { type: "error", message: "Reconnecting... 5/5" }));
  assert.deepEqual([cut.is_error, cut.error], [true, "Reconnecting... 5/5"]);
  assert.equal(summarizeCodexTurn("").error, "no turn.completed event in the transcript");
});

test("[REQ-idd-031] a Codex turn feeds the prompt on stdin, counts its own turn end and leaves Codex's log lines out of a failure", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ospec-auto-codex-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const calls = [];
  let outcome = { code: 0, stderr: "" };
  let transcript = lines(started("01a8"), message("ok"), completed({ input_tokens: 5, output_tokens: 1 }));
  const run = async (options) => {
    calls.push(options);
    fs.writeFileSync(options.stdoutPath, transcript);
    return { error: null, timedOut: false, aborted: false, wall_ms: 3, ...outcome };
  };
  const host = createCodexHost({ baseEnv: { PATH: "/bin", OSPEC_AUTO_RUN: "auto-1" }, resolveExecutable: () => "/usr/bin/codex", run });
  const turn = await host.turn({ cwd: dir, prompt: "Fix it.", sessionId: "01a8", transcriptPath: path.join(dir, "t", "1.jsonl") });
  assert.deepEqual([turn.session_id, turn.tokens, turn.is_error], ["01a8", 6, false]);
  assert.deepEqual([calls[0].executable, calls[0].input, calls[0].env, calls[0].args.slice(-3)], ["/usr/bin/codex", "Fix it.", { PATH: "/bin" }, ["resume", "01a8", "-"]]);
  assert.deepEqual([host.name, host.reportsCost, host.reviewsActions, host.countsTurnEnds, host.resumeCommand("01a8")], ["codex", false, true, false, "codex resume 01a8"]);

  outcome = { code: 1, stderr: '2026-11-26T20:30:53.290398Z ERROR rmcp::transport::worker: worker quit with fatal: HTTP 403: <!DOCTYPE HTML>\n' };
  transcript = lines(started("01a9"), { type: "turn.failed", error: { message: apiError(400, "model_not_found", "Unsupported model.") } });
  const failed = await host.turn({ cwd: dir, prompt: "x", transcriptPath: path.join(dir, "2.jsonl") });
  assert.deepEqual([failed.is_error, failed.error], [true, "exit 1 (Unsupported model.)"]);
  outcome = { code: 1, stderr: "2026-11-26T20:30:53Z WARN codex_core: retrying\nError: Not logged in. Run codex login.\n" };
  transcript = "";
  const loggedOut = await host.turn({ cwd: dir, prompt: "x", transcriptPath: path.join(dir, "3.jsonl") });
  assert.equal(loggedOut.error, "exit 1: Error: Not logged in. Run codex login. (no turn.completed event in the transcript)");
});
