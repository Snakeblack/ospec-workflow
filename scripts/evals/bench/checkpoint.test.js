"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { MARGINS_PATH, evaluateCheckpoint, loadMargins, renderCheckpoint, validateMargins } = require("./checkpoint.js");

const margins = {
  schema_version: 2,
  margins_version: "test-margins",
  declared_at: "2026-10-06",
  baseline_arm: "sdd",
  candidate_arm: "idd",
  repetitions: 1,
  escaped_defects: { max_mean_delta: 0 },
  tokens: { max_total_ratio: 0.9 },
};
const margins3 = { ...margins, repetitions: 3 };

function record(arm, runs, overrides = {}) {
  return {
    schema_version: 2,
    record_id: `${arm}-1`,
    arm,
    recorded_at: "2026-10-06T10:00:00Z",
    host: { name: "claude-code", cli_version: "2.1.286", model: "claude-sonnet-5-5", effort: null, plugin_version: "2.103.0", plugin_digest: arm.repeat(64).slice(0, 64) },
    persona: { model: "claude-haiku-4-5-20251001" },
    scenarios_digest: "b".repeat(64),
    harness_digest: "f".repeat(64),
    limits: {},
    repetitions: Math.max(1, ...runs.map((entry) => entry.repetition)),
    runs,
    ...overrides,
  };
}

function run(scenarioId, tokens, failing = [], status = "complete", repetition = 1) {
  const checks = ["a", "b", "c"].map((id) => ({ id, kind: "fact", fact: "F1", pass: !failing.includes(id) }));
  return {
    scenario_id: scenarioId,
    repetition,
    profile: scenarioId,
    status,
    reason: status === "complete" ? null : "max-cost",
    metrics: { tokens_total: tokens, cost_usd: 1, duration_ms: 1, questions: 1, decision_changing_questions: 0, interventions: 1 },
    checks,
    escaped_defects: failing.length,
  };
}

const reps = (scenarioId, specs) => specs.map(([tokens, failing = []], index) => run(scenarioId, tokens, failing, "complete", index + 1));

test("the committed margins load and carry a digest", () => {
  const { margins: loaded, digest } = loadMargins(MARGINS_PATH);
  assert.equal(loaded.baseline_arm, "sdd");
  assert.equal(loaded.candidate_arm, "idd");
  assert.equal(loaded.margins_version, "bench-margins-2");
  assert.equal(loaded.repetitions, 3);
  assert.match(digest, /^[a-f0-9]{64}$/);
});

test("validateMargins rejects unknown or missing margins", () => {
  assert.throws(() => validateMargins({ ...margins, extra: 1 }), /exactly/);
  assert.throws(() => validateMargins({ ...margins, schema_version: 1 }), /schema_version/);
  assert.throws(() => validateMargins({ ...margins, repetitions: 0 }), /repetitions/);
  assert.throws(() => validateMargins({ ...margins, tokens: { max_total_ratio: 0 } }), /max_total_ratio/);
  assert.throws(() => validateMargins({ ...margins, escaped_defects: { max_mean_delta: -1 } }), /max_mean_delta/);
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

test("with repetitions the margins apply to per-scenario means", () => {
  const baseline = record("sdd", [...reps("cli-local", [[900], [1000], [1100]]), ...reps("bugfix", [[1000, ["a"]], [1000], [1000]])]);
  const candidate = record("idd", [...reps("cli-local", [[600], [800], [700]]), ...reps("bugfix", [[800, ["a"]], [800], [800]])]);
  const result = evaluateCheckpoint({ baseline, candidate, margins: margins3 });
  assert.equal(result.decision, "continue", JSON.stringify(result.reasons));
  const cli = result.per_scenario.find((row) => row.scenario_id === "cli-local");
  assert.equal(cli.baseline.tokens_total, 1000);
  assert.equal(cli.candidate.tokens_total, 700);
  assert.equal(result.totals.tokens_ratio, 0.75);
  assert.equal(result.totals.escaped_delta, 0);
});

test("a check the baseline always passes is a veto when the candidate fails it in any repetition", () => {
  const baseline = record("sdd", [...reps("cli-local", [[1000], [1000], [1000]])]);
  const candidate = record("idd", [...reps("cli-local", [[500], [500, ["b"]], [500]])]);
  const result = evaluateCheckpoint({ baseline, candidate, margins: margins3 });
  assert.deepEqual(result.reasons.map((reason) => reason.code), ["check-regression", "escaped-defects"]);
  assert.deepEqual(result.reasons[0].detail, ["cli-local/b"]);

  // A check the baseline already fails in one repetition is not a regression;
  // the escaped-defect means still count it.
  const flaky = record("sdd", [...reps("cli-local", [[1000, ["b"]], [1000], [1000]])]);
  const same = evaluateCheckpoint({ baseline: flaky, candidate, margins: margins3 });
  assert.equal(same.decision, "continue", JSON.stringify(same.reasons));
});

test("a missing repetition or a repetition count other than the margins' is not judgeable", () => {
  const baseline = record("sdd", reps("cli-local", [[1000], [1000], [1000]]));
  const missing = evaluateCheckpoint({ baseline, candidate: record("idd", reps("cli-local", [[500], [500]]), { repetitions: 3 }), margins: margins3 });
  assert.ok(missing.reasons.some((reason) => reason.code === "incomplete-run" && reason.detail.includes("idd cli-local#3: missing")));
  const single = evaluateCheckpoint({ baseline, candidate: record("idd", reps("cli-local", [[500]])), margins: margins3 });
  assert.ok(single.reasons.some((reason) => reason.code === "not-comparable"));
});

test("a run that was not judged blocks the decision instead of counting escapes", () => {
  const baseline = record("sdd", [run("cli-local", 1000)]);
  const unjudged = { ...run("cli-local", 0, [], "incomplete"), reason: "setup-incomplete", checks: [], escaped_defects: 0 };
  const result = evaluateCheckpoint({ baseline, candidate: record("idd", [unjudged]), margins });
  assert.ok(result.reasons.some((reason) => reason.code === "incomplete-run"));
  assert.ok(!result.reasons.some((reason) => reason.code === "check-regression"));
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
