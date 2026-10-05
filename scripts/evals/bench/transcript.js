"use strict";

// Reads one headless Claude Code turn (`claude -p --output-format stream-json`).
// Usage comes from the final `result` event's `modelUsage`, which adds the
// subagents' consumption to the main thread's (`usage` covers the main thread
// only).

const crypto = require("node:crypto");

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
    sha256,
  };
  if (turn.is_error) turn.error = result.subtype || "error";
  return turn;
}

module.exports = { addUsage, emptyUsage, parseEvents, summarizeTurn, tokenTotal };
