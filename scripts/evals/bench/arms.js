"use strict";

// Bench arms: the mode under measurement. Each arm says how a project is set
// up once (outside the measurement), how the change is requested, and how the
// driver knows the change is finished. The persona receives `goal` so it asks
// the agent to carry the change through to that point.

const fs = require("node:fs");
const path = require("node:path");

function hasArchivedChange(root) {
  const archive = path.join(root, "openspec", "changes", "archive");
  if (!fs.existsSync(archive)) return false;
  return fs.readdirSync(archive, { withFileTypes: true }).some((entry) => entry.isDirectory());
}

const ARMS = Object.freeze({
  sdd: Object.freeze({
    id: "sdd",
    available: true,
    goal: "implementado, verificado y archivado",
    setupGoal: "el proyecto inicializado para trabajar en modo SDD, sin empezar ningún cambio ni tocar el código",
    setupPrompts: Object.freeze(["/ospec-workflow:sdd-init"]),
    isSetupDone: (root) => fs.existsSync(path.join(root, "openspec", "config.yaml")),
    changePrompt: (scenario) => `/ospec-workflow:sdd-new ${scenario.brief}`,
    isComplete: hasArchivedChange,
  }),
  idd: Object.freeze({
    id: "idd",
    available: false,
    unavailable_reason: "the IDD protocol arrives with E1.6, which runs this arm before changing the default",
  }),
});

function armFor(id) {
  const arm = ARMS[id];
  if (!arm) throw new Error(`unknown arm ${id}; known arms: ${Object.keys(ARMS).join(", ")}`);
  if (!arm.available) throw new Error(`arm ${id} is not available yet: ${arm.unavailable_reason} (E1.6)`);
  return arm;
}

module.exports = { ARMS, armFor, hasArchivedChange };
