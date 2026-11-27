"use strict";

// The record of an automatic run (E1.108, REQ-idd-031): what `ospec auto`
// keeps in .ospec/auto/<run>/run.json, local and unversioned like the rest of
// .ospec/. The conductor writes it after every step, atomically, so `status`,
// `stop` and `resume` read the last step it took. A delegated answer is
// recorded only while its run is registered here as running (REQ-idd-030).

const fs = require("node:fs");
const path = require("node:path");

const { writeFileAtomic } = require("./atomic-write.js");
const { isAutoRunId } = require("./idd-contract.js");
const { mkdirOspec } = require("./ospec-gitignore.js");

const AUTO_ROOT = ".ospec/auto";
const RUN_FILE = "run.json";
const STOP_FILE = "stop";
const RUN_SCHEMA = "ospec-auto-run/v1";
const RUN_STATUSES = Object.freeze(["running", "blocked", "paused", "stopped", "failed", "done"]);
// Only one run per repository is active: running, or waiting for the user.
const ACTIVE_STATUSES = Object.freeze(["running", "blocked", "paused"]);
const ITEM_STATUSES = Object.freeze(["pending", "running", "closed"]);
// What a run counts as spent: the cost its host reports, the tokens or the AI credits.
const SPEND = Object.freeze(["cost", "tokens", "credits"]);
const MAX_ITEMS = 20;

class AutoError extends Error {
  constructor(code, message, how) {
    super(message);
    this.name = "AutoError";
    this.code = code;
    if (how) this.how = how;
  }
}

function autoDir(root) {
  return path.join(root, ...AUTO_ROOT.split("/"));
}

function runDir(root, id) {
  return path.join(autoDir(root), id);
}

function runFile(root, id) {
  return path.join(runDir(root, id), RUN_FILE);
}

/** The id of a run started at `date`, in UTC: auto-<YYYYMMDD>-<HHMMSS>. */
function newRunId(date) {
  const iso = date.toISOString();
  return `auto-${iso.slice(0, 10).replace(/-/g, "")}-${iso.slice(11, 19).replace(/:/g, "")}`;
}

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

// Every rule a run record keeps; the first broken one, or null.
function runProblem(run, id) {
  if (!isObject(run)) return "it is not a JSON object";
  if (run.schema !== RUN_SCHEMA) return `its schema is ${JSON.stringify(run.schema)}, not ${RUN_SCHEMA}`;
  if (run.id !== id) return `it names the run ${JSON.stringify(run.id)}`;
  if (!RUN_STATUSES.includes(run.status)) return `its status ${JSON.stringify(run.status)} is none of ${RUN_STATUSES.join(", ")}`;
  // Absent in a run from before E1.110, which counts its cost.
  if (run.spend !== undefined && !SPEND.includes(run.spend)) return `its spend ${JSON.stringify(run.spend)} is none of ${SPEND.join(", ")}`;
  if (!Array.isArray(run.items) || run.items.length === 0 || run.items.length > MAX_ITEMS) return `it holds no list of 1 to ${MAX_ITEMS} items`;
  const item = run.items.findIndex((entry) => !isObject(entry) || typeof entry.text !== "string" || !ITEM_STATUSES.includes(entry.status));
  if (item !== -1) return `item ${item + 1} has no text or a status other than ${ITEM_STATUSES.join(", ")}`;
  if (!Number.isSafeInteger(run.current) || run.current < 0 || run.current > run.items.length) return "its current item is out of range";
  return null;
}

/** The run `id`; refused when it does not exist or its record is unreadable. */
function readRun(root, id) {
  if (!isAutoRunId(id)) throw new AutoError("no-run", `no automatic run ${JSON.stringify(id)}: a run id is kebab-case, as ospec auto status lists it`);
  let text;
  try {
    text = fs.readFileSync(runFile(root, id), "utf8");
  } catch (error) {
    if (error.code === "ENOENT") throw new AutoError("no-run", `no automatic run ${id} in ${AUTO_ROOT}`);
    throw error;
  }
  let run;
  try {
    run = JSON.parse(text);
  } catch {
    run = undefined;
  }
  const problem = runProblem(run, id);
  if (problem) {
    throw new AutoError("run-invalid", `${AUTO_ROOT}/${id}/${RUN_FILE} is not a run record ospec can read: ${problem}`, `nothing was changed; remove ${AUTO_ROOT}/${id} to forget this run`);
  }
  return run;
}

async function writeRun(root, run) {
  mkdirOspec(runDir(root, run.id));
  await writeFileAtomic(runFile(root, run.id), `${JSON.stringify(run, null, 2)}\n`);
}

/** The ids of the runs of `root`, oldest first. */
function listRunIds(root) {
  let entries;
  try {
    entries = fs.readdirSync(autoDir(root), { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "ENOTDIR") return [];
    throw error;
  }
  return entries.filter((entry) => entry.isDirectory() && isAutoRunId(entry.name) && fs.existsSync(runFile(root, entry.name))).map((entry) => entry.name).sort();
}

function processAlive(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === "EPERM";
  }
}

/** A run marked running whose conductor process is gone: it crashed or was killed. */
function isStale(run, alive = processAlive) {
  return run.status === "running" && !alive(run.pid);
}

/** The active run of `root` (running with a live conductor, blocked or paused), or null. */
function activeRun(root, alive = processAlive) {
  for (const id of listRunIds(root).reverse()) {
    let run;
    try {
      run = readRun(root, id);
    } catch {
      continue;
    }
    if (ACTIVE_STATUSES.includes(run.status) && !isStale(run, alive)) return run;
  }
  return null;
}

/** The run `id`, or the latest one when no id is given. */
function selectRun(root, id) {
  if (id !== undefined) return readRun(root, id);
  const ids = listRunIds(root);
  if (ids.length === 0) throw new AutoError("no-run", `no automatic run in ${AUTO_ROOT}`, "start one with ospec auto start --item \"<request>\"");
  return readRun(root, ids.at(-1));
}

/**
 * Whether `id` names a run registered as running in `root` with its conductor
 * alive, the condition of a delegated answer (REQ-idd-030).
 */
function runIsRunning(root, id, alive = processAlive) {
  try {
    const run = readRun(root, id);
    return run.status === "running" && !isStale(run, alive);
  } catch {
    return false;
  }
}

function stopPath(root, id) {
  return path.join(runDir(root, id), STOP_FILE);
}

function requestStop(root, id) {
  mkdirOspec(runDir(root, id));
  fs.writeFileSync(stopPath(root, id), `${new Date().toISOString()}\n`);
}

function stopRequested(root, id) {
  return fs.existsSync(stopPath(root, id));
}

function clearStop(root, id) {
  fs.rmSync(stopPath(root, id), { force: true });
}

module.exports = {
  ACTIVE_STATUSES,
  AUTO_ROOT,
  AutoError,
  ITEM_STATUSES,
  MAX_ITEMS,
  RUN_SCHEMA,
  RUN_STATUSES,
  activeRun,
  clearStop,
  isStale,
  listRunIds,
  newRunId,
  processAlive,
  readRun,
  requestStop,
  runDir,
  runIsRunning,
  selectRun,
  stopRequested,
  writeRun,
};
