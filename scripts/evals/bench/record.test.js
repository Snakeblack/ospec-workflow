"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { assertSameIdentity, createRecord, renderReport, summarizeRecord, upsertRun, validateRecord } = require("./record.js");

const identity = {
  record_id: "sdd-baseline-1",
  arm: "sdd",
  host: { name: "claude-code", cli_version: "2.1.286", model: "claude-sonnet-5-5", effort: null, plugin_version: "2.103.0", plugin_digest: "a".repeat(64) },
  persona: { model: "claude-haiku-4-5-20251001" },
  scenarios_digest: "b".repeat(64),
  harness_digest: "f".repeat(64),
  limits: { maxAgentTurns: 30, maxSetupTurns: 6, maxCostUsd: 25 },
  repetitions: 1,
};

function run(scenarioId, profile, overrides = {}) {
  return {
    scenario_id: scenarioId,
    repetition: 1,
    profile,
    status: "complete",
    reason: null,
    setup: { status: "complete", reason: null, agent_turns: 1, usage: { input: 1, output: 1, cache_read: 1, cache_creation: 1 }, cost_usd: 0.1, duration_ms: 10, interventions: 0 },
    metrics: {
      usage: { input: 10, output: 20, cache_read: 1000, cache_creation: 70 },
      tokens_total: 1100,
      cost_usd: 1.5,
      duration_ms: 60000,
      agent_turns: 4,
      model_turns: 40,
      subagents: 6,
      questions: 2,
      decision_changing_questions: 1,
      interventions: 3,
      host_errors: 0,
    },
    persona: { usage: { input: 1, output: 1, cache_read: 0, cache_creation: 0 }, cost_usd: 0.01, errors: 0, unknown_facts: [] },
    checks: [{ id: "a", kind: "acceptance", fact: null, pass: true }, { id: "b", kind: "fact", fact: "F1", pass: false, error: "x" }],
    escaped_defects: 1,
    facts_disclosed: ["F2"],
    changed_files: ["src/cli.js"],
    conversation: [{ role: "agent", text: "hola" }],
    transcripts: [{ label: "change", turn: 1, sha256: "c".repeat(64) }],
    ...overrides,
  };
}

test("createRecord starts empty and validates", () => {
  const record = createRecord({ ...identity, recorded_at: "2026-10-06T10:00:00Z" });
  assert.equal(record.schema_version, 2);
  assert.equal(record.repetitions, 1);
  assert.deepEqual(record.runs, []);
  assert.equal(validateRecord(record), record);
});

test("upsertRun replaces a scenario's run and keeps profile order", () => {
  let record = createRecord({ ...identity, recorded_at: "2026-10-06T10:00:00Z" });
  record = upsertRun(record, run("bugfix", "bugfix"));
  record = upsertRun(record, run("cli-local", "cli-local"));
  record = upsertRun(record, run("bugfix", "bugfix", { escaped_defects: 0, checks: [{ id: "a", kind: "acceptance", fact: null, pass: true }] }));
  assert.deepEqual(record.runs.map((entry) => entry.scenario_id), ["cli-local", "bugfix"]);
  assert.equal(record.runs[1].escaped_defects, 0);
  validateRecord(record);
});

test("validateRecord rejects unknown keys and inconsistent escaped defects", () => {
  const record = createRecord({ ...identity, recorded_at: "2026-10-06T10:00:00Z" });
  assert.throws(() => validateRecord({ ...record, extra: 1 }), /exactly/);
  assert.throws(() => validateRecord(upsertRun(record, run("bugfix", "bugfix", { escaped_defects: 5 }))), /escaped_defects/);
  assert.throws(() => validateRecord(upsertRun(record, run("bugfix", "bugfix", { status: "done" }))), /status/);
});

test("resuming a record requires the same host, plugin, persona, and scenarios", () => {
  const record = createRecord({ ...identity, recorded_at: "2026-10-06T10:00:00Z" });
  assert.doesNotThrow(() => assertSameIdentity(record, identity));
  assert.throws(() => assertSameIdentity(record, { ...identity, host: { ...identity.host, plugin_digest: "d".repeat(64) } }), /plugin_digest/);
  assert.throws(() => assertSameIdentity(record, { ...identity, scenarios_digest: "e".repeat(64) }), /scenarios_digest/);
  assert.throws(() => assertSameIdentity(record, { ...identity, harness_digest: "e".repeat(64) }), /harness_digest/);
  assert.throws(() => assertSameIdentity(record, { ...identity, repetitions: 3 }), /repetitions/);
});

