"use strict";

const assert = require("node:assert/strict");
const { mkdir, mkdtemp, rm, writeFile } = require("node:fs/promises");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const test = require("node:test");

const { loadCohort } = require("./cohort.js");
const {
  PAIRED_ARMS,
  RunnerError,
  executePlan,
  planPairedRuns,
  planRuns,
  summarizeCohort,
  summarizePairedCohort,
} = require("./runner.js");

const seedRoot = join(__dirname, "../../evals/__fixtures__/k12");
const seedCatalogPath = join(seedRoot, "oracle-catalog.json");
const seedTasksDir = join(seedRoot, "tasks");

function options(root, overrides = {}) {
  return {
    repetitions: 2,
    order_seed: "order-seed-001",
    cohort_id: "k12-test-cohort",
    base_worktree_root: join(root, "worktrees"),
    base_cache_root: join(root, "cache"),
    evaluator: "fake-evaluator",
    host: "test-host",
    runner_version: "1.0.0-test",
    ...overrides,
  };
}

function fixture(fixtureId, stratum = "local-reversible") {
  return {
    fixture_id: fixtureId,
    stratum,
    holdout_family: `${fixtureId}-family`,
    obligations: [{ id: "must-pass", criticality: "must", required_evidence: ["test-output"] }],
  };
}

async function syntheticCohort(fixtures) {
  const root = await mkdtemp(join(tmpdir(), "k12-runner-"));
  const tasksDir = join(root, "tasks");
  const catalogPath = join(root, "catalog.json");
  await writeFile(
    catalogPath,
    JSON.stringify({ schema_version: 1, catalog_version: "test-1", fixtures }),
    "utf8",
  );
  await Promise.all(fixtures.map(async (entry) => {
    const taskDir = join(tasksDir, entry.fixture_id);
    await mkdir(taskDir, { recursive: true });
    await writeFile(join(taskDir, "task.md"), "# Task\n", "utf8");
  }));
  return { root, cohort: loadCohort(catalogPath, tasksDir) };
}

test("plans the real seed cohort deterministically and changes order for a distinct seed", () => {
  const cohort = loadCohort(seedCatalogPath, seedTasksDir);
  const root = join(tmpdir(), "k12-runner-real");
  const first = planRuns(cohort, options(root));
  const second = planRuns(cohort, options(root));
  const otherSeed = planRuns(cohort, options(root, { order_seed: "order-seed-002" }));

  assert.equal(JSON.stringify(first), JSON.stringify(second));
  assert.notDeepEqual(
    first.runs.map((run) => run.fixture_id),
    otherSeed.runs.map((run) => run.fixture_id),
  );
});

