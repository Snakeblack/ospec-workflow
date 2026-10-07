"use strict";

// Bench arms: the mode under measurement. Each arm says how a project is set
// up once (outside the measurement), how the change is requested, and how the
// driver knows the change is finished. The persona receives `goal` so it asks
// the agent to carry the change through to that point.

const fs = require("node:fs");
const path = require("node:path");

const { CONFIG_FILE, parseIddConfig } = require("../../lib/idd-config.js");

function hasDirectoryIn(dir) {
  if (!fs.existsSync(dir)) return false;
  return fs.readdirSync(dir, { withFileTypes: true }).some((entry) => entry.isDirectory());
}

function hasArchivedChange(root) {
  return hasDirectoryIn(path.join(root, "openspec", "changes", "archive"));
}

// `ospec close` moves a finished IDD change to idd/archive/<date>-<id>/.
function hasClosedIddChange(root) {
  return hasDirectoryIn(path.join(root, "idd", "archive"));
}

function isIddMode(root) {
  try {
    return parseIddConfig(fs.readFileSync(path.join(root, CONFIG_FILE), "utf8")).mode === "idd";
  } catch {
    return false;
  }
}

// Every seed tests with `npm test`, the command sdd-init records for the sdd
// arm. The router is not loaded in the bench's isolated configuration, so the
// change enters the protocol through its skill.
const IDD_CONFIG = "mode: idd\nchecks:\n  test: npm test\n";

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
    available: true,
    goal: "implementado y cerrado con ospec close, que lo archiva en idd/archive/",
    setupGoal: "el proyecto con idd/config.yaml en modo IDD, sin empezar ningún cambio ni tocar el código",
    setupPrompts: Object.freeze([
      `Crea el fichero ${CONFIG_FILE} con exactamente este contenido y no hagas nada más:\n\n\`\`\`yaml\n${IDD_CONFIG}\`\`\``,
    ]),
    isSetupDone: isIddMode,
    changePrompt: (scenario) => `/ospec-workflow:idd ${scenario.brief}`,
    isComplete: hasClosedIddChange,
  }),
});

function armFor(id) {
  const arm = ARMS[id];
  if (!arm) throw new Error(`unknown arm ${id}; known arms: ${Object.keys(ARMS).join(", ")}`);
  if (!arm.available) throw new Error(`arm ${id} is not available yet: ${arm.unavailable_reason}`);
  return arm;
}

module.exports = { ARMS, armFor, hasArchivedChange, hasClosedIddChange };