test("summarizeRecord totals with explicit denominators", () => {
  let record = createRecord({ ...identity, recorded_at: "2026-10-06T10:00:00Z" });
  record = upsertRun(record, run("cli-local", "cli-local"));
  record = upsertRun(record, run("bugfix", "bugfix", { status: "incomplete", reason: "max-cost" }));
  const summary = summarizeRecord(record);
  assert.equal(summary.scenarios, 2);
  assert.equal(summary.complete, 1);
  assert.deepEqual(summary.incomplete, [{ scenario_id: "bugfix", repetition: 1, reason: "max-cost" }]);
  assert.equal(summary.totals.tokens_total, 2200);
  assert.equal(summary.totals.escaped_defects, 2);
  assert.equal(summary.totals.checks_total, 4);
  assert.equal(summary.totals.checks_passed, 2);
  assert.equal(summary.totals.questions, 4);
  assert.equal(summary.totals.decision_changing_questions, 2);
});

test("renderReport is deterministic and lists every scenario and escaped check", () => {
  let record = createRecord({ ...identity, recorded_at: "2026-10-06T10:00:00Z" });
  record = upsertRun(record, run("cli-local", "cli-local"));
  const report = renderReport(record);
  assert.equal(report, renderReport(JSON.parse(JSON.stringify(record))));
  assert.match(report, /sdd-baseline-1/);
  assert.match(report, /\| cli-local \|/);
  assert.match(report, /b \(F1\)/);
  assert.match(report, /claude-sonnet-5-5/);
});

test("repetitions are separate runs of the same scenario, ordered by profile then repetition", () => {
  let record = createRecord({ ...identity, repetitions: 3, recorded_at: "2026-10-06T10:00:00Z" });
  record = upsertRun(record, run("cli-local", "cli-local", { repetition: 2 }));
  record = upsertRun(record, run("bugfix", "bugfix", { repetition: 1 }));
  record = upsertRun(record, run("cli-local", "cli-local", { repetition: 1 }));
  record = upsertRun(record, run("cli-local", "cli-local", { repetition: 2, escaped_defects: 0, checks: [] }));
  assert.deepEqual(record.runs.map((entry) => `${entry.scenario_id}#${entry.repetition}`), ["cli-local#1", "cli-local#2", "bugfix#1"]);
  assert.equal(record.runs[1].escaped_defects, 0);
  validateRecord(record);
  assert.throws(() => validateRecord({ ...record, runs: [...record.runs, run("bugfix", "bugfix", { repetition: 4 })] }), /repetition/);
  assert.throws(() => validateRecord({ ...record, runs: [...record.runs, run("bugfix", "bugfix")] }), /twice/);
});

test("a schema 1 record still reads as one repetition per scenario", () => {
  const v1 = createRecord({ ...identity, recorded_at: "2026-10-06T10:00:00Z" });
  delete v1.repetitions;
  v1.schema_version = 1;
  const legacyRun = run("cli-local", "cli-local");
  delete legacyRun.repetition;
  v1.runs = [legacyRun];
  const read = validateRecord(JSON.parse(JSON.stringify(v1)));
  assert.equal(read.schema_version, 2);
  assert.equal(read.repetitions, 1);
  assert.equal(read.runs[0].repetition, 1);
  assert.match(renderReport(read), /\| cli-local \| complete \|/);
});

test("with repetitions the report adds per-scenario means, and unjudged runs say so", () => {
  let record = createRecord({ ...identity, repetitions: 2, recorded_at: "2026-10-06T10:00:00Z" });
  record = upsertRun(record, run("cli-local", "cli-local", { repetition: 1 }));
  record = upsertRun(record, run("cli-local", "cli-local", { repetition: 2, metrics: { ...run("x", "x").metrics, tokens_total: 3100 } }));
  record = upsertRun(record, run("bugfix", "bugfix", { repetition: 1, status: "incomplete", reason: "setup-incomplete", checks: [], escaped_defects: 0 }));
  const summary = summarizeRecord(record);
  const cli = summary.per_scenario.find((row) => row.scenario_id === "cli-local");
  assert.equal(cli.runs, 2);
  assert.equal(cli.complete, 2);
  assert.equal(cli.mean.tokens_total, 2100);
  assert.equal(cli.mean.escaped_defects, 1);
  const report = renderReport(record);
  assert.match(report, /\| cli-local #2 \|/);
  assert.match(report, /not judged/);
  assert.match(report, /Mean per scenario/);
  assert.match(report, /\| cli-local \| 2\/2 \| 2 k \|/);
});
