"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { assertSameIdentity, createRecord, renderReport, summarizeRecord, upsertRun, validateRecord } = require("./record.js");

const identity = {
  record_id: "sdd-baseline-1",
  arm: "sdd",
  host: { name: "claude-code", cli_version: "2.1.286", model: "claude-sonnet-5-5", effort: null, plugin_version: "2.103.0", plugin_digest: "a".repeat(64), engram_mcp_bytes: 120 },
  persona: { model: "claude-haiku-4-5-20251001" },
  repo_commit: "c".repeat(40),
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
    open_facts: null,
    conversation: [{ role: "agent", text: "hola", tokens: 1100 }],
    transcripts: [{ label: "change", turn: 1, sha256: "c".repeat(64) }],
    ...overrides,
  };
}

test("createRecord starts empty and validates", () => {
  const record = createRecord({ ...identity, recorded_at: "2026-10-06T10:00:00Z" });
  assert.equal(record.schema_version, 3);
  assert.equal(record.repo_commit, "c".repeat(40));
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
  delete v1.repo_commit;
  v1.schema_version = 1;
  const legacyRun = run("cli-local", "cli-local");
  delete legacyRun.repetition;
  delete legacyRun.open_facts;
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

test("the report breaks checks down by kind and states the Engram MCP size apart from tokens", () => {
  let record = createRecord({
    ...identity,
    recorded_at: "2026-10-13T10:00:00Z",
    host: { ...identity.host, engram_mcp_bytes: 120 },
  });
  record = upsertRun(record, run("cli-local", "cli-local"));
  const report = renderReport(record);
  assert.match(report, /\| Acceptance \| Regression \| Fact \|/);
  assert.match(report, /\| 1\/1 \| 0\/0 \| 0\/1 \|/);
  assert.match(report, /Engram MCP: 120 bytes, reported apart and not subtracted from token totals/);
});

// Schema 3 (OSP-025, OSP-026): Engram in every arm, the commit, tokens per
// turn and how IDD closed its open facts. Schema 2 records keep reading.
test("schema 3 requires Engram, the commit, tokens per agent turn and valid open facts; schema 2 still reads", () => {
  const record = upsertRun(createRecord({ ...identity, recorded_at: "2026-10-21T10:00:00Z" }), run("cli-local", "cli-local"));
  const { engram_mcp_bytes: _bytes, ...withoutEngram } = record.host;
  assert.throws(() => validateRecord({ ...record, host: withoutEngram }), /engram_mcp_bytes.*OSP-025/);
  assert.throws(() => validateRecord({ ...record, repo_commit: "main" }), /repo_commit/);
  assert.doesNotThrow(() => validateRecord({ ...record, repo_commit: `${"c".repeat(40)}-dirty` }));
  const turn = (overrides) => ({ ...record, runs: [{ ...record.runs[0], ...overrides }] });
  assert.throws(() => validateRecord(turn({ conversation: [{ role: "agent", text: "hola" }, { role: "user", text: "sí" }] })), /tokens/);
  const closed = { kind: "feature", categories: { inputs: "asked", uniqueness: "cited", persistence: "quoted" }, questions: 1 };
  assert.doesNotThrow(() => validateRecord(turn({ open_facts: closed })));
  assert.throws(() => validateRecord(turn({ open_facts: { ...closed, categories: { inputs: "guessed" } } })), /open_facts.categories/);
  assert.throws(() => validateRecord(turn({ open_facts: { kind: "bug", categories: null, questions: -1 } })), /questions/);

  const { repo_commit: _commit, ...v2 } = { ...record, schema_version: 2, host: withoutEngram };
  const { open_facts: _openFacts, ...v2Run } = record.runs[0];
  assert.equal(validateRecord({ ...v2, runs: [v2Run] }).schema_version, 2);
});

test("the report lists how each IDD change closed its open facts", () => {
  const closed = { kind: "feature", categories: { inputs: "asked", uniqueness: "cited", persistence: "quoted", copy: "cited" }, questions: 1 };
  let record = createRecord({ ...identity, recorded_at: "2026-10-21T10:00:00Z" });
  record = upsertRun(record, run("cli-local", "cli-local", { open_facts: closed }));
  record = upsertRun(record, run("bugfix", "bugfix", { open_facts: { kind: "bug", categories: null, questions: 2 } }));
  const report = renderReport(record);
  assert.match(report, /## Open facts/);
  assert.match(report, /\| cli-local \| feature \| 1 \| 2 \| 1 \| 1 \|/);
  assert.match(report, /\| bugfix \| bug \| — \| — \| — \| 2 \|/);
  assert.doesNotMatch(renderReport(createRecord({ ...identity, recorded_at: "2026-10-21T10:00:00Z" })), /## Open facts/);
});

// Schema 3 is additive: every record already committed (schema 1 or 2) still
// validates and renders, so its report and checkpoint regenerate as before.
test("every committed record still validates and renders under schema 3", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const dir = path.join(__dirname, "records");
  const files = fs.readdirSync(dir).filter((file) => file.endsWith(".json"));
  assert.ok(files.length > 0);
  for (const file of files) {
    const record = validateRecord(JSON.parse(fs.readFileSync(path.join(dir, file), "utf8")));
    assert.ok([2, 3].includes(record.schema_version), file);
    assert.match(renderReport(record), new RegExp(`Bench record \`${record.record_id}\``), file);
  }
});
