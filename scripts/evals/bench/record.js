"use strict";

// Bench record: the versioned result of one arm over the scenarios. It binds
// every run to the host, model, plugin build, persona, and scenario corpus, so
// the report and the checkpoint can be recomputed byte for byte from the file
// without calling a model again. Transcripts stay out of the repository; the
// record keeps their SHA-256.
//
// Schema 2 repeats every scenario `repetitions` times: each run carries its
// `repetition` (1..N) and the report adds per-scenario means. A schema 1 record
// reads as one repetition per scenario.

const { PROFILES } = require("./scenarios.js");

const RECORD_SCHEMA_VERSION = 2;
const RECORD_KEYS = Object.freeze(["schema_version", "record_id", "arm", "recorded_at", "host", "persona", "scenarios_digest", "harness_digest", "limits", "repetitions", "runs"]);
const RUN_KEYS = Object.freeze([
  "scenario_id", "repetition", "profile", "status", "reason", "setup", "metrics", "persona", "checks",
  "escaped_defects", "facts_disclosed", "changed_files", "conversation", "transcripts",
]);
const METRIC_KEYS = Object.freeze([
  "usage", "tokens_total", "cost_usd", "duration_ms", "agent_turns", "model_turns", "subagents",
  "questions", "decision_changing_questions", "interventions", "host_errors",
]);
const IDENTITY_FIELDS = Object.freeze([
  ["arm"], ["repetitions"], ["scenarios_digest"], ["harness_digest"], ["host", "name"], ["host", "cli_version"], ["host", "model"], ["host", "effort"],
  ["host", "plugin_version"], ["host", "plugin_digest"], ["persona", "model"],
]);

class BenchRecordError extends Error {
  constructor(message) {
    super(message);
    this.name = "BenchRecordError";
    this.code = "INVALID_BENCH_RECORD";
  }
}

const isPlainObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const isCount = (value) => Number.isInteger(value) && value >= 0;
const isAmount = (value) => typeof value === "number" && Number.isFinite(value) && value >= 0;

function hasExactKeys(value, keys) {
  const actual = Object.keys(value).sort();
  return actual.length === keys.length && [...keys].sort().every((key, index) => key === actual[index]);
}

function createRecord({ record_id: recordId, arm, recorded_at: recordedAt, host, persona, scenarios_digest: scenariosDigest, harness_digest: harness, limits, repetitions = 1 }) {
  return { schema_version: RECORD_SCHEMA_VERSION, record_id: recordId, arm, recorded_at: recordedAt, host, persona, scenarios_digest: scenariosDigest, harness_digest: harness, limits, repetitions, runs: [] };
}

const runKey = (run) => `${run.scenario_id}#${run.repetition}`;

function profileRank(run) {
  const rank = PROFILES.indexOf(run.profile);
  return rank === -1 ? PROFILES.length : rank;
}

function upsertRun(record, run) {
  const runs = record.runs.filter((entry) => runKey(entry) !== runKey(run)).concat([run])
    .sort((a, b) => profileRank(a) - profileRank(b) || a.scenario_id.localeCompare(b.scenario_id) || a.repetition - b.repetition);
  return { ...record, runs };
}

/** A run that never reached the change (voided setup, exhausted quota) has no check results. */
const isJudged = (run) => run.status === "complete" || run.checks.length > 0;

function validateRun(run, index, repetitions) {
  const where = `runs[${index}]`;
  const fail = (message) => { throw new BenchRecordError(`${where} ${message}`); };
  if (!isPlainObject(run) || !hasExactKeys(run, RUN_KEYS)) fail(`must declare exactly ${RUN_KEYS.join(", ")}`);
  if (!Number.isInteger(run.repetition) || run.repetition < 1 || run.repetition > repetitions) fail(`repetition must be an integer from 1 to ${repetitions}`);
  if (!["complete", "incomplete"].includes(run.status)) fail("status must be complete or incomplete");
  if (run.status === "incomplete" && typeof run.reason !== "string") fail("an incomplete run needs a reason");
  if (!isPlainObject(run.metrics) || !hasExactKeys(run.metrics, METRIC_KEYS)) fail(`metrics must declare exactly ${METRIC_KEYS.join(", ")}`);
  for (const key of METRIC_KEYS.filter((name) => name !== "usage")) {
    if (!(key === "cost_usd" ? isAmount(run.metrics[key]) : isCount(run.metrics[key]))) fail(`metrics.${key} must be a non-negative number`);
  }
  if (!Array.isArray(run.checks) || !run.checks.every((check) => isPlainObject(check) && typeof check.id === "string" && typeof check.pass === "boolean")) {
    fail("checks must list { id, pass } results");
  }
  if (run.escaped_defects !== run.checks.filter((check) => !check.pass).length) fail("escaped_defects must equal the failed checks");
}

