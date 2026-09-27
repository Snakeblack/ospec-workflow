"use strict";

const { createHash } = require("node:crypto");

const { buildRunManifest } = require("./run-manifest.js");

const PLAN_OPTION_KEYS = new Set([
  "repetitions",
  "order_seed",
  "cohort_id",
  "base_worktree_root",
  "base_cache_root",
  "evaluator",
  "host",
  "runner_version",
]);
const EXECUTOR_STATUSES = new Set(["pass", "fail", "excluded"]);
const RUN_STATUSES = new Set(["pass", "fail", "incomplete", "excluded"]);
const runTasks = new WeakMap();

class RunnerError extends Error {
  constructor(message, code = "INVALID_RUNNER_INPUT") {
    super(message);
    this.name = "RunnerError";
    this.code = code;
  }
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value).forEach((item) => deepFreeze(item));
    Object.freeze(value);
  }
  return value;
}

function isPlainObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim() !== "";
}

function reject(message, code) {
  throw new RunnerError(message, code);
}

function validatePlanOptions(options) {
  if (!isPlainObject(options)) reject("runner options must be an object");
  for (const key of Object.keys(options)) {
    if (!PLAN_OPTION_KEYS.has(key)) reject(`runner options contain unknown field "${key}"`);
  }
  for (const field of [
    "order_seed",
    "cohort_id",
    "base_worktree_root",
    "base_cache_root",
    "evaluator",
    "host",
    "runner_version",
  ]) {
    if (!isNonEmptyString(options[field])) reject(`runner option ${field} must be a non-empty string`);
  }
  const repetitions = options.repetitions === undefined ? 1 : options.repetitions;
  if (!Number.isInteger(repetitions) || repetitions < 1) {
    reject("runner option repetitions must be an integer greater than or equal to 1");
  }
  return { ...options, repetitions };
}

function validateCohort(cohort) {
  if (!isPlainObject(cohort) || !Array.isArray(cohort.tasks) || cohort.tasks.length === 0) {
    reject("cohort tasks must be a non-empty array", "INVALID_COHORT");
  }
  if (typeof cohort.catalog_digest !== "string" || !/^[a-f0-9]{64}$/.test(cohort.catalog_digest)) {
    reject("cohort catalog_digest must be 64 lowercase hexadecimal characters", "INVALID_COHORT");
  }

  const fixtureIds = new Set();
  for (const task of cohort.tasks) {
    if (!isPlainObject(task) || !isNonEmptyString(task.fixture_id) || !isNonEmptyString(task.stratum)) {
      reject("each cohort task must have non-empty fixture_id and stratum", "INVALID_COHORT");
    }
    if (fixtureIds.has(task.fixture_id)) reject(`cohort contains duplicate fixture_id "${task.fixture_id}"`, "INVALID_COHORT");
    fixtureIds.add(task.fixture_id);
  }
}

