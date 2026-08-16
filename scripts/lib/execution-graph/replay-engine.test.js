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

test("ReplayEngine: rejects stale fixture result for invalidated node fail-closed", () => {
  const graph = createSampleExecutionGraph();
  const fixtures = createSampleFixtureResults();

  assert.throws(
    () => replayExecutionGraph(graph, fixtures, { invalidatedNodeIds: ["repair-patch"] }),
    (err) => err.code === "stale-fixture-rejected" && err.node_id === "repair-patch"
  );
});

test("ReplayEngine: discriminates cancelled or non-completed status and generates counterexample", () => {
  const graph = createSampleExecutionGraph();
  const cancelledFixtures = {
    "repair-patch": {
      ok: false,
      status: "cancelled",
      error: "Operation timed out and was cancelled",
    },
    "repair-verify": {
      ok: true,
      status: "completed",
      evidence: { "ev:test-pass": { digest: "sha256:2" } },
    },
  };

  const result = replayExecutionGraph(graph, cancelledFixtures);

  assert.equal(result.ok, false);
  assert.deepEqual(result.failedNodes, ["repair-patch"]);
  assert.ok(result.blockedNodes.includes("repair-verify"));
  assert.ok(result.counterexample);
  assert.equal(result.counterexample.failed_node, "repair-patch");
  assert.ok(result.counterexample.reason.includes("cancelled") || result.counterexample.reason.includes("timed out"));
});

test("ReplayEngine: per-node required_evidence failure stops node and blocks downstream dependencies", () => {
  const graph = createSampleExecutionGraph();
  // repair-patch requires "ev:patch-proof". Providing other evidence but not required evidence
  const fixtures = {
    "repair-patch": {
      ok: true,
      status: "completed",
      evidence: { "ev:unrelated": { digest: "sha256:3" } },
    },
    "repair-verify": {
      ok: true,
      status: "completed",
      evidence: { "ev:test-pass": { digest: "sha256:2" } },
    },
  };

  const result = replayExecutionGraph(graph, fixtures);
  assert.equal(result.ok, false);
  assert.deepEqual(result.failedNodes, ["repair-patch"]);
  assert.deepEqual(result.blockedNodes, ["repair-verify"]);
  assert.ok(result.counterexample);
  assert.equal(result.counterexample.failed_node, "repair-patch");
  assert.ok(result.counterexample.reason.includes("missing required evidence") || result.counterexample.reason.includes("ev:patch-proof"));
  assert.ok(Array.isArray(result.counterexample.trace));
  assert.ok(result.counterexample.trace.length >= 2);
});

test("ReplayEngine: rejects tampered ExecutionGraph with graph-id-mismatch", () => {
  const graph = createSampleExecutionGraph();
  graph.nodes[0].objective = "tampered objective";

  const fixtures = createSampleFixtureResults();

  assert.throws(
    () => replayExecutionGraph(graph, fixtures),
    (err) => err.code === "graph-id-mismatch" || err.code === "GRAPH_ID_MISMATCH"
  );
});

test("ReplayEngine: rejects contradictory terminal states fail-closed", () => {
  const graph = createSampleExecutionGraph();

  // Case 1: status completed but outcome failed
  const contradictory1 = {
    "repair-patch": {
      ok: true,
      status: "completed",
      outcome: "failed",
      evidence: { "ev:patch-proof": { digest: "sha256:1" } },
    },
    "repair-verify": {
      ok: true,
      status: "completed",
      evidence: { "ev:test-pass": { digest: "sha256:2" } },
    },
  };
  const res1 = replayExecutionGraph(graph, contradictory1);
  assert.equal(res1.ok, false);
  assert.deepEqual(res1.failedNodes, ["repair-patch"]);

  // Case 2: ok false but status completed
  const contradictory2 = {
    "repair-patch": {
      ok: false,
      status: "completed",
      outcome: "completed",
      evidence: { "ev:patch-proof": { digest: "sha256:1" } },
    },
    "repair-verify": {
      ok: true,
      status: "completed",
      evidence: { "ev:test-pass": { digest: "sha256:2" } },
    },
  };
  const res2 = replayExecutionGraph(graph, contradictory2);
  assert.equal(res2.ok, false);
  assert.deepEqual(res2.failedNodes, ["repair-patch"]);

  // Case 3: status cancelled but outcome completed
  const contradictory3 = {
    "repair-patch": {
      ok: true,
      status: "cancelled",
      outcome: "completed",
      evidence: { "ev:patch-proof": { digest: "sha256:1" } },
    },
    "repair-verify": {
      ok: true,
      status: "completed",
      evidence: { "ev:test-pass": { digest: "sha256:2" } },
    },
  };
  const res3 = replayExecutionGraph(graph, contradictory3);
  assert.equal(res3.ok, false);
  assert.deepEqual(res3.failedNodes, ["repair-patch"]);
});

test("ReplayEngine: rejects stale fixture with mismatched work_order_id or graph_id fail-closed", () => {
  const graph = createSampleExecutionGraph();

  // Mismatched graph_id
  const mismatchedGraphFixtures = {
    "repair-patch": {
      ok: true,
      status: "completed",
      graph_id: "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
      evidence: { "ev:patch-proof": { digest: "sha256:1" } },
    },
    "repair-verify": {
      ok: true,
      status: "completed",
      evidence: { "ev:test-pass": { digest: "sha256:2" } },
    },
  };
  assert.throws(
    () => replayExecutionGraph(graph, mismatchedGraphFixtures),
    (err) => err.code === "stale-fixture-rejected"
  );

  // Mismatched work_order_id
  const mismatchedWoFixtures = {
    "repair-patch": {
      ok: true,
      status: "completed",
      work_order_id: "sha256:0000000000000000000000000000000000000000000000000000000000000000",
      evidence: { "ev:patch-proof": { digest: "sha256:1" } },
    },
    "repair-verify": {
      ok: true,
      status: "completed",
      evidence: { "ev:test-pass": { digest: "sha256:2" } },
    },
  };
  assert.throws(
    () => replayExecutionGraph(graph, mismatchedWoFixtures),
    (err) => err.code === "stale-fixture-rejected"
  );
});
