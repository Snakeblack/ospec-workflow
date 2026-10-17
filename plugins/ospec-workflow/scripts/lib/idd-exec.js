"use strict";

// Runs the commands behind IDD run evidence (openspec/specs/idd/spec.md,
// REQ-idd-007, REQ-idd-014): the checks of idd/config.yaml and the test
// commands of `ospec run`. Commands come from the project or the person, like
// package.json scripts, and run through the shell in the project root. Only
// the exit code, a digest of the output and its last lines leave this module.

const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");

const OUTPUT_TAIL_LINES = 20;
const MAX_OUTPUT_BYTES = 256 * 1024 * 1024;

function tailOf(output) {
  const lines = output.toString("utf8").replace(/\r\n/g, "\n").replace(/\n+$/, "").split("\n");
  return lines.length === 1 && lines[0] === "" ? [] : lines.slice(-OUTPUT_TAIL_LINES);
}

/**
 * @param {string} command  shell command line
 * @param {{cwd: string}} options
 * @returns {{exit_code: number, output_sha256: string, output_tail: string[]}}
 */
function runCommand(command, { cwd }) {
  const result = spawnSync(command, {
    cwd,
    shell: true,
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: MAX_OUTPUT_BYTES,
    windowsHide: true,
  });
  const output = Buffer.concat([result.stdout || Buffer.alloc(0), result.stderr || Buffer.alloc(0)]);
  // A command killed by a signal or unable to start never counts as passing.
  let exitCode = result.status;
  if (exitCode == null) exitCode = result.error ? 127 : 128;
  return {
    exit_code: exitCode,
    output_sha256: `sha256:${crypto.createHash("sha256").update(output).digest("hex")}`,
    output_tail: tailOf(output),
  };
}

module.exports = {
  OUTPUT_TAIL_LINES,
  runCommand,
};
