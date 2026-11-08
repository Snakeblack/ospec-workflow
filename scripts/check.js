"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");
const CAVEMAN_DIR = path.join(ROOT, "skills", "caveman-compress");

const { isWindowsInteropPath, resolveClaudeBin, spawnCliSync } = require("./configure/cli.js");
const { runStagedChecks } = require("./hooks/lib/staged-validator.js");

function runStep(name, args, deps = {}) {
  const spawn = deps.spawnSync || spawnSync;
  const stdout = deps.stdout || process.stdout;
  const stderr = deps.stderr || process.stderr;

  stdout.write(`\n==> ${name}\n`);
  const result = spawn(deps.command || process.execPath, args, {
    cwd: deps.cwd || ROOT,
    stdio: "inherit",
    shell: false,
  });

  if (result.error) {
    stderr.write(`${name} failed to start: ${result.error.message}\n`);
    throw new Error(`${name} failed to start: ${result.error.message}`);
  }
  if (result.status !== 0) {
    stderr.write(`${name} failed with exit code ${result.status}\n`);
    throw new Error(`${name} failed with exit code ${result.status}`);
  }
}

// The claude profile validates with the external `claude` CLI, which is not
// guaranteed in CI. Probe for it so check.js can validate claude when present
// and fall back to generation-only; github-copilot, opencode, and codex always
// run their in-repo validators, while vscode still remains generation-only.
// A binary resolved under /mnt/<drive>/ on linux is the Windows claude reached
// through WSL interop: it cannot consume the POSIX output dirs, so it counts
// as unavailable and claude degrades to generation-only.
function claudeCliAvailable(deps = {}) {
  const spawnCli = deps.spawnCliSync || spawnCliSync;
  const resolve = deps.resolveClaudeBin || resolveClaudeBin;
  const isInterop = deps.isWindowsInteropPath || isWindowsInteropPath;
  const resolved = resolve();
  if (!resolved || isInterop(resolved)) {
    return false;
  }
  const probe = spawnCli(resolved, ["--version"], { stdio: "ignore" });
  return !probe.error && probe.status === 0;
}

// The caveman-compress skill ships Python code with its own unittest suite.
// Like the claude CLI, Python is optional: without a Python 3 on PATH the
// suite is skipped with a note. On Windows "python3" may be a store stub that
// fails the probe, so "python" is tried next.
function findPython(deps = {}) {
  const spawn = deps.spawnSync || spawnSync;
  for (const bin of ["python3", "python"]) {
    const probe = spawn(bin, ["-c", "import sys; sys.exit(sys.version_info[0] != 3)"], { stdio: "ignore" });
    if (!probe.error && probe.status === 0) {
      return bin;
    }
  }
  return null;
}

function generateTarget(target, validate, deps = {}) {
  const fsImpl = deps.fs || fs;
  const osImpl = deps.os || os;
  const pathImpl = deps.path || path;
  const run = deps.runStep || runStep;
  const outDir = fsImpl.mkdtempSync(pathImpl.join(osImpl.tmpdir(), `ospec-${target}-`));
  try {
    const args = ["scripts/configure/cli.js", "--target", target, "--source", ROOT, "--out", outDir];
    if (!validate) {
      args.push("--no-validate");
    }
    const label = validate ? `Generate + validate ${target}` : `Generate ${target} (validation skipped)`;
    run(label, args);
  } finally {
    fsImpl.rmSync(outDir, { recursive: true, force: true });
  }
}

// `--shard <index>/<total>` (or `--shard=<index>/<total>`) splits the Node
// tests across CI jobs; the targets are generated once, by shard 1, so every
// check still runs exactly once across the shards. Returns null without it.
function parseShard(argv) {
  const at = argv.findIndex((arg) => arg === "--shard" || arg.startsWith("--shard="));
  if (at === -1) {
    return null;
  }
  const value = argv[at] === "--shard" ? argv[at + 1] : argv[at].slice("--shard=".length);
  const match = /^(\d+)\/(\d+)$/.exec(value || "");
  const index = match ? Number(match[1]) : 0;
  const total = match ? Number(match[2]) : 0;
  if (index < 1 || index > total) {
    throw new Error(`--shard expects <index>/<total> with 1 <= index <= total, got ${JSON.stringify(value ?? "")}`);
  }
  return { index, total };
}

// --index <path>: the index git is committing, which the pre-commit hook
// passes when it is not .git/index (`git commit -a`, or with paths).
function parseIndex(argv) {
  const at = argv.indexOf("--index");
  if (at === -1) return undefined;
  const value = argv[at + 1];
  if (!value || value.startsWith("--")) {
    throw new Error("--index expects the path of a git index");
  }
  return path.resolve(value);
}

function main(deps = {}) {
  const proc = deps.process || process;
  const run = deps.runStep || runStep;
  const hasClaudeCli = deps.claudeCliAvailable || claudeCliAvailable;
  const python = deps.findPython || findPython;
  const generate = deps.generateTarget || generateTarget;
  const runStaged = deps.runStagedChecks || runStagedChecks;

  const argv = deps.argv || (proc.argv ? proc.argv.slice(2) : []);
  const isStaged = argv.includes("--staged");

  try {
    if (isStaged) {
      const indexFile = parseIndex(argv);
      const claudeOk = hasClaudeCli();
      runStaged(
        {
          repoRoot: ROOT,
          indexFile,
          runStep: run,
          generateTarget: (target, validate, d) =>
            generate(target, target === "claude" ? claudeOk && validate : validate, d),
        },
        deps,
      );
      proc.stdout.write("\nAll staged checks passed.\n");
      return;
    }

    const shard = parseShard(argv);
    const tests = ["scripts/**/*.test.js", "tests/**/*.test.js"];
    if (shard) {
      run(`Native Node tests (shard ${shard.index}/${shard.total})`, ["--test", `--test-shard=${shard.index}/${shard.total}`, ...tests]);
      if (shard.index !== 1) {
        proc.stdout.write(`\n(note) the targets are generated by shard 1/${shard.total}.\n\nAll checks passed.\n`);
        return;
      }
    } else {
      run("Native Node tests", ["--test", ...tests]);
    }

    const pythonBin = python();
    if (pythonBin) {
      run("Python tests (caveman-compress)", ["-B", "-m", "unittest", "scripts.test_caveman"], { command: pythonBin, cwd: CAVEMAN_DIR });
    } else {
      proc.stdout.write("\n(note) Python 3 not found — skipping the caveman-compress tests.\n");
    }

    const claudeOk = hasClaudeCli();
    if (!claudeOk) {
      proc.stdout.write("\n(note) claude CLI not found — generating the claude target without its validator.\n");
    }

    // github-copilot, opencode, and codex always validate (local node validators);
    // vscode is an identity transform with no validator; claude validates only
    // when its CLI is installed.
    const targets = [
      { target: "claude", validate: claudeOk },
      { target: "vscode", validate: true },
      { target: "github-copilot", validate: true },
      { target: "opencode", validate: true },
      { target: "codex", validate: true },
      { target: "cursor", validate: true },
      { target: "antigravity", validate: true },
    ];

    for (const { target, validate } of targets) {
      generate(target, validate);
    }

    proc.stdout.write("\nAll checks passed.\n");
  } catch (err) {
    proc.stderr.write(`\nCheck failed: ${err.message}\n`);
    proc.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { main, runStep, claudeCliAvailable, findPython, generateTarget, runStagedChecks };
