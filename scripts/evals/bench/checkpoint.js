"use strict";

// E4.1 checkpoint: compares a candidate arm (IDD) with the baseline arm (the
// SDD mode) over the same scenarios and decides whether E1.6 may change the
// default (`continue`) or must `revise` first.
//
// The margins file is declared before any comparison and digested into the
// result. Fixed in code, not choosable, are the conditions that make the
// comparison unjudgeable (`not-comparable`, `incomplete-run`) and the veto
// `check-regression`: a hidden check the baseline passes and the candidate
// fails, even if the totals improve. The task (scenario) is the statistical
// unit; per-scenario token ratios are reported with a 95% t interval.
//
// Measurement tooling only: it grants no authority and promotes nothing.

const fs = require("node:fs");
const path = require("node:path");

const { sha256Fingerprint } = require("../../lib/canonical-json.js");
const { taskInterval } = require("./stats.js");

const MARGINS_PATH = path.join(__dirname, "margins.json");
const MARGINS_KEYS = Object.freeze(["schema_version", "margins_version", "declared_at", "baseline_arm", "candidate_arm", "escaped_defects", "tokens"]);
const IDENTITY_FIELDS = Object.freeze([["scenarios_digest"], ["host", "name"], ["host", "model"], ["host", "effort"], ["persona", "model"]]);

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
  if (margins.schema_version !== 1) fail("margins schema_version must be 1");
  for (const key of ["margins_version", "declared_at", "baseline_arm", "candidate_arm"]) {
    if (typeof margins[key] !== "string" || margins[key].trim() === "") fail(`margins ${key} must be a non-empty string`);
  }
  const delta = margins.escaped_defects && margins.escaped_defects.max_total_delta;
  if (!isPlainObject(margins.escaped_defects) || !hasExactKeys(margins.escaped_defects, ["max_total_delta"]) || !Number.isInteger(delta) || delta < 0) {
    fail("escaped_defects.max_total_delta must be a non-negative integer");
  }
  const ratio = margins.tokens && margins.tokens.max_total_ratio;
  if (!isPlainObject(margins.tokens) || !hasExactKeys(margins.tokens, ["max_total_ratio"]) || typeof ratio !== "number" || !(ratio > 0)) {
    fail("tokens.max_total_ratio must be a positive number");
  }
  return margins;
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
  if (baseline.arm !== margins.baseline_arm) problems.push(`baseline arm is ${baseline.arm}, margins expect ${margins.baseline_arm}`);
  if (candidate.arm !== margins.candidate_arm) problems.push(`candidate arm is ${candidate.arm}, margins expect ${margins.candidate_arm}`);
  for (const fieldPath of IDENTITY_FIELDS) {
    const a = fieldValue(baseline, fieldPath);
    const b = fieldValue(candidate, fieldPath);
    if (a !== b) problems.push(`${fieldPath.join(".")} differs (${a} vs ${b})`);
  }
  const ids = (record) => record.runs.map((run) => run.scenario_id).sort().join(",");
  if (ids(baseline) !== ids(candidate)) problems.push(`scenario sets differ (${ids(baseline)} vs ${ids(candidate)})`);
  return problems;
}

/**
 * @returns {{ decision: "continue"|"revise", reasons: Array<{code, detail}>, per_scenario, totals, margins_version }}
 */
function evaluateCheckpoint({ baseline, candidate, margins, margins_digest: marginsDigest = null }) {
  validateMargins(margins);
  const reasons = [];
  const problems = comparability(baseline, candidate, margins);
  if (problems.length > 0) reasons.push({ code: "not-comparable", detail: problems });

  const incomplete = [...baseline.runs, ...candidate.runs]
    .filter((run) => run.status !== "complete")
    .map((run) => `${run.scenario_id}: ${run.reason}`);
  if (incomplete.length > 0) reasons.push({ code: "incomplete-run", detail: incomplete });

  const candidateRuns = new Map(candidate.runs.map((run) => [run.scenario_id, run]));
  const regressions = [];
  const perScenario = [];
  for (const base of baseline.runs) {
    const cand = candidateRuns.get(base.scenario_id);
    if (!cand) continue;
    const passed = new Set(base.checks.filter((check) => check.pass).map((check) => check.id));
    const regressed = cand.checks.filter((check) => !check.pass && passed.has(check.id)).map((check) => check.id);
    regressions.push(...regressed.map((id) => `${base.scenario_id}/${id}`));
    perScenario.push({
      scenario_id: base.scenario_id,
      baseline: { tokens_total: base.metrics.tokens_total, escaped_defects: base.escaped_defects, questions: base.metrics.questions, interventions: base.metrics.interventions },
      candidate: { tokens_total: cand.metrics.tokens_total, escaped_defects: cand.escaped_defects, questions: cand.metrics.questions, interventions: cand.metrics.interventions },
      tokens_ratio: base.metrics.tokens_total > 0 ? round(cand.metrics.tokens_total / base.metrics.tokens_total) : null,
      regressions: regressed,
    });
  }
  if (regressions.length > 0) reasons.push({ code: "check-regression", detail: regressions });

  const compared = perScenario.map((row) => row.scenario_id);
  const total = (record, pick) => record.runs.filter((run) => compared.includes(run.scenario_id)).reduce((sum, run) => sum + pick(run), 0);
  const baselineTokens = total(baseline, (run) => run.metrics.tokens_total);
  const candidateTokens = total(candidate, (run) => run.metrics.tokens_total);
  const escapedDelta = total(candidate, (run) => run.escaped_defects) - total(baseline, (run) => run.escaped_defects);
  const tokensRatio = baselineTokens > 0 ? round(candidateTokens / baselineTokens) : null;

  if (escapedDelta > margins.escaped_defects.max_total_delta) {
    reasons.push({ code: "escaped-defects", detail: [`candidate escapes ${escapedDelta} more defects than the baseline (margin ${margins.escaped_defects.max_total_delta})`] });
  }
  if (tokensRatio === null || tokensRatio > margins.tokens.max_total_ratio) {
    reasons.push({ code: "tokens", detail: [`candidate/baseline tokens = ${tokensRatio} (margin ≤ ${margins.tokens.max_total_ratio})`] });
  }

  return {
    decision: reasons.length === 0 ? "continue" : "revise",
    reasons,
    margins_version: margins.margins_version,
    margins_digest: marginsDigest,
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

function renderCheckpoint(result) {
  const lines = [
    `# Checkpoint E4.1: ${result.decision}`,
    "",
    `- Baseline: \`${result.baseline_record}\` · Candidate: \`${result.candidate_record}\``,
    `- Margins: \`${result.margins_version}\`${result.margins_digest ? ` (\`${result.margins_digest.slice(0, 12)}\`)` : ""}`,
    `- Tokens: ${result.totals.candidate_tokens} / ${result.totals.baseline_tokens} = ${result.totals.tokens_ratio}`,
    `- Escaped defects, candidate − baseline: ${result.totals.escaped_delta}`,
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
