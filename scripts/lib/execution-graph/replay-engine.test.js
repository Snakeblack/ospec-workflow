"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { replayExecutionGraph } = require("./replay-engine.js");
const { defaultPathInventory } = require("./work-order-compiler.js");
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

test("ReplayEngine: canonical replayExecutionGraph ignores allowLegacyFixtures option", () => {
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

  assert.throws(
    () => replayExecutionGraph(graph, unboundFixtures, { allowLegacyFixtures: true }),
    (err) => err.code === "stale-fixture-rejected"
  );
});

test("ReplayEngine: Replay accepts every canonical WorkOrder emitted by supported K4a compilation", () => {
  const { compileWorkOrdersV2 } = require("./work-order-compiler.js");
  const graph = createSampleExecutionGraph();
  const workOrders = compileWorkOrdersV2(graph, { pathInventory: defaultPathInventory(graph.source_snapshot_id) });

  const fixtures = {};
  for (const wo of workOrders) {
    fixtures[wo.node_id] = {
      graph_id: graph.graph_id,
      work_order_id: wo.work_order_id,
      status: "completed",
      evidence: { [wo.required_evidence[0]]: { verified: true, digest: "sha256:canonical" } },
    };
  }

  const result = replayExecutionGraph(graph, fixtures);
  assert.equal(result.ok, true);
  assert.deepEqual(result.completedNodes.sort(), graph.nodes.map((n) => n.node_id).sort());
});

test("ReplayEngine: rejects incomplete fixture claiming completed without evidence object fail-closed", () => {
  const { compileWorkOrdersV2 } = require("./work-order-compiler.js");
  const graph = createSampleExecutionGraph();
  const workOrders = compileWorkOrdersV2(graph, { pathInventory: defaultPathInventory(graph.source_snapshot_id) });
  const woMap = new Map(workOrders.map((w) => [w.node_id, w.work_order_id]));

  const incompleteFixtures = {
    "repair-patch": {
      graph_id: graph.graph_id,
      work_order_id: woMap.get("repair-patch"),
      status: "completed",
      // missing evidence entirely
    },
    "repair-verify": {
      graph_id: graph.graph_id,
      work_order_id: woMap.get("repair-verify"),
      status: "completed",
      evidence: { "ev:test-pass": { digest: "sha256:pass" } },
    },
  };

  const result = replayExecutionGraph(graph, incompleteFixtures);
  assert.equal(result.ok, false);
  assert.deepEqual(result.failedNodes, ["repair-patch"]);
  assert.ok(result.counterexample);
  assert.ok(result.counterexample.reason.includes("incomplete"));
});

test("ReplayEngine: rejects completed status when exit_code is non-zero fail-closed", () => {
  const { compileWorkOrdersV2 } = require("./work-order-compiler.js");
  const graph = createSampleExecutionGraph();
  const workOrders = compileWorkOrdersV2(graph, { pathInventory: defaultPathInventory(graph.source_snapshot_id) });
  const woMap = new Map(workOrders.map((w) => [w.node_id, w.work_order_id]));

  const contradictoryExitCodeFixtures = {
    "repair-patch": {
      graph_id: graph.graph_id,
      work_order_id: woMap.get("repair-patch"),
      status: "completed",
      exit_code: 1, // Non-zero exit code contradicts completed status
      evidence: { "ev:patch-proof": { digest: "sha256:proof" } },
    },
    "repair-verify": {
      graph_id: graph.graph_id,
      work_order_id: woMap.get("repair-verify"),
      status: "completed",
      exit_code: 0,
      evidence: { "ev:test-pass": { digest: "sha256:pass" } },
    },
  };

  const result = replayExecutionGraph(graph, contradictoryExitCodeFixtures);
  assert.equal(result.ok, false);
  assert.deepEqual(result.failedNodes, ["repair-patch"]);
  assert.ok(result.counterexample);
  assert.ok(result.counterexample.reason.includes("Contradictory"));
});