/** Schema 1 had one run per scenario: read it as repetition 1 of 1. */
function upgradeRecord(record) {
  if (!isPlainObject(record) || record.schema_version !== 1 || "repetitions" in record || !Array.isArray(record.runs)) return record;
  const { runs, ...rest } = record;
  return {
    ...rest,
    schema_version: RECORD_SCHEMA_VERSION,
    repetitions: 1,
    runs: runs.map((run) => (isPlainObject(run) ? { scenario_id: run.scenario_id, repetition: 1, ...run } : run)),
  };
}

/** Returns the record, upgraded in memory when it uses schema 1. */
function validateRecord(input) {
  const record = upgradeRecord(input);
  if (!isPlainObject(record) || !hasExactKeys(record, RECORD_KEYS)) throw new BenchRecordError(`a bench record must declare exactly ${RECORD_KEYS.join(", ")}`);
  if (record.schema_version !== RECORD_SCHEMA_VERSION) throw new BenchRecordError(`schema_version must be 1 or ${RECORD_SCHEMA_VERSION}`);
  if (!isCount(record.repetitions) || record.repetitions < 1) throw new BenchRecordError("repetitions must be a positive integer");
  if (!Array.isArray(record.runs)) throw new BenchRecordError("runs must be an array");
  record.runs.forEach((run, index) => validateRun(run, index, record.repetitions));
  if (new Set(record.runs.map(runKey)).size !== record.runs.length) throw new BenchRecordError("a scenario repetition appears twice in runs");
  return record;
}

const fieldValue = (value, fieldPath) => fieldPath.reduce((current, key) => (current == null ? undefined : current[key]), value);

/** Throws when a resumed record would mix runs from different hosts, builds, or corpora. */
function assertSameIdentity(record, identity) {
  for (const fieldPath of IDENTITY_FIELDS) {
    const stored = fieldValue(record, fieldPath);
    const current = fieldValue(identity, fieldPath);
    if (stored !== current) {
      throw new BenchRecordError(`record ${record.record_id} was produced with ${fieldPath.join(".")}=${stored}; this run has ${current}. Use a new record id.`);
    }
  }
}

const MEAN_FIELDS = Object.freeze([
  ["tokens_total", (run) => run.metrics.tokens_total],
  ["cost_usd", (run) => run.metrics.cost_usd],
  ["duration_ms", (run) => run.metrics.duration_ms],
  ["questions", (run) => run.metrics.questions],
  ["decision_changing_questions", (run) => run.metrics.decision_changing_questions],
  ["interventions", (run) => run.metrics.interventions],
  ["escaped_defects", (run) => run.escaped_defects],
]);
const round = (value) => Math.round(value * 1e6) / 1e6;

/** Per-scenario means over its repetitions, in record order. */
function scenarioMeans(record) {
  const groups = new Map();
  for (const run of record.runs) {
    if (!groups.has(run.scenario_id)) groups.set(run.scenario_id, []);
    groups.get(run.scenario_id).push(run);
  }
  return [...groups.entries()].map(([scenarioId, runs]) => {
    const tokens = runs.map((run) => run.metrics.tokens_total);
    return {
      scenario_id: scenarioId,
      runs: runs.length,
      complete: runs.filter((run) => run.status === "complete").length,
      mean: Object.fromEntries(MEAN_FIELDS.map(([key, pick]) => [key, round(runs.reduce((sum, run) => sum + pick(run), 0) / runs.length)])),
      tokens_range: [Math.min(...tokens), Math.max(...tokens)],
    };
  });
}

function summarizeRecord(record) {
  const sum = (pick) => record.runs.reduce((total, run) => total + pick(run), 0);
  return {
    repetitions: record.repetitions,
    scenarios: record.runs.length,
    complete: record.runs.filter((run) => run.status === "complete").length,
    incomplete: record.runs.filter((run) => run.status !== "complete").map((run) => ({ scenario_id: run.scenario_id, repetition: run.repetition, reason: run.reason })),
    totals: {
      tokens_total: sum((run) => run.metrics.tokens_total),
      cost_usd: Math.round(sum((run) => run.metrics.cost_usd) * 1e4) / 1e4,
      duration_ms: sum((run) => run.metrics.duration_ms),
      questions: sum((run) => run.metrics.questions),
      decision_changing_questions: sum((run) => run.metrics.decision_changing_questions),
      interventions: sum((run) => run.metrics.interventions),
      escaped_defects: sum((run) => run.escaped_defects),
      checks_total: sum((run) => run.checks.length),
      checks_passed: sum((run) => run.checks.filter((check) => check.pass).length),
    },
    per_scenario: scenarioMeans(record),
  };
}

