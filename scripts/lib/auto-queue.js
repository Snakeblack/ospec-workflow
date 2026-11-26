"use strict";

// The queue of the execution mode choice (E1.109, REQ-idd-032): the pending
// phases of the project roadmap, read with the reader of the progress snapshot
// v1, which `ospec next` without an open change and `ospec close` offer to work
// interactively, as today, or in an automatic run (REQ-idd-031). It writes
// nothing and emits no snapshot. No queue is offered in an SDD project nor
// while an automatic run is active, which covers every session the conductor
// launched.

const fs = require("node:fs");
const path = require("node:path");

const { DEFAULT_LIMITS, DEFAULT_MAX_TOKENS } = require("./auto-conductor.js");
const { HOSTS } = require("./auto-hosts.js");
const { MAX_ITEMS, activeRun, processAlive } = require("./auto-run.js");
const { CONFIG_FILE, parseIddConfig } = require("./idd-config.js");
const { shellArg } = require("./idd-next.js");
const { DEFAULT_ROADMAP, PHASE_CELL, SnapshotError, phaseStatuses, plainText, readChanges, readRoadmap, roadmapPhases } = require("./progress-snapshot.js");

const MIN_QUEUE = 2;
// The roadmaps that hold no queue: nothing to offer, and the flow stays as it is.
const NO_QUEUE = Object.freeze(["roadmap-missing", "roadmap-unrecognized"]);

const money = (value) => `$${Number.isInteger(value) ? value : value.toFixed(2)}`;

function projectMode(root) {
  let text;
  try {
    text = fs.readFileSync(path.join(root, CONFIG_FILE), "utf8");
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "ENOTDIR") return "idd";
    return null;
  }
  try {
    return parseIddConfig(text).mode ?? "idd";
  } catch {
    return null;
  }
}

// The request of one item: the phase as the roadmap names it, and the change
// id that makes the roadmap count it done once closed.
function itemRequest(roadmap, { id, label, title }) {
  return `Work roadmap item ${label} of ${roadmap}: ${title}. Name its change ${id.replace(/\./g, "")}-<slug>, so the roadmap counts it done.`;
}

function howToAsk(count, limits) {
  return [
    `ask the user, once, whether to work ${count === 1 ? "this item" : `these ${count} items`} interactively (the default: the next item in a new session, as today)`,
    `or in an automatic run (in order, one headless session per change, at most ${limits.max_turns} turns per item and ${money(limits.max_cost_usd)} in all,`,
    "a commit per closed change on the current branch, or on a new branch off the default one, and no push); their answer may keep fewer items or change the limits",
    "(--max-turns, --max-cost-usd). An empty, skipped or undecided answer is interactive: never start the run without their explicit choice.",
    "The run needs a clean tree, so after close ask once the delivery they want is done; on the default branch create a <type>/<name> branch first.",
    "Where the host runs a command in the background and tells you when it ends, run it so; when it ends, report one line per closed change from ospec auto status,",
    'and at a block ask the user its questions and pass their answer with ospec auto resume --answer "<their words>", in the background too.',
    `Elsewhere, add --host with the session's host (${HOSTS.filter((host) => host !== "claude").join(", ")}) and give the user the command to run in a terminal;`,
    `a host that reports no cost is capped at ${DEFAULT_MAX_TOKENS / 1e6}M tokens (--max-tokens) instead of the cost, and another host cannot run it.`,
  ].join(" ");
}

/**
 * The execution mode block of `root`, or null when there is nothing to
 * offer; `warnings` names a roadmap that does not read, which offers nothing.
 */
function executionMode(root, { roadmap = DEFAULT_ROADMAP, alive = processAlive } = {}) {
  if (projectMode(root) !== "idd" || activeRun(root, alive)) return { executionMode: null, warnings: [] };
  let phases;
  try {
    phases = roadmapPhases(readRoadmap(root, roadmap), roadmap);
  } catch (error) {
    if (error instanceof SnapshotError && NO_QUEUE.includes(error.code)) return { executionMode: null, warnings: [] };
    if (!(error instanceof SnapshotError) && typeof error.code !== "string") throw error;
    return { executionMode: null, warnings: [`${error.message}; no execution mode is offered until the roadmap reads`] };
  }
  const statuses = phaseStatuses(phases, readChanges(root));
  const pending = phases
    .filter((phase, index) => statuses[index].status === "pending")
    .map((phase) => ({ id: phase.id, label: PHASE_CELL.exec(plainText(phase.cells[0]))[1], title: phase.title }));
  if (pending.length < MIN_QUEUE) return { executionMode: null, warnings: [] };
  const queue = pending.slice(0, MAX_ITEMS).map((phase) => ({ id: phase.label, title: phase.title, item: itemRequest(roadmap, phase) }));
  const limits = { ...DEFAULT_LIMITS };
  return {
    executionMode: {
      roadmap,
      pending: pending.length,
      queue,
      default: "interactive",
      limits,
      command: `ospec auto start ${queue.map((entry) => `--item ${shellArg(entry.item)}`).join(" ")}`,
      how: howToAsk(queue.length, limits),
    },
    warnings: [],
  };
}

module.exports = { MIN_QUEUE, executionMode, itemRequest };
