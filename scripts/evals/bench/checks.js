"use strict";

// Runs a scenario's hidden checks against a delivered workspace, one process
// per check. A check that crashes, hangs, or prints nothing counts as failed:
// every failed check is an escaped defect.

const path = require("node:path");
const { spawnSync } = require("node:child_process");

const RUNNER = path.join(__dirname, "check-runner.js");
const CHECK_TIMEOUT_MS = 180000;

function lastJsonLine(text) {
  const lines = String(text || "").trim().split("\n").reverse();
  for (const line of lines) {
    try {
      return JSON.parse(line);
    } catch {
      // keep looking: the check may have printed its own output
    }
  }
  return null;
}

/**
 * @returns {Array<{ id, kind, fact, pass, error? }>}
 */
function runChecks(scenario, workspaceRoot, { spawn = spawnSync } = {}) {
  return scenario.checks.map((check) => {
    const result = spawn(process.execPath, [RUNNER, scenario.checksPath, workspaceRoot, check.id], {
      cwd: workspaceRoot,
      encoding: "utf8",
      timeout: CHECK_TIMEOUT_MS,
    });
    const verdict = lastJsonLine(result.stdout);
    const entry = { id: check.id, kind: check.kind, fact: check.fact, pass: Boolean(verdict && verdict.pass === true) };
    if (!entry.pass) {
      entry.error = verdict && verdict.error
        ? verdict.error
        : `check did not report (status ${result.status}${result.error ? `, ${result.error.message}` : ""})`;
    }
    return entry;
  });
}

module.exports = { runChecks };
