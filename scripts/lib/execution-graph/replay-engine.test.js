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
  const sampleFixtures = createSampleFixtureResults(graph);
  // Only repair-patch has fixture result; repair-verify is missing
  const partialFixtures = {
    "repair-patch": sampleFixtures["repair-patch"],
  };

  const result = replayExecutionGraph(graph, partialFixtures);

  assert.equal(result.ok, false);
  assert.deepEqual(result.completedNodes, ["repair-patch"]);
  assert.ok(result.blockedNodes.includes("repair-verify") || result.failedNodes.includes("repair-verify"));
  assert.ok(result.counterexample !== null, "Incomplete replay must emit reproducible counterexample");
});

test("ReplayEngine: failed node stops dependent branch and generates counterexample", () => {
  const graph = createSampleExecutionGraph();
  const sampleFixtures = createSampleFixtureResults(graph);
  const failingFixtures = {
    "repair-patch": {
      ...sampleFixtures["repair-patch"],
      ok: false,
      outcome: "failed",
      error: "Patch application conflict",
    },
    "repair-verify": sampleFixtures["repair-verify"],
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
  const sampleFixtures = createSampleFixtureResults(graph);
  const missingEvidenceFixtures = {
    "repair-patch": {
      ...sampleFixtures["repair-patch"],
      evidence: {}, // Missing required ev:patch-proof
    },
    "repair-verify": sampleFixtures["repair-verify"],
  };

  const result = replayExecutionGraph(graph, missingEvidenceFixtures);

  assert.equal(result.ok, false);
  assert.ok(result.counterexample);
  assert.ok(result.counterexample.reason.includes("evidence") || result.counterexample.reason.includes("obligation"));
});

test("ReplayEngine: rejects stale fixture result for invalidated node fail-closed", () => {
  const graph = createSampleExecutionGraph();
  const fixtures = createSampleFixtureResults(graph);

  assert.throws(
    () => replayExecutionGraph(graph, fixtures, { invalidatedNodeIds: ["repair-patch"] }),
    (err) => err.code === "stale-fixture-rejected" && err.node_id === "repair-patch"
  );
});

test("ReplayEngine: discriminates cancelled or non-completed status and generates counterexample", () => {
  const graph = createSampleExecutionGraph();
  const sampleFixtures = createSampleFixtureResults(graph);
  const cancelledFixtures = {
    "repair-patch": {
      ...sampleFixtures["repair-patch"],
      ok: false,
      status: "cancelled",
      error: "Operation timed out and was cancelled",
    },
    "repair-verify": sampleFixtures["repair-verify"],
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
  const sampleFixtures = createSampleFixtureResults(graph);
  // repair-patch requires "ev:patch-proof". Providing other evidence but not required evidence
  const fixtures = {
    "repair-patch": {
      ...sampleFixtures["repair-patch"],
      evidence: { "ev:unrelated": { digest: "sha256:3" } },
    },
    "repair-verify": sampleFixtures["repair-verify"],
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

  const fixtures = createSampleFixtureResults(graph);

  assert.throws(
    () => replayExecutionGraph(graph, fixtures),
    (err) => err.code === "graph-id-mismatch" || err.code === "GRAPH_ID_MISMATCH"
  );
});

test("ReplayEngine: rejects contradictory terminal states fail-closed", () => {
  const graph = createSampleExecutionGraph();
  const sampleFixtures = createSampleFixtureResults(graph);

  // Case 1: status completed but outcome failed
  const contradictory1 = {
    "repair-patch": {
      ...sampleFixtures["repair-patch"],
      outcome: "failed",
    },
    "repair-verify": sampleFixtures["repair-verify"],
  };
  const res1 = replayExecutionGraph(graph, contradictory1);
  assert.equal(res1.ok, false);
  assert.deepEqual(res1.failedNodes, ["repair-patch"]);

  // Case 2: ok false but status completed
  const contradictory2 = {
    "repair-patch": {
      ...sampleFixtures["repair-patch"],
      ok: false,
    },
    "repair-verify": sampleFixtures["repair-verify"],
  };
  const res2 = replayExecutionGraph(graph, contradictory2);
  assert.equal(res2.ok, false);
  assert.deepEqual(res2.failedNodes, ["repair-patch"]);

  // Case 3: status cancelled but outcome completed
  const contradictory3 = {
    "repair-patch": {
      ...sampleFixtures["repair-patch"],
      status: "cancelled",
    },
    "repair-verify": sampleFixtures["repair-verify"],
  };
  const res3 = replayExecutionGraph(graph, contradictory3);
  assert.equal(res3.ok, false);
  assert.deepEqual(res3.failedNodes, ["repair-patch"]);
});

test("ReplayEngine: rejects stale fixture with mismatched work_order_id or graph_id fail-closed", () => {
  const graph = createSampleExecutionGraph();
  const sampleFixtures = createSampleFixtureResults(graph);

  // Mismatched graph_id
  const mismatchedGraphFixtures = {
    "repair-patch": {
      ...sampleFixtures["repair-patch"],
      graph_id: "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
    },
    "repair-verify": sampleFixtures["repair-verify"],
  };
  assert.throws(
    () => replayExecutionGraph(graph, mismatchedGraphFixtures),
    (err) => err.code === "stale-fixture-rejected"
  );

  // Mismatched work_order_id
  const mismatchedWoFixtures = {
    "repair-patch": {
      ...sampleFixtures["repair-patch"],
      work_order_id: "sha256:0000000000000000000000000000000000000000000000000000000000000000",
    },
    "repair-verify": sampleFixtures["repair-verify"],
  };
  assert.throws(
    () => replayExecutionGraph(graph, mismatchedWoFixtures),
    (err) => err.code === "stale-fixture-rejected"
  );
});

test("ReplayEngine: rejects unbound fixtures lacking graph_id or work_order_id in canonical mode", () => {
  const graph = createSampleExecutionGraph();
  const unboundFixtures = {
    "repair-patch": {
      ok: true,
      status: "completed",
      evidence: { "ev:patch-proof": { digest: "sha256:1" } },
    },
    "repair-verify": {
      ok: true,
      status: "completed",
      evidence: { "ev:test-pass": { digest: "sha256:2" } },
    },
  };

  // Canonical replay MUST reject unbound fixtures
  assert.throws(
    () => replayExecutionGraph(graph, unboundFixtures),
    (err) => err.code === "stale-fixture-rejected"
  );

  // Legacy mode explicitly allows unbound fixtures if allowLegacyFixtures is passed
  const { replayLegacyFixtureGraph } = require("./replay-engine.js");
  const legacyRes = replayLegacyFixtureGraph(graph, unboundFixtures);
  assert.equal(legacyRes.ok, true);
  assert.deepEqual(legacyRes.completedNodes.sort(), ["repair-patch", "repair-verify"]);
});

test("ReplayEngine: old unbound fixture cannot resurrect clarified graph nodes", () => {
  const { applyClarifyEvent } = require("./clarify.js");
  const graph = createSampleExecutionGraph();

  const oldUnboundFixture = {
    ok: true,
    status: "completed",
    evidence: {
      "ev:patch-proof": { signature: "old-sig" },
    },
  };

  const clarifyEvent = {
    schema_version: 1,
    event_id: "evt-clarify-adversarial",
    question_id: "q-auth",
    answer: "New clarified auth specification",
    timestamp: "2026-08-16T12:00:00Z",
    affected_nodes: ["repair-patch"],
  };

  const clarified = applyClarifyEvent(graph, clarifyEvent);

  // Replay without explicit invalidatedNodeIds must still reject unbound old fixture
  assert.throws(
    () =>
      replayExecutionGraph(clarified.graph, {
        "repair-patch": oldUnboundFixture,
        "repair-verify": oldUnboundFixture,
      }),
    (err) => err.code === "stale-fixture-rejected"
  );
});