test("ReplayEngine (Dimension 1): rejects empty, null, or non-string graph_id or work_order_id fail-closed", () => {
  const { compileWorkOrdersV2 } = require("./work-order-compiler.js");
  const graph = createSampleExecutionGraph();
  const workOrders = compileWorkOrdersV2(graph, { pathInventory: defaultPathInventory(graph.source_snapshot_id) });
  const woMap = new Map(workOrders.map((w) => [w.node_id, w.work_order_id]));

  const invalidProvenanceCases = [
    { graph_id: "", work_order_id: woMap.get("repair-patch"), label: "empty graph_id" },
    { graph_id: null, work_order_id: woMap.get("repair-patch"), label: "null graph_id" },
    { graph_id: 12345, work_order_id: woMap.get("repair-patch"), label: "numeric graph_id" },
    { graph_id: graph.graph_id, work_order_id: "", label: "empty work_order_id" },
    { graph_id: graph.graph_id, work_order_id: null, label: "null work_order_id" },
    { graph_id: graph.graph_id, work_order_id: { id: "bad" }, label: "object work_order_id" },
  ];

  for (const tc of invalidProvenanceCases) {
    const fixtures = {
      "repair-patch": {
        graph_id: tc.graph_id,
        work_order_id: tc.work_order_id,
        status: "completed",
        evidence: { "ev:patch-proof": { digest: "sha256:proof" } },
      },
      "repair-verify": {
        graph_id: graph.graph_id,
        work_order_id: woMap.get("repair-verify"),
        status: "completed",
        evidence: { "ev:test-pass": { digest: "sha256:pass" } },
      },
    };

    assert.throws(
      () => replayExecutionGraph(graph, fixtures),
      (err) => err.code === "stale-fixture-rejected" && err.node_id === "repair-patch",
      `Expected stale-fixture-rejected for ${tc.label}`
    );
  }
});

test("ReplayEngine (Dimension 2): accepts status or outcome completed independently", () => {
  const { compileWorkOrdersV2 } = require("./work-order-compiler.js");
  const graph = createSampleExecutionGraph();
  const workOrders = compileWorkOrdersV2(graph, { pathInventory: defaultPathInventory(graph.source_snapshot_id) });
  const woMap = new Map(workOrders.map((w) => [w.node_id, w.work_order_id]));

  // Status completed only
  const fixturesStatusOnly = {
    "repair-patch": {
      graph_id: graph.graph_id,
      work_order_id: woMap.get("repair-patch"),
      status: "completed",
      evidence: { "ev:patch-proof": { digest: "sha256:proof" } },
    },
    "repair-verify": {
      graph_id: graph.graph_id,
      work_order_id: woMap.get("repair-verify"),
      status: "completed",
      evidence: { "ev:test-pass": { digest: "sha256:pass" } },
    },
  };
  const res1 = replayExecutionGraph(graph, fixturesStatusOnly);
  assert.equal(res1.ok, true);

  // Outcome completed only
  const fixturesOutcomeOnly = {
    "repair-patch": {
      graph_id: graph.graph_id,
      work_order_id: woMap.get("repair-patch"),
      outcome: "completed",
      evidence: { "ev:patch-proof": { digest: "sha256:proof" } },
    },
    "repair-verify": {
      graph_id: graph.graph_id,
      work_order_id: woMap.get("repair-verify"),
      outcome: "completed",
      evidence: { "ev:test-pass": { digest: "sha256:pass" } },
    },
  };
  const res2 = replayExecutionGraph(graph, fixturesOutcomeOnly);
  assert.equal(res2.ok, true);
});

