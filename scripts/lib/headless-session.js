"use strict";

// One headless Claude Code turn (`claude -p --output-format stream-json`), as
// the automatic run of `ospec auto` and the bench drive it: the process that
// runs it, and what its transcript says. Usage comes from the final `result`
// event's `modelUsage`, which adds the subagents' consumption to the main
// thread's (`usage` covers the main thread only).

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

const { resolveClaudeBin } = require("./claude-bin.js");

const STDERR_TAIL = 2000;

const USAGE_KEYS = Object.freeze({
  input: "inputTokens",
  output: "outputTokens",
  cache_read: "cacheReadInputTokens",
  cache_creation: "cacheCreationInputTokens",
});

function emptyUsage() {
  return { input: 0, output: 0, cache_read: 0, cache_creation: 0 };
}

function addUsage(a, b) {
  return Object.fromEntries(Object.keys(USAGE_KEYS).map((key) => [key, (a[key] || 0) + (b[key] || 0)]));
}

function tokenTotal(usage) {
  return Object.keys(USAGE_KEYS).reduce((sum, key) => sum + (usage[key] || 0), 0);
}

function parseEvents(text) {
  return String(text).split("\n").flatMap((line) => {
    try {
      const event = JSON.parse(line);
      return event && typeof event === "object" ? [event] : [];
    } catch {
      return [];
    }
  });
}

/**
 * @param {string|Buffer} bytes The raw stream-json transcript of one turn.
 */
function summarizeTurn(bytes) {
  const events = parseEvents(bytes);
  const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
  const result = [...events].reverse().find((event) => event.type === "result");
  const init = events.find((event) => event.type === "system" && event.subtype === "init");
  if (!result) {
    return {
      session_id: init ? init.session_id : null,
      final_text: "",
      usage: emptyUsage(),
      cost_usd: 0,
      duration_ms: 0,
      agent_turns: 0,
      subagents: 0,
      is_error: true,
      error: "no result event in the transcript",
      sha256,
    };
  }
  const usage = Object.values(result.modelUsage || {}).reduce((sum, model) => addUsage(sum, Object.fromEntries(
    Object.entries(USAGE_KEYS).map(([key, source]) => [key, Number(model[source]) || 0]),
  )), emptyUsage());
  const turn = {
    session_id: result.session_id || (init && init.session_id) || null,
    final_text: typeof result.result === "string" ? result.result : "",
    usage,
    cost_usd: Number(result.total_cost_usd) || 0,
    duration_ms: Number(result.duration_ms) || 0,
    agent_turns: Number(result.num_turns) || 0,
    subagents: Number(result.subagent_stats && result.subagent_stats.spawned) || 0,
    is_error: result.is_error === true,
    // HTTP 429 at the end of a turn: the account's usage quota (for example
    // a subscription session limit) is spent. Retrying only burns the next turn.
    quota_exhausted: result.is_error === true && Number(result.api_error_status) === 429,
    sha256,
  };
  if (turn.is_error) turn.error = turn.quota_exhausted ? turn.final_text || "usage quota exhausted" : result.subtype || "error";
  return turn;
}

/** The binary behind `claude`: on Windows the npm .cmd shim cannot be spawned without a shell. */
function resolveClaudeExecutable(bin = resolveClaudeBin()) {
  if (!bin) throw new Error("claude CLI not found on PATH");
  if (!/\.(cmd|bat)$/i.test(bin)) return bin;
  const native = path.join(path.dirname(bin), "node_modules", "@anthropic-ai", "claude-code", "bin", "claude.exe");
  if (!fs.existsSync(native)) throw new Error(`could not find the native binary behind ${bin}`);
  return native;
}

/**
 * Runs one host process to its end, feeding `input` on stdin. Its stdout goes
 * to `stdoutPath` when given, else into the result; its stderr keeps a tail.
 * The process is killed when `timeoutMs` passes or `signal` aborts
 * (`aborted` in the result).
 */
function runProcess({ executable, args, cwd, env, input, stdoutPath, timeoutMs, children = null, signal = null }) {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(executable, args, { cwd, env, stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    if (children) children.add(child);
    const chunks = [];
    let stderr = "";
    let timedOut = false;
    let aborted = false;
    const out = stdoutPath ? fs.createWriteStream(stdoutPath) : null;
    child.stdout.on("data", (chunk) => {
      if (out) out.write(chunk);
      else chunks.push(chunk);
    });
    child.stderr.on("data", (chunk) => { stderr = (stderr + chunk).slice(-STDERR_TAIL); });
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);
    const abort = () => {
      aborted = true;
      child.kill();
    };
    if (signal) {
      if (signal.aborted) abort();
      else signal.addEventListener("abort", abort, { once: true });
    }
    const finish = (code, error) => {
      clearTimeout(timer);
      if (signal) signal.removeEventListener("abort", abort);
      if (children) children.delete(child);
      const done = () => resolve({
        code,
        error,
        timedOut,
        aborted,
        stderr,
        stdout: out ? null : Buffer.concat(chunks).toString("utf8"),
        wall_ms: Date.now() - started,
      });
      if (out) out.end(done);
      else done();
    };
    child.on("error", (error) => finish(null, error));
    child.on("close", (code) => finish(code, null));
    child.stdin.on("error", () => {});
    child.stdin.end(input);
  });
}

module.exports = { addUsage, emptyUsage, parseEvents, resolveClaudeExecutable, runProcess, summarizeTurn, tokenTotal };
