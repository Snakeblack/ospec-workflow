"use strict";

const assert = require("node:assert/strict");
const { mkdir, mkdtemp, rm, writeFile } = require("node:fs/promises");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const test = require("node:test");

const { loadCohort } = require("./cohort.js");
const {
  RunnerError,
  executePlan,
  planRuns,
  summarizeCohort,
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
