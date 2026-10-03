#!/usr/bin/env node
"use strict";

const { readFileSync } = require("node:fs");
const { mkdir, mkdtemp, writeFile } = require("node:fs/promises");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");

const { loadCohort, validateCohortShape, validatePilotCohortShape } = require("./lib/k12/cohort.js");
const { createHarnessCampaignExecutor } = require("./lib/k12/campaign-executor.js");
const { evaluatePilotCheckpoint, loadPilotMargins } = require("./lib/k12/pilot-checkpoint.js");
const { createDeterministicPilotExecutor } = require("./lib/k12/pilot-executor.js");
const {
  executePlan,
  planPairedRuns,
  planRuns,
  summarizeCohort,
  summarizePairedCohort,
} = require("./lib/k12/runner.js");
const { parseRoutingTable } = require("./lib/route-dispatcher.js");

const fixtureRoot = join(__dirname, "evals", "__fixtures__", "k12");
const configPath = join(__dirname, "..", "openspec", "config.yaml");

function parseArgs(argv) {
  const options = {
    repetitions: 3,
    seed: null,
    cohortPath: join(fixtureRoot, "oracle-catalog.json"),
    tasksDir: join(fixtureRoot, "tasks"),
    marginsPath: join(fixtureRoot, "pilot-margins.json"),
    out: null,
    faults: true,
    paired: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--no-faults") {
      options.faults = false;
      continue;
    }
    if (arg === "--paired") {
      options.paired = true;
      continue;
    }
    if (!["--repetitions", "--seed", "--cohort-path", "--tasks-dir", "--margins", "--out"].includes(arg)) {
      throw new Error(`unknown argument: ${arg}`);
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`${arg} requires a value`);
    index += 1;
    if (arg === "--repetitions") {
      options.repetitions = Number(value);
    } else if (arg === "--seed") {
      options.seed = value;
    } else if (arg === "--cohort-path") {
      options.cohortPath = value;
    } else if (arg === "--tasks-dir") {
      options.tasksDir = value;
    } else if (arg === "--margins") {
      options.marginsPath = value;
    } else {
      options.out = value;
    }
  }

  if (!options.seed) throw new Error("--seed is required");
  if (!Number.isInteger(options.repetitions) || options.repetitions < 1) {
    throw new Error("--repetitions must be an integer greater than or equal to 1");
  }
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const cohort = loadCohort(resolve(options.cohortPath), resolve(options.tasksDir));
  const validation = options.paired ? validatePilotCohortShape(cohort) : validateCohortShape(cohort);
  if (!validation.valid) {
    for (const error of validation.errors) console.error(error);
    process.exitCode = 1;
    return;
  }
  // Margins are loaded before any run: they must be declared, not fitted to the results.
  const declared = options.paired ? loadPilotMargins(resolve(options.marginsPath), cohort) : null;

  const campaignRoot = await mkdtemp(join(tmpdir(), "k12-campaign-"));
  console.log(`campaign_root=${campaignRoot}`);
  const planOptions = {
    repetitions: options.repetitions,
    order_seed: options.seed,
    cohort_id: `seed-${cohort.catalog.catalog_version}`,
    base_worktree_root: join(campaignRoot, "worktrees"),
    base_cache_root: join(campaignRoot, "cache"),
    evaluator: options.paired ? "k12-pilot-deterministic" : "minimal-kernel-harness",
    host: "node",
    runner_version: options.paired ? "k12-pilot/v1" : "k12-campaign/v1",
  };
  let summary;
  if (options.paired) {
    // Deterministic Adaptive Repair pilot (P2a–P4): both arms per fixture repetition, with seeded
    // defects and injected faults, judged against the predeclared margins.
    const routes = parseRoutingTable(readFileSync(configPath, "utf8"));
    const completed = await executePlan(
      planPairedRuns(cohort, planOptions),
      createDeterministicPilotExecutor({ catalog: cohort.catalog, routes }),
    );
    const report = summarizePairedCohort(completed);
    const checkpoint = evaluatePilotCheckpoint({ runs: completed.runs, report, cohort, ...declared });
    summary = { ...report, checkpoint };
    const { totals } = summary;
    const defects = (arm) => `${totals.defects[arm].detected}/${totals.defects[arm].seeded}`;
    console.log(
      `tasks=${totals.tasks_total} comparable=${totals.tasks_comparable} pairs=${totals.pairs_total} excluded=${totals.pairs_excluded} regressions=${summary.regressions.length}`
      + ` defects_detected fixed=${defects("fixed")} adaptive=${defects("adaptive-repair-v1")} defect_regressions=${summary.defect_regressions.length}`,
    );
    console.log(
      `checkpoint=${checkpoint.checkpoint} margins=${checkpoint.margins_version} vetoes=${checkpoint.vetoes.length} revisions=${checkpoint.revisions.length}`,
    );
  } else {
    const completed = await executePlan(
      planRuns(cohort, planOptions),
      createHarnessCampaignExecutor({ cohort, faults: options.faults }),
    );
    summary = summarizeCohort(completed);
    const { overall } = summary;
    console.log(
      `tasks=${overall.tasks_total} runs=${overall.runs_total} pass=${overall.runs_pass} fail=${overall.runs_fail}`,
    );
  }
  console.log(JSON.stringify(summary, null, 2));

  if (options.out) {
    const outputPath = resolve(options.out);
    await mkdir(resolve(outputPath, ".."), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  }
  const expected = options.paired ? "usable-comparison" : "usable-baseline";
  if (summary.verdict !== expected || (summary.checkpoint && summary.checkpoint.checkpoint === "reject")) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
