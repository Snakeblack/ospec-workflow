"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { replayExecutionGraph } = require("./replay-engine.js");
const {
  createSampleExecutionGraph,
  createSampleFixtureResults,
} = require("../test-support/execution-graph-fixtures.js");

test("ReplayEngine: deterministic convergence with pre-recorded fixtures", () => {
  const graph = createSampleExecutionGraph();
  const fixtures = createSampleFixtureResults();

  const run1 = replayExecutionGraph(graph, fixtures);
  const run2 = replayExecutionGraph(graph, fixtures);

  assert.equal(run1.ok, true);
  assert.deepEqual(run1.completedNodes.sort(), ["repair-patch", "repair-verify"]);
  assert.deepEqual(run1.failedNodes, []);
  assert.deepEqual(run1.blockedNodes, []);
  assert.equal(run1.counterexample, null);

  // Idempotency: exact same state digest across multiple replay evaluations
  assert.equal(run1.finalStateDigest, run2.finalStateDigest);
  assert.deepEqual(run1.trace, run2.trace);
});

test("ReplayEngine: missing fixture result blocks dependent downstream nodes", () => {
  const graph = createSampleExecutionGraph();
  // Only repair-patch has fixture result; repair-verify is missing
  const partialFixtures = {
    "repair-patch": {
      ok: true,
      outcome: "completed",
      evidence: { "ev:patch-proof": { digest: "sha256:1" } },
    },
  };

  const result = replayExecutionGraph(graph, partialFixtures);

  assert.equal(result.ok, false);
  assert.deepEqual(result.completedNodes, ["repair-patch"]);
  assert.ok(result.blockedNodes.includes("repair-verify") || result.failedNodes.includes("repair-verify"));
  assert.ok(result.counterexample !== null, "Incomplete replay must emit reproducible counterexample");
});

test("ReplayEngine: failed node stops dependent branch and generates counterexample", () => {
  const graph = createSampleExecutionGraph();
  const failingFixtures = {
    "repair-patch": {
      ok: false,
      outcome: "failed",
      error: "Patch application conflict",
    },
    "repair-verify": {
      ok: true,
      outcome: "completed",
      evidence: { "ev:test-pass": { digest: "sha256:2" } },
    },
  };

  const result = replayExecutionGraph(graph, failingFixtures);

  assert.equal(result.ok, false);
  assert.deepEqual(result.failedNodes, ["repair-patch"]);
  assert.ok(result.blockedNodes.includes("repair-verify"));
  assert.ok(result.counterexample);
  assert.equal(result.counterexample.failed_node, "repair-patch");
});

test("ReplayEngine: missing required obligation evidence marks replay incomplete", () => {
  const graph = createSampleExecutionGraph();
  const missingEvidenceFixtures = {
    "repair-patch": {
      ok: true,
      outcome: "completed",
      evidence: {}, // Missing required ev:patch-proof
    },
    "repair-verify": {
      ok: true,
      outcome: "completed",
      evidence: { "ev:test-pass": { digest: "sha256:2" } },
    },
  };

  const result = replayExecutionGraph(graph, missingEvidenceFixtures);

  assert.equal(result.ok, false);
  assert.ok(result.counterexample);
  assert.ok(result.counterexample.reason.includes("evidence") || result.counterexample.reason.includes("obligation"));
});
