"use strict";

const { orchestrateRepairShadow } = require("./orchestrator.js");
const { integrateWorkResultPatches } = require("./patch-integrator.js");
const {
  persistRepairShadowExecution,
  loadRepairShadowExecution,
  loadRepairShadowExecutions,
  validateRepairShadowExecutionRecord,
} = require("./execution-record-store.js");
const { compareShadowExecution, buildComparisonProjection } = require("./shadow-comparator.js");

module.exports = {
  orchestrateRepairShadow,
  integrateWorkResultPatches,
  compareShadowExecution,
  buildComparisonProjection,
  persistRepairShadowExecution,
  loadRepairShadowExecution,
  loadRepairShadowExecutions,
  validateRepairShadowExecutionRecord,
};
