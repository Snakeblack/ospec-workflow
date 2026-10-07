"use strict";

// E4.1 checkpoint: compares a candidate arm (IDD) with the baseline arm (the
// SDD mode) over the same scenarios and decides whether E1.6 may change the
// default (`continue`) or must `revise` first.
//
// The margins file is declared before any comparison and digested into the
// result. Fixed in code, not choosable, are the conditions that make the
// comparison unjudgeable (`not-comparable`, `incomplete-run`) and the veto
// `check-regression`: a hidden check the baseline passes in every repetition
// and the candidate fails in any, even if the totals improve. Each scenario
// runs `repetitions` times per arm; the margins apply to per-scenario means.
// The task (scenario) is the statistical unit; per-scenario token ratios are
// reported with a 95% t interval.
//
// Records of different harnesses are not comparable, with one exception the
// margins may declare: exactly one baseline/candidate digest pair, the harness
// files allowed to differ between them, and why. harness-exception.test.js
// verifies it (the baseline digest is rebuilt from the current harness with
// those files restored), and the result reports it.
//
// Measurement tooling only: it grants no authority and promotes nothing.

const fs = require("node:fs");
const path = require("node:path");

const { sha256Fingerprint } = require("../../lib/canonical-json.js");
const { taskInterval } = require("./stats.js");

const MARGINS_PATH = path.join(__dirname, "margins.json");
const MARGINS_SCHEMA_VERSION = 3;
const MARGINS_KEYS = Object.freeze(["schema_version", "margins_version", "declared_at", "baseline_arm", "candidate_arm", "repetitions", "escaped_defects", "tokens", "harness_exception"]);
const EXCEPTION_KEYS = Object.freeze(["baseline_digest", "candidate_digest", "changed_files", "reason"]);
const DIGEST_PATTERN = /^[a-f0-9]{64}$/;
const IDENTITY_FIELDS = Object.freeze([["scenarios_digest"], ["harness_digest"], ["host", "name"], ["host", "model"], ["host", "effort"], ["persona", "model"]]);

class BenchMarginsError extends Error {
  constructor(message) {
    super(message);
    this.name = "BenchMarginsError";
    this.code = "INVALID_BENCH_MARGINS";
  }
}

const isPlainObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

function hasExactKeys(value, keys) {
  const actual = Object.keys(value).sort();
  return actual.length === keys.length && [...keys].sort().every((key, index) => key === actual[index]);
}

function validateMargins(margins) {
  const fail = (message) => { throw new BenchMarginsError(message); };
  if (!isPlainObject(margins) || !hasExactKeys(margins, MARGINS_KEYS)) fail(`margins must declare exactly ${MARGINS_KEYS.join(", ")}`);
  if (margins.schema_version !== MARGINS_SCHEMA_VERSION) fail(`margins schema_version must be ${MARGINS_SCHEMA_VERSION}`);
  for (const key of ["margins_version", "declared_at", "baseline_arm", "candidate_arm"]) {
    if (typeof margins[key] !== "string" || margins[key].trim() === "") fail(`margins ${key} must be a non-empty string`);
  }
  if (!Number.isInteger(margins.repetitions) || margins.repetitions < 1) fail("repetitions must be a positive integer");
  const delta = margins.escaped_defects && margins.escaped_defects.max_mean_delta;
  if (!isPlainObject(margins.escaped_defects) || !hasExactKeys(margins.escaped_defects, ["max_mean_delta"]) || typeof delta !== "number" || !(delta >= 0)) {
    fail("escaped_defects.max_mean_delta must be a non-negative number");
  }
  const ratio = margins.tokens && margins.tokens.max_total_ratio;
  if (!isPlainObject(margins.tokens) || !hasExactKeys(margins.tokens, ["max_total_ratio"]) || typeof ratio !== "number" || !(ratio > 0)) {
    fail("tokens.max_total_ratio must be a positive number");
  }
  validateHarnessException(margins.harness_exception, fail);
  return margins;
}

function validateHarnessException(exception, fail) {
  if (exception === null) return;
  if (!isPlainObject(exception) || !hasExactKeys(exception, EXCEPTION_KEYS)) fail(`harness_exception must be null or declare exactly ${EXCEPTION_KEYS.join(", ")}`);
  for (const key of ["baseline_digest", "candidate_digest"]) {
    if (!DIGEST_PATTERN.test(exception[key] || "")) fail(`harness_exception.${key} must be a sha256 hex digest`);
  }
  if (exception.baseline_digest === exception.candidate_digest) fail("harness_exception digests must differ");
  const files = exception.changed_files;
  if (!Array.isArray(files) || files.length === 0 || !files.every((file) => typeof file === "string" && file.endsWith(".js") && !file.endsWith(".test.js"))) {
    fail("harness_exception.changed_files must list the harness .js files that differ");
  }
  if (typeof exception.reason !== "string" || exception.reason.trim() === "") fail("harness_exception.reason must be a non-empty string");
}

