"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { WORKFLOWS, decide, waitForCi, waitForWorkflow } = require("./wait-for-ci.js");

const ROOT = path.resolve(__dirname, "..", "..");

test("decide ignores tag runs and waits until the branch run succeeds", () => {
  const tagFailure = { headBranch: "v2.119.1", status: "completed", conclusion: "failure" };
  const mainRunning = { headBranch: "main", status: "in_progress", conclusion: null };
  const mainSuccess = { headBranch: "main", status: "completed", conclusion: "success" };
  assert.equal(decide([tagFailure], "main"), "wait");
  assert.equal(decide([tagFailure, mainRunning], "main"), "wait");
  assert.equal(decide([tagFailure, mainSuccess], "main"), "ok");
  assert.equal(decide([{ headBranch: "main", status: "completed", conclusion: "failure" }], "main"), "fail");
  assert.equal(decide([{ headBranch: "main", status: "completed", conclusion: "timed_out" }], "main"), "fail");
  assert.equal(decide([{ headBranch: "main", status: "completed", conclusion: "startup_failure" }], "main"), "fail");
  assert.equal(decide([{ headBranch: "main", status: "completed", conclusion: "cancelled" }], "main"), "fail");
  assert.equal(decide([
    { headBranch: "main", status: "completed", conclusion: "success" },
    { headBranch: "main", status: "completed", conclusion: "failure" },
  ], "main"), "fail");
});

test("waitForWorkflow fails when the deadline passes without a branch run", async () => {
  let now = 0;
  await assert.rejects(
    () => waitForWorkflow({
      name: "Validate Harness",
      branch: "main",
      list: async () => [],
      sleep: async () => {},
      now: () => now,
      deadline: 0,
      intervalMs: 30,
    }),
    /no Validate Harness run/,
  );
  now = 10;
  await assert.rejects(
    () => waitForWorkflow({
      name: "Build ospec-hooks",
      branch: "feat",
      list: async () => [{ headBranch: "feat", status: "in_progress", conclusion: null }],
      sleep: async () => { now = 100; },
      now: () => now,
      deadline: 50,
      intervalMs: 30,
    }),
    /timed out waiting for Build ospec-hooks/,
  );
});

test("waitForWorkflow returns once the branch run is green", async () => {
  const runs = [{ headBranch: "main", status: "completed", conclusion: "success" }];
  await waitForWorkflow({
    name: "Validate Harness",
    branch: "main",
    list: async () => runs,
    sleep: async () => { throw new Error("should not sleep"); },
    now: () => 0,
    deadline: 1000,
    intervalMs: 30,
  });
});

// The Go tests read JS and YAML inputs too (hooks.json, session-start.js, the
// skill registry), so a release needs Build ospec-hooks green as well.
test("publish waits for Validate Harness and Build ospec-hooks of the same SHA", async () => {
  assert.deepEqual(WORKFLOWS, [
    { file: "validate-harness.yml", name: "Validate Harness" },
    { file: "build-hooks.yml", name: "Build ospec-hooks" },
  ]);
  const runsOf = (conclusions) => async (file) => [{ headBranch: "main", status: "completed", conclusion: conclusions[file] }];
  const options = { branch: "main", sleep: async () => {}, now: () => 0, deadline: 1000, intervalMs: 30 };
  await waitForCi({ ...options, list: runsOf({ "validate-harness.yml": "success", "build-hooks.yml": "success" }) });
  await assert.rejects(
    () => waitForCi({ ...options, list: runsOf({ "validate-harness.yml": "success", "build-hooks.yml": "failure" }) }),
    /Build ospec-hooks for main finished without success/,
  );
  const publish = fs.readFileSync(path.join(ROOT, ".github", "workflows", "publish-marketplace.yml"), "utf8");
  // A Windows checkout may carry CRLF.
  assert.match(publish, /run: node scripts\/ci\/wait-for-ci\.js\r?$/m);
});
