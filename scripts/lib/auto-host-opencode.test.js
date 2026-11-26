"use strict";

// The OpenCode host of an automatic run (E1.110, REQ-idd-031).

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { createOpencodeHost, opencodeTurnArgs, summarizeOpencodeTurn } = require("./auto-host-opencode.js");

const lines = (...events) => events.map((event) => JSON.stringify(event)).join("\n");
const step = (sessionID) => ({ type: "step_start", sessionID, part: { type: "step-start" } });
const text = (sessionID, value) => ({ type: "text", sessionID, part: { type: "text", text: value } });

test("[REQ-idd-031] an OpenCode turn runs opencode run on its own server with --auto and resumes its session", () => {
  assert.deepEqual(opencodeTurnArgs(), ["run", "--standalone", "--format", "json", "--auto"]);
  assert.deepEqual(opencodeTurnArgs({ model: "opencode/big-pickle", sessionId: "ses_1" }).slice(-4), ["--model", "opencode/big-pickle", "--session", "ses_1"]);
});

test("[REQ-idd-031] OpenCode events give the session, the text of the last step and an error event as the turn's error", () => {
  const ok = summarizeOpencodeTurn(lines(step("ses_1"), text("ses_1", "Working."), { type: "step_finish", sessionID: "ses_1", part: { cost: 0.01 } }, step("ses_1"), text("ses_1", "Done.")));
  assert.deepEqual(ok, { session_id: "ses_1", final_text: "Done.", cost_usd: 0, is_error: false, quota_exhausted: false });
  const failed = summarizeOpencodeTurn(lines({ type: "error", sessionID: "ses_2", error: { type: "provider.rate-limit", message: "Rate limit exceeded" } }));
  assert.deepEqual([failed.session_id, failed.is_error, failed.error, failed.quota_exhausted], ["ses_2", true, "Rate limit exceeded", true]);
  assert.deepEqual(summarizeOpencodeTurn("").error, "no event in the transcript");
});

test("[REQ-idd-031] an OpenCode turn reads the session's cost so far from its export, and a failed export is the turn's error", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ospec-auto-opencode-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const calls = [];
  let exportCode = 0;
  const run = async (options) => {
    calls.push(options);
    if (options.args[0] === "session") {
      return { code: exportCode, error: null, timedOut: false, aborted: false, stderr: exportCode ? "no session\n" : "", stdout: JSON.stringify({ info: { cost: 0.42 } }), wall_ms: 1 };
    }
    fs.writeFileSync(options.stdoutPath, lines(step("ses_9"), text("ses_9", "ok")));
    return { code: 0, error: null, timedOut: false, aborted: false, stderr: "", wall_ms: 3 };
  };
  const host = createOpencodeHost({ baseEnv: { PATH: "/bin", OSPEC_AUTO_RUN: "auto-1" }, resolveExecutable: () => "/usr/bin/opencode", run });
  const turn = await host.turn({ cwd: dir, prompt: "Fix it.", sessionId: "ses_9", transcriptPath: path.join(dir, "t", "1.jsonl") });
  assert.deepEqual([turn.session_id, turn.cost_usd, turn.is_error], ["ses_9", 0.42, false]);
  assert.deepEqual([calls[0].input, calls[0].env, calls[1].args], ["Fix it.", { PATH: "/bin" }, ["session", "export", "--standalone", "ses_9"]]);
  assert.deepEqual([host.name, host.reportsCost, host.reviewsActions, host.resumeCommand("ses_9")], ["opencode", true, false, "opencode --session ses_9"]);
  exportCode = 1;
  const failed = await host.turn({ cwd: dir, prompt: "x", sessionId: "ses_9", transcriptPath: path.join(dir, "2.jsonl") });
  assert.deepEqual([failed.is_error, failed.error], [true, "opencode session export failed: no session"]);
});

test("[REQ-idd-031] an OpenCode turn that exits with its error only in the events reports the exit code and that error", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ospec-auto-opencode-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const run = async (options) => {
    if (options.args[0] === "session") return { code: 0, error: null, timedOut: false, aborted: false, stderr: "", stdout: JSON.stringify({ info: { cost: 0 } }), wall_ms: 1 };
    fs.writeFileSync(options.stdoutPath, lines(step("ses_3"), { type: "error", sessionID: "ses_3", error: { message: "Free usage limit reached." } }));
    return { code: 1, error: null, timedOut: false, aborted: false, stderr: "", wall_ms: 2 };
  };
  const turn = await createOpencodeHost({ baseEnv: {}, resolveExecutable: () => "opencode", run }).turn({ cwd: dir, prompt: "x", sessionId: "ses_3", transcriptPath: path.join(dir, "1.jsonl") });
  assert.deepEqual([turn.is_error, turn.error, turn.quota_exhausted], [true, "exit 1 (Free usage limit reached.)", true]);
});
