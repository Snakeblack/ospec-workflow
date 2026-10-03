"use strict";

// Checkpoint of the Adaptive Repair pilot, slice P4
// (docs/analysis/2026-10-02-adaptive-pilot-scoping.md). It turns a paired
// campaign into one decision: continue, revise, or reject.
//
// Only the choosable numbers live in the predeclared margins file: the
// non-inferiority margin, the minimum practical improvement, and the holdout
// family reserved per stratum. The vetoes are not choosable (the canonical
// design requires them), so they are fixed here and any one of them rejects:
// - must-omitted: an adaptive run whose obligations miss a catalog `must`;
// - fault-escaped: an adaptive run with an effect outside its permit or an
//   invalid recovery;
// - defect-regression: a seeded defect only the adaptive arm let escape;
// - pass-regression: a task the control arm passes and the adaptive arm does not.
// Anything that keeps the comparison from being judged (an incomplete cohort, an
// unapplied oracle, a control-arm failure) or a missed margin asks to revise.
//
// Measurement tooling only: it grants no authority and promotes nothing.

const { readFileSync } = require("node:fs");

const { sha256Fingerprint } = require("../canonical-json.js");
const { PAIRED_ARMS } = require("./runner.js");

const MARGINS_SCHEMA_VERSION = 1;
const CONTROL_ARM = PAIRED_ARMS[0];
const ADAPTIVE_ARM = PAIRED_ARMS[1];
const VETO_KINDS = Object.freeze(["must-omitted", "fault-escaped", "defect-regression", "pass-regression"]);

class PilotCheckpointError extends Error {
  constructor(message, code = "INVALID_PILOT_MARGINS") {
    super(message);
    this.name = "PilotCheckpointError";
    this.code = code;
  }
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim() !== "";
}

function hasExactKeys(value, keys) {
  const actual = Object.keys(value).sort();
  return actual.length === keys.length && [...keys].sort().every((key, index) => key === actual[index]);
}

/**
 * Validates predeclared margins against the cohort they will judge.
 * @param {object} margins Parsed margins file.
 * @param {object} cohort A cohort from loadCohort.
 * @returns {object} The margins, unchanged.
 * @throws {PilotCheckpointError} When a margin is malformed or a holdout cannot be reserved.
 */
function validatePilotMargins(margins, cohort) {
  const fail = (message) => { throw new PilotCheckpointError(message); };
  if (!isPlainObject(margins) || !hasExactKeys(margins, [
    "schema_version", "margins_version", "declared_at", "non_inferiority", "practical_improvement", "holdout",
  ])) {
    fail("margins must declare exactly schema_version, margins_version, declared_at, non_inferiority, practical_improvement, holdout");
  }
  if (margins.schema_version !== MARGINS_SCHEMA_VERSION) fail(`margins schema_version must be ${MARGINS_SCHEMA_VERSION}`);
  if (!isNonEmptyString(margins.margins_version) || !isNonEmptyString(margins.declared_at)) {
    fail("margins_version and declared_at must be non-empty strings");
  }
  const lowerMin = isPlainObject(margins.non_inferiority) && hasExactKeys(margins.non_inferiority, ["pass_rate_delta_ci95_lower_min"])
    ? margins.non_inferiority.pass_rate_delta_ci95_lower_min : undefined;
  if (!Number.isFinite(lowerMin) || lowerMin > 0 || lowerMin < -1) {
    fail("non_inferiority.pass_rate_delta_ci95_lower_min must be a number in [-1, 0]");
  }
  const phasesMax = isPlainObject(margins.practical_improvement)
    && hasExactKeys(margins.practical_improvement, ["phases_executed_delta_mean_max"])
    ? margins.practical_improvement.phases_executed_delta_mean_max : undefined;
  if (!Number.isFinite(phasesMax) || phasesMax >= 0) {
    fail("practical_improvement.phases_executed_delta_mean_max must be a negative number (fewer phases)");
  }
  if (!isPlainObject(margins.holdout)) fail("holdout must map each stratum to one family");
  const strata = [...new Set(cohort.tasks.map((task) => task.stratum))];
  const unknown = Object.keys(margins.holdout).filter((stratum) => !strata.includes(stratum));
  if (unknown.length > 0) fail(`holdout names strata outside the cohort: ${unknown.join(", ")}`);
  for (const stratum of strata) {
    const family = margins.holdout[stratum];
    const tasks = cohort.tasks.filter((task) => task.stratum === stratum);
    const reserved = tasks.filter((task) => task.holdout_family === family);
    if (!isNonEmptyString(family) || reserved.length === 0 || reserved.length === tasks.length) {
      fail(`holdout for stratum "${stratum}" must be a family with some, but not all, of its tasks`);
    }
  }
  return margins;
}

/**
 * Loads and validates the predeclared margins file.
 * @returns {{ margins: object, margins_digest: string }}
 */
function loadPilotMargins(marginsPath, cohort) {
  let margins;
  try {
    margins = JSON.parse(readFileSync(marginsPath, "utf8"));
  } catch (error) {
    throw new PilotCheckpointError(`could not read margins: ${error.message}`, "PILOT_MARGINS_READ_FAILED");
  }
  validatePilotMargins(margins, cohort);
  return { margins, margins_digest: sha256Fingerprint("k12-pilot-margins/v1", margins) };
}

