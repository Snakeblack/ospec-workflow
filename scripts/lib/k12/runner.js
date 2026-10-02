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
// The paired pilot always compares the control arm against the one fixed
// Adaptive arm; it never discovers or adds arms from its input.
const CONTROL_ARM = "fixed";
const PAIRED_ARMS = Object.freeze([CONTROL_ARM, "adaptive-repair-v1"]);
const MEASUREMENT_FIELDS = Object.freeze([
  "phases_executed",
  "effects_executed",
  "events_recorded",
  "wall_ms",
  "interruptions",
  "recoveries",
]);
// Two-sided 95% Student t quantiles indexed by degrees of freedom - 1 (df 1..30);
// larger samples fall back to the normal quantile. The task is the statistical
// unit, so df = comparable tasks - 1.
const T_975 = Object.freeze([
  12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228,
  2.201, 2.179, 2.16, 2.145, 2.131, 2.12, 2.11, 2.101, 2.093, 2.086,
  2.08, 2.074, 2.069, 2.064, 2.06, 2.056, 2.052, 2.048, 2.045, 2.042,
]);
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

function plannedManifest(cohort, normalizedOptions, task, repetitionIndex, policy, armSuffix) {
  const manifest = buildRunManifest({
    schema_version: 1,
    cohort_id: normalizedOptions.cohort_id,
    fixture_id: task.fixture_id,
    stratum: task.stratum,
    policy,
    repetition_index: repetitionIndex,
    repetitions_total: normalizedOptions.repetitions,
    order_seed: normalizedOptions.order_seed,
    worktree_path: `${runNamespace(normalizedOptions.base_worktree_root, task.fixture_id, repetitionIndex)}${armSuffix}`,
    cache_namespace: `${runNamespace(normalizedOptions.base_cache_root, task.fixture_id, repetitionIndex)}${armSuffix}`,
    evaluator: normalizedOptions.evaluator,
    host: normalizedOptions.host,
    catalog_digest: cohort.catalog_digest,
    outcome: { status: "incomplete", note: "planned" },
    versions: { runner_version: normalizedOptions.runner_version },
  });
  runTasks.set(manifest, task);
  return manifest;
}

function armOrder(orderSeed, catalogDigest, repetitionIndex, fixtureId) {
  // One SHA-256 bit per (seed, catalog, repetition, fixture) decides which arm
  // runs first: randomized across pairs, byte-for-byte reproducible.
  const digest = createHash("sha256")
    .update(`arm-order:${orderSeed}:${catalogDigest}:${repetitionIndex}:${fixtureId}`)
    .digest();
  return (digest[0] & 1) === 0 ? [...PAIRED_ARMS] : [...PAIRED_ARMS].reverse();
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
      runs.push(plannedManifest(cohort, normalizedOptions, task, repetitionIndex, CONTROL_ARM, ""));
    }
  }

  return deepFreeze({
    cohort_id: normalizedOptions.cohort_id,
    order_seed: normalizedOptions.order_seed,
    repetitions: normalizedOptions.repetitions,
    runs,
  });
}

/**
 * Plans the paired Adaptive Repair pilot: every fixture repetition runs once per
 * arm (`fixed` control and `adaptive-repair-v1`). Task order per repetition is
 * the same seeded shuffle as planRuns, and the arm order inside each pair is
 * seeded too. Each arm gets its own worktree and cache namespace; planned
 * manifests never claim outcomes.
 * @param {object} cohort A cohort returned by loadCohort.
 * @param {object} options Planning options (same as planRuns).
 * @returns {{ cohort_id: string, order_seed: string, repetitions: number, arms: string[], runs: object[] }}
 * @throws {RunnerError} When planning input is invalid.
 */