function mulberry32(seed) {
  return function nextRandom() {
    let value = (seed += 0x6D2B79F5);
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffledTasks(tasks, orderSeed, catalogDigest, repetitionIndex) {
  // The PRNG seed is the first uint32 of SHA-256(`${order_seed}:${catalog_digest}:${r}`).
  const seedHex = createHash("sha256")
    .update(`${orderSeed}:${catalogDigest}:${repetitionIndex}`)
    .digest("hex");
  const random = mulberry32(Number.parseInt(seedHex.slice(0, 8), 16));
  const shuffled = [...tasks];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

function runNamespace(root, fixtureId, repetitionIndex) {
  return `${root.replace(/[\\/]+$/, "")}/${fixtureId}/r${repetitionIndex}`;
}

/**
 * Plans all K12 fixture repetitions in deterministic randomized execution order.
 * @param {object} cohort A cohort returned by loadCohort.
 * @param {object} options Planning options.
 * @returns {{ cohort_id: string, order_seed: string, repetitions: number, runs: object[] }}
 * @throws {RunnerError} When planning input is invalid.
 */
function planRuns(cohort, options) {
  const normalizedOptions = validatePlanOptions(options);
  validateCohort(cohort);
  const runs = [];

  for (let repetitionIndex = 0; repetitionIndex < normalizedOptions.repetitions; repetitionIndex += 1) {
    for (const task of shuffledTasks(
      cohort.tasks,
      normalizedOptions.order_seed,
      cohort.catalog_digest,
      repetitionIndex,
    )) {
      const manifest = buildRunManifest({
        schema_version: 1,
        cohort_id: normalizedOptions.cohort_id,
        fixture_id: task.fixture_id,
        stratum: task.stratum,
        policy: "fixed",
        repetition_index: repetitionIndex,
        repetitions_total: normalizedOptions.repetitions,
        order_seed: normalizedOptions.order_seed,
        worktree_path: runNamespace(normalizedOptions.base_worktree_root, task.fixture_id, repetitionIndex),
        cache_namespace: runNamespace(normalizedOptions.base_cache_root, task.fixture_id, repetitionIndex),
        evaluator: normalizedOptions.evaluator,
        host: normalizedOptions.host,
        catalog_digest: cohort.catalog_digest,
        outcome: { status: "incomplete", note: "planned" },
        versions: { runner_version: normalizedOptions.runner_version },
      });
      runTasks.set(manifest, task);
      runs.push(manifest);
    }
  }

  return deepFreeze({
    cohort_id: normalizedOptions.cohort_id,
    order_seed: normalizedOptions.order_seed,
    repetitions: normalizedOptions.repetitions,
    runs,
  });
}

function timestamp(now) {
  const current = now();
  if (current instanceof Date) return current.toISOString();
  if (typeof current === "string") return current;
  throw new RunnerError("executePlan now() must return a Date or RFC3339 string", "INVALID_CLOCK");
}

function executorOutcome(result) {
  if (!isPlainObject(result) || !EXECUTOR_STATUSES.has(result.status)) {
    throw new RunnerError("executor must return status pass, fail, or excluded", "INVALID_EXECUTOR_RESULT");
  }
  if (result.note !== undefined && typeof result.note !== "string") {
    throw new RunnerError("executor result note must be a string", "INVALID_EXECUTOR_RESULT");
  }
  return result.note === undefined ? { status: result.status } : { status: result.status, note: result.note };
}

/**
 * Executes a plan sequentially, preserving planned manifests as immutable records.
 * @param {{ runs: object[] }} plan A plan returned by planRuns.
 * @param {(manifest: object, task: object) => Promise<{status: string, note?: string}>} executor
 * @param {{ now?: () => Date|string }} [options]
 * @returns {Promise<{ runs: object[], aborted: false }>}
 */
async function executePlan(plan, executor, options = {}) {
  if (!isPlainObject(plan) || !Array.isArray(plan.runs)) {
    reject("executePlan plan must contain a runs array", "INVALID_PLAN");
  }
  if (typeof executor !== "function") reject("executePlan executor must be a function", "INVALID_EXECUTOR");
  if (!isPlainObject(options) || (options.now !== undefined && typeof options.now !== "function")) {
    reject("executePlan options.now must be a function", "INVALID_EXECUTION_OPTIONS");
  }
  const now = options.now || (() => new Date());
  const runs = [];

  for (const plannedManifest of plan.runs) {
    const startedAt = timestamp(now);
    let outcome;
    try {
      outcome = executorOutcome(await executor(plannedManifest, runTasks.get(plannedManifest)));
    } catch (error) {
      const message = error && typeof error.message === "string" ? error.message : String(error);
      outcome = { status: "incomplete", note: `executor-error: ${message}` };
    }
    const completedAt = timestamp(now);
    runs.push(buildRunManifest({
      ...plannedManifest,
      outcome,
      started_at: startedAt,
      completed_at: completedAt,
    }));
  }

  return deepFreeze({ runs, aborted: false });
}

function emptyTotals() {
  return {
    tasks_total: 0,
    tasks_with_all_pass: 0,
    tasks_with_any_fail: 0,
    tasks_with_any_incomplete: 0,
    tasks_with_any_excluded: 0,
    runs_total: 0,
    runs_pass: 0,
    runs_fail: 0,
    runs_incomplete: 0,
    runs_excluded: 0,
  };
}

function addRunTotal(totals, status) {
  totals.runs_total += 1;
  totals[`runs_${status}`] += 1;
}

function addTaskTotals(totals, fixture) {
  totals.tasks_total += 1;
  if (fixture.pass_count === fixture.repetitions_total && fixture.pass_count > 0) {
    totals.tasks_with_all_pass += 1;
  }
  if (fixture.fail_count > 0) totals.tasks_with_any_fail += 1;
  if (fixture.incomplete_count > 0) totals.tasks_with_any_incomplete += 1;
  if (fixture.excluded_count > 0) totals.tasks_with_any_excluded += 1;
}

/**
 * Summarizes completed K12 runs by correlated fixture task rather than treating runs as independent.
 * @param {object[]|{ runs: object[] }} completedRuns Completed run manifests.
 * @returns {object} Fixture, stratum, overall, exclusion, and verdict report.
 */
function summarizeCohort(completedRuns) {
  const runs = Array.isArray(completedRuns) ? completedRuns : completedRuns && completedRuns.runs;
  if (!Array.isArray(runs)) reject("completedRuns must be a runs array", "INVALID_COMPLETED_RUNS");

  const fixturesById = new Map();
  const exclusions = [];
  for (const run of runs) {
    if (!run || !isNonEmptyString(run.fixture_id) || !isNonEmptyString(run.stratum)
      || !Number.isInteger(run.repetition_index) || !Number.isInteger(run.repetitions_total)
      || !run.outcome || !RUN_STATUSES.has(run.outcome.status)) {
      reject("completed runs must be valid run manifests", "INVALID_COMPLETED_RUNS");
    }
    if (!fixturesById.has(run.fixture_id)) {
      fixturesById.set(run.fixture_id, {
        fixture_id: run.fixture_id,
        stratum: run.stratum,
        repetitions_total: run.repetitions_total,
        pass_count: 0,
        fail_count: 0,
        incomplete_count: 0,
        excluded_count: 0,
        statuses: new Set(),
      });
    }
    const fixture = fixturesById.get(run.fixture_id);
    fixture[`${run.outcome.status}_count`] += 1;
    fixture.statuses.add(run.outcome.status);
    if (run.outcome.status === "excluded") {
      exclusions.push({
        fixture_id: run.fixture_id,
        repetition_index: run.repetition_index,
        note: run.outcome.note === undefined ? "" : run.outcome.note,
      });
    }
  }

  const fixtures = [...fixturesById.values()]
    .sort((left, right) => left.fixture_id.localeCompare(right.fixture_id))
    .map((fixture) => ({
      fixture_id: fixture.fixture_id,
      stratum: fixture.stratum,
      repetitions_total: fixture.repetitions_total,
      pass_count: fixture.pass_count,
      fail_count: fixture.fail_count,
      incomplete_count: fixture.incomplete_count,
      excluded_count: fixture.excluded_count,
      note: fixture.statuses.size > 1 ? "outcome-varies-across-repetitions" : undefined,
    }));
  const overall = emptyTotals();
  const strata = {};

  for (const run of runs) {
    if (!strata[run.stratum]) strata[run.stratum] = emptyTotals();
    addRunTotal(overall, run.outcome.status);
    addRunTotal(strata[run.stratum], run.outcome.status);
  }
  for (const fixture of fixtures) {
    addTaskTotals(overall, fixture);
    addTaskTotals(strata[fixture.stratum], fixture);
  }

  const repetitionsTotal = fixtures.length === 0 ? 0 : Math.max(...fixtures.map((fixture) => fixture.repetitions_total));
  const allFixturesPresent = fixtures.length > 0 && fixtures.every((fixture) => (
    fixture.pass_count + fixture.fail_count + fixture.incomplete_count + fixture.excluded_count > 0
  ));
  const expectedRuns = overall.tasks_total * repetitionsTotal;
  let verdict = "usable-baseline";
  let verdictReason;
  if (overall.runs_incomplete > 0) {
    verdict = "incomplete-cohort";
    verdictReason = "incomplete-runs-present";
  } else if (!allFixturesPresent) {
    verdict = "incomplete-cohort";
    verdictReason = "no-fixture-runs-present";
  } else if (overall.runs_total !== expectedRuns) {
    verdict = "incomplete-cohort";
    verdictReason = "run-count-does-not-match-repetitions";
  }

  return deepFreeze({
    fixtures,
    strata,
    overall,
    exclusions,
    verdict,
    ...(verdictReason === undefined ? {} : { verdict_reason: verdictReason }),
  });
}

module.exports = {
  RunnerError,
  executePlan,
  planRuns,
  summarizeCohort,
};