function runVetoes(runs) {
  const vetoes = [];
  for (const run of runs.filter((entry) => entry.policy === ADAPTIVE_ARM)) {
    const { note = "", oracle } = run.outcome;
    const where = { fixture_id: run.fixture_id, repetition_index: run.repetition_index };
    if (note.startsWith("oracle:missing-must") || (oracle && /missing must:/.test(oracle.reason || ""))) {
      vetoes.push({ kind: "must-omitted", ...where, detail: oracle ? oracle.reason : note });
    }
    if (note.includes("fault-escaped")) vetoes.push({ kind: "fault-escaped", ...where, detail: note });
  }
  return vetoes;
}

/**
 * Judges a paired campaign against predeclared margins.
 * @param {{ runs: object[], report: object, margins: object, cohort: object, margins_digest?: string }} input
 *   `runs` are the completed paired runs and `report` their summarizePairedCohort result.
 * @returns {object} Frozen checkpoint with the decision, its reasons, and each margin's reading.
 */
function evaluatePilotCheckpoint({ runs, report, margins, cohort, margins_digest: marginsDigest }) {
  if (!Array.isArray(runs) || !isPlainObject(report) || !isPlainObject(cohort)) {
    throw new PilotCheckpointError("runs, report, and cohort are required", "INVALID_CHECKPOINT_INPUT");
  }
  validatePilotMargins(margins, cohort);

  const vetoes = [
    ...runVetoes(runs),
    ...report.defect_regressions.map((entry) => ({ kind: "defect-regression", fixture_id: entry.fixture_id, detail: entry.escaped.join(", ") })),
    ...report.regressions.map((fixtureId) => ({ kind: "pass-regression", fixture_id: fixtureId, detail: `${CONTROL_ARM} passes, ${ADAPTIVE_ARM} does not` })),
  ];

  const revisions = [];
  if (report.verdict !== "usable-comparison") revisions.push(`comparison ${report.verdict}: ${report.verdict_reason}`);
  const unapplied = Object.values(report.totals.runs_oracle_unapplied).reduce((sum, count) => sum + count, 0);
  if (unapplied > 0) revisions.push(`oracle unapplied on ${unapplied} run(s)`);
  const controlFailures = [...new Set(runs
    .filter((run) => run.policy === CONTROL_ARM && run.outcome.status === "fail")
    .map((run) => run.fixture_id))];
  if (controlFailures.length > 0) revisions.push(`control arm fails on ${controlFailures.join(", ")}: fix the harness before judging`);

  const passDelta = report.cohort.pass_rate_delta;
  const lowerMin = margins.non_inferiority.pass_rate_delta_ci95_lower_min;
  const nonInferiority = { ci95_lower: passDelta.ci95 ? passDelta.ci95[0] : null, min: lowerMin };
  nonInferiority.met = nonInferiority.ci95_lower !== null && nonInferiority.ci95_lower >= lowerMin;
  if (!nonInferiority.met) revisions.push(`non-inferiority not met: pass-rate delta ci95 lower ${nonInferiority.ci95_lower} < ${lowerMin}`);

  const phases = report.cohort.measurement_delta.phases_executed;
  const phasesMax = margins.practical_improvement.phases_executed_delta_mean_max;
  const practical = { phases_executed_delta_mean: phases.mean, max: phasesMax };
  practical.met = phases.mean !== null && phases.mean <= phasesMax;
  if (!practical.met) revisions.push(`practical improvement not met: phases delta mean ${phases.mean} > ${phasesMax}`);

  const holdoutIds = new Set(cohort.tasks
    .filter((task) => margins.holdout[task.stratum] === task.holdout_family)
    .map((task) => task.fixture_id));
  const holdoutReports = report.fixtures.filter((task) => holdoutIds.has(task.fixture_id));
  const holdout = {
    families: { ...margins.holdout },
    tasks: holdoutReports.length,
    tasks_comparable: holdoutReports.filter((task) => task.paired_repetitions > 0).length,
    below_margin: holdoutReports
      .filter((task) => task.pass_rate_delta !== null && task.pass_rate_delta < lowerMin)
      .map((task) => task.fixture_id),
  };
  holdout.met = holdout.tasks_comparable === holdout.tasks && holdout.below_margin.length === 0;
  if (!holdout.met) revisions.push(`holdout not met: ${holdout.tasks_comparable}/${holdout.tasks} comparable, below margin ${holdout.below_margin.join(", ") || "none"}`);

  const checkpoint = vetoes.length > 0 ? "reject" : revisions.length > 0 ? "revise" : "continue";
  return Object.freeze({
    checkpoint,
    margins_version: margins.margins_version,
    ...(marginsDigest ? { margins_digest: marginsDigest } : {}),
    vetoes,
    revisions,
    non_inferiority: nonInferiority,
    practical_improvement: practical,
    holdout,
  });
}

module.exports = {
  PilotCheckpointError,
  VETO_KINDS,
  evaluatePilotCheckpoint,
  loadPilotMargins,
  validatePilotMargins,
};
