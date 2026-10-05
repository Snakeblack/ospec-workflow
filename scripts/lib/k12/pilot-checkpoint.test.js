"use strict";

const assert = require("node:assert/strict");
const { mkdtemp, rm, writeFile } = require("node:fs/promises");
const { readFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const test = require("node:test");

const { loadCohort } = require("./cohort.js");
const {
  PilotCheckpointError,
  VETO_KINDS,
  evaluatePilotCheckpoint,
  loadPilotMargins,
  validatePilotMargins,
} = require("./pilot-checkpoint.js");

const seedRoot = join(__dirname, "../../evals/__fixtures__/k12");
const marginsPath = join(seedRoot, "pilot-margins.json");
const cohort = loadCohort(join(seedRoot, "oracle-catalog.json"), join(seedRoot, "tasks"));
const margins = JSON.parse(readFileSync(marginsPath, "utf8"));

// One paired repetition of the real pilot cohort, as the deterministic pilot
// executor produced it in v2.94.0 (the executor was retired in E1.5); cloned
// per test.
const campaign = JSON.parse(readFileSync(join(seedRoot, "snapshots", "pilot-campaign.json"), "utf8"));
async function realCampaign() {
  return structuredClone(campaign);
}

function judge({ runs, report }, overrides = {}) {
  return evaluatePilotCheckpoint({ runs, report, cohort, margins, ...overrides });
}

function adaptiveRun(runs, fixtureId) {
  return runs.find((run) => run.fixture_id === fixtureId && run.policy === "adaptive-repair-v1");
}

test("the predeclared margins are valid for the pilot cohort and carry a stable digest", () => {
  const first = loadPilotMargins(marginsPath, cohort);
  const second = loadPilotMargins(marginsPath, cohort);
  assert.equal(first.margins.margins_version, "k12-pilot-margins-1");
  assert.match(first.margins_digest, /^sha256:[0-9a-f]{64}$/);
  assert.equal(first.margins_digest, second.margins_digest);
});

test("the real pilot cohort reaches continue with every margin met", async () => {
  const checkpoint = judge(await realCampaign(), { margins_digest: "sha256:test" });
  assert.equal(checkpoint.checkpoint, "continue", checkpoint.revisions.join("; "));
  assert.deepEqual(checkpoint.vetoes, []);
  assert.deepEqual(checkpoint.revisions, []);
  assert.deepEqual(checkpoint.non_inferiority, { ci95_lower: 0, min: 0, met: true });
  assert.deepEqual(checkpoint.practical_improvement, { phases_executed_delta_mean: -2, max: -1, met: true });
  assert.equal(checkpoint.holdout.tasks, 10);
  assert.equal(checkpoint.holdout.met, true);
  assert.equal(checkpoint.margins_digest, "sha256:test");
});

test("each veto rejects regardless of the margins", async () => {
  assert.deepEqual(VETO_KINDS, ["must-omitted", "fault-escaped", "defect-regression", "pass-regression"]);

  const omitted = await realCampaign();
  const run = adaptiveRun(omitted.runs, "behavior-null-guard");
  run.outcome.note = "oracle:missing-must (repair-recipe: 3 phases, 1 gates)";
  run.outcome.oracle.reason = "catalog compared: matched 1/2; missing must: behavior-preserved";

  const escaped = await realCampaign();
  adaptiveRun(escaped.runs, "adversarial-role-escalation").outcome.note = "fault-escaped: bypass-without-permit: bypass ok";

  const defect = await realCampaign();
  defect.report.defect_regressions = [{ fixture_id: "local-slug-trim", escaped: ["stale-receipt"] }];

  const regression = await realCampaign();
  regression.report.regressions = ["multi-api-contract"];

  for (const [campaignCase, kind] of [[omitted, "must-omitted"], [escaped, "fault-escaped"], [defect, "defect-regression"], [regression, "pass-regression"]]) {
    const checkpoint = judge(campaignCase);
    assert.equal(checkpoint.checkpoint, "reject", kind);
    assert.deepEqual(checkpoint.vetoes.map((veto) => veto.kind), [kind]);
  }
});

test("a control-arm failure, an unapplied oracle, or an incomplete comparison asks to revise", async () => {
  const control = await realCampaign();
  control.runs.find((run) => run.policy === "fixed" && run.fixture_id === "local-percent-format").outcome.status = "fail";
  assert.match(judge(control).revisions.join("; "), /control arm fails on local-percent-format/);

  const unapplied = await realCampaign();
  unapplied.report.totals.runs_oracle_unapplied.fixed = 1;
  assert.match(judge(unapplied).revisions.join("; "), /oracle unapplied on 1 run/);

  const incomplete = await realCampaign();
  Object.assign(incomplete.report, { verdict: "incomplete-comparison", verdict_reason: "pair-missing-arm" });
  const checkpoint = judge(incomplete);
  assert.equal(checkpoint.checkpoint, "revise");
  assert.match(checkpoint.revisions.join("; "), /comparison incomplete-comparison: pair-missing-arm/);
});

test("with a recorded real worker a control-arm failure is an outcome, not a harness defect", async () => {
  const control = await realCampaign();
  control.runs.find((run) => run.policy === "fixed" && run.fixture_id === "local-percent-format").outcome.status = "fail";
  const checkpoint = judge(control, { recordedWorker: true });
  assert.equal(checkpoint.checkpoint, "continue", checkpoint.revisions.join("; "));
  assert.deepEqual(checkpoint.control_failures, ["local-percent-format"]);
});

test("missed margins ask to revise and name the reading", async () => {
  const inferior = await realCampaign();
  inferior.report.cohort.pass_rate_delta = { tasks: 22, mean: -0.05, sd: 0.1, ci95: [-0.1, 0] };
  const nonInferiority = judge(inferior);
  assert.equal(nonInferiority.checkpoint, "revise");
  assert.equal(nonInferiority.non_inferiority.met, false);

  const flat = await realCampaign();
  flat.report.cohort.measurement_delta.phases_executed = { tasks: 22, mean: -0.5, sd: 0.5, ci95: [-0.7, -0.3] };
  const practical = judge(flat);
  assert.equal(practical.checkpoint, "revise");
  assert.match(practical.revisions.join("; "), /practical improvement not met: phases delta mean -0.5 > -1/);

  const holdout = await realCampaign();
  holdout.report.fixtures.find((task) => task.fixture_id === "adversarial-role-escalation").pass_rate_delta = -1;
  const holdoutCheckpoint = judge(holdout);
  assert.equal(holdoutCheckpoint.holdout.met, false);
  assert.deepEqual(holdoutCheckpoint.holdout.below_margin, ["adversarial-role-escalation"]);
});

test("malformed margins and unreservable holdouts fail closed", async () => {
  const cases = [
    [{ ...margins, extra: true }, /exactly/],
    [{ ...margins, schema_version: 2 }, /schema_version/],
    [{ ...margins, non_inferiority: { pass_rate_delta_ci95_lower_min: 0.1 } }, /\[-1, 0\]/],
    [{ ...margins, practical_improvement: { phases_executed_delta_mean_max: 0 } }, /negative number/],
    [{ ...margins, holdout: { ...margins.holdout, adversarial: "compatibility" } }, /stratum "adversarial"/],
    [{ ...margins, holdout: { ...margins.holdout, migration: "x" } }, /unknown strata/],
  ];
  for (const [candidate, pattern] of cases) {
    assert.throws(() => validatePilotMargins(candidate, cohort), (error) => error instanceof PilotCheckpointError && pattern.test(error.message));
  }
  // A family covering every task of its stratum leaves nothing to tune on.
  const single = { tasks: cohort.tasks.map((task) => ({ ...task, holdout_family: "only" })) };
  assert.throws(() => validatePilotMargins({ ...margins, holdout: Object.fromEntries(Object.keys(margins.holdout).map((s) => [s, "only"])) }, single), /some, but not all/);

  const root = await mkdtemp(join(tmpdir(), "k12-margins-"));
  try {
    await writeFile(join(root, "margins.json"), "{");
    assert.throws(() => loadPilotMargins(join(root, "margins.json"), cohort), (error) => error.code === "PILOT_MARGINS_READ_FAILED");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