test("plans every fixture once per repetition with isolated worktree and cache paths", async () => {
  const { root, cohort } = await syntheticCohort([
    fixture("alpha"),
    fixture("bravo", "behavior-repair"),
    fixture("charlie", "multi-module"),
  ]);

  try {
    const plan = planRuns(cohort, options(root, { repetitions: 3 }));
    const fixtureIds = cohort.tasks.map((task) => task.fixture_id).sort();

    for (let repetition = 0; repetition < 3; repetition += 1) {
      assert.deepEqual(
        plan.runs.filter((run) => run.repetition_index === repetition).map((run) => run.fixture_id).sort(),
        fixtureIds,
      );
    }
    assert.equal(new Set(plan.runs.map((run) => run.worktree_path)).size, plan.runs.length);
    assert.equal(new Set(plan.runs.map((run) => run.cache_namespace)).size, plan.runs.length);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects invalid planning options with RunnerError", async () => {
  const { root, cohort } = await syntheticCohort([fixture("alpha"), fixture("bravo"), fixture("charlie")]);

  try {
    assert.throws(() => planRuns(cohort, options(root, { order_seed: "" })), RunnerError);
    assert.throws(() => planRuns(cohort, options(root, { repetitions: 0 })), RunnerError);
    assert.throws(() => planRuns(cohort, { ...options(root), unexpected: true }), RunnerError);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("executes sequentially without mutating frozen planned manifests and records executor errors", async () => {
  const { root, cohort } = await syntheticCohort([
    fixture("always-pass"),
    fixture("mixed-failure", "behavior-repair"),
    fixture("executor-throws", "multi-module"),
    fixture("always-excluded", "adversarial"),
  ]);

  try {
    const plan = planRuns(cohort, options(root));
    const plannedJson = JSON.stringify(plan);
    let active = 0;
    const completed = await executePlan(plan, async (manifest, task) => {
      assert.equal(active, 0);
      active += 1;
      assert.equal(task.fixture_id, manifest.fixture_id);
      active -= 1;
      if (manifest.fixture_id === "executor-throws") throw new Error("synthetic executor failure");
      if (manifest.fixture_id === "always-excluded") return { status: "excluded", note: "not supported" };
      if (manifest.fixture_id === "mixed-failure" && manifest.repetition_index === 0) {
        return { status: "fail", note: "first repetition fails" };
      }
      return { status: "pass", note: "ok" };
    }, { now: () => "2026-04-01T00:00:00Z" });

    assert.equal(completed.aborted, false);
    assert.equal(JSON.stringify(plan), plannedJson);
    assert.ok(plan.runs.every((run) => Object.isFrozen(run) && Object.isFrozen(run.outcome)));
    assert.equal(completed.runs.filter((run) => run.outcome.status === "pass").length, 3);
    assert.equal(completed.runs.filter((run) => run.outcome.status === "fail").length, 1);
    assert.equal(completed.runs.filter((run) => run.outcome.status === "excluded").length, 2);
    assert.ok(completed.runs.filter((run) => run.fixture_id === "executor-throws")
      .every((run) => run.outcome.status === "incomplete"
        && run.outcome.note === "executor-error: synthetic executor failure"));
    assert.ok(completed.runs.every((run) => run.started_at === "2026-04-01T00:00:00Z"
      && run.completed_at === "2026-04-01T00:00:00Z"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("summarizes correlated repetitions, exclusions, variance, and cohort completeness", async () => {
  const { root, cohort } = await syntheticCohort([
    fixture("always-pass"),
    fixture("mixed-failure", "behavior-repair"),
    fixture("executor-throws", "multi-module"),
    fixture("always-excluded", "adversarial"),
  ]);

  try {
    const completed = await executePlan(planRuns(cohort, options(root)), async (manifest) => {
      if (manifest.fixture_id === "executor-throws") throw new Error("synthetic executor failure");
      if (manifest.fixture_id === "always-excluded") return { status: "excluded", note: "not supported" };
      if (manifest.fixture_id === "mixed-failure" && manifest.repetition_index === 0) return { status: "fail" };
      return { status: "pass" };
    }, { now: () => "2026-04-01T00:00:00Z" });
    const summary = summarizeCohort(completed.runs);

    assert.deepEqual(summary.overall, {
      tasks_total: 4,
      tasks_with_all_pass: 1,
      tasks_with_any_fail: 1,
      tasks_with_any_incomplete: 1,
      tasks_with_any_excluded: 1,
      runs_total: 8,
      runs_pass: 3,
      runs_fail: 1,
      runs_incomplete: 2,
      runs_excluded: 2,
    });
    assert.deepEqual(summary.strata["local-reversible"], {
      tasks_total: 1,
      tasks_with_all_pass: 1,
      tasks_with_any_fail: 0,
      tasks_with_any_incomplete: 0,
      tasks_with_any_excluded: 0,
      runs_total: 2,
      runs_pass: 2,
      runs_fail: 0,
      runs_incomplete: 0,
      runs_excluded: 0,
    });
    assert.equal(summary.fixtures.find((entry) => entry.fixture_id === "mixed-failure").note,
      "outcome-varies-across-repetitions");
    assert.equal(summary.exclusions.length, 2);
    assert.equal(summary.verdict, "incomplete-cohort");
    assert.equal(summary.verdict_reason, "incomplete-runs-present");

    const clean = await executePlan(planRuns(cohort, options(root)), async () => ({ status: "pass" }), {
      now: () => "2026-04-01T00:00:00Z",
    });
    assert.equal(summarizeCohort(clean.runs).verdict, "usable-baseline");
    assert.equal(summarizeCohort(clean.runs.slice(1)).verdict, "incomplete-cohort");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("integrates the real seed cohort through a two-repetition usable baseline", async () => {
  const cohort = loadCohort(seedCatalogPath, seedTasksDir);
  const plan = planRuns(cohort, options(join(tmpdir(), "k12-runner-integration")));
  const completed = await executePlan(plan, async () => ({ status: "pass", note: "fake baseline" }), {
    now: () => "2026-04-01T00:00:00Z",
  });
  const summary = summarizeCohort(completed.runs);

  assert.equal(summary.verdict, "usable-baseline");
  assert.equal(summary.overall.tasks_total, 11);
  assert.equal(summary.overall.runs_total, 22);
});

test("executePlan preserves executor measurements and oracle in the completed outcome", async () => {
  const cohort = loadCohort(seedCatalogPath, seedTasksDir);
  const plan = planRuns(cohort, options(seedRoot, { repetitions: 1 }));
  const measurements = {
    phases_executed: 3,
    effects_executed: 3,
    events_recorded: 6,
    wall_ms: 11,
    interruptions: 0,
    recoveries: 0,
  };
  const oracle = { applied: false, reason: "no observed contract for fixture x" };
  const { runs } = await executePlan(plan, async () => ({
    status: "pass",
    note: "machinery-baseline ok",
    measurements,
    oracle,
  }), { now: () => "2026-09-27T00:00:00.000Z" });
  for (const run of runs) {
    assert.deepEqual(run.outcome.measurements, measurements);
    assert.deepEqual(run.outcome.oracle, oracle);
  }
});

test("executePlan rejects an executor result with malformed measurements", async () => {
  const cohort = loadCohort(seedCatalogPath, seedTasksDir);
  const plan = planRuns(cohort, options(seedRoot, { repetitions: 1 }));
  await assert.rejects(
    () => executePlan(plan, async () => ({ status: "pass", measurements: { phases_executed: "many" } })),
    /measurements/
  );
});

const FIXED_CLOCK = { now: () => "2026-10-02T00:00:00.000Z" };

function pilotMeasurements(phases, wallMs) {
  return {
    phases_executed: phases,
    effects_executed: 1,
    events_recorded: phases,
    wall_ms: wallMs,
    interruptions: 0,
    recoveries: 0,
  };
}

test("planPairedRuns pairs both arms per fixture repetition with isolated namespaces and seeded arm order", () => {
  const cohort = loadCohort(seedCatalogPath, seedTasksDir);
  const root = join(tmpdir(), "k12-paired-real");
  const plan = planPairedRuns(cohort, options(root, { repetitions: 3 }));
  const again = planPairedRuns(cohort, options(root, { repetitions: 3 }));

  assert.deepEqual(plan.arms, PAIRED_ARMS);
  assert.deepEqual(PAIRED_ARMS, ["fixed", "adaptive-repair-v1"]);
  assert.equal(JSON.stringify(plan), JSON.stringify(again));
  assert.equal(plan.runs.length, cohort.tasks.length * 3 * 2);
  assert.equal(new Set(plan.runs.map((run) => run.worktree_path)).size, plan.runs.length);
  assert.equal(new Set(plan.runs.map((run) => run.cache_namespace)).size, plan.runs.length);
  assert.equal(new Set(plan.runs.map((run) => run.run_id)).size, plan.runs.length);
  assert.ok(plan.runs.every((run) => run.outcome.status === "incomplete"));

  // Both arms of a pair are adjacent; the task order per repetition matches planRuns.
  const firstArms = [];
  for (let index = 0; index < plan.runs.length; index += 2) {
    const [left, right] = [plan.runs[index], plan.runs[index + 1]];
    assert.equal(left.fixture_id, right.fixture_id);
    assert.equal(left.repetition_index, right.repetition_index);
    assert.deepEqual([left.policy, right.policy].sort(), [...PAIRED_ARMS].sort());
    assert.ok(left.worktree_path.endsWith(`/${left.policy}`));
    firstArms.push(left.policy);
  }
  const fixedOnly = planRuns(cohort, options(root, { repetitions: 3 }));
  assert.deepEqual(
    plan.runs.filter((run) => run.policy === "fixed").map((run) => [run.fixture_id, run.repetition_index]),
    fixedOnly.runs.map((run) => [run.fixture_id, run.repetition_index]),
  );
  // The arm that runs first varies across pairs instead of always favoring one arm.
  assert.equal(new Set(firstArms).size, 2);
});

test("planRuns keeps the fixed-only plan unchanged and summarizeCohort refuses mixed arms", async () => {
  const cohort = loadCohort(seedCatalogPath, seedTasksDir);
  const fixedOnly = planRuns(cohort, options(seedRoot, { repetitions: 1 }));
  assert.ok(fixedOnly.runs.every((run) => run.policy === "fixed" && !run.worktree_path.endsWith("/fixed")));

  const paired = planPairedRuns(cohort, options(seedRoot, { repetitions: 1 }));
  const { runs } = await executePlan(paired, async () => ({ status: "pass" }), FIXED_CLOCK);
  assert.throws(() => summarizeCohort(runs), (error) => error instanceof RunnerError && error.code === "MIXED_POLICIES");
});

test("summarizePairedCohort reports per-task paired deltas, regressions, and t intervals over tasks", async () => {
  const { root, cohort } = await syntheticCohort([
    fixture("alpha"),
    fixture("bravo", "behavior-repair"),
    fixture("charlie", "multi-module"),
  ]);
  try {
    const plan = planPairedRuns(cohort, options(root, { repetitions: 2 }));
    const { runs } = await executePlan(plan, async (manifest) => {
      const adaptive = manifest.policy === "adaptive-repair-v1";
      // bravo regresses under adaptive in repetition 1; adaptive runs fewer phases everywhere.
      const fail = adaptive && manifest.fixture_id === "bravo" && manifest.repetition_index === 1;
      return {
        status: fail ? "fail" : "pass",
        measurements: pilotMeasurements(adaptive ? 3 : 5, adaptive ? 80 : 100),
        oracle: { applied: true, reason: "catalog compared" },
      };
    }, FIXED_CLOCK);

    const report = summarizePairedCohort(runs);
    assert.equal(report.verdict, "usable-comparison");
    assert.equal(report.verdict_reason, undefined);
    assert.deepEqual(report.regressions, ["bravo"]);
    assert.deepEqual(report.improvements, []);

    const bravo = report.fixtures.find((task) => task.fixture_id === "bravo");
    assert.equal(bravo.paired_repetitions, 2);
    assert.deepEqual(bravo.pass_rate, { fixed: 1, "adaptive-repair-v1": 0.5 });
    assert.equal(bravo.pass_rate_delta, -0.5);
    assert.equal(bravo.measurement_delta.phases_executed, -2);
    assert.equal(bravo.measurement_delta.wall_ms, -20);

    // The task is the unit: three tasks, df = 2, t = 4.303.
    const passDelta = report.cohort.pass_rate_delta;
    assert.equal(passDelta.tasks, 3);
    assert.equal(passDelta.mean, round6(-0.5 / 3));
    const sd = Math.sqrt(((0 + 0.5 / 3) ** 2 * 2 + (-0.5 + 0.5 / 3) ** 2) / 2);
    assert.equal(passDelta.sd, round6(sd));
    assert.deepEqual(passDelta.ci95, [
      round6(-0.5 / 3 - 4.303 * sd / Math.sqrt(3)),
      round6(-0.5 / 3 + 4.303 * sd / Math.sqrt(3)),
    ]);
    assert.deepEqual(report.cohort.measurement_delta.phases_executed, { tasks: 3, mean: -2, sd: 0, ci95: [-2, -2] });
    assert.deepEqual(report.totals, {
      tasks_total: 3,
      tasks_comparable: 3,
      pairs_total: 6,
      pairs_missing_arm: 0,
      pairs_incomplete: 0,
      pairs_excluded: 0,
      runs_oracle_unapplied: { fixed: 0, "adaptive-repair-v1": 0 },
    });
    assert.equal(Object.isFrozen(report), true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

function round6(value) {
  return Math.round(value * 1e6) / 1e6;
}

test("summarizePairedCohort lists excluded pairs, counts unapplied oracles, and flags incomplete comparisons", async () => {
  const { root, cohort } = await syntheticCohort([fixture("alpha"), fixture("bravo"), fixture("charlie")]);
  try {
    const plan = planPairedRuns(cohort, options(root, { repetitions: 1 }));
    const { runs } = await executePlan(plan, async (manifest) => (
      manifest.fixture_id === "charlie" && manifest.policy === "adaptive-repair-v1"
        ? { status: "excluded", note: "host timeout" }
        : { status: "pass" }
    ), FIXED_CLOCK);

    const report = summarizePairedCohort(runs);
    assert.equal(report.verdict, "usable-comparison");
    assert.deepEqual(report.exclusions, [
      { fixture_id: "charlie", repetition_index: 0, arms: ["adaptive-repair-v1"], notes: ["host timeout"] },
    ]);
    assert.equal(report.totals.tasks_comparable, 2);
    assert.equal(report.fixtures.find((task) => task.fixture_id === "charlie").pass_rate_delta, null);
    assert.deepEqual(report.totals.runs_oracle_unapplied, { fixed: 3, "adaptive-repair-v1": 3 });
    assert.equal(report.cohort.pass_rate_delta.tasks, 2);

    const missing = summarizePairedCohort(runs.filter((run) => !(run.fixture_id === "alpha" && run.policy === "fixed")));
    assert.equal(missing.verdict, "incomplete-comparison");
    assert.equal(missing.verdict_reason, "pair-missing-arm");

    const unfinished = summarizePairedCohort(planPairedRuns(cohort, options(root, { repetitions: 1 })).runs);
    assert.equal(unfinished.verdict, "incomplete-comparison");
    assert.equal(unfinished.verdict_reason, "incomplete-runs-present");

    const twoReps = planPairedRuns(cohort, options(root, { repetitions: 2 }));
    const { runs: twoRepRuns } = await executePlan(twoReps, async () => ({ status: "pass" }), FIXED_CLOCK);
    const short = summarizePairedCohort(twoRepRuns.filter((run) => run.repetition_index === 0));
    assert.equal(short.verdict_reason, "pair-count-does-not-match-repetitions");

    assert.equal(summarizePairedCohort([]).verdict_reason, "no-paired-runs-present");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("summarizePairedCohort rejects duplicate arms, foreign arms, and inconsistent pairs", async () => {
  const cohort = loadCohort(seedCatalogPath, seedTasksDir);
  const plan = planPairedRuns(cohort, options(seedRoot, { repetitions: 1 }));
  const { runs } = await executePlan(plan, async () => ({ status: "pass" }), FIXED_CLOCK);

  const isInvalid = (error) => error instanceof RunnerError && error.code === "INVALID_COMPLETED_RUNS";
  assert.throws(() => summarizePairedCohort([...runs, runs[0]]), isInvalid);
  assert.throws(() => summarizePairedCohort([...runs.slice(1), { ...runs[0], policy: "kernel" }]), isInvalid);
  assert.throws(() => summarizePairedCohort([...runs.slice(1), { ...runs[0], stratum: "adversarial" }]), isInvalid);
  assert.throws(() => summarizePairedCohort("runs"), isInvalid);
});
