#!/usr/bin/env node
"use strict";

const { mkdir, mkdtemp, writeFile } = require("node:fs/promises");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");

const { loadCohort, validateCohortShape } = require("./lib/k12/cohort.js");
const { createHarnessCampaignExecutor } = require("./lib/k12/campaign-executor.js");
const { executePlan, planRuns, summarizeCohort } = require("./lib/k12/runner.js");

const fixtureRoot = join(__dirname, "evals", "__fixtures__", "k12");

function parseArgs(argv) {
  const options = {
    repetitions: 3,
    seed: null,
    cohortPath: join(fixtureRoot, "oracle-catalog.json"),
    tasksDir: join(fixtureRoot, "tasks"),
    out: null,
    faults: true,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--no-faults") {
      options.faults = false;
      continue;
    }
    if (!["--repetitions", "--seed", "--cohort-path", "--tasks-dir", "--out"].includes(arg)) {
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
  const validation = validateCohortShape(cohort);
  if (!validation.valid) {
    for (const error of validation.errors) console.error(error);
    process.exitCode = 1;
    return;
  }

  const campaignRoot = await mkdtemp(join(tmpdir(), "k12-campaign-"));
  console.log(`campaign_root=${campaignRoot}`);
  const plan = planRuns(cohort, {
    repetitions: options.repetitions,
    order_seed: options.seed,
    cohort_id: `seed-${cohort.catalog.catalog_version}`,
    base_worktree_root: join(campaignRoot, "worktrees"),
    base_cache_root: join(campaignRoot, "cache"),
    evaluator: "minimal-kernel-harness",
    host: "node",
    runner_version: "k12-campaign/v1",
  });
  const completed = await executePlan(
    plan,
    createHarnessCampaignExecutor({ cohort, faults: options.faults }),
  );
  const summary = summarizeCohort(completed);
  const { overall } = summary;
  console.log(
    `tasks=${overall.tasks_total} runs=${overall.runs_total} pass=${overall.runs_pass} fail=${overall.runs_fail}`,
  );
  console.log(JSON.stringify(summary, null, 2));

  if (options.out) {
    const outputPath = resolve(options.out);
    await mkdir(resolve(outputPath, ".."), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  }
  if (summary.verdict !== "usable-baseline") process.exitCode = 1;
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