test("ReplayEngine (Dimension 2): rejects contradictory status and outcome combinations", () => {
  const { compileWorkOrdersV2 } = require("./work-order-compiler.js");
  const graph = createSampleExecutionGraph();
  const workOrders = compileWorkOrdersV2(graph, { pathInventory: defaultPathInventory(graph.source_snapshot_id) });
  const woMap = new Map(workOrders.map((w) => [w.node_id, w.work_order_id]));

  const contradictoryCombos = [
    { status: "completed", outcome: "cancelled" },
    { status: "cancelled", outcome: "completed" },
    { status: "failed", outcome: "completed" },
    { status: "completed", outcome: "failed" },
    { status: "completed", ok: false },
    { outcome: "completed", ok: false },
  ];

  for (const combo of contradictoryCombos) {
    const fixtures = {
      "repair-patch": {
        graph_id: graph.graph_id,
        work_order_id: woMap.get("repair-patch"),
        ...combo,
        evidence: { "ev:patch-proof": { digest: "sha256:proof" } },
      },
      "repair-verify": {
        graph_id: graph.graph_id,
        work_order_id: woMap.get("repair-verify"),
        status: "completed",
        evidence: { "ev:test-pass": { digest: "sha256:pass" } },
      },
    };

    const res = replayExecutionGraph(graph, fixtures);
    assert.equal(res.ok, false, `Expected failure for combo ${JSON.stringify(combo)}`);
    assert.deepEqual(res.failedNodes, ["repair-patch"]);
    assert.ok(res.blockedNodes.includes("repair-verify"));
  }
});

test("ReplayEngine (Dimension 3): exit_code validation rules", () => {
  const { compileWorkOrdersV2 } = require("./work-order-compiler.js");
  const graph = createSampleExecutionGraph();
  const workOrders = compileWorkOrdersV2(graph, { pathInventory: defaultPathInventory(graph.source_snapshot_id) });
  const woMap = new Map(workOrders.map((w) => [w.node_id, w.work_order_id]));

  // Exit code 0 is valid
  const res0 = replayExecutionGraph(graph, {
    "repair-patch": {
      graph_id: graph.graph_id,
      work_order_id: woMap.get("repair-patch"),
      status: "completed",
      exit_code: 0,
      evidence: { "ev:patch-proof": { digest: "sha256:proof" } },
    },
    "repair-verify": {
      graph_id: graph.graph_id,
      work_order_id: woMap.get("repair-verify"),
      status: "completed",
      exit_code: 0,
      evidence: { "ev:test-pass": { digest: "sha256:pass" } },
    },
  });
  assert.equal(res0.ok, true);

  // Exit code non-zero with completed status fails closed
  for (const badExitCode of [1, -1, 127, 255]) {
    const resBad = replayExecutionGraph(graph, {
      "repair-patch": {
        graph_id: graph.graph_id,
        work_order_id: woMap.get("repair-patch"),
        status: "completed",
        exit_code: badExitCode,
        evidence: { "ev:patch-proof": { digest: "sha256:proof" } },
      },
      "repair-verify": {
        graph_id: graph.graph_id,
        work_order_id: woMap.get("repair-verify"),
        status: "completed",
        evidence: { "ev:test-pass": { digest: "sha256:pass" } },
      },
    });
    assert.equal(resBad.ok, false);
    assert.deepEqual(resBad.failedNodes, ["repair-patch"]);
  }

  // Non-zero exit code when status is explicitly failed does not contradict
  const resFailed = replayExecutionGraph(graph, {
    "repair-patch": {
      graph_id: graph.graph_id,
      work_order_id: woMap.get("repair-patch"),
      status: "failed",
      exit_code: 1,
      error: "Command failed with code 1",
    },
    "repair-verify": {
      graph_id: graph.graph_id,
      work_order_id: woMap.get("repair-verify"),
      status: "completed",
      evidence: { "ev:test-pass": { digest: "sha256:pass" } },
    },
  });
  assert.equal(resFailed.ok, false);
  assert.deepEqual(resFailed.failedNodes, ["repair-patch"]);
  assert.deepEqual(resFailed.blockedNodes, ["repair-verify"]);
});

