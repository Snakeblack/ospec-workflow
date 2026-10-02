"use strict";

const assert = require("node:assert/strict");
const { mkdir, mkdtemp, readFile, rm, writeFile } = require("node:fs/promises");
const { readFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const test = require("node:test");

const { parseRoutingTable } = require("../route-dispatcher.js");
const { loadCohort } = require("./cohort.js");
const { executePlan, planPairedRuns, summarizePairedCohort } = require("./runner.js");
const {
  FIXED_ROUTE_BY_STRATUM,
  PILOT_SCRIPT_FILE,
  PilotExecutorError,
  REPAIR_RECIPE_PHASES,
  createDeterministicPilotExecutor,
  loadPilotScript,
  resolveArmPlans,
} = require("./pilot-executor.js");

const repoRoot = join(__dirname, "../../..");
const seedRoot = join(__dirname, "../../evals/__fixtures__/k12");
const seedCatalogPath = join(seedRoot, "oracle-catalog.json");
const seedTasksDir = join(seedRoot, "tasks");
const FIXED_CLOCK = { now: () => "2026-10-02T00:00:00.000Z" };
const P2A_STRATA = Object.keys(FIXED_ROUTE_BY_STRATUM);

function liveRoutes() {
  return parseRoutingTable(readFileSync(join(repoRoot, "openspec/config.yaml"), "utf8"));
}

function planOptions(root, overrides = {}) {
  return {
    repetitions: 1,
    order_seed: "pilot-seed-001",
    cohort_id: "k12-pilot-test",
    base_worktree_root: join(root, "worktrees"),
    base_cache_root: join(root, "cache"),
    evaluator: "k12-pilot-deterministic",
    host: "node",
    runner_version: "k12-pilot/v1-test",
    ...overrides,
  };
}

const TICKING_CLOCK = () => {
  let tick = 0;
  return () => {
    tick += 1;
    return tick;
  };
};

async function runPaired(cohort, repetitions = 1) {
  const plan = planPairedRuns(cohort, planOptions(tmpdir(), { repetitions }));
  const executor = createDeterministicPilotExecutor({ catalog: cohort.catalog, routes: liveRoutes(), now: TICKING_CLOCK() });
  return executePlan(plan, executor, FIXED_CLOCK);
}

const SYNTHETIC_FILE = "src/length.js";
const SYNTHETIC_BEFORE = "module.exports = (value) => value.length;\n";
const SYNTHETIC_PATCH = [
  `--- a/${SYNTHETIC_FILE}`,
  `+++ b/${SYNTHETIC_FILE}`,
  "@@ -1 +1 @@",
  "-module.exports = (value) => value.length;",
  "+module.exports = (value) => (value == null ? 0 : value.length);",
  "",
].join("\n");
const SYNTHETIC_OBLIGATIONS = [
  { id: "behavior-preserved", criticality: "must", required_evidence: ["regression-test-output"] },
  { id: "tests-pass", criticality: "must", required_evidence: ["focused-test-output"] },
];

function syntheticScript(overrides = {}) {
  return {
    schema_version: 1,
    files: { [SYNTHETIC_FILE]: SYNTHETIC_BEFORE },
    patch: SYNTHETIC_PATCH,
    allowed_paths: [SYNTHETIC_FILE],
    obligations: SYNTHETIC_OBLIGATIONS,
    ...overrides,
  };
}

/** One behavior-repair fixture plus one local fixture, each with an optional pilot script. */
async function syntheticCohort(scripts) {
  const root = await mkdtemp(join(tmpdir(), "k12-pilot-"));
  const fixtures = Object.keys(scripts).map((fixtureId, index) => ({
    fixture_id: fixtureId,
    stratum: index === 0 ? "behavior-repair" : "local-reversible",
    holdout_family: `${fixtureId}-family`,
    obligations: SYNTHETIC_OBLIGATIONS,
  }));
  await writeFile(join(root, "catalog.json"), JSON.stringify({ schema_version: 1, catalog_version: "pilot-test-1", fixtures }));
  for (const [fixtureId, script] of Object.entries(scripts)) {
    const taskDir = join(root, "tasks", fixtureId);
    await mkdir(taskDir, { recursive: true });
    await writeFile(join(taskDir, "task.md"), "# Task\n");
    if (script !== null) {
      await writeFile(join(taskDir, PILOT_SCRIPT_FILE), typeof script === "string" ? script : JSON.stringify(script));
    }
  }
  return { root, cohort: loadCohort(join(root, "catalog.json"), join(root, "tasks")) };
}

test("arm plans mirror the live control routes and the Adaptive arm inherits every control gate", () => {
  const routes = liveRoutes();
  const plans = resolveArmPlans(routes);
  assert.deepEqual(Object.keys(plans).sort(), [...P2A_STRATA].sort());
  for (const [stratum, routeName] of Object.entries(FIXED_ROUTE_BY_STRATUM)) {
    const route = routes.find((entry) => entry.name === routeName);
    assert.deepEqual(plans[stratum].fixed, { route: routeName, phases: route.phases, gates: route.gates || [] });
    assert.deepEqual(plans[stratum]["adaptive-repair-v1"], {
      route: "repair-recipe",
      phases: [...REPAIR_RECIPE_PHASES],
      gates: route.gates || [],
    });
  }
  assert.deepEqual(plans["behavior-repair"]["adaptive-repair-v1"].gates, ["quality-review-gate"]);

  assert.throws(
    () => resolveArmPlans(routes.filter((entry) => entry.name !== "bugfix")),
    (error) => error instanceof PilotExecutorError && error.code === "CONTROL_ROUTE_MISSING",
  );
  assert.throws(() => createDeterministicPilotExecutor({ catalog: null, routes }), PilotExecutorError);
});

test("the seed cohort yields a usable paired comparison with the oracle applied on every P2a run", async () => {
  const cohort = loadCohort(seedCatalogPath, seedTasksDir);
  const { runs } = await runPaired(cohort, 2);

  const p2aRuns = runs.filter((run) => P2A_STRATA.includes(run.stratum));
  assert.equal(p2aRuns.length, 6 * 2 * 2);
  for (const run of p2aRuns) {
    assert.equal(run.outcome.status, "pass", `${run.fixture_id} ${run.policy}: ${run.outcome.note}`);
    assert.equal(run.outcome.oracle.applied, true);
    assert.match(run.outcome.oracle.reason, /no must obligation missing/);
    assert.equal(run.outcome.measurements.effects_executed, 1);
  }
  for (const run of runs.filter((entry) => !P2A_STRATA.includes(entry.stratum))) {
    assert.equal(run.outcome.status, "excluded");
    assert.match(run.outcome.note, /outside pilot slice P2a/);
  }

  const report = summarizePairedCohort(runs);
  assert.equal(report.verdict, "usable-comparison");
  assert.equal(report.totals.tasks_comparable, 6);
  assert.equal(report.totals.pairs_excluded, 5 * 2);
  assert.deepEqual(report.regressions, []);
  assert.deepEqual(report.cohort.pass_rate_delta, { tasks: 6, mean: 0, sd: 0, ci95: [0, 0] });
  // Ceremony is a declared plan, so the -2 phase delta is the hypothesis under test, not an observation.
  assert.deepEqual(report.cohort.measurement_delta.phases_executed, { tasks: 6, mean: -2, sd: 0, ci95: [-2, -2] });
  assert.deepEqual(report.cohort.measurement_delta.effects_executed, { tasks: 6, mean: 0, sd: 0, ci95: [0, 0] });
});

test("paired outcomes are deterministic across executions apart from wall time", async () => {
  const cohort = loadCohort(seedCatalogPath, seedTasksDir);
  const strip = (runs) => runs.map((run) => ({
    run_id: run.run_id,
    status: run.outcome.status,
    note: run.outcome.note,
    oracle: run.outcome.oracle,
    phases: run.outcome.measurements.phases_executed,
  }));
  const first = await runPaired(cohort);
  const second = await runPaired(cohort);
  assert.deepEqual(strip(first.runs), strip(second.runs));
});

test("a patch outside the allowed paths fails both arms at K4b integration with the oracle still applied", async () => {
  const drift = syntheticScript({
    patch: SYNTHETIC_PATCH.replaceAll(SYNTHETIC_FILE, "src/other.js"),
    files: { [SYNTHETIC_FILE]: SYNTHETIC_BEFORE, "src/other.js": SYNTHETIC_BEFORE },
  });
  const { root, cohort } = await syntheticCohort({ drift, clean: syntheticScript() });
  try {
    const { runs } = await runPaired(cohort);
    for (const run of runs.filter((entry) => entry.fixture_id === "drift")) {
      assert.equal(run.outcome.status, "fail");
      assert.match(run.outcome.note, /^integration:/);
      assert.equal(run.outcome.oracle.applied, true);
      assert.equal(run.outcome.measurements.effects_executed, 0);
    }
    for (const run of runs.filter((entry) => entry.fixture_id === "clean")) {
      assert.equal(run.outcome.status, "pass", run.outcome.note);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a self-declared contract that omits a must obligation passes K6b but fails the independent oracle", async () => {
  const omitted = syntheticScript({ obligations: [SYNTHETIC_OBLIGATIONS[1]] });
  const { root, cohort } = await syntheticCohort({ omitted, clean: syntheticScript() });
  try {
    const { runs } = await runPaired(cohort);
    for (const run of runs.filter((entry) => entry.fixture_id === "omitted")) {
      assert.equal(run.outcome.status, "fail");
      assert.match(run.outcome.note, /^oracle:missing-must/);
      assert.equal(run.outcome.oracle.applied, true);
      assert.match(run.outcome.oracle.reason, /missing must: behavior-preserved/);
      assert.equal(run.outcome.measurements.effects_executed, 1);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("missing scripts are excluded, malformed scripts fail closed, and unknown runs are invalid", async () => {
  const { root, cohort } = await syntheticCohort({
    malformed: { ...syntheticScript(), bypass: true },
    missing: null,
  });
  try {
    const { runs } = await runPaired(cohort);
    for (const run of runs.filter((entry) => entry.fixture_id === "malformed")) {
      assert.equal(run.outcome.status, "fail");
      assert.match(run.outcome.note, /^invalid-pilot-script: pilot script has unknown keys: bypass/);
      assert.equal(run.outcome.oracle.applied, false);
    }
    for (const run of runs.filter((entry) => entry.fixture_id === "missing")) {
      assert.equal(run.outcome.status, "excluded");
      assert.equal(run.outcome.note, "no pilot script for fixture");
    }

    const executor = createDeterministicPilotExecutor({ catalog: cohort.catalog, routes: liveRoutes() });
    const invalid = await executor({ ...runs[0], policy: "kernel" }, { task_path: root });
    assert.equal(invalid.status, "fail");
    assert.equal(invalid.note, "invalid-run");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("loadPilotScript validates every field and reports absence separately from corruption", async () => {
  const root = await mkdtemp(join(tmpdir(), "k12-pilot-script-"));
  try {
    assert.deepEqual(loadPilotScript(root), { script: null, error: null });
    const cases = [
      ["not json", /not valid JSON/],
      [JSON.stringify(syntheticScript({ schema_version: 2 })), /schema_version must be 1/],
      [JSON.stringify(syntheticScript({ files: {} })), /files must map paths/],
      [JSON.stringify(syntheticScript({ patch: "" })), /patch must be a non-empty/],
      [JSON.stringify(syntheticScript({ allowed_paths: [] })), /allowed_paths must be a non-empty/],
      [JSON.stringify(syntheticScript({ obligations: [{ id: "x", criticality: "may", required_evidence: ["e"] }] })), /obligation 0/],
    ];
    for (const [content, pattern] of cases) {
      await writeFile(join(root, PILOT_SCRIPT_FILE), content);
      const loaded = loadPilotScript(root);
      assert.equal(loaded.script, null);
      assert.match(loaded.error, pattern);
    }
    await writeFile(join(root, PILOT_SCRIPT_FILE), JSON.stringify(syntheticScript()));
    assert.deepEqual(JSON.parse(await readFile(join(root, PILOT_SCRIPT_FILE), "utf8")), loadPilotScript(root).script);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("the campaign CLI runs the paired pilot and exits 0 on a usable comparison", () => {
  const { spawnSync } = require("node:child_process");
  const result = spawnSync(process.execPath, [join(repoRoot, "scripts/k12-campaign.js"), "--paired", "--seed", "cli-smoke", "--repetitions", "1"], {
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /tasks=11 comparable=6 pairs=11 excluded=5 regressions=0/);
  assert.match(result.stdout, /"verdict": "usable-comparison"/);
});