function planPairedRuns(cohort, options) {
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
      const arms = armOrder(normalizedOptions.order_seed, cohort.catalog_digest, repetitionIndex, task.fixture_id);
      for (const policy of arms) {
        runs.push(plannedManifest(cohort, normalizedOptions, task, repetitionIndex, policy, `/${policy}`));
      }
    }
  }

  return deepFreeze({
    cohort_id: normalizedOptions.cohort_id,
    order_seed: normalizedOptions.order_seed,
    repetitions: normalizedOptions.repetitions,
    arms: [...PAIRED_ARMS],
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
  // Preserve the executor's structured records; buildRunManifest enforces their
  // complete-record fail-closed shapes (unknown keys, missing fields, types).
  if (result.measurements !== undefined && !isPlainObject(result.measurements)) {
    throw new RunnerError("executor result measurements must be an object", "INVALID_EXECUTOR_RESULT");
  }
  if (result.oracle !== undefined && !isPlainObject(result.oracle)) {
    throw new RunnerError("executor result oracle must be an object", "INVALID_EXECUTOR_RESULT");
  }
  if (result.defects !== undefined && !isPlainObject(result.defects)) {
    throw new RunnerError("executor result defects must be an object", "INVALID_EXECUTOR_RESULT");
  }
  const outcome = { status: result.status };
  if (result.note !== undefined) outcome.note = result.note;
  if (result.measurements !== undefined) outcome.measurements = result.measurements;
  if (result.oracle !== undefined) outcome.oracle = result.oracle;
  if (result.defects !== undefined) outcome.defects = result.defects;
  return outcome;
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
  const policies = new Set();
  for (const run of runs) {
    if (!run || !isNonEmptyString(run.fixture_id) || !isNonEmptyString(run.stratum)
      || !Number.isInteger(run.repetition_index) || !Number.isInteger(run.repetitions_total)
      || !run.outcome || !RUN_STATUSES.has(run.outcome.status)) {
      reject("completed runs must be valid run manifests", "INVALID_COMPLETED_RUNS");
    }
    // A single-policy baseline never blends arms; paired runs go through
    // summarizePairedCohort.
    policies.add(run.policy);
    if (policies.size > 1) {
      reject("completed runs mix policies; summarize paired runs with summarizePairedCohort", "MIXED_POLICIES");
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

function round(value) {
  return Math.round(value * 1e6) / 1e6;
}

/**
 * Mean, sample standard deviation, and a two-sided 95% t interval over
 * per-task values. With fewer than two tasks the spread is undefined (null).
 */
function taskInterval(values) {
  const n = values.length;
  if (n === 0) return { tasks: 0, mean: null, sd: null, ci95: null };
  const mean = values.reduce((sum, value) => sum + value, 0) / n;
  if (n < 2) return { tasks: n, mean: round(mean), sd: null, ci95: null };
  const sd = Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (n - 1));
  const quantile = n - 1 <= T_975.length ? T_975[n - 2] : 1.96;
  const half = quantile * (sd / Math.sqrt(n));
  return { tasks: n, mean: round(mean), sd: round(sd), ci95: [round(mean - half), round(mean + half)] };
}

function validatePairedRun(run) {
  if (!run || !isNonEmptyString(run.fixture_id) || !isNonEmptyString(run.stratum)
    || !Number.isInteger(run.repetition_index) || !Number.isInteger(run.repetitions_total)
    || !run.outcome || !RUN_STATUSES.has(run.outcome.status)) {
    reject("completed runs must be valid run manifests", "INVALID_COMPLETED_RUNS");
  }
  if (!PAIRED_ARMS.includes(run.policy)) {
    reject(`paired runs must use the arms ${PAIRED_ARMS.join(", ")}; got "${run.policy}"`, "INVALID_COMPLETED_RUNS");
  }
}

function groupPairs(runs) {
  const pairs = new Map();
  for (const run of runs) {
    validatePairedRun(run);
    const key = JSON.stringify([run.fixture_id, run.repetition_index]);
    if (!pairs.has(key)) {
      pairs.set(key, {
        fixture_id: run.fixture_id,
        stratum: run.stratum,
        repetition_index: run.repetition_index,
        repetitions_total: run.repetitions_total,
        arms: {},
      });
    }
    const pair = pairs.get(key);
    if (pair.stratum !== run.stratum || pair.repetitions_total !== run.repetitions_total) {
      reject(`paired runs for ${run.fixture_id} r${run.repetition_index} disagree on stratum or repetitions`, "INVALID_COMPLETED_RUNS");
    }
    if (pair.arms[run.policy]) {
      reject(`duplicate ${run.policy} run for ${run.fixture_id} r${run.repetition_index}`, "INVALID_COMPLETED_RUNS");
    }
    pair.arms[run.policy] = run;
  }
  for (const pair of pairs.values()) {
    // Both arms consume the same scripted worker output, so arms that ran the
    // seeded variants must agree on how many; an arm whose clean output failed
    // reports none and surfaces as a pass-rate regression instead.
    const seeded = PAIRED_ARMS
      .filter((arm) => pair.arms[arm] && pair.arms[arm].outcome.defects)
      .map((arm) => pair.arms[arm].outcome.defects.seeded);
    if (new Set(seeded).size > 1) {
      reject(`paired runs for ${pair.fixture_id} r${pair.repetition_index} disagree on seeded defects`, "INVALID_COMPLETED_RUNS");
    }
  }
  return [...pairs.values()];
}

/**
 * Sums seeded-defect tallies of one arm over a task's paired repetitions; the
 * escaped ids are the union across repetitions.
 */
function armDefectTally(paired, armIndex) {
  const tally = { seeded: 0, detected: 0, escaped: [] };
  for (const arms of paired) {
    const defects = arms[armIndex].outcome.defects;
    if (!defects) continue;
    tally.seeded += defects.seeded;
    tally.detected += defects.detected;
    tally.escaped.push(...defects.escaped.filter((id) => !tally.escaped.includes(id)));
  }
  tally.escaped.sort();
  return tally;
}

function pairedTaskReport(task) {
  const count = task.paired.length;
  const passRate = (armIndex) => (count === 0 ? null
    : round(task.paired.reduce((sum, arms) => sum + (arms[armIndex].outcome.status === "pass" ? 1 : 0), 0) / count));
  const measured = task.paired.filter((arms) => arms.every((run) => run.outcome.measurements));
  const measurementDelta = {};
  for (const field of MEASUREMENT_FIELDS) {
    measurementDelta[field] = measured.length === 0 ? null : round(measured.reduce(
      (sum, arms) => sum + arms[1].outcome.measurements[field] - arms[0].outcome.measurements[field],
      0,
    ) / measured.length);
  }
  const controlRate = passRate(0);
  const adaptiveRate = passRate(1);
  const seededAny = task.paired.some((arms) => arms.some((run) => run.outcome.defects));
  const defects = seededAny
    ? { [PAIRED_ARMS[0]]: armDefectTally(task.paired, 0), [PAIRED_ARMS[1]]: armDefectTally(task.paired, 1) }
    : null;
  return {
    fixture_id: task.fixture_id,
    stratum: task.stratum,
    repetitions_total: task.repetitions_total,
    paired_repetitions: count,
    pass_rate: { [PAIRED_ARMS[0]]: controlRate, [PAIRED_ARMS[1]]: adaptiveRate },
    pass_rate_delta: count === 0 ? null : round(adaptiveRate - controlRate),
    measurement_delta: measurementDelta,
    defects,
    regression: count > 0 && controlRate === 1 && adaptiveRate < 1,
    improvement: count > 0 && adaptiveRate === 1 && controlRate < 1,
  };
}

/**
 * Seeded defects the adaptive arm let escape while the control arm detected
 * them: veto candidates, like pass-rate regressions.
 */
function defectRegressions(fixtures) {
  return fixtures
    .filter((task) => task.defects)
    .map((task) => ({
      fixture_id: task.fixture_id,
      escaped: task.defects[PAIRED_ARMS[1]].escaped
        .filter((id) => !task.defects[PAIRED_ARMS[0]].escaped.includes(id)),
    }))
    .filter((entry) => entry.escaped.length > 0);
}

/** Per-arm seeded/detected/escaped counts over the comparable tasks. */
function cohortDefectTotals(comparable) {
  return Object.fromEntries(PAIRED_ARMS.map((arm) => {
    const totals = { seeded: 0, detected: 0, escaped: 0 };
    for (const task of comparable) {
      if (!task.defects) continue;
      totals.seeded += task.defects[arm].seeded;
      totals.detected += task.defects[arm].detected;
    }
    totals.escaped = totals.seeded - totals.detected;
    return [arm, totals];
  }));
}

/**
 * Summarizes the paired pilot by task, the statistical unit. A pair is the two
 * arms of one fixture repetition. Only pairs where both arms passed or failed
 * enter the paired differences (adaptive minus fixed); pairs with an excluded
 * arm are listed, never dropped silently, and any missing or incomplete arm
 * makes the comparison incomplete. Repetitions are averaged per task first,
 * then the cohort interval runs over tasks. Regressions (fixed passed every
 * paired repetition, adaptive failed at least one) are listed as veto
 * candidates, and so are seeded defects only the adaptive arm let escape
 * (`defect_regressions`); seeded-defect tallies stay orthogonal to the pass
 * rate. Nothing here decides promotion.
 * @param {object[]|{ runs: object[] }} completedRuns Completed paired run manifests.
 * @returns {object} Per-task paired report, cohort intervals, exclusions, totals, and verdict.
 */
function summarizePairedCohort(completedRuns) {
  const runs = Array.isArray(completedRuns) ? completedRuns : completedRuns && completedRuns.runs;
  if (!Array.isArray(runs)) reject("completedRuns must be a runs array", "INVALID_COMPLETED_RUNS");
  const pairs = groupPairs(runs);

  const exclusions = [];
  const oracleUnapplied = Object.fromEntries(PAIRED_ARMS.map((arm) => [arm, 0]));
  const tasks = new Map();
  let missingArm = 0;
  let incomplete = 0;
  for (const pair of pairs) {
    if (!tasks.has(pair.fixture_id)) {
      tasks.set(pair.fixture_id, {
        fixture_id: pair.fixture_id,
        stratum: pair.stratum,
        repetitions_total: pair.repetitions_total,
        pairs_seen: 0,
        paired: [],
      });
    }
    const task = tasks.get(pair.fixture_id);
    task.pairs_seen += 1;
    const arms = PAIRED_ARMS.map((arm) => pair.arms[arm]);
    for (const run of arms) {
      if (run && !(run.outcome.oracle && run.outcome.oracle.applied === true)) oracleUnapplied[run.policy] += 1;
    }
    if (arms.some((run) => !run)) {
      missingArm += 1;
    } else if (arms.some((run) => run.outcome.status === "incomplete")) {
      incomplete += 1;
    } else if (arms.some((run) => run.outcome.status === "excluded")) {
      const excluded = arms.filter((run) => run.outcome.status === "excluded");
      exclusions.push({
        fixture_id: pair.fixture_id,
        repetition_index: pair.repetition_index,
        arms: excluded.map((run) => run.policy),
        notes: excluded.map((run) => (run.outcome.note === undefined ? "" : run.outcome.note)),
      });
    } else {
      task.paired.push(arms);
    }
  }

  const fixtures = [...tasks.values()]
    .sort((left, right) => left.fixture_id.localeCompare(right.fixture_id))
    .map(pairedTaskReport);
  const comparable = fixtures.filter((task) => task.paired_repetitions > 0);

  let verdictReason;
  if (pairs.length === 0) verdictReason = "no-paired-runs-present";
  else if (missingArm > 0) verdictReason = "pair-missing-arm";
  else if (incomplete > 0) verdictReason = "incomplete-runs-present";
  else if ([...tasks.values()].some((task) => task.pairs_seen !== task.repetitions_total)) {
    verdictReason = "pair-count-does-not-match-repetitions";
  } else if (comparable.length === 0) verdictReason = "no-comparable-pairs";

  return deepFreeze({
    arms: [...PAIRED_ARMS],
    fixtures,
    cohort: {
      pass_rate_delta: taskInterval(comparable.map((task) => task.pass_rate_delta)),
      measurement_delta: Object.fromEntries(MEASUREMENT_FIELDS.map((field) => [
        field,
        taskInterval(comparable
          .filter((task) => task.measurement_delta[field] !== null)
          .map((task) => task.measurement_delta[field])),
      ])),
    },
    regressions: fixtures.filter((task) => task.regression).map((task) => task.fixture_id),
    improvements: fixtures.filter((task) => task.improvement).map((task) => task.fixture_id),
    defect_regressions: defectRegressions(fixtures),
    exclusions,
    totals: {
      tasks_total: fixtures.length,
      tasks_comparable: comparable.length,
      pairs_total: pairs.length,
      pairs_missing_arm: missingArm,
      pairs_incomplete: incomplete,
      pairs_excluded: exclusions.length,
      runs_oracle_unapplied: oracleUnapplied,
      defects: cohortDefectTotals(comparable),
    },
    verdict: verdictReason === undefined ? "usable-comparison" : "incomplete-comparison",
    ...(verdictReason === undefined ? {} : { verdict_reason: verdictReason }),
  });
}

module.exports = {
  PAIRED_ARMS,
  RunnerError,
  executePlan,
  planPairedRuns,
  planRuns,
  summarizeCohort,
  summarizePairedCohort,
};
