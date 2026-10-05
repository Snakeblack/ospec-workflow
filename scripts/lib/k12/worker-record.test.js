"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const test = require("node:test");

const { loadCohort } = require("./cohort.js");
const { evaluatePilotCheckpoint, loadPilotMargins } = require("./pilot-checkpoint.js");
const {
  WorkerRecordError,
  loadWorkerRecord,
  recordCohort,
  summarizeWorkerUsage,
  validateWorkerRecord,
} = require("./worker-record.js");

const seedRoot = join(__dirname, "../../evals/__fixtures__/k12");
const cohort = loadCohort(join(seedRoot, "oracle-catalog.json"), join(seedRoot, "tasks"));
const recordPath = (name) => join(seedRoot, "calibration", `${name}.json`);

// Each calibration's paired runs as the deterministic pilot executor replayed
// its recorded agent patches in v2.94.0 (the executor was retired in E1.5).
// The checkpoint is still judged live from them.
async function replay(recordName, marginsFile) {
  const record = loadWorkerRecord(recordPath(recordName), cohort);
  const narrowed = recordCohort(cohort, record);
  const { runs, report } = JSON.parse(readFileSync(join(seedRoot, "snapshots", `${recordName}.json`), "utf8"));
  const declared = loadPilotMargins(join(seedRoot, marginsFile), narrowed);
  const checkpoint = evaluatePilotCheckpoint({ runs, report, cohort: narrowed, ...declared, recordedWorker: true });
  return { record, narrowed, runs, report, checkpoint };
}

test("the first calibration replays its recorded agent patches and asks to revise under the pilot margins", async () => {
  const { narrowed, runs, report, checkpoint } = await replay("behavior-repair-haiku-1", "pilot-margins.json");

  assert.deepEqual(narrowed.tasks.map((task) => task.stratum), Array(7).fill("behavior-repair"));
  assert.equal(report.verdict, "usable-comparison");
  for (const run of runs) {
    assert.equal(run.outcome.oracle.applied, true);
    assert.equal(run.outcome.defects, undefined, "recorded runs skip seeded defects");
    assert.match(run.outcome.note, /worker claude-haiku-4-5-20251001: \d+ tokens, \d+ tool uses/);
  }
  // The control agent used `id || legacyId`, which breaks the hidden `id: 0` check.
  const legacy = runs.filter((run) => run.fixture_id === "behavior-legacy-adapter");
  assert.equal(legacy.find((run) => run.policy === "fixed").outcome.status, "fail");
  assert.match(legacy.find((run) => run.policy === "fixed").outcome.note, /^verify:/);
  assert.equal(legacy.find((run) => run.policy === "adaptive-repair-v1").outcome.status, "pass");
  assert.deepEqual(report.improvements, ["behavior-legacy-adapter"]);
  assert.deepEqual(report.regressions, []);

  assert.equal(checkpoint.checkpoint, "revise");
  assert.deepEqual(checkpoint.vetoes, []);
  assert.deepEqual(checkpoint.control_failures, ["behavior-legacy-adapter"]);
  // A CI over 7 binary deltas widens with an improvement: the deterministic margin cannot judge real agents.
  assert.equal(checkpoint.non_inferiority.met, false);
  assert.equal(checkpoint.practical_improvement.met, true);
});

test("the confirmatory calibration, declared before its run, reaches continue under the calibration margins", async () => {
  const { runs, report, checkpoint } = await replay("behavior-repair-haiku-2", "calibration-margins.json");

  assert.equal(report.verdict, "usable-comparison");
  assert.ok(runs.every((run) => run.outcome.status === "pass"), runs.map((run) => run.outcome.note).join("; "));
  assert.equal(checkpoint.checkpoint, "continue", checkpoint.revisions.join("; "));
  assert.equal(checkpoint.margins_version, "k12-calibration-margins-1");
  assert.deepEqual(checkpoint.vetoes, []);
  assert.deepEqual(checkpoint.control_failures, []);
  assert.equal(checkpoint.holdout.met, true);
  assert.deepEqual(Object.keys(checkpoint.holdout.families), ["behavior-repair"]);

  const usage = summarizeWorkerUsage(loadWorkerRecord(recordPath("behavior-repair-haiku-2"), cohort));
  for (const field of ["tokens", "tool_uses", "duration_ms"]) {
    assert.ok(usage.delta[field].ci95[1] < 0, `${field}: the adaptive agents spend less, with the interval below zero`);
  }
});

test("a recorded agent's duration is the run's wall time", async () => {
  const { record, runs } = await replay("behavior-repair-haiku-1", "pilot-margins.json");
  for (const run of runs) {
    assert.equal(run.outcome.measurements.wall_ms, record.outputs[run.fixture_id].arms[run.policy].usage.duration_ms);
  }
});

test("worker usage is summarized per task with the task as the statistical unit", () => {
  const record = loadWorkerRecord(recordPath("behavior-repair-haiku-1"), cohort);
  const usage = summarizeWorkerUsage(record);
  assert.equal(usage.tasks, 7);
  assert.deepEqual(usage.totals.fixed, { tokens: 272477, tool_uses: 86, duration_ms: 349421 });
  assert.deepEqual(usage.totals["adaptive-repair-v1"], { tokens: 255298, tool_uses: 59, duration_ms: 231177 });
  assert.equal(usage.delta.tokens.tasks, 7);
  assert.ok(usage.delta.tokens.ci95[1] < 0, "the adaptive agents spend fewer tokens on every task");
});

test("malformed worker records fail closed", () => {
  const valid = JSON.parse(readFileSync(recordPath("behavior-repair-haiku-1"), "utf8"));
  const clone = () => structuredClone(valid);
  const cases = [
    [(record) => { record.extra = 1; }, /exactly/],
    [(record) => { record.worker.model = ""; }, /versioned worker/],
    [(record) => { delete record.protocols.fixed; }, /protocols/],
    [(record) => { record.outputs["not-a-fixture"] = record.outputs["behavior-null-guard"]; }, /outside the cohort/],
    [(record) => { delete record.outputs["behavior-null-guard"].arms.fixed; }, /one output per arm/],
    [(record) => { record.outputs["behavior-null-guard"].arms.fixed.usage.tokens = -1; }, /non-negative integers/],
    [(record) => { record.outputs["behavior-null-guard"].arms.fixed.patch = null; }, /patch must be a string/],
  ];
  for (const [mutate, pattern] of cases) {
    const record = clone();
    mutate(record);
    assert.throws(() => validateWorkerRecord(record, cohort), (error) => error instanceof WorkerRecordError && pattern.test(error.message));
  }
  assert.throws(() => loadWorkerRecord(join(seedRoot, "missing.json"), cohort), (error) => error.code === "WORKER_RECORD_READ_FAILED");
});
