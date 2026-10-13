"use strict";

// Bench arms: the mode under measurement. Each arm says how a project is set
// up once (outside the measurement), how the change is requested, and how the
// driver knows the change is finished. The persona receives `goal` so it asks
// the agent to carry the change through to that point. `isComplete` also
// receives the commit the change starts from (after setup).

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const { CONFIG_FILE, parseIddConfig } = require("../../lib/idd-config.js");

function hasDirectoryIn(dir) {
  if (!fs.existsSync(dir)) return false;
  return fs.readdirSync(dir, { withFileTypes: true }).some((entry) => entry.isDirectory());
}

function hasArchivedChange(root) {
  return hasDirectoryIn(path.join(root, "openspec", "changes", "archive"));
}

// `ospec close` moves a finished IDD change to idd/archive/<date>-<id>/. Only an
// entry the base commit lacks counts: where the router is loaded (agy), a
// change the agent opened and closed during setup is not the requested one.
function hasClosedIddChange(root, base) {
  const dir = path.join(root, "idd", "archive");
  if (!hasDirectoryIn(dir)) return false;
  const before = base ? git(root, ["ls-tree", "-d", "--name-only", `${base}:idd/archive`]) : null;
  const existing = new Set((before || "").split("\n").filter(Boolean));
  return fs.readdirSync(dir, { withFileTypes: true }).some((entry) => entry.isDirectory() && !existing.has(entry.name));
}

function isIddMode(root) {
  try {
    return parseIddConfig(fs.readFileSync(path.join(root, CONFIG_FILE), "utf8")).mode === "idd";
  } catch {
    return false;
  }
}

function git(root, args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  return result.status === 0 ? result.stdout : null;
}

// Paths `git status -z` reports; a rename or copy adds its source path.
function changedPaths(output) {
  const entries = output.split("\0").filter(Boolean);
  const paths = [];
  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i];
    paths.push(entry.slice(3));
    if (/^[RC]/.test(entry)) {
      i += 1;
      paths.push(entries[i]);
    }
  }
  return paths;
}

const ODD_DIR = "odd";
// gentle-ai regenerates its skill registry in .atl/ at every session start: it
// is its local runtime state (gentle-ai's own .gitignore helper excludes it),
// not part of the delivery.
const RUNTIME_DIRS = Object.freeze([ODD_DIR, ".atl"]);
const UNCHECKED_TASK = /^\s*[-*] \[ \]/m;

function hasPendingOddTask(root) {
  const tasksDir = path.join(root, ODD_DIR, "tasks");
  if (!fs.existsSync(tasksDir)) return false;
  return fs.readdirSync(tasksDir).filter((name) => name.endsWith(".md"))
    .some((name) => UNCHECKED_TASK.test(fs.readFileSync(path.join(tasksDir, name), "utf8")));
}

// ODD writes odd/tasks/<feature>.md only for substantial work, closes every
// task with a commit, and records that commit in the document afterwards, so
// the document may stay uncommitted. A gentle-ai change is finished with at
// least one commit after setup, nothing uncommitted outside odd/ (and .atl/),
// and no unchecked task in any feature document (user decision, 2026-10-12).
function hasOddDelivery(root, base) {
  const commits = git(root, ["rev-list", "--count", `${base}..HEAD`]);
  if (commits === null || Number(commits.trim()) < 1) return false;
  const status = git(root, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]);
  if (status === null || changedPaths(status).some((file) => !RUNTIME_DIRS.some((dir) => file.startsWith(`${dir}/`)))) return false;
  return !hasPendingOddTask(root);
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
  // gentle-ai is installed once in the bench's gentle-ai HOME (bench.js
  // setup-gentle-ai), so a project needs no setup. ODD runs on every request,
  // so the change is the brief itself.
  "gentle-ai": Object.freeze({
    id: "gentle-ai",
    available: true,
    goal: "implementado, con el trabajo en commits y, si creó un documento en odd/tasks/, con todas sus tareas marcadas",
    setupGoal: "ninguno: el proyecto no necesita preparación",
    setupPrompts: Object.freeze([]),
    isSetupDone: () => true,
    changePrompt: (scenario) => scenario.brief,
    isComplete: hasOddDelivery,
  }),
});

// On agy (E4.5) ospec is installed for antigravity without SDD, and its router
// is loaded, so the IDD arm receives the brief as is, like gentle-ai (user
// decision, 2026-10-13).
function armFor(id, { host = "claude" } = {}) {
  const arm = ARMS[id];
  if (!arm) throw new Error(`unknown arm ${id}; known arms: ${Object.keys(ARMS).join(", ")}`);
  if (!arm.available) throw new Error(`arm ${id} is not available yet: ${arm.unavailable_reason}`);
  if (host !== "agy") return arm;
  if (id === "sdd") throw new Error("arm sdd is not available on agy: the bench installs ospec for antigravity without SDD");
  return id === "idd" ? Object.freeze({ ...arm, changePrompt: (scenario) => scenario.brief }) : arm;
}

module.exports = { ARMS, armFor, hasArchivedChange, hasClosedIddChange, hasOddDelivery };