const thousands = (value) => `${Math.round(value / 1000).toLocaleString("en-US")} k`;
const minutes = (ms) => `${(ms / 60000).toFixed(1)} min`;
const usd = (value) => `$${value.toFixed(2)}`;

function renderReport(record) {
  const summary = summarizeRecord(record);
  const lines = [
    `# Bench record \`${record.record_id}\` (arm \`${record.arm}\`)`,
    "",
    `- Host: ${record.host.name} ${record.host.cli_version}, model \`${record.host.model}\`${record.host.effort ? `, effort ${record.host.effort}` : ""}`,
    `- Plugin: ospec-workflow ${record.host.plugin_version} (\`${record.host.plugin_digest.slice(0, 12)}\`)`,
    `- Persona: \`${record.persona.model}\``,
    `- Scenarios digest: \`${record.scenarios_digest.slice(0, 12)}\` · harness: \`${record.harness_digest.slice(0, 12)}\``,
    `- Recorded at: ${record.recorded_at}${record.repetitions > 1 ? ` · ${record.repetitions} repetitions per scenario` : ""}`,
    "",
    "| Scenario | Status | Tokens | Cost | Duration | Turns | Questions (decisive) | Interventions | Checks | Escaped |",
    "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |",
  ];
  for (const run of record.runs) {
    const failed = run.checks.filter((check) => !check.pass).map((check) => (check.fact ? `${check.id} (${check.fact})` : check.id));
    const status = run.status === "complete" ? "complete" : `incomplete: ${run.reason}`;
    const label = record.repetitions > 1 ? `${run.scenario_id} #${run.repetition}` : run.scenario_id;
    const judged = isJudged(run);
    const checks = judged ? `${run.checks.length - failed.length}/${run.checks.length}` : "not judged";
    const escaped = judged ? (failed.length ? failed.join(", ") : "none") : "—";
    lines.push(`| ${label} | ${status} | ${thousands(run.metrics.tokens_total)} | ${usd(run.metrics.cost_usd)} | ${minutes(run.metrics.duration_ms)} | ${run.metrics.agent_turns} | ${run.metrics.questions} (${run.metrics.decision_changing_questions}) | ${run.metrics.interventions} | ${checks} | ${escaped} |`);
  }
  const { totals } = summary;
  lines.push(
    `| **Total** | ${summary.complete}/${summary.scenarios} complete | ${thousands(totals.tokens_total)} | ${usd(totals.cost_usd)} | ${minutes(totals.duration_ms)} | | ${totals.questions} (${totals.decision_changing_questions}) | ${totals.interventions} | ${totals.checks_passed}/${totals.checks_total} | ${totals.escaped_defects} |`,
    "",
    "Tokens add input, output, cache reads, and cache writes of every model in the run, subagents included. Setup turns (project initialization) and the simulated user are not counted. Escaped defects are the hidden checks the delivered workspace fails; the fact in parentheses is the one the user would have given if asked. A run that never reached the change (voided setup, exhausted host quota) is not judged.",
    "",
  );
  if (record.repetitions > 1) {
    const decimal = (value) => (Number.isInteger(value) ? String(value) : value.toFixed(2));
    lines.push(
      `## Mean per scenario (${record.repetitions} repetitions)`,
      "",
      "| Scenario | Complete | Tokens | Tokens min–max | Cost | Duration | Questions (decisive) | Interventions | Escaped |",
      "| --- | ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: |",
    );
    for (const row of summary.per_scenario) {
      const { mean } = row;
      lines.push(`| ${row.scenario_id} | ${row.complete}/${row.runs} | ${thousands(mean.tokens_total)} | ${thousands(row.tokens_range[0])} – ${thousands(row.tokens_range[1])} | ${usd(mean.cost_usd)} | ${minutes(mean.duration_ms)} | ${decimal(mean.questions)} (${decimal(mean.decision_changing_questions)}) | ${decimal(mean.interventions)} | ${decimal(mean.escaped_defects)} |`);
    }
    const total = (key) => round(summary.per_scenario.reduce((sum, row) => sum + row.mean[key], 0));
    lines.push(
      `| **Total** | ${summary.complete}/${summary.scenarios} | ${thousands(total("tokens_total"))} | | ${usd(total("cost_usd"))} | ${minutes(total("duration_ms"))} | ${decimal(total("questions"))} (${decimal(total("decision_changing_questions"))}) | ${decimal(total("interventions"))} | ${decimal(total("escaped_defects"))} |`,
      "",
      "Each figure is the mean over the scenario's repetitions; the total adds those means, so it compares with a one-repetition record.",
      "",
    );
  }
  return lines.join("\n");
}

module.exports = {
  BenchRecordError,
  RECORD_SCHEMA_VERSION,
  assertSameIdentity,
  createRecord,
  renderReport,
  summarizeRecord,
  upsertRun,
  validateRecord,
};
