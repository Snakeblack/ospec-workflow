"use strict";

const { orchestrateRepairShadow } = require("./orchestrator.js");
const { integrateWorkResultPatches } = require("./patch-integrator.js");
const { compareShadowExecution } = require("./shadow-comparator.js");
const {
  persistRepairShadowExecution,
  loadRepairShadowExecution,
  validateRepairShadowExecutionRecord,
} = require("./execution-record-store.js");

module.exports = {
  orchestrateRepairShadow,
  integrateWorkResultPatches,
  compareShadowExecution,
  persistRepairShadowExecution,
  loadRepairShadowExecution,
  validateRepairShadowExecutionRecord,
};
