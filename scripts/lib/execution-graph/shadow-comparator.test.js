"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { compareShadowExecution } = require("./shadow-comparator.js");
const { createSampleExecutionGraph } = require("../test-support/execution-graph-fixtures.js");

test("ShadowComparator: matching baseline and graph execution returns match:true and null telemetry diff", () => {
  const contractInput = {
    change_id: "change:repair-001",
    classification: { route: "repair", risk: "low" },
  };

  const fixedBaselineFn = (input) => ({
    route: "repair",
    steps: ["apply_repair_patch", "verify_repair_conformance"],
    allowed_paths: ["src/**", "tests/**"],
  });

  const graph = createSampleExecutionGraph();

  const comparison = compareShadowExecution({
    contractInput,
    fixedBaselineFn,
    compiledGraph: graph,
  });

  assert.equal(comparison.match, true);
  assert.equal(comparison.telemetryDiff, null);
  assert.ok(comparison.baselineRoute);
  assert.ok(comparison.shadowRoute);
});

test("ShadowComparator: divergent decisions produce structured telemetry diff without halting or throwing", () => {
  const contractInput = {
    change_id: "change:repair-002",
    classification: { route: "repair", risk: "low" },
  };

  const fixedBaselineFn = (input) => ({
    route: "repair",
    steps: ["legacy_apply_patch", "legacy_verify"],
    allowed_paths: ["legacy/path/**"],
  });

  const graph = createSampleExecutionGraph();

  const comparison = compareShadowExecution({
    contractInput,
    fixedBaselineFn,
    compiledGraph: graph,
  });

  assert.equal(comparison.match, false);
  assert.ok(comparison.telemetryDiff);
  assert.ok(comparison.telemetryDiff.divergences.length > 0);
  assert.equal(comparison.baselineRoute.steps[0], "legacy_apply_patch");
  assert.equal(comparison.shadowRoute.steps[0], "apply_repair_patch");
});

test("ShadowComparator: guarantees zero mutation of input objects and active state", () => {
  const stateSnapshot = {
    active_revision: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
    journal: [{ effect_id: "sha256:e1", status: "completed" }],
    status: "ready",
  };

  const frozenJson = JSON.stringify(stateSnapshot);

  const contractInput = {
    change_id: "change:repair-003",
    state: stateSnapshot,
  };

  const fixedBaselineFn = (input) => ({
    route: "repair",
    steps: ["apply_repair_patch"],
  });

  const graph = createSampleExecutionGraph();

  compareShadowExecution({
    contractInput,
    fixedBaselineFn,
    compiledGraph: graph,
  });

  assert.equal(JSON.stringify(stateSnapshot), frozenJson, "State must remain byte-identical before and after shadow comparison");
});

test("ShadowComparator: isolates the baseline input from mutating active state and journal", () => {
  const stateSnapshot = {
    active_revision: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
    journal: [{ effect_id: "sha256:e1", status: "completed" }],
    status: "ready",
  };
  const contractInput = {
    change_id: "change:repair-004",
    state: stateSnapshot,
  };
  const frozenInputJson = JSON.stringify(contractInput);

  const fixedBaselineFn = (input) => {
    input.state.active_revision = "sha256:mutated";
    input.state.journal.push({ effect_id: "sha256:e2", status: "mutated" });
    return {
      route: "repair",
      steps: ["apply_repair_patch", "verify_repair_conformance"],
      allowed_paths: ["src/**", "tests/**"],
    };
  };

  compareShadowExecution({
    contractInput,
    fixedBaselineFn,
    compiledGraph: createSampleExecutionGraph(),
  });

  assert.equal(JSON.stringify(contractInput), frozenInputJson, "Baseline mutations must not reach the original contract input");
  assert.equal(JSON.stringify(stateSnapshot), JSON.stringify(contractInput.state), "Active state and journal must remain identical");
});

