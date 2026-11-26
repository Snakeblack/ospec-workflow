"use strict";

// The Cursor host of an automatic run (E1.110, REQ-idd-031).

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { createCursorHost, cursorTurnArgs, summarizeCursorTurn } = require("./auto-host-cursor.js");

const lines = (...events) => events.map((event) => JSON.stringify(event)).join("\n");

test("[REQ-idd-031] a Cursor turn runs cursor-agent -p with auto-review on a trusted workspace and resumes its chat", () => {
  assert.deepEqual(cursorTurnArgs(), ["-p", "--output-format", "stream-json", "--trust", "--auto-review"]);
  assert.deepEqual(cursorTurnArgs({ model: "auto", sessionId: "c-1" }).slice(-4), ["--model", "auto", "--resume", "c-1"]);
});

test("[REQ-idd-031] a Cursor transcript gives the chat, the reply and the turn's tokens, with no cost", () => {
  const ok = summarizeCursorTurn(lines(
    { type: "system", subtype: "init", session_id: "c-1" },
    { type: "result", subtype: "success", is_error: false, result: "Done.", session_id: "c-1", usage: { inputTokens: 158, outputTokens: 26, cacheReadTokens: 15744, cacheWriteTokens: 2, reasoningTokens: 25 } },
  ));
  assert.deepEqual(ok, { session_id: "c-1", final_text: "Done.", cost_usd: 0, tokens: 15930, is_error: false, quota_exhausted: false });
  const quota = summarizeCursorTurn(lines({ type: "result", subtype: "error", is_error: true, result: "You've hit your usage limit", session_id: "c-1" }));
  assert.deepEqual([quota.is_error, quota.quota_exhausted, quota.error], [true, true, "You've hit your usage limit"]);
  const none = summarizeCursorTurn(lines({ type: "system", subtype: "init", session_id: "c-2" }));
  assert.deepEqual([none.session_id, none.is_error, none.error], ["c-2", true, "no result event in the transcript"]);
});

test("[REQ-idd-031] a Cursor turn takes the prompt on stdin, without the run's mark, and reports a failed process", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ospec-auto-cursor-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const calls = [];
  const run = async (options) => {
    calls.push(options);
    fs.writeFileSync(options.stdoutPath, lines({ type: "result", is_error: false, result: "ok", session_id: "c-9", usage: { inputTokens: 10 } }));
    return { code: calls.length === 1 ? 0 : 1, error: null, timedOut: false, aborted: false, stderr: "Not authenticated\n", wall_ms: 3 };
  };
  const host = createCursorHost({ baseEnv: { PATH: "/bin", OSPEC_AUTO_RUN: "auto-1" }, resolveExecutable: () => "/usr/bin/cursor-agent", run });
  const turn = await host.turn({ cwd: dir, prompt: "Fix it.", sessionId: "c-9", transcriptPath: path.join(dir, "t", "1.jsonl") });
  assert.deepEqual([turn.session_id, turn.tokens, turn.is_error], ["c-9", 10, false]);
  assert.deepEqual([calls[0].executable, calls[0].input, calls[0].env], ["/usr/bin/cursor-agent", "Fix it.", { PATH: "/bin" }]);
  assert.deepEqual([host.name, host.reportsCost, host.reviewsActions, host.countsTurnEnds, host.resumeCommand("c-9")], ["cursor", false, true, false, "cursor-agent --resume c-9"]);
  const failed = await host.turn({ cwd: dir, prompt: "x", transcriptPath: path.join(dir, "2.jsonl") });
  assert.deepEqual([failed.is_error, failed.error], [true, "exit 1: Not authenticated"]);
});
