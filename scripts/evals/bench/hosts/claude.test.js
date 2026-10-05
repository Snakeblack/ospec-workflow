"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { benchEnv, createClaudeHost, resolveClaudeExecutable, turnArgs } = require("./claude.js");

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "bench-host-"));
}

// A stand-in for claude.exe: echoes its argv and stdin into a stream-json
// result, or a persona reply when called with --json-schema.
function fakeClaude(dir, { exitCode = 0 } = {}) {
  const script = path.join(dir, "fake-claude.js");
  fs.writeFileSync(script, `
    let input = "";
    process.stdin.on("data", (chunk) => { input += chunk; });
    process.stdin.on("end", () => {
      const args = process.argv.slice(2);
      const result = {
        type: "result", subtype: "success", is_error: false, session_id: "s-" + (args.includes("--resume") ? "resumed" : "new"),
        result: JSON.stringify({ args, input, config: process.env.CLAUDE_CONFIG_DIR, nested: process.env.CLAUDECODE || null }),
        duration_ms: 5, num_turns: 1, total_cost_usd: 0.01,
        modelUsage: { m: { inputTokens: 1, outputTokens: 2, cacheReadInputTokens: 3, cacheCreationInputTokens: 4 } },
      };
      if (args.includes("--json-schema")) {
        result.structured_output = { kind: "question", answer: "Media.", facts_disclosed: ["F1"], deviates_from_recommendation: false };
        process.stdout.write(JSON.stringify(result));
      } else {
        process.stdout.write(JSON.stringify({ type: "system", subtype: "init", session_id: result.session_id }) + "\\n" + JSON.stringify(result) + "\\n");
      }
      process.exitCode = ${exitCode};
    });
  `);
  return script;
}

test("turnArgs runs headless with the bench plugin, no MCP, and resumes by session", () => {
  const args = turnArgs({ model: "claude-sonnet-5-5", pluginDir: "/p", sessionId: null });
  assert.deepEqual(args.slice(0, 1), ["-p"]);
  for (const flag of ["--output-format", "--verbose", "--strict-mcp-config", "--plugin-dir", "--permission-mode"]) assert.ok(args.includes(flag), flag);
  assert.ok(!args.includes("--resume"));
  assert.ok(!args.includes("--effort"));
  const resumed = turnArgs({ model: "m", pluginDir: "/p", sessionId: "abc", effort: "high" });
  assert.equal(resumed[resumed.indexOf("--resume") + 1], "abc");
  assert.equal(resumed[resumed.indexOf("--effort") + 1], "high");
});

test("benchEnv isolates the bench configuration from the calling session", () => {
  const env = benchEnv({
    PATH: "x",
    CLAUDECODE: "1",
    CLAUDE_CODE_ENTRYPOINT: "cli",
    DISABLE_AGENT_SHIELD: "1",
    ANTHROPIC_API_KEY: "x",
    HOME: "h",
  }, "/bench-config");
  assert.equal(env.CLAUDE_CONFIG_DIR, "/bench-config");
  assert.equal(env.CLAUDE_CODE_DISABLE_AUTO_MEMORY, "1");
  assert.equal(env.PATH, "x");
  assert.equal(env.HOME, "h");
  for (const key of ["CLAUDECODE", "CLAUDE_CODE_ENTRYPOINT", "DISABLE_AGENT_SHIELD", "ANTHROPIC_API_KEY"]) assert.equal(env[key], undefined, key);
});

test("resolveClaudeExecutable skips the npm .cmd shim for the native binary", () => {
  const dir = tempDir();
  const native = path.join(dir, "node_modules", "@anthropic-ai", "claude-code", "bin", "claude.exe");
  fs.mkdirSync(path.dirname(native), { recursive: true });
  fs.writeFileSync(native, "");
  assert.equal(resolveClaudeExecutable(path.join(dir, "claude.cmd")), native);
  assert.equal(resolveClaudeExecutable("/usr/local/bin/claude"), "/usr/local/bin/claude");
  assert.throws(() => resolveClaudeExecutable(path.join(tempDir(), "claude.cmd")), /native binary/);
});

