"use strict";

const { spawnSync } = require("node:child_process");

const FATAL = new Set(["failure", "timed_out", "startup_failure"]);

function decide(runs, branch) {
  const relevant = (runs || []).filter((run) => run.headBranch === branch);
  if (relevant.length === 0) return "wait";
  if (relevant.some((run) => run.status !== "completed")) return "wait";
  if (relevant.some((run) => FATAL.has(run.conclusion))) return "fail";
  if (relevant.some((run) => run.conclusion === "success")) return "ok";
  return "fail";
}

async function waitForValidateHarness({ branch, list, sleep, now, deadline, intervalMs }) {
  let last = [];
  for (;;) {
    last = await list();
    const decision = decide(last, branch);
    if (decision === "ok") return;
    if (decision === "fail") {
      throw new Error(`Validate Harness for ${branch} finished without success`);
    }
    if (now() >= deadline) {
      if (last.some((run) => run.headBranch === branch)) {
        throw new Error(`timed out waiting for Validate Harness on ${branch}`);
      }
      throw new Error(`no Validate Harness run for ${branch}`);
    }
    await sleep(intervalMs);
  }
}

function listValidateRuns(sha, spawn = spawnSync) {
  const result = spawn("gh", [
    "run", "list",
    "--workflow", "validate-harness.yml",
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
    await waitForValidateHarness({
      branch,
      list: () => Promise.resolve(listValidateRuns(sha)),
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

module.exports = { decide, listValidateRuns, waitForValidateHarness };

if (require.main === module) {
  void main();
}
