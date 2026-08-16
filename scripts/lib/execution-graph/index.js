"use strict";

const {
  FORBIDDEN_OPERATIONS,
  computeGraphId,
  compileExecutionGraph,
} = require("./compiler.js");

const {
  validateExecutionGraphBinding,
} = require("./binding.js");

const {
  validateObligationManifest,
} = require("./obligation-manifest.js");

const {
  hasCycle,
  topologicalSort,
  computeDescendantClosure,
} = require("./dag.js");

const {
  DEFAULT_VERSIONS,
  createPolicySnapshot,
  computePolicySnapshotDigest,
  validatePolicySnapshotBinding,
} = require("./policy-snapshot.js");

const {
  calculateDescendantClosure,
  applyClarifyEvent,
  processClarifyEvent,
} = require("./clarify.js");

const {
  DEFAULT_WORK_ORDER_BUDGET,
  compileWorkOrders,
  compileWorkOrdersV1,
  compileWorkOrdersV2,
} = require("./work-order-compiler.js");

const {
  replayExecutionGraph,
} = require("./replay-engine.js");

const {
  compareShadowExecution,
  compareShadowDecisions,
} = require("./shadow-comparator.js");

module.exports = {
  // Compiler
  FORBIDDEN_OPERATIONS,
  computeGraphId,
  compileExecutionGraph,
  validateExecutionGraphBinding,

  // Obligation Manifest
  validateObligationManifest,

  // PolicySnapshot
  DEFAULT_VERSIONS,
  createPolicySnapshot,
  computePolicySnapshotDigest,
  validatePolicySnapshotBinding,

  // Clarify
  hasCycle,
  computeDescendantClosure,
  calculateDescendantClosure,
  applyClarifyEvent,
  processClarifyEvent,

  // Work Orders
  DEFAULT_WORK_ORDER_BUDGET,
  compileWorkOrders,
  compileWorkOrdersV1,
  compileWorkOrdersV2,

  // Replay
  topologicalSort,
  replayExecutionGraph,

  // Shadow
  compareShadowExecution,
  compareShadowDecisions,
};
