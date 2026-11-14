"use strict";

// Runs the commands behind IDD run evidence (openspec/specs/idd/spec.md,
// REQ-idd-007, REQ-idd-014): the checks of idd/config.yaml and the test
// commands of `ospec run`. Commands come from the project or the person, like
// package.json scripts, and run through the shell in the project root. Only
// the exit code, a digest of the output and its last lines go into the state
// of a change; the whole output of a failing run goes to a local file (#511).

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const { mkdirOspec } = require("./ospec-gitignore.js");

const OUTPUT_TAIL_LINES = 20;
const MAX_OUTPUT_BYTES = 256 * 1024 * 1024;

function tailOf(output) {
  const lines = output.toString("utf8").replace(/\r\n/g, "\n").replace(/\n+$/, "").split("\n");
  return lines.length === 1 && lines[0] === "" ? [] : lines.slice(-OUTPUT_TAIL_LINES);
}

// The exit code of a command killed by its timeout, as timeout(1) reports it.
const TIMED_OUT_EXIT = 124;

// What a masked path reads as in the output (E1.48): a counterproof and its
// control run in different worktrees and still compare.
const MASKED_PATH = "<worktree>";

// Each path of `mask` replaced by MASKED_PATH, the longest first, since one
// may end another (/private/var/x and /var/x on macOS).
function masked(output, mask) {
  if (!mask?.length) return output;
  let text = output.toString("utf8");
  for (const entry of [...mask].filter(Boolean).sort((left, right) => right.length - left.length)) text = text.split(entry).join(MASKED_PATH);
  return Buffer.from(text, "utf8");
}

/**
 * @param {string} command  shell command line
 * @param {{cwd: string, timeoutMs?: number, mask?: string[]}} options
 * @returns {{result: {exit_code: number, output_sha256: string, output_tail: string[], timed_out?: true}, output: Buffer}}
 */
function captureCommand(command, { cwd, timeoutMs, mask }) {
  const result = spawnSync(command, {
    cwd,
    shell: true,
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: MAX_OUTPUT_BYTES,
    windowsHide: true,
    ...(timeoutMs ? { timeout: timeoutMs } : {}),
  });
  const output = masked(Buffer.concat([result.stdout || Buffer.alloc(0), result.stderr || Buffer.alloc(0)]), mask);
  // A command killed by a signal or its timeout, or unable to start, never
  // counts as passing.
  const timedOut = result.error?.code === "ETIMEDOUT";
  let exitCode = result.status;
  if (exitCode == null) exitCode = timedOut ? TIMED_OUT_EXIT : result.error ? 127 : 128;
  return {
    result: {
      exit_code: exitCode,
      output_sha256: `sha256:${crypto.createHash("sha256").update(output).digest("hex")}`,
      output_tail: tailOf(output),
      ...(timedOut ? { timed_out: true } : {}),
    },
    output,
  };
}

/** What the state of a change keeps of a command (see captureCommand). */
function runCommand(command, options) {
  return captureCommand(command, options).result;
}

// The whole output of the failing runs of a change (#511): local and
// unversioned, since it may print what the state never holds, and removed
// when the change closes.
const RUN_OUTPUT_DIR = ".ospec/runs";

function runOutputDir(root, change) {
  return path.join(root, ...RUN_OUTPUT_DIR.split("/"), change);
}

/** Writes the output of run `runId` and returns its path from the root. */
function keepRunOutput(root, change, runId, output) {
  const dir = runOutputDir(root, change);
  mkdirOspec(dir);
  fs.writeFileSync(path.join(dir, `${runId}.log`), output);
  return `${RUN_OUTPUT_DIR}/${change}/${runId}.log`;
}

function dropRunOutputs(root, change) {
  fs.rmSync(runOutputDir(root, change), { recursive: true, force: true });
}

module.exports = {
  OUTPUT_TAIL_LINES,
  TIMED_OUT_EXIT,
  captureCommand,
  dropRunOutputs,
  keepRunOutput,
  runCommand,
};