test("ReplayEngine (Dimension 4): malformed evidence types fail closed", () => {
  const { compileWorkOrdersV2 } = require("./work-order-compiler.js");
  const graph = createSampleExecutionGraph();
  const workOrders = compileWorkOrdersV2(graph, { pathInventory: defaultPathInventory(graph.source_snapshot_id) });
  const woMap = new Map(workOrders.map((w) => [w.node_id, w.work_order_id]));

  const malformedEvidenceValues = [
    { value: null, label: "null" },
    { value: [], label: "empty array" },
    { value: ["ev:patch-proof"], label: "array of strings" },
    { value: "ev:patch-proof", label: "string primitive" },
    { value: 12345, label: "number primitive" },
    { value: true, label: "boolean primitive" },
  ];

  for (const tc of malformedEvidenceValues) {
    const fixtures = {
      "repair-patch": {
        graph_id: graph.graph_id,
        work_order_id: woMap.get("repair-patch"),
        status: "completed",
        evidence: tc.value,
      },
      "repair-verify": {
        graph_id: graph.graph_id,
        work_order_id: woMap.get("repair-verify"),
        status: "completed",
        evidence: { "ev:test-pass": { digest: "sha256:pass" } },
      },
    };

    const res = replayExecutionGraph(graph, fixtures);
    assert.equal(res.ok, false, `Expected failure for evidence ${tc.label}`);
    assert.deepEqual(res.failedNodes, ["repair-patch"]);
    assert.ok(res.counterexample.reason.includes("incomplete") || res.counterexample.reason.includes("evidence"));
  }
});

test("ReplayEngine (Dimension 5): multi-item required evidence failure", () => {
  const { compileWorkOrdersV2 } = require("./work-order-compiler.js");
  const graph = createSampleExecutionGraph({
    nodes: [
      {
        node_id: "repair-patch",
        kind: "repair-action/v1",
        operation: "apply_repair_patch",
        objective: "Apply repair code modifications",
        dependencies: [],
        ownership: { owner: "agent:repair", mode: "exclusive" },
        allowed_paths: ["src/index.js"],
        invariants: ["inv-fail-closed"],
        required_evidence: ["ev:patch-proof", "ev:lint-attestation"],
        budget_ref: "budget:default",
      },
      {
        node_id: "repair-verify",
        kind: "repair-action/v1",
        operation: "verify_repair_conformance",
        objective: "Run automated verification on repair modifications",
        dependencies: ["repair-patch"],
        ownership: { owner: "agent:verify", mode: "shared" },
        allowed_paths: ["src/index.js", "tests/index.js"],
        invariants: ["inv-no-direct-mutation"],
        required_evidence: ["ev:test-pass"],
        budget_ref: "budget:default",
      },
    ],
    obligations: [
      {
        id: "req-repair-patch-001",
        criticality: "must",
        implemented_by: ["repair-patch"],
        required_evidence: ["ev:patch-proof", "ev:lint-attestation"],
      },
      {
        id: "req-repair-verify-001",
        criticality: "must",
        implemented_by: ["repair-verify"],
        required_evidence: ["ev:test-pass"],
      },
    ],
    contractOverrides: {
      obligations: [
        {
          id: "req-repair-patch-001",
          criticality: "must",
          implemented_by: ["repair-patch"],
          required_evidence: ["ev:patch-proof", "ev:lint-attestation"],
        },
        {
          id: "req-repair-verify-001",
          criticality: "must",
          implemented_by: ["repair-verify"],
          required_evidence: ["ev:test-pass"],
        },
      ],
    },
  });

  const workOrders = compileWorkOrdersV2(graph, { pathInventory: defaultPathInventory(graph.source_snapshot_id) });
  const woMap = new Map(workOrders.map((w) => [w.node_id, w.work_order_id]));

  // Fixture provides only 1 of 2 required evidence keys
  const partialEvidenceFixtures = {
    "repair-patch": {
      graph_id: graph.graph_id,
      work_order_id: woMap.get("repair-patch"),
      status: "completed",
      evidence: { "ev:patch-proof": { digest: "sha256:patch" } }, // missing ev:lint-attestation
    },
    "repair-verify": {
      graph_id: graph.graph_id,
      work_order_id: woMap.get("repair-verify"),
      status: "completed",
      evidence: { "ev:test-pass": { digest: "sha256:pass" } },
    },
  };

  const result = replayExecutionGraph(graph, partialEvidenceFixtures);
  assert.equal(result.ok, false);
  assert.deepEqual(result.failedNodes, ["repair-patch"]);
  assert.deepEqual(result.blockedNodes, ["repair-verify"]);
  assert.ok(result.counterexample);
  assert.equal(result.counterexample.failed_node, "repair-patch");
  assert.ok(result.counterexample.reason.includes("missing required evidence") || result.counterexample.reason.includes("ev:lint-attestation"));

  // Providing both required evidence keys succeeds
  const fullEvidenceFixtures = {
    "repair-patch": {
      graph_id: graph.graph_id,
      work_order_id: woMap.get("repair-patch"),
      status: "completed",
      evidence: {
        "ev:patch-proof": { digest: "sha256:patch" },
        "ev:lint-attestation": { digest: "sha256:lint" },
        "ev:extra-telemetry": { duration: 42 }, // Extra keys allowed
      },
    },
    "repair-verify": {
      graph_id: graph.graph_id,
      work_order_id: woMap.get("repair-verify"),
      status: "completed",
      evidence: { "ev:test-pass": { digest: "sha256:pass" } },
    },
  };

  const fullResult = replayExecutionGraph(graph, fullEvidenceFixtures);
  assert.equal(fullResult.ok, true);
  assert.deepEqual(fullResult.completedNodes.sort(), ["repair-patch", "repair-verify"]);
});

