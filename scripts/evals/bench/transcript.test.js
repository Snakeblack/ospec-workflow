"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { addUsage, emptyUsage, summarizeTurn, tokenTotal } = require("./transcript.js");

const result = {
  type: "result",
  subtype: "success",
  is_error: false,
  session_id: "s-1",
  result: "¿Qué prioridad por defecto?",
  duration_ms: 1200,
  num_turns: 3,
  total_cost_usd: 0.5,
  usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 1, cache_creation_input_tokens: 1 },
  modelUsage: {
    "claude-sonnet-5-5": { inputTokens: 10, outputTokens: 20, cacheReadInputTokens: 300, cacheCreationInputTokens: 40, costUSD: 0.4 },
    "claude-haiku-4-5": { inputTokens: 1, outputTokens: 2, cacheReadInputTokens: 30, cacheCreationInputTokens: 4, costUSD: 0.1 },
  },
  subagent_stats: { spawned: 2 },
};

function jsonl(...events) {
  return events.map((event) => JSON.stringify(event)).join("\n");
}

test("summarizeTurn sums modelUsage across models, subagents included", () => {
  const turn = summarizeTurn(jsonl({ type: "system", subtype: "init", session_id: "s-1" }, result));
  assert.equal(turn.session_id, "s-1");
  assert.equal(turn.final_text, "¿Qué prioridad por defecto?");
  assert.deepEqual(turn.usage, { input: 11, output: 22, cache_read: 330, cache_creation: 44 });
  assert.equal(turn.cost_usd, 0.5);
  assert.equal(turn.duration_ms, 1200);
  assert.equal(turn.subagents, 2);
  assert.equal(turn.is_error, false);
  assert.match(turn.sha256, /^[a-f0-9]{64}$/);
});

test("a transcript without a result event is an error turn", () => {
  const turn = summarizeTurn(jsonl({ type: "system", subtype: "init", session_id: "s-2" }, "not json"));
  assert.equal(turn.is_error, true);
  assert.equal(turn.session_id, "s-2");
  assert.deepEqual(turn.usage, emptyUsage());
  assert.match(turn.error, /no result event/);
});

test("an error result keeps its usage and reports the error", () => {
  const turn = summarizeTurn(jsonl({ ...result, is_error: true, subtype: "error_max_turns" }));
  assert.equal(turn.is_error, true);
  assert.equal(turn.error, "error_max_turns");
  assert.equal(tokenTotal(turn.usage), 407);
});

test("a 429 result means the host's usage quota is exhausted", () => {
  const limit = { ...result, is_error: true, subtype: "success", api_error_status: 429, result: "You've hit your session limit · resets 11:20am (Europe/Madrid)" };
  const turn = summarizeTurn(jsonl(limit));
  assert.equal(turn.is_error, true);
  assert.equal(turn.quota_exhausted, true);
  assert.match(turn.error, /session limit/);
  assert.equal(summarizeTurn(jsonl({ ...result, is_error: true, subtype: "error_during_execution" })).quota_exhausted, false);
});

test("addUsage adds field by field", () => {
  assert.deepEqual(addUsage({ input: 1, output: 2, cache_read: 3, cache_creation: 4 }, { input: 1, output: 1, cache_read: 1, cache_creation: 1 }),
    { input: 2, output: 3, cache_read: 4, cache_creation: 5 });
});
