"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const executionGraph = require("./index.js");

test("ExecutionGraph barrel: exports complete public API", () => {
  assert.equal(typeof executionGraph.compileExecutionGraph, "function");
  assert.equal(typeof executionGraph.computeGraphId, "function");
  assert.ok(Array.isArray(executionGraph.FORBIDDEN_OPERATIONS));

  assert.equal(typeof executionGraph.validateObligationManifest, "function");

  assert.equal(typeof executionGraph.createPolicySnapshot, "function");
  assert.equal(typeof executionGraph.computePolicySnapshotDigest, "function");

  assert.equal(typeof executionGraph.applyClarifyEvent, "function");
  assert.equal(typeof executionGraph.processClarifyEvent, "function");
  assert.equal(typeof executionGraph.computeDescendantClosure, "function");
  assert.equal(typeof executionGraph.calculateDescendantClosure, "function");
  assert.equal(typeof executionGraph.hasCycle, "function");

  assert.equal(typeof executionGraph.compileWorkOrdersV1, "function");
  assert.equal(typeof executionGraph.compileWorkOrdersV2, "function");
  assert.equal(executionGraph.compileWorkOrders, executionGraph.compileWorkOrdersV2);
  assert.ok(executionGraph.DEFAULT_WORK_ORDER_BUDGET);

  assert.equal(typeof executionGraph.replayExecutionGraph, "function");
  assert.equal(typeof executionGraph.topologicalSort, "function");

  assert.equal(typeof executionGraph.compareShadowExecution, "function");
  assert.equal(typeof executionGraph.compareShadowDecisions, "function");
});