test("ShadowComparator: detects multi-dimensional divergences across invariants, obligations, dependencies, and ownership", () => {
  const contractInput = {
    change_id: "change:repair-005",
    classification: { route: "repair", risk: "low" },
  };

  const baselineFnWithDivergentDimensions = (input) => ({
    route: "repair",
    steps: ["apply_repair_patch", "verify_repair_conformance"],
    allowed_paths: ["src/**", "tests/**"],
    invariants: ["inv-other"],
    obligations: ["req-other-obligation"],
    dependencies: [{ node_id: "repair-patch", dependencies: ["other-dep"] }],
    ownership: [{ node_id: "repair-patch", ownership: { owner: "other-agent", mode: "shared" } }],
  });

  const graph = createSampleExecutionGraph();

  const comparison = compareShadowExecution({
    contractInput,
    fixedBaselineFn: baselineFnWithDivergentDimensions,
    compiledGraph: graph,
  });

  assert.equal(comparison.match, false);
  assert.ok(comparison.telemetryDiff);
  const diffFields = comparison.telemetryDiff.divergences.map((d) => d.field);
  assert.ok(diffFields.includes("invariants"));
  assert.ok(diffFields.includes("obligations"));
  assert.ok(diffFields.includes("dependencies"));
  assert.ok(diffFields.includes("ownership"));
  assert.equal(comparison.discrepancy_classification, "partial-match");
  assert.ok(comparison.evaluated_dimensions.includes("steps"));
  assert.ok(comparison.evaluated_dimensions.includes("invariants"));
  assert.equal(comparison.dimension_match_rates.steps, 1);
  assert.equal(comparison.dimension_match_rates.invariants, 0);
});

test("ShadowComparator: classifies fully matching baseline across all dimensions as full-match and skipped dimensions as partial-match", () => {
  const graph = createSampleExecutionGraph();

  // True full match (all 6 dimensions provided and matching)
  const fullMatchBaseline = () => ({
    steps: ["apply_repair_patch", "verify_repair_conformance"],
    allowed_paths: ["src/**", "tests/**"],
    invariants: ["inv-fail-closed", "inv-no-direct-mutation"],
    obligations: ["req-repair-patch-001", "req-repair-verify-001"],
    dependencies: [
      { node_id: "repair-patch", dependencies: [] },
      { node_id: "repair-verify", dependencies: ["repair-patch"] },
    ],
    ownership: [
      { node_id: "repair-patch", ownership: { owner: "agent:repair", mode: "exclusive" } },
      { node_id: "repair-verify", ownership: { owner: "agent:verify", mode: "shared" } },
    ],
  });
  const resFull = compareShadowExecution({
    contractInput: {},
    fixedBaselineFn: fullMatchBaseline,
    compiledGraph: graph,
  });
  assert.equal(resFull.match, true);
  assert.equal(resFull.discrepancy_classification, "full-match");
  assert.equal(resFull.skipped_dimensions.length, 0);

  // Partial match due to skipped dimensions (steps match, but other dimensions not evaluated)
  const skippedDimensionsBaseline = () => ({
    steps: ["apply_repair_patch", "verify_repair_conformance"],
    allowed_paths: ["src/**", "tests/**"],
  });
  const resPartial = compareShadowExecution({
    contractInput: {},
    fixedBaselineFn: skippedDimensionsBaseline,
    compiledGraph: graph,
  });
  assert.equal(resPartial.match, true);
  assert.equal(resPartial.discrepancy_classification, "partial-match");
  assert.ok(resPartial.skipped_dimensions.includes("invariants"));

  // Full divergence across all evaluated dimensions
  const divergedBaseline = () => ({
    steps: ["completely_different_step"],
    allowed_paths: ["completely_different_path"],
  });
  const resDiverged = compareShadowExecution({
    contractInput: {},
    fixedBaselineFn: divergedBaseline,
    compiledGraph: graph,
  });
  assert.equal(resDiverged.match, false);
  assert.equal(resDiverged.discrepancy_classification, "diverged");
});

test("ShadowComparator: detects structured obligation governance differences", () => {
  const graph = createSampleExecutionGraph();

  // Baseline specifies structured obligations with different criticality
  const baselineFnWithGovernanceDiff = () => ({
    steps: ["apply_repair_patch", "verify_repair_conformance"],
    obligations: [
      { id: "req-repair-patch-001", criticality: "should", implemented_by: [], required_evidence: [] },
    ],
  });

  const res = compareShadowExecution({
    contractInput: {},
    fixedBaselineFn: baselineFnWithGovernanceDiff,
    compiledGraph: graph,
  });

  assert.equal(res.match, false);
  const diffFields = res.telemetryDiff.divergences.map((d) => d.field);
  assert.ok(diffFields.includes("obligations"));
});

test("ShadowComparator: rejects tampered ExecutionGraph with graph-id-mismatch", () => {
  const graph = createSampleExecutionGraph();
  graph.nodes[0].objective = "tampered objective";

  assert.throws(
    () =>
      compareShadowExecution({
        contractInput: {},
        fixedBaselineFn: () => ({}),
        compiledGraph: graph,
      }),
    (err) => err.code === "graph-id-mismatch" || err.code === "GRAPH_ID_MISMATCH"
  );
});