/** The declared exception when it covers exactly these two records' harnesses. */
function appliedHarnessException(baseline, candidate, margins) {
  const exception = margins.harness_exception;
  return exception && baseline.harness_digest === exception.baseline_digest && candidate.harness_digest === exception.candidate_digest
    ? exception
    : null;
}

function loadMargins(marginsPath = MARGINS_PATH) {
  let margins;
  try {
    margins = JSON.parse(fs.readFileSync(marginsPath, "utf8"));
  } catch (error) {
    throw new BenchMarginsError(`could not read margins: ${error.message}`);
  }
  validateMargins(margins);
  return { margins, digest: sha256Fingerprint("ospec-bench-margins-v1", margins).replace(/^sha256:/, "") };
}

const fieldValue = (value, fieldPath) => fieldPath.reduce((current, key) => (current == null ? undefined : current[key]), value);
const round = (value) => Math.round(value * 1e6) / 1e6;

function comparability(baseline, candidate, margins) {
  const problems = [];
  const excepted = appliedHarnessException(baseline, candidate, margins);
  if (baseline.arm !== margins.baseline_arm) problems.push(`baseline arm is ${baseline.arm}, margins expect ${margins.baseline_arm}`);
  if (candidate.arm !== margins.candidate_arm) problems.push(`candidate arm is ${candidate.arm}, margins expect ${margins.candidate_arm}`);
  for (const fieldPath of IDENTITY_FIELDS) {
    if (excepted && fieldPath[0] === "harness_digest") continue;
    const a = fieldValue(baseline, fieldPath);
    const b = fieldValue(candidate, fieldPath);
    if (a !== b) problems.push(`${fieldPath.join(".")} differs (${a} vs ${b})`);
  }
  for (const record of [baseline, candidate]) {
    if (repetitionsOf(record) !== margins.repetitions) problems.push(`${record.arm} has ${repetitionsOf(record)} repetitions, margins expect ${margins.repetitions}`);
  }
  const ids = (record) => [...new Set(record.runs.map((run) => run.scenario_id))].sort().join(",");
  if (ids(baseline) !== ids(candidate)) problems.push(`scenario sets differ (${ids(baseline)} vs ${ids(candidate)})`);
  return problems;
}

const repetitionsOf = (record) => record.repetitions || 1;
const repetitionOf = (run) => run.repetition || 1;
const isJudged = (run) => run.status === "complete" || run.checks.length > 0;
const mean = (runs, pick) => (runs.length === 0 ? 0 : round(runs.reduce((sum, run) => sum + pick(run), 0) / runs.length));

function runsByScenario(record) {
  const groups = new Map();
  for (const run of record.runs) {
    if (!groups.has(run.scenario_id)) groups.set(run.scenario_id, []);
    groups.get(run.scenario_id).push(run);
  }
  return groups;
}

/** Incomplete runs and repetitions missing up to the margins' count, per arm. */
function unjudgeable(record, scenarioIds, repetitions) {
  const present = new Set(record.runs.map((run) => `${run.scenario_id}#${repetitionOf(run)}`));
  const problems = record.runs
    .filter((run) => run.status !== "complete")
    .map((run) => `${record.arm} ${run.scenario_id}#${repetitionOf(run)}: ${run.reason}`);
  for (const scenarioId of scenarioIds) {
    for (let repetition = 1; repetition <= repetitions; repetition += 1) {
      if (!present.has(`${scenarioId}#${repetition}`)) problems.push(`${record.arm} ${scenarioId}#${repetition}: missing`);
    }
  }
  return problems;
}

/** Check ids the baseline passes in every judged repetition. */
function alwaysPassed(runs) {
  const judged = runs.filter(isJudged);
  if (judged.length === 0) return new Set();
  const [first, ...rest] = judged;
  return new Set(first.checks.filter((check) => check.pass).map((check) => check.id)
    .filter((id) => rest.every((run) => run.checks.some((check) => check.id === id && check.pass))));
}

const scenarioSummary = (runs) => ({
  tokens_total: mean(runs, (run) => run.metrics.tokens_total),
  escaped_defects: mean(runs, (run) => run.escaped_defects),
  questions: mean(runs, (run) => run.metrics.questions),
  interventions: mean(runs, (run) => run.metrics.interventions),
});

/**
 * @returns {{ decision: "continue"|"revise", reasons: Array<{code, detail}>, per_scenario, totals, margins_version }}
 */
