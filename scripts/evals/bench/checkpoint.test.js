"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { MARGINS_PATH, evaluateCheckpoint, loadMargins, renderCheckpoint, validateMargins } = require("./checkpoint.js");

const margins = {
  schema_version: 1,
  margins_version: "test-margins",
  declared_at: "2026-10-06",
  baseline_arm: "sdd",
  candidate_arm: "idd",
  escaped_defects: { max_total_delta: 0 },
  tokens: { max_total_ratio: 0.9 },
};

function record(arm, runs, overrides = {}) {
  return {
    schema_version: 1,
    record_id: `${arm}-1`,
    arm,
    recorded_at: "2026-10-06T10:00:00Z",
    host: { name: "claude-code", cli_version: "2.1.286", model: "claude-sonnet-5-5", effort: null, plugin_version: "2.103.0", plugin_digest: arm.repeat(64).slice(0, 64) },
    persona: { model: "claude-haiku-4-5-20251001" },
    scenarios_digest: "b".repeat(64),
    harness_digest: "f".repeat(64),
    limits: {},
    runs,
    ...overrides,
  };
}

function run(scenarioId, tokens, failing = [], status = "complete") {
  const checks = ["a", "b", "c"].map((id) => ({ id, kind: "fact", fact: "F1", pass: !failing.includes(id) }));
  return {
    scenario_id: scenarioId,
    profile: scenarioId,
    status,
    reason: status === "complete" ? null : "max-cost",
    metrics: { tokens_total: tokens, cost_usd: 1, duration_ms: 1, questions: 1, decision_changing_questions: 0, interventions: 1 },
    checks,
    escaped_defects: failing.length,
  };
}

test("the committed margins load and carry a digest", () => {
  const { margins: loaded, digest } = loadMargins(MARGINS_PATH);
  assert.equal(loaded.baseline_arm, "sdd");
  assert.equal(loaded.candidate_arm, "idd");
  assert.match(digest, /^[a-f0-9]{64}$/);
});

test("validateMargins rejects unknown or missing margins", () => {
  assert.throws(() => validateMargins({ ...margins, extra: 1 }), /exactly/);
  assert.throws(() => validateMargins({ ...margins, tokens: { max_total_ratio: 0 } }), /max_total_ratio/);
  assert.throws(() => validateMargins({ ...margins, escaped_defects: { max_total_delta: -1 } }), /max_total_delta/);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bench-margins-"));
  fs.writeFileSync(path.join(dir, "m.json"), "{");
  assert.throws(() => loadMargins(path.join(dir, "m.json")), /could not read/);
});

test("fewer tokens and no extra escapes continue", () => {
  const baseline = record("sdd", [run("cli-local", 1000, ["a"]), run("bugfix", 1000)]);
  const candidate = record("idd", [run("cli-local", 700, ["a"]), run("bugfix", 800)]);
  const result = evaluateCheckpoint({ baseline, candidate, margins });
  assert.equal(result.decision, "continue");
  assert.deepEqual(result.reasons, []);
  assert.equal(result.totals.tokens_ratio, 0.75);
  assert.equal(result.totals.escaped_delta, 0);
  assert.equal(result.per_scenario.length, 2);
});

test("a check the baseline passes and the candidate fails is a veto even if totals improve", () => {
  const baseline = record("sdd", [run("cli-local", 1000, ["a", "b"]), run("bugfix", 1000)]);
  const candidate = record("idd", [run("cli-local", 500), run("bugfix", 500, ["c"])]);
  const result = evaluateCheckpoint({ baseline, candidate, margins });
  assert.equal(result.decision, "revise");
  assert.deepEqual(result.reasons.map((reason) => reason.code), ["check-regression"]);
  assert.deepEqual(result.reasons[0].detail, ["bugfix/c"]);
});

test("more escaped defects or too many tokens revise", () => {
  const baseline = record("sdd", [run("cli-local", 1000, ["a"])]);
  const worse = evaluateCheckpoint({ baseline, candidate: record("idd", [run("cli-local", 950, ["a", "b"])]), margins });
  assert.deepEqual(worse.reasons.map((reason) => reason.code).sort(), ["check-regression", "escaped-defects", "tokens"]);
});

test("incomplete runs and incomparable records revise", () => {
  const baseline = record("sdd", [run("cli-local", 1000)]);
  const incomplete = evaluateCheckpoint({ baseline, candidate: record("idd", [run("cli-local", 500, [], "incomplete")]), margins });
  assert.ok(incomplete.reasons.some((reason) => reason.code === "incomplete-run"));
  const otherModel = record("idd", [run("cli-local", 500)], { host: { ...baseline.host, model: "claude-opus-5-5" } });
  assert.ok(evaluateCheckpoint({ baseline, candidate: otherModel, margins }).reasons.some((reason) => reason.code === "not-comparable"));
  const otherScenarios = record("idd", [run("bugfix", 500)]);
  assert.ok(evaluateCheckpoint({ baseline, candidate: otherScenarios, margins }).reasons.some((reason) => reason.code === "not-comparable"));
  const otherHarness = record("idd", [run("cli-local", 500)], { harness_digest: "e".repeat(64) });
  assert.ok(evaluateCheckpoint({ baseline, candidate: otherHarness, margins }).reasons.some((reason) => reason.code === "not-comparable"));
  const wrongArm = record("sdd", [run("cli-local", 500)]);
  assert.ok(evaluateCheckpoint({ baseline, candidate: wrongArm, margins }).reasons.some((reason) => reason.code === "not-comparable"));
});

test("renderCheckpoint states the decision and every reason", () => {
  const baseline = record("sdd", [run("cli-local", 1000)]);
  const result = evaluateCheckpoint({ baseline, candidate: record("idd", [run("cli-local", 990)]), margins });
  const text = renderCheckpoint(result);
  assert.match(text, /revise/);
  assert.match(text, /tokens/);
  assert.match(text, /test-margins/);
});
