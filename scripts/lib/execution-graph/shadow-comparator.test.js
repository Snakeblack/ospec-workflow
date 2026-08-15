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
});
