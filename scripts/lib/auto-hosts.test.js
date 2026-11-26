"use strict";

// The hosts of an automatic run (E1.108, REQ-idd-031).

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { HOSTS, claudeTurnArgs, createClaudeHost, createHost, sessionEnv, unavailableReason } = require("./auto-hosts.js");

test("[REQ-idd-031] a Claude turn runs headless in the auto permission mode and resumes its session", () => {
  assert.deepEqual(claudeTurnArgs(), ["-p", "--output-format", "stream-json", "--verbose", "--permission-mode", "auto"]);
  assert.deepEqual(claudeTurnArgs({ model: "haiku", sessionId: "s-1" }).slice(-4), ["--model", "haiku", "--resume", "s-1"]);
  assert.equal(createHost("agy"), null);
});

test("[REQ-idd-031] every host the run drives has an adapter that declares its cost and review; any other names why it cannot run", () => {
  for (const name of HOSTS) {
    const host = createHost(name, { resolveExecutable: () => name });
    assert.equal(host.name, name);
    assert.deepEqual([typeof host.reportsCost, typeof host.reviewsActions, typeof host.resumeCommand("s-1")], ["boolean", "boolean", "string"]);
    assert.equal(unavailableReason(name), null);
  }
  assert.match(unavailableReason("vscode"), /no headless mode/);
  assert.match(unavailableReason("agy"), /not a host ospec knows \(claude, cursor/);
});

test("[REQ-idd-031] the session never gets the run's mark nor the markers of the session that launched the conductor", () => {
  const env = sessionEnv({
    PATH: "/bin",
    OSPEC_AUTO_RUN: "auto-1",
    CLAUDECODE: "1",
    CLAUDE_PID: "7",
    CLAUDE_EFFORT: "high",
    CLAUDE_CODE_ENTRYPOINT: "cli",
    CLAUDE_CODE_SESSION_ID: "parent",
    CLAUDE_CODE_USE_BEDROCK: "1",
    CLAUDE_CONFIG_DIR: "/home/u/.claude",
    ANTHROPIC_API_KEY: "key",
  });
  assert.deepEqual(env, { PATH: "/bin", CLAUDE_CODE_USE_BEDROCK: "1", CLAUDE_CONFIG_DIR: "/home/u/.claude", ANTHROPIC_API_KEY: "key" });
});

test("[REQ-idd-031] a Claude turn reports its transcript, and a stopped or failed process as an error", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ospec-auto-host-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const result = { type: "result", subtype: "success", is_error: false, session_id: "s-9", result: "done", total_cost_usd: 0.25, num_turns: 3, modelUsage: {} };
  const calls = [];
  const fake = (outcome) => async (options) => {
    calls.push(options);
    fs.writeFileSync(options.stdoutPath, `${JSON.stringify(result)}\n`);
    return { code: 0, error: null, timedOut: false, aborted: false, stderr: "", wall_ms: 5, ...outcome };
  };
  const host = createClaudeHost({ model: "haiku", baseEnv: { PATH: "/bin", OSPEC_AUTO_RUN: "auto-1" }, resolveExecutable: () => "/usr/bin/claude", run: fake({}) });
  const turn = await host.turn({ cwd: dir, prompt: "Fix it.", sessionId: "s-9", transcriptPath: path.join(dir, "t", "1.jsonl") });
  assert.deepEqual([turn.session_id, turn.cost_usd, turn.is_error, turn.aborted], ["s-9", 0.25, false, false]);
  assert.deepEqual([calls[0].executable, calls[0].input, calls[0].env], ["/usr/bin/claude", "Fix it.", { PATH: "/bin" }]);
  assert.ok(calls[0].args.includes("--resume"));
  assert.equal(host.resumeCommand("s-9"), "claude --resume s-9");

  const stopped = await createClaudeHost({ resolveExecutable: () => "claude", run: fake({ aborted: true, code: null }) }).turn({ cwd: dir, prompt: "x", transcriptPath: path.join(dir, "2.jsonl") });
  assert.deepEqual([stopped.is_error, stopped.error, stopped.aborted], [true, "stopped", true]);
  const failed = await createClaudeHost({ resolveExecutable: () => "claude", run: fake({ code: 1, stderr: "not logged in\n" }) }).turn({ cwd: dir, prompt: "x", transcriptPath: path.join(dir, "3.jsonl") });
  assert.deepEqual([failed.is_error, failed.error], [true, "exit 1: not logged in"]);
  assert.throws(() => createClaudeHost({ resolveExecutable: () => { throw new Error("claude CLI not found on PATH"); } }).resolve(), /not found/);
});