test("ReplayEngine (Dimension 6): obligation satisfaction and approved deferrals", () => {
  const { compileWorkOrdersV2 } = require("./work-order-compiler.js");
  const graphWithDeferred = createSampleExecutionGraph({
    obligations: [
      {
        id: "req-repair-patch-001",
        criticality: "must",
        implemented_by: ["repair-patch"],
        required_evidence: ["ev:patch-proof"],
      },
      {
        id: "req-repair-verify-001",
        criticality: "must",
        implemented_by: ["repair-verify"],
        required_evidence: ["ev:test-pass"],
      },
      {
        id: "obl-security-audit",
        criticality: "must",
        description: "External security audit obligation",
        implemented_by: ["repair-patch"],
        required_evidence: ["ev:sec-audit"],
        deferred: {
          reason: "Deferred to post-release external penetration test",
          approved_by: "sec-lead-signature",
        },
      },
    ],
    contractOverrides: {
      obligations: [
        {
          id: "req-repair-patch-001",
          criticality: "must",
          implemented_by: ["repair-patch"],
          required_evidence: ["ev:patch-proof"],
        },
        {
          id: "req-repair-verify-001",
          criticality: "must",
          implemented_by: ["repair-verify"],
          required_evidence: ["ev:test-pass"],
        },
        {
          id: "obl-security-audit",
          criticality: "must",
          implemented_by: ["repair-patch"],
          required_evidence: ["ev:sec-audit"],
          deferred: {
            reason: "Deferred to post-release external penetration test",
            approved_by: "sec-lead-signature",
          },
        },
      ],
    },
  });

  const workOrders = compileWorkOrdersV2(graphWithDeferred, {
    pathInventory: defaultPathInventory(graphWithDeferred.source_snapshot_id),
  });
  const woMap = new Map(workOrders.map((w) => [w.node_id, w.work_order_id]));

  const fixtures = {
    "repair-patch": {
      graph_id: graphWithDeferred.graph_id,
      work_order_id: woMap.get("repair-patch"),
      status: "completed",
      evidence: { "ev:patch-proof": { digest: "sha256:patch" } },
    },
    "repair-verify": {
      graph_id: graphWithDeferred.graph_id,
      work_order_id: woMap.get("repair-verify"),
      status: "completed",
      evidence: { "ev:test-pass": { digest: "sha256:pass" } },
    },
  };

  // Replay should succeed because obl-security-audit has an approved deferral
  const resDeferred = replayExecutionGraph(graphWithDeferred, fixtures);
  assert.equal(resDeferred.ok, true);

  // Without deferred record, obligation check fails and produces counterexample
  const graphWithoutDeferred = createSampleExecutionGraph({
    obligations: [
      {
        id: "req-repair-patch-001",
        criticality: "must",
        implemented_by: ["repair-patch"],
        required_evidence: ["ev:patch-proof"],
      },
      {
        id: "req-repair-verify-001",
        criticality: "must",
        implemented_by: ["repair-verify"],
        required_evidence: ["ev:test-pass"],
      },
      {
        id: "obl-security-audit",
        criticality: "must",
        implemented_by: ["repair-patch"],
        required_evidence: ["ev:sec-audit"],
      },
    ],
    contractOverrides: {
      obligations: [
        {
          id: "req-repair-patch-001",
          criticality: "must",
          implemented_by: ["repair-patch"],
          required_evidence: ["ev:patch-proof"],
        },
        {
          id: "req-repair-verify-001",
          criticality: "must",
          implemented_by: ["repair-verify"],
          required_evidence: ["ev:test-pass"],
        },
        {
          id: "obl-security-audit",
          criticality: "must",
          implemented_by: ["repair-patch"],
          required_evidence: ["ev:sec-audit"],
        },
      ],
    },
  });

  const woMapNoDef = new Map(compileWorkOrdersV2(graphWithoutDeferred, {
    pathInventory: defaultPathInventory(graphWithoutDeferred.source_snapshot_id),
  }).map((w) => [w.node_id, w.work_order_id]));
  const resFailingObl = replayExecutionGraph(graphWithoutDeferred, {
    "repair-patch": {
      graph_id: graphWithoutDeferred.graph_id,
      work_order_id: woMapNoDef.get("repair-patch"),
      status: "completed",
      evidence: { "ev:patch-proof": { digest: "sha256:patch" } }, // missing ev:sec-audit
    },
    "repair-verify": {
      graph_id: graphWithoutDeferred.graph_id,
      work_order_id: woMapNoDef.get("repair-verify"),
      status: "completed",
      evidence: { "ev:test-pass": { digest: "sha256:pass" } },
    },
  });
  assert.equal(resFailingObl.ok, false);
  assert.ok(resFailingObl.counterexample);
  assert.ok(resFailingObl.counterexample.unfulfilled_obligations.length > 0);
  assert.equal(resFailingObl.counterexample.unfulfilled_obligations[0].id, "obl-security-audit");
  assert.deepEqual(resFailingObl.counterexample.unfulfilled_obligations[0].missingEvidence, ["ev:sec-audit"]);
});

test("ReplayEngine: idempotency of failed evaluations and counterexample determinism", () => {
  const graph = createSampleExecutionGraph();
  const sampleFixtures = createSampleFixtureResults(graph);
  const failingFixtures = {
    "repair-patch": {
      ...sampleFixtures["repair-patch"],
      status: "failed",
      error: "Deterministic failure injection",
    },
    "repair-verify": sampleFixtures["repair-verify"],
  };

  const run1 = replayExecutionGraph(graph, failingFixtures);
  const run2 = replayExecutionGraph(graph, failingFixtures);

  assert.equal(run1.ok, false);
  assert.equal(run2.ok, false);
  assert.equal(run1.finalStateDigest, run2.finalStateDigest);
  assert.deepEqual(run1.counterexample, run2.counterexample);
  assert.deepEqual(run1.trace, run2.trace);
});



