"use strict";

const { spawnSync } = require("node:child_process");

const FATAL = new Set(["failure", "timed_out", "startup_failure"]);

// Publish waits for each of these on the SHA it publishes, in order: the Node
// harness, and the Go tests and cross-compile, which read JS and YAML inputs too.
const WORKFLOWS = [
  { file: "validate-harness.yml", name: "Validate Harness" },
  { file: "build-hooks.yml", name: "Build ospec-hooks" },
];

function decide(runs, branch) {
  const relevant = (runs || []).filter((run) => run.headBranch === branch);
  if (relevant.length === 0) return "wait";
  if (relevant.some((run) => run.status !== "completed")) return "wait";
  if (relevant.some((run) => FATAL.has(run.conclusion))) return "fail";
  if (relevant.some((run) => run.conclusion === "success")) return "ok";
  return "fail";
}

async function waitForWorkflow({ name, branch, list, sleep, now, deadline, intervalMs }) {
  let last = [];
  for (;;) {
    last = await list();
    const decision = decide(last, branch);
    if (decision === "ok") return;
    if (decision === "fail") {
      throw new Error(`${name} for ${branch} finished without success`);
    }
    if (now() >= deadline) {
      if (last.some((run) => run.headBranch === branch)) {
        throw new Error(`timed out waiting for ${name} on ${branch}`);
      }
      throw new Error(`no ${name} run for ${branch}`);
    }
    await sleep(intervalMs);
  }
}

// `list(file)` returns the runs of one workflow; the deadline covers them all.
async function waitForCi({ list, ...options }) {
  for (const workflow of WORKFLOWS) {
    await waitForWorkflow({ ...options, name: workflow.name, list: () => list(workflow.file) });
  }
}

function listRuns(workflow, sha, spawn = spawnSync) {
  const result = spawn("gh", [
    "run", "list",
    "--workflow", workflow,
    "--commit", sha,
    "--limit", "50",
    "--json", "databaseId,headBranch,status,conclusion,event",
  ], { encoding: "utf8" });
  if (result.error || result.status !== 0) {
    throw new Error((result.stderr || result.error?.message || "gh run list failed").trim());
  }
  return JSON.parse(result.stdout || "[]");
}

async function main() {
  const sha = process.env.VALIDATE_SHA || process.env.GITHUB_SHA;
  const branch = process.env.VALIDATE_BRANCH;
  if (!sha || !branch) {
    process.stderr.write("VALIDATE_SHA and VALIDATE_BRANCH are required\n");
    process.exit(1);
  }
  const timeoutMs = Number(process.env.WAIT_TIMEOUT_MS || 25 * 60 * 1000);
  const intervalMs = Number(process.env.WAIT_INTERVAL_MS || 30 * 1000);
  const started = Date.now();
  try {
    await waitForCi({
      branch,
      list: (workflow) => Promise.resolve(listRuns(workflow, sha)),
      sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      now: () => Date.now(),
      deadline: started + timeoutMs,
      intervalMs,
    });
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  }
}

module.exports = { WORKFLOWS, decide, listRuns, waitForCi, waitForWorkflow };

if (require.main === module) {
  void main();
}
