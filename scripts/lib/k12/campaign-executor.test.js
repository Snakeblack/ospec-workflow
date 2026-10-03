"use strict";

const assert = require("node:assert/strict");
const { access, mkdir, mkdtemp, rm, writeFile } = require("node:fs/promises");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const test = require("node:test");

const { loadCohort } = require("./cohort.js");
const { createHarnessCampaignExecutor } = require("./campaign-executor.js");
const { executePlan, planRuns, summarizeCohort } = require("./runner.js");

const seedRoot = join(__dirname, "../../evals/__fixtures__/k12");
const seedCatalogPath = join(seedRoot, "oracle-catalog.json");
const seedTasksDir = join(seedRoot, "tasks");

function planOptions(root, overrides = {}) {
  return {
    repetitions: 1,
    order_seed: "campaign-executor-test",
    cohort_id: "k12-campaign-test",
    base_worktree_root: join(root, "worktrees"),
    base_cache_root: join(root, "cache"),
    evaluator: "harness",
    host: "node-test",
    runner_version: "k12-campaign-test",
    ...overrides,
  };
}

function runFor(cohort, root, fixtureId, overrides = {}) {
  return planRuns(cohort, planOptions(root, overrides)).runs.find((run) => run.fixture_id === fixtureId);
}

test("materializes a local-reversible task and records complete machinery measurements", async () => {
  const root = await mkdtemp(join(tmpdir(), "k12-campaign-executor-"));
  try {
    const cohort = loadCohort(seedCatalogPath, seedTasksDir);
    const manifest = runFor(cohort, root, "local-config-default");
    const task = cohort.tasks.find((entry) => entry.fixture_id === manifest.fixture_id);
    const outcome = await createHarnessCampaignExecutor({ cohort, now: () => 100 }) (manifest, task);

    assert.equal(outcome.status, "pass");
    assert.equal(outcome.note, "machinery-baseline ok");
    assert.deepEqual(outcome.measurements, {
      phases_executed: 2,
      effects_executed: 2,
      events_recorded: 2,
      wall_ms: 0,
      interruptions: 0,
      recoveries: 0,
    });
    await access(join(manifest.worktree_path, "task.md"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("injects and recovers an adversarial interruption only when faults are enabled", async () => {
  const root = await mkdtemp(join(tmpdir(), "k12-campaign-adversarial-"));
  try {
    const cohort = loadCohort(seedCatalogPath, seedTasksDir);
    const task = cohort.tasks.find((entry) => entry.fixture_id === "adversarial-interrupted-recovery");
    const faulted = await createHarnessCampaignExecutor({ cohort, now: () => 10 })(
      runFor(cohort, root, task.fixture_id),
      task,
    );
    const withoutFaults = await createHarnessCampaignExecutor({ cohort, faults: false, now: () => 10 })(
      runFor(cohort, root, task.fixture_id, { base_worktree_root: join(root, "no-fault-worktrees") }),
      task,
    );

    assert.equal(faulted.status, "pass");
    assert.equal(faulted.measurements.interruptions, 1);
    assert.equal(faulted.measurements.recoveries, 1);
    assert.equal(withoutFaults.status, "pass");
    assert.equal(withoutFaults.measurements.interruptions, 0);
    assert.equal(withoutFaults.measurements.recoveries, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects a worktree that already contains files", async () => {
  const root = await mkdtemp(join(tmpdir(), "k12-campaign-dirty-"));
  try {
    const cohort = loadCohort(seedCatalogPath, seedTasksDir);
    const manifest = runFor(cohort, root, "local-config-default");
    const task = cohort.tasks.find((entry) => entry.fixture_id === manifest.fixture_id);
    await mkdir(manifest.worktree_path, { recursive: true });
    await writeFile(join(manifest.worktree_path, "stale.txt"), "stale\n", "utf8");

    const outcome = await createHarnessCampaignExecutor({ cohort })(manifest, task);
    assert.equal(outcome.status, "fail");
    assert.equal(outcome.note, "worktree-not-clean");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("produces identical outcomes for a clean replay with an injected deterministic clock", async () => {
  const root = await mkdtemp(join(tmpdir(), "k12-campaign-determinism-"));
  try {
    const cohort = loadCohort(seedCatalogPath, seedTasksDir);
    const manifest = runFor(cohort, root, "local-config-default");
    const task = cohort.tasks.find((entry) => entry.fixture_id === manifest.fixture_id);
    const first = await createHarnessCampaignExecutor({ cohort, now: () => 500 })(manifest, task);
    await rm(manifest.worktree_path, { recursive: true, force: true });
    const second = await createHarnessCampaignExecutor({ cohort, now: () => 500 })(manifest, task);

    assert.equal(JSON.stringify(first), JSON.stringify(second));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("never fabricates an observed obligations oracle", async () => {
  const root = await mkdtemp(join(tmpdir(), "k12-campaign-oracle-"));
  try {
    const cohort = loadCohort(seedCatalogPath, seedTasksDir);
    const manifest = runFor(cohort, root, "local-config-default");
    const task = cohort.tasks.find((entry) => entry.fixture_id === manifest.fixture_id);
    const outcome = await createHarnessCampaignExecutor({ cohort })(manifest, task);

    assert.deepEqual(outcome.oracle, {
      applied: false,
      reason: "no observed contract for fixture local-config-default",
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("executes the real seed cohort through the runner as a usable machinery baseline", async () => {
  const root = await mkdtemp(join(tmpdir(), "k12-campaign-integration-"));
  try {
    const cohort = loadCohort(seedCatalogPath, seedTasksDir);
    const plan = planRuns(cohort, planOptions(root, { repetitions: 2 }));
    const completed = await executePlan(
      plan,
      createHarnessCampaignExecutor({ cohort, now: () => 0 }),
      { now: () => new Date(0) },
    );
    const summary = summarizeCohort(completed);

    assert.equal(summary.verdict, "usable-baseline");
    assert.equal(summary.overall.tasks_total, cohort.tasks.length);
    assert.equal(summary.overall.runs_total, cohort.tasks.length * 2);
    assert.equal(summary.overall.runs_pass, cohort.tasks.length * 2);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