function evaluateCheckpoint({ baseline, candidate, margins, margins_digest: marginsDigest = null }) {
  validateMargins(margins);
  const reasons = [];
  const problems = comparability(baseline, candidate, margins);
  if (problems.length > 0) reasons.push({ code: "not-comparable", detail: problems });

  const baselineGroups = runsByScenario(baseline);
  const candidateGroups = runsByScenario(candidate);
  const scenarioIds = [...baselineGroups.keys()].filter((id) => candidateGroups.has(id));
  const incomplete = [
    ...unjudgeable(baseline, scenarioIds, margins.repetitions),
    ...unjudgeable(candidate, scenarioIds, margins.repetitions),
  ];
  if (incomplete.length > 0) reasons.push({ code: "incomplete-run", detail: incomplete });

  const regressions = [];
  const perScenario = [];
  for (const scenarioId of scenarioIds) {
    const baseRuns = baselineGroups.get(scenarioId);
    const candRuns = candidateGroups.get(scenarioId);
    const passed = alwaysPassed(baseRuns);
    const regressed = [...new Set(candRuns.flatMap((run) => run.checks.filter((check) => !check.pass && passed.has(check.id)).map((check) => check.id)))];
    regressions.push(...regressed.map((id) => `${scenarioId}/${id}`));
    const base = scenarioSummary(baseRuns);
    const cand = scenarioSummary(candRuns);
    perScenario.push({
      scenario_id: scenarioId,
      baseline: base,
      candidate: cand,
      tokens_ratio: base.tokens_total > 0 ? round(cand.tokens_total / base.tokens_total) : null,
      regressions: regressed,
    });
  }
  if (regressions.length > 0) reasons.push({ code: "check-regression", detail: regressions });

  const total = (side, key) => round(perScenario.reduce((sum, row) => sum + row[side][key], 0));
  const baselineTokens = total("baseline", "tokens_total");
  const candidateTokens = total("candidate", "tokens_total");
  const escapedDelta = round(total("candidate", "escaped_defects") - total("baseline", "escaped_defects"));
  const tokensRatio = baselineTokens > 0 ? round(candidateTokens / baselineTokens) : null;

  if (escapedDelta > margins.escaped_defects.max_mean_delta) {
    reasons.push({ code: "escaped-defects", detail: [`candidate escapes ${escapedDelta} more defects per run than the baseline, summed over scenario means (margin ${margins.escaped_defects.max_mean_delta})`] });
  }
  if (tokensRatio === null || tokensRatio > margins.tokens.max_total_ratio) {
    reasons.push({ code: "tokens", detail: [`candidate/baseline tokens = ${tokensRatio} (margin ≤ ${margins.tokens.max_total_ratio})`] });
  }

  return {
    decision: reasons.length === 0 ? "continue" : "revise",
    reasons,
    margins_version: margins.margins_version,
    margins_digest: marginsDigest,
    repetitions: margins.repetitions,
    harness_exception: appliedHarnessException(baseline, candidate, margins),
    baseline_record: baseline.record_id,
    candidate_record: candidate.record_id,
    per_scenario: perScenario,
    totals: {
      baseline_tokens: baselineTokens,
      candidate_tokens: candidateTokens,
      tokens_ratio: tokensRatio,
      tokens_ratio_by_scenario: taskInterval(perScenario.filter((row) => row.tokens_ratio !== null).map((row) => row.tokens_ratio)),
      escaped_delta: escapedDelta,
    },
  };
}

function renderHarnessException(exception) {
  const short = (digest) => `\`${digest.slice(0, 12)}\``;
  return `- Harness exception: ${short(exception.baseline_digest)} → ${short(exception.candidate_digest)} (${exception.changed_files.join(", ")}): ${exception.reason}`;
}

function renderCheckpoint(result) {
  const lines = [
    `# Checkpoint E4.1: ${result.decision}`,
    "",
    `- Baseline: \`${result.baseline_record}\` · Candidate: \`${result.candidate_record}\``,
    `- Margins: \`${result.margins_version}\`${result.margins_digest ? ` (\`${result.margins_digest.slice(0, 12)}\`)` : ""} · ${result.repetitions} repetitions per scenario; figures are per-scenario means`,
    ...(result.harness_exception ? [renderHarnessException(result.harness_exception)] : []),
    `- Tokens: ${result.totals.candidate_tokens} / ${result.totals.baseline_tokens} = ${result.totals.tokens_ratio}`,
    `- Escaped defects (sum of scenario means), candidate − baseline: ${result.totals.escaped_delta}`,
    "",
    "| Scenario | Tokens ratio | Escaped (baseline → candidate) | Questions | Regressions |",
    "| --- | ---: | --- | --- | --- |",
    ...result.per_scenario.map((row) => `| ${row.scenario_id} | ${row.tokens_ratio} | ${row.baseline.escaped_defects} → ${row.candidate.escaped_defects} | ${row.baseline.questions} → ${row.candidate.questions} | ${row.regressions.join(", ") || "none"} |`),
    "",
  ];
  if (result.reasons.length === 0) lines.push("No veto and every margin is met.", "");
  for (const reason of result.reasons) lines.push(`- **${reason.code}**: ${reason.detail.join("; ")}`);
  return `${lines.join("\n").trimEnd()}\n`;
}

module.exports = { BenchMarginsError, MARGINS_PATH, evaluateCheckpoint, loadMargins, renderCheckpoint, validateMargins };
