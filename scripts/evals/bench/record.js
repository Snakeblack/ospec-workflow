"use strict";

// Bench record: the versioned result of one arm over the scenarios. It binds
// every run to the host, model, plugin build, persona, and scenario corpus, so
// the report and the checkpoint can be recomputed byte for byte from the file
// without calling a model again. Transcripts stay out of the repository; the
// record keeps their SHA-256.

const { PROFILES } = require("./scenarios.js");

const RECORD_SCHEMA_VERSION = 1;
const RECORD_KEYS = Object.freeze(["schema_version", "record_id", "arm", "recorded_at", "host", "persona", "scenarios_digest", "harness_digest", "limits", "runs"]);
const RUN_KEYS = Object.freeze([
  "scenario_id", "profile", "status", "reason", "setup", "metrics", "persona", "checks",
  "escaped_defects", "facts_disclosed", "changed_files", "conversation", "transcripts",
]);
const METRIC_KEYS = Object.freeze([
  "usage", "tokens_total", "cost_usd", "duration_ms", "agent_turns", "model_turns", "subagents",
  "questions", "decision_changing_questions", "interventions", "host_errors",
]);
const IDENTITY_FIELDS = Object.freeze([
  ["arm"], ["scenarios_digest"], ["harness_digest"], ["host", "name"], ["host", "cli_version"], ["host", "model"], ["host", "effort"],
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

function createRecord({ record_id: recordId, arm, recorded_at: recordedAt, host, persona, scenarios_digest: scenariosDigest, harness_digest: harness, limits }) {
  return { schema_version: RECORD_SCHEMA_VERSION, record_id: recordId, arm, recorded_at: recordedAt, host, persona, scenarios_digest: scenariosDigest, harness_digest: harness, limits, runs: [] };
}

function profileRank(run) {
  const rank = PROFILES.indexOf(run.profile);
  return rank === -1 ? PROFILES.length : rank;
}

function upsertRun(record, run) {
  const runs = record.runs.filter((entry) => entry.scenario_id !== run.scenario_id).concat([run])
    .sort((a, b) => profileRank(a) - profileRank(b) || a.scenario_id.localeCompare(b.scenario_id));
  return { ...record, runs };
}

function validateRun(run, index) {
  const where = `runs[${index}]`;
  const fail = (message) => { throw new BenchRecordError(`${where} ${message}`); };
  if (!isPlainObject(run) || !hasExactKeys(run, RUN_KEYS)) fail(`must declare exactly ${RUN_KEYS.join(", ")}`);
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

function validateRecord(record) {
  if (!isPlainObject(record) || !hasExactKeys(record, RECORD_KEYS)) throw new BenchRecordError(`a bench record must declare exactly ${RECORD_KEYS.join(", ")}`);
  if (record.schema_version !== RECORD_SCHEMA_VERSION) throw new BenchRecordError(`schema_version must be ${RECORD_SCHEMA_VERSION}`);
  if (!Array.isArray(record.runs)) throw new BenchRecordError("runs must be an array");
  record.runs.forEach(validateRun);
  if (new Set(record.runs.map((run) => run.scenario_id)).size !== record.runs.length) throw new BenchRecordError("a scenario appears twice in runs");
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

function summarizeRecord(record) {
  const sum = (pick) => record.runs.reduce((total, run) => total + pick(run), 0);
  return {
    scenarios: record.runs.length,
    complete: record.runs.filter((run) => run.status === "complete").length,
    incomplete: record.runs.filter((run) => run.status !== "complete").map((run) => ({ scenario_id: run.scenario_id, reason: run.reason })),
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
    `- Recorded at: ${record.recorded_at}`,
    "",
    "| Scenario | Status | Tokens | Cost | Duration | Turns | Questions (decisive) | Interventions | Checks | Escaped |",
    "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |",
  ];
  for (const run of record.runs) {
    const failed = run.checks.filter((check) => !check.pass).map((check) => (check.fact ? `${check.id} (${check.fact})` : check.id));
    const status = run.status === "complete" ? "complete" : `incomplete: ${run.reason}`;
    lines.push(`| ${run.scenario_id} | ${status} | ${thousands(run.metrics.tokens_total)} | ${usd(run.metrics.cost_usd)} | ${minutes(run.metrics.duration_ms)} | ${run.metrics.agent_turns} | ${run.metrics.questions} (${run.metrics.decision_changing_questions}) | ${run.metrics.interventions} | ${run.checks.length - failed.length}/${run.checks.length} | ${failed.length ? failed.join(", ") : "none"} |`);
  }
  const { totals } = summary;
  lines.push(
    `| **Total** | ${summary.complete}/${summary.scenarios} complete | ${thousands(totals.tokens_total)} | ${usd(totals.cost_usd)} | ${minutes(totals.duration_ms)} | | ${totals.questions} (${totals.decision_changing_questions}) | ${totals.interventions} | ${totals.checks_passed}/${totals.checks_total} | ${totals.escaped_defects} |`,
    "",
    "Tokens add input, output, cache reads, and cache writes of every model in the run, subagents included. Setup turns (project initialization) and the simulated user are not counted. Escaped defects are the hidden checks the delivered workspace fails; the fact in parentheses is the one the user would have given if asked.",
    "",
  );
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
