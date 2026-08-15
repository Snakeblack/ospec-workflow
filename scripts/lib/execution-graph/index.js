"use strict";

const {
  FORBIDDEN_OPERATIONS,
  computeGraphId,
  compileExecutionGraph,
} = require("./compiler.js");

const {
  validateObligationManifest,
} = require("./obligation-manifest.js");

const {
  DEFAULT_VERSIONS,
  createPolicySnapshot,
  computePolicySnapshotDigest,
} = require("./policy-snapshot.js");

const {
  hasCycle,
  computeDescendantClosure,
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
  topologicalSort,
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

  // Obligation Manifest
  validateObligationManifest,

  // PolicySnapshot
  DEFAULT_VERSIONS,
  createPolicySnapshot,
  computePolicySnapshotDigest,

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