test("a turn writes its transcript, sends the prompt on stdin, and summarizes it", async () => {
  const dir = tempDir();
  const host = createClaudeHost({
    executable: process.execPath,
    prefixArgs: [fakeClaude(dir)],
    configDir: path.join(dir, "config"),
    pluginDir: path.join(dir, "plugin"),
    model: "claude-sonnet-5-5",
    personaModel: "claude-haiku-4-5",
    personaDir: dir,
    baseEnv: { ...process.env, CLAUDECODE: "1" },
  });
  const transcriptPath = path.join(dir, "run", "change-01.jsonl");
  const turn = await host.turn({ cwd: dir, prompt: "/ospec-workflow:sdd-new \"hola\"", sessionId: null, transcriptPath });
  assert.equal(turn.is_error, false);
  assert.equal(turn.session_id, "s-new");
  const echoed = JSON.parse(turn.final_text);
  assert.equal(echoed.input, "/ospec-workflow:sdd-new \"hola\"");
  assert.equal(echoed.config, path.join(dir, "config"));
  assert.equal(echoed.nested, null);
  assert.ok(fs.readFileSync(transcriptPath, "utf8").includes("\"type\":\"result\""));
  assert.ok(turn.wall_ms >= 0);
  assert.deepEqual(turn.usage, { input: 1, output: 2, cache_read: 3, cache_creation: 4 });

  const resumed = await host.turn({ cwd: dir, prompt: "sigue", sessionId: "s-new", transcriptPath: path.join(dir, "run", "change-02.jsonl") });
  assert.equal(resumed.session_id, "s-resumed");
});

test("a turn whose process fails is an error turn", async () => {
  const dir = tempDir();
  const script = path.join(dir, "boom.js");
  fs.writeFileSync(script, "process.stderr.write('boom'); process.exitCode = 3;");
  const host = createClaudeHost({ executable: process.execPath, prefixArgs: [script], configDir: dir, pluginDir: dir, model: "m", personaModel: "p", personaDir: dir });
  const turn = await host.turn({ cwd: dir, prompt: "x", sessionId: null, transcriptPath: path.join(dir, "t.jsonl") });
  assert.equal(turn.is_error, true);
  assert.match(turn.error, /exit 3.*boom/);
});

test("the persona answers through structured output with the scenario's facts", async () => {
  const dir = tempDir();
  const host = createClaudeHost({
    executable: process.execPath,
    prefixArgs: [fakeClaude(dir)],
    configDir: dir,
    pluginDir: dir,
    model: "m",
    personaModel: "claude-haiku-4-5",
    personaDir: dir,
  });
  const scenario = { brief: "b", facts: [{ id: "F1", text: "media" }] };
  const { reply, usage, cost_usd: cost, error } = await host.persona({ scenario, goal: "archivado", message: "¿Prioridad?" });
  assert.equal(error, null);
  assert.deepEqual(reply.facts_disclosed, ["F1"]);
  assert.equal(reply.kind, "question");
  assert.equal(cost, 0.01);
  assert.equal(usage.output, 2);
});

test("a persona that keeps failing falls back to asking the agent to continue", async () => {
  const dir = tempDir();
  const script = path.join(dir, "silent.js");
  fs.writeFileSync(script, "process.stdout.write('not json');");
  const host = createClaudeHost({ executable: process.execPath, prefixArgs: [script], configDir: dir, pluginDir: dir, model: "m", personaModel: "p", personaDir: dir });
  const { reply, error } = await host.persona({ scenario: { brief: "b", facts: [] }, goal: "g", message: "m" });
  assert.ok(error);
  assert.equal(reply.kind, "stopped");
  assert.deepEqual(reply.facts_disclosed, []);
});
