"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { decide, waitForValidateHarness } = require("./wait-for-validate-harness.js");

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

test("waitForValidateHarness fails when the deadline passes without a branch run", async () => {
  let now = 0;
  await assert.rejects(
    () => waitForValidateHarness({
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
    () => waitForValidateHarness({
      branch: "feat",
      list: async () => [{ headBranch: "feat", status: "in_progress", conclusion: null }],
      sleep: async () => { now = 100; },
      now: () => now,
      deadline: 50,
      intervalMs: 30,
    }),
    /timed out/,
  );
});

test("waitForValidateHarness returns once the branch run is green", async () => {
  const runs = [{ headBranch: "main", status: "completed", conclusion: "success" }];
  await waitForValidateHarness({
    branch: "main",
    list: async () => runs,
    sleep: async () => { throw new Error("should not sleep"); },
    now: () => 0,
    deadline: 1000,
    intervalMs: 30,
  });
});
