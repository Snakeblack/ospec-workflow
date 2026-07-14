#!/usr/bin/env node
"use strict";

// Golden eval harness CLI — scripts/evals/run.js.
//
// IMPORTANT: this file is intentionally NOT named `*.test.js` so it is
// excluded from `check.js`'s `--test scripts/**/*.test.js` collection glob
// (ADR sdd-design-001 in openspec/changes/prompt-evals-golden-scenarios/design.md).
// It requires a live, configured model session to drive the orchestrator —
// there is no headless invocation in this iteration (deferred to roadmap
// 2.2/B4) — so it must stay out of `npm test`/CI entirely. See
// scripts/evals/README.md for the manual driver protocol.
//
// Verbs:
//   setup   <scenario|all>   materialize fixture(s) into scripts/evals/.runs/
//   run     <scenario|all>   setup, then either print driver instructions
//                            (awaiting-live-run) or assert+report if a
//                            completed live turn was already captured
//   assert  <scenario|all>   capture the workspace and score it structurally
//   report  <scenario|all>   assert + print a per-scenario and aggregate summary
//
//   benchmark <profile|all>  materialize and print live-driver instructions;
//                            productive scoring is host-only in live-driver.js

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { resolveBinFromPath, resolveCodexInvocation } = require("../configure/install-codex.js");

const {
  loadScenario,
  materializeFixture,
  teardown,
  markMaterialized,
  isMaterialized,
} = require("./lib/fixtures.js");
const { captureWorkspace } = require("./lib/capture.js");
const { assertScenario, resolveActualRoute } = require("./lib/assertions.js");
const { readPhaseCosts } = require("./lib/benchmark.js");
const { listSafeBenchmarkProfiles, scenarioFor } = require("./safe-export.js");

const FIXTURES_ROOT = path.join(__dirname, "__fixtures__");
const RUNS_ROOT = path.join(__dirname, ".runs");
const BENCHMARK_RUNS_ROOT = path.join(RUNS_ROOT, "benchmark");
const CORE_BENCHMARK_PROFILES = Object.freeze(["docs-one-file", "small-bugfix", "security-sensitive-change"]);
const BASELINE_REPORT = path.join(__dirname, "reports", "reference-baseline.md");
const GIT_BASELINE_MARKER = "GIT-BASELINE.json";
const GIT_HEAD_PLACEHOLDER = "__GIT_HEAD__";

function usageError(message) {
  process.stderr.write(
    `${message}\n\n` +
      "Usage: node scripts/evals/run.js <setup|run|assert|report|benchmark> <scenario-id|profile|all>\n" +
      "  setup   — materialize a fixture's repo/ into .runs/<scenario>/\n" +
      "  run     — setup, then print driver instructions or assert+report\n" +
      "  assert  — capture + score a workspace that has already been run live\n" +
      "  report  — assert every requested scenario and print a suite summary\n\n" +
      "  benchmark — materialize reference profiles; scoring requires live-driver.js\n\n" +
      "Example: node scripts/evals/run.js run all\n" +
      "See scripts/evals/README.md for the full manual driver protocol.\n",
  );
  process.exitCode = 1;
}

function listScenarioNames() {
  if (!fs.existsSync(FIXTURES_ROOT)) {
    return [];
  }
  return fs
    .readdirSync(FIXTURES_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== "benchmark")
    .map((entry) => entry.name)
    .sort();
}

function listBenchmarkNames() {
  return listSafeBenchmarkProfiles();
}

function resolveBenchmarkNames(arg) {
  const all = listBenchmarkNames();
  if (arg === "all" || arg === "initial" || arg === undefined) {
    if (all.length < 8 || all.length > 12) throw new Error(`Expected 8-12 benchmark profiles, found ${all.length}.`);
    const missing = CORE_BENCHMARK_PROFILES.filter((name) => !all.includes(name));
    if (missing.length) throw new Error(`Core benchmark profiles are missing: ${missing.join(", ")}.`);
    return [...CORE_BENCHMARK_PROFILES];
  }
  if (arg === "extended") return all;
  if (!all.includes(arg)) throw new Error(`Unknown benchmark profile "${arg}". Known profiles: ${all.join(", ")}.`);
  return [arg];
}

function resolveScenarioNames(arg) {
  const all = listScenarioNames();

  if (arg === "all" || arg === undefined) {
    if (all.length === 0) {
      throw new Error(
        `No scenario fixtures found under ${FIXTURES_ROOT}. Expected 7 golden ` +
          "scenario directories, each with scenario.json + repo/.",
      );
    }
    return all;
  }

  if (!all.includes(arg)) {
    throw new Error(
      `Unknown scenario "${arg}". Known scenarios: ${all.join(", ") || "(none found)"}.`,
    );
  }

  return [arg];
}

function scenarioDirFor(name) {
  return path.join(FIXTURES_ROOT, name);
}

function workspaceRootFor(name) {
  return path.join(RUNS_ROOT, name);
}

/**
 * Resolves a `GIT-BASELINE.json`-declared relative path (from
 * `gitHead_files` or `post_baseline_untracked`) strictly inside
 * `workspaceRoot`, throwing loudly if it would escape (e.g. a `../../..`
 * traversal). Defense-in-depth: these entries come from a fixture author's
 * own `GIT-BASELINE.json`, but the marker is a documented, reusable
 * convention for future fixtures (not just the two currently committed
 * ones), so it must never be allowed to write or move a path outside the
 * ephemeral, gitignored workspace it is meant to be confined to.
 */
function resolveContainedPath(workspaceRoot, relPath) {
  const resolvedRoot = path.resolve(workspaceRoot);
  const resolvedTarget = path.resolve(resolvedRoot, relPath);

  if (
    resolvedTarget === resolvedRoot ||
    !resolvedTarget.startsWith(resolvedRoot + path.sep)
  ) {
    throw new Error(
      `GIT-BASELINE.json: path ${JSON.stringify(relPath)} escapes the fixture ` +
        `workspace root (${resolvedRoot}). gitHead_files/post_baseline_untracked ` +
        "entries must stay within the materialized workspace — see " +
        "scripts/evals/README.md's GIT-BASELINE.json contract.",
    );
  }

  return resolvedTarget;
}

/**
 * Ensures the nested fixture git repo (created by `applyGitBaseline` below,
 * see the `commit_all` step) ignores `.eval-capture/` — the harness-only
 * side-channel/completion-marker directory (`gate.json`, `envelope.json`,
 * `done.json`, `materialized.json`). Without this, files the harness itself
 * writes into that directory (before or after the baseline commit) would
 * show up as untracked/changed in `git status` inside the workspace,
 * producing a FALSE positive for `sdd-document`'s J5 sandbox-inventory
 * check on scenarios (like `document-update-noop`) that expect a perfectly
 * clean tree. Only relevant to git-baselined fixtures; non-git fixtures
 * never get a nested repo at all.
 */
function ensureEvalCaptureGitignored(workspaceRoot) {
  const gitignorePath = path.join(workspaceRoot, ".gitignore");
  const ignoreLine = ".eval-capture/";
  let existing = "";

  if (fs.existsSync(gitignorePath)) {
    existing = fs.readFileSync(gitignorePath, "utf8");
    if (existing.split(/\r?\n/).some((line) => line.trim() === ignoreLine)) {
      return;
    }
  }

  const needsLeadingNewline = existing.length > 0 && !existing.endsWith("\n");
  fs.writeFileSync(
    gitignorePath,
    `${existing}${needsLeadingNewline ? "\n" : ""}${ignoreLine}\n`,
  );
}

function runGit(args, cwd) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8", shell: false });

  if (result.error || result.status !== 0) {
    const detail = result.error ? result.error.message : result.stderr;
    throw new Error(`git ${args.join(" ")} failed in ${cwd}: ${detail}`);
  }

  return result.stdout.trim();
}

/**
 * Consumes a fixture's optional `GIT-BASELINE.json` marker (see
 * scripts/evals/README.md's driver protocol): initializes a real git repo in
 * the materialized workspace, commits everything except any paths listed
 * under `post_baseline_untracked` (temporarily moved aside so they land as
 * genuinely untracked files after the baseline commit), then resolves the
 * `__GIT_HEAD__` placeholder token in each of `gitHead_files` to the
 * baseline commit's short hash. This lets fixtures exercise `sdd-document`'s
 * real `gitHead`-scoped drift detection without ever committing a nested
 * `.git` directory into this repository (the marker + workspace are both
 * gitignored ephemeral state under `.runs/`).
 */
function applyGitBaseline(workspaceRoot) {
  const markerPath = path.join(workspaceRoot, GIT_BASELINE_MARKER);

  if (!fs.existsSync(markerPath)) {
    return;
  }

  const marker = JSON.parse(fs.readFileSync(markerPath, "utf8"));
  const untrackedPaths = Array.isArray(marker.post_baseline_untracked)
    ? marker.post_baseline_untracked
    : [];

  fs.rmSync(markerPath, { force: true });

  const stashDir = fs.mkdtempSync(path.join(RUNS_ROOT, ".git-baseline-stash-"));
  const stashed = [];

  try {
    for (const relPath of untrackedPaths) {
      const absPath = resolveContainedPath(workspaceRoot, relPath);
      if (!fs.existsSync(absPath)) {
        continue;
      }
      const stashTarget = path.join(stashDir, relPath);
      fs.mkdirSync(path.dirname(stashTarget), { recursive: true });
      fs.renameSync(absPath, stashTarget);
      stashed.push({ relPath, stashTarget });
    }

    if (marker.commit_all !== false) {
      ensureEvalCaptureGitignored(workspaceRoot);
      runGit(["init", "--quiet"], workspaceRoot);
      runGit(["add", "-A"], workspaceRoot);
      runGit(
        ["-c", "user.email=eval@ospec-workflow.local", "-c", "user.name=ospec-eval", "commit", "--quiet", "-m", "eval fixture baseline"],
        workspaceRoot,
      );
    }

    const shortHash = runGit(["rev-parse", "--short", "HEAD"], workspaceRoot);
    const gitHeadFiles = Array.isArray(marker.gitHead_files) ? marker.gitHead_files : [];

    for (const relPath of gitHeadFiles) {
      const absPath = resolveContainedPath(workspaceRoot, relPath);
      const content = fs.readFileSync(absPath, "utf8");
      fs.writeFileSync(absPath, content.split(GIT_HEAD_PLACEHOLDER).join(shortHash));
    }

    if (gitHeadFiles.length > 0) {
      runGit(["add", "-A"], workspaceRoot);
      runGit(
        [
          "-c",
          "user.email=eval@ospec-workflow.local",
          "-c",
          "user.name=ospec-eval",
          "commit",
          "--quiet",
          "--amend",
          "--no-edit",
        ],
        workspaceRoot,
      );
    }
  } finally {
    for (const { relPath, stashTarget } of stashed) {
      const absPath = path.join(workspaceRoot, relPath);
      fs.mkdirSync(path.dirname(absPath), { recursive: true });
      fs.renameSync(stashTarget, absPath);
    }
    fs.rmSync(stashDir, { recursive: true, force: true });
  }
}

function setupScenario(name) {
  const scenarioDir = scenarioDirFor(name);
  loadScenario(scenarioDir); // validates the manifest early, fails loudly if malformed
  const { workspaceRoot } = materializeFixture(scenarioDir, RUNS_ROOT);
  applyGitBaseline(workspaceRoot);
  // Only mark the workspace materialized once EVERY step above has fully
  // succeeded. If materializeFixture or applyGitBaseline throws partway
  // (disk full, EACCES mid-copy, git command failure), execution never
  // reaches this line, so the workspace is correctly left unmarked —
  // isMaterialized() will report it as not ready, and a future setup call
  // will rebuild it from scratch rather than silently reusing corrupt state.
  markMaterialized(workspaceRoot);
  return workspaceRoot;
}

function evalCaptureDonePath(workspaceRoot) {
  return path.join(workspaceRoot, ".eval-capture", "done.json");
}

function liveTurnCaptured(workspaceRoot) {
  return fs.existsSync(evalCaptureDonePath(workspaceRoot));
}

function printDriverInstructions(name, manifest, workspaceRoot, verb = "run", write = (chunk) => process.stdout.write(chunk)) {
  write(
    `\n${name}: awaiting-live-run\n` +
      `  Workspace: ${workspaceRoot}\n` +
      `  Input command: ${manifest.input.command || "(none — plain chat)"}\n` +
      `  Input text: ${manifest.input.text}\n\n` +
      "  Next step (manual, live-agent turn — see scripts/evals/README.md for the\n" +
      "  full driver protocol):\n" +
      "    1. Open a live orchestrator session rooted at the workspace above.\n" +
      "    2. Send the input command/text exactly as shown.\n" +
      "    3. If a question_gate would normally be asked via vscode/askQuestions,\n" +
      `       write it to ${path.join(workspaceRoot, ".eval-capture", "gate.json")}\n` +
      "       instead of waiting for a human answer, per scenario.json's\n" +
      `       capture.gate = ${manifest.capture.gate}.\n` +
      "    4. If a sub-agent returns status: blocked, write its envelope to\n" +
      `       ${path.join(workspaceRoot, ".eval-capture", "envelope.json")}\n` +
      `       per scenario.json's capture.envelope = ${manifest.capture.envelope}.\n` +
      `    5. Always write ${evalCaptureDonePath(workspaceRoot)}\n` +
      '       (e.g. `{ "completed_at": "<ISO timestamp>" }`) once the turn is done,\n' +
      "       only after every scenario-required artifact is complete, whether\n" +
      "       or not a gate/envelope was captured.\n" +
      `    6. Re-run: node scripts/evals/run.js ${verb} ` + name + "\n",
  );
}

function printBenchmarkInstructions(name, manifest, workspaceRoot, write = (chunk) => process.stdout.write(chunk)) {
  printDriverInstructions(name, manifest, workspaceRoot, "benchmark", write);
  write(
    `  Benchmark change: ${manifest.benchmark.change}\n` +
    `  Expected route: ${manifest.benchmark.expected_route}\n` +
    `  Completion observations: ${path.join(workspaceRoot, ".eval-capture", "benchmark.json")}\n` +
    "  Record questions_asked plus verify and four_r severity counters; do not infer missing evidence as zero.\n" +
    "  Transaction: transcript/state/benchmark.pending.json first; live-driver.js alone may finalize benchmark.json and done.json after run-level validation.\n",
  );
}

function benchmarkWorkspaceRoot(name) { return path.join(BENCHMARK_RUNS_ROOT, name); }

function resolveBenchmarkEvidencePaths(workspaceRoot, change, declarations = {}) {
  if (
    typeof change !== "string" ||
    change.length === 0 ||
    change === "." ||
    change === ".." ||
    path.isAbsolute(change) ||
    change.includes("/") ||
    change.includes("\\")
  ) {
    throw new Error("benchmark.change must be one non-empty relative path segment.");
  }
  const changeRoot = resolveContainedPath(path.join(workspaceRoot, "openspec", "changes"), change);
  const sessionRoot = resolveContainedPath(path.join(workspaceRoot, ".ospec", "session"), change);
  const captureRoot = resolveContainedPath(workspaceRoot, ".eval-capture");
  const transcriptPath = path.join(captureRoot, "codex-events.jsonl");
  if (declarations.transcriptPath !== undefined && path.resolve(workspaceRoot, declarations.transcriptPath) !== transcriptPath) {
    throw new Error("Benchmark transcript path must resolve exactly to .eval-capture/codex-events.jsonl inside the workspace.");
  }
  return {
    changeRoot,
    statePath: path.join(changeRoot, "state.yaml"),
    costsPath: path.join(sessionRoot, "phase-costs.jsonl"),
    observationPath: path.join(captureRoot, "benchmark.json"),
    pendingObservationPath: path.join(captureRoot, "benchmark.pending.json"),
    transcriptPath,
  };
}

function preflightBenchmarkWorkspace({ manifest, workspaceRoot }) {
  const evidence = resolveBenchmarkEvidencePaths(workspaceRoot, manifest.benchmark.change);
  const costs = readPhaseCosts(evidence.costsPath);
  const captured = captureWorkspace(workspaceRoot);
  const result = assertScenario(manifest.expect, captured);
  if (!result.pass) {
    throw new Error(`Live benchmark structural evidence is incomplete: ${result.failures.join("; ")}`);
  }
  return { evidence, costs, captured, result };
}

function resolveCodexLauncher(args, deps = {}) {
  const resolveBin = deps.resolveBinFromPath || resolveBinFromPath;
  const resolveInvocation = deps.resolveCodexInvocation || resolveCodexInvocation;
  const bin = resolveBin("codex");
  if (!bin) throw new Error("codex executable was not found on PATH.");
  return resolveInvocation(bin, args, deps);
}

function codexVersion(deps = {}) {
  const invocation = resolveCodexLauncher(["--version"], deps);
  const spawn = deps.spawnSync || spawnSync;
  const result = spawn(invocation.command, invocation.args, { encoding: "utf8", shell: false });
  if (result.error || result.status !== 0) throw new Error(`codex --version failed: ${result.error ? result.error.message : result.stderr.trim()}`);
  const version = result.stdout.trim();
  if (!/^codex-cli \d+\.\d+\.\d+$/.test(version)) throw new Error(`Unexpected codex version output: ${version}`);
  return version;
}

function gitRevision() {
  try { return runGit(["rev-parse", "--short", "HEAD"], __dirname); }
  catch (error) {
    process.stderr.write(`warning: git revision unavailable; baseline records unknown (${error.message})\n`);
    return "unknown";
  }
}

function publishBaselineAtomic(reportPath, markdown, overrides = {}) {
  const mkdirSync = overrides.mkdirSync || fs.mkdirSync;
  const writeFileSync = overrides.writeFileSync || fs.writeFileSync;
  const renameSync = overrides.renameSync || fs.renameSync;
  const rmSync = overrides.rmSync || fs.rmSync;
  const tempPath = `${reportPath}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`;
  mkdirSync(path.dirname(reportPath), { recursive: true });
  try {
    writeFileSync(tempPath, markdown, { encoding: "utf8", flag: "wx" });
    renameSync(tempPath, reportPath);
  } catch (error) {
    rmSync(tempPath, { force: true });
    throw error;
  }
}

function benchmarkReportEligible(scored, expectedProfiles) {
  if (scored.length !== expectedProfiles.length || !scored.every((entry) => entry.result.pass)) return false;
  const names = new Set(scored.map((entry) => entry.name));
  return expectedProfiles.every((name) => names.has(name));
}

function cmdBenchmark(names) {
  for (const name of names) {
    const workspaceRoot = benchmarkWorkspaceRoot(name);
    printBenchmarkInstructions(name, scenarioFor(name), workspaceRoot);
  }
  process.stdout.write(`\n${names.length}/${names.length} benchmark(s) awaiting host-authorized live-driver execution: ${names.join(", ")}\n`);
  process.exitCode = 2;
}

function scoreScenario(name) {
  const scenarioDir = scenarioDirFor(name);
  const manifest = loadScenario(scenarioDir);
  const workspaceRoot = workspaceRootFor(name);

  if (!isMaterialized(workspaceRoot)) {
    throw new Error(
      `No fully materialized workspace for "${name}" at ${workspaceRoot} ` +
        "(the directory is missing, or a prior setup was interrupted before " +
        `completing). Run \`node scripts/evals/run.js setup ${name}\` first.`,
    );
  }

  const captured = captureWorkspace(workspaceRoot);
  const result = assertScenario(manifest.expect, captured);

  return { name, manifest, captured, result };
}

function printScenarioResult({ name, result }) {
  const verdict = result.pass ? "PASS" : "FAIL";
  process.stdout.write(`${verdict}  ${name}\n`);

  for (const failure of result.failures) {
    process.stdout.write(`  - ${failure}\n`);
  }
}

function printSummary(scored) {
  const passCount = scored.filter(({ result }) => result.pass).length;
  process.stdout.write(`\n${passCount}/${scored.length} passed\n`);

  if (passCount < scored.length) {
    process.exitCode = 1;
  }
}

function cmdSetup(names) {
  for (const name of names) {
    const workspaceRoot = setupScenario(name);
    process.stdout.write(`setup  ${name} -> ${workspaceRoot}\n`);
  }
}

function cmdAssert(names) {
  const scored = names.map((name) => scoreScenario(name));
  for (const scored1 of scored) {
    printScenarioResult(scored1);
  }
  if (scored.length > 1) {
    printSummary(scored);
  } else if (!scored[0].result.pass) {
    process.exitCode = 1;
  }
}

function cmdReport(names) {
  const scored = names.map((name) => scoreScenario(name));
  for (const entry of scored) {
    printScenarioResult(entry);
  }
  printSummary(scored);
}

function cmdRun(names) {
  const pending = [];

  for (const name of names) {
    // Only materialize once: re-running `run` after a live turn already
    // wrote state/.eval-capture files into the workspace must NOT wipe them
    // out by re-copying the fixture's repo/ tree on top. Reuse is gated on
    // the completion marker, not mere directory existence — a half-copied
    // or half-baselined workspace (interrupted materializeFixture/
    // applyGitBaseline) would satisfy fs.existsSync but must never be
    // silently treated as ready; isMaterialized() catches that and this
    // falls through to a full rebuild via setupScenario (which itself wipes
    // any stale partial directory before re-copying).
    const workspaceRoot = isMaterialized(workspaceRootFor(name))
      ? workspaceRootFor(name)
      : setupScenario(name);

    if (!liveTurnCaptured(workspaceRoot)) {
      const manifest = loadScenario(scenarioDirFor(name));
      printDriverInstructions(name, manifest, workspaceRoot);
      pending.push(name);
    }
  }

  if (pending.length > 0) {
    process.stdout.write(
      `\n${pending.length}/${names.length} scenario(s) awaiting a live run: ${pending.join(", ")}\n`,
    );
    process.exitCode = 2; // distinct from a normal assertion failure (exit 1)
    return;
  }

  cmdReport(names);
}

function main() {
  const [, , verb, arg] = process.argv;

  if (!verb) {
    usageError("Missing command.");
    return;
  }

  let names;
  try {
    names = verb === "benchmark" ? resolveBenchmarkNames(arg) : resolveScenarioNames(arg);
  } catch (error) {
    usageError(error.message);
    return;
  }

  try {
    switch (verb) {
      case "setup":
        cmdSetup(names);
        break;
      case "assert":
        cmdAssert(names);
        break;
      case "report":
        cmdReport(names);
        break;
      case "run":
        cmdRun(names);
        break;
      case "benchmark":
        cmdBenchmark(names);
        break;
      case "teardown":
        teardown(RUNS_ROOT);
        process.stdout.write(`teardown -> removed ${RUNS_ROOT}\n`);
        break;
      default:
        usageError(`Unknown command "${verb}".`);
    }
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  main,
  resolveScenarioNames,
  setupScenario,
  scoreScenario,
  applyGitBaseline,
  resolveContainedPath,
  listScenarioNames,
  listBenchmarkNames,
  resolveBenchmarkNames,
  benchmarkReportEligible,
  printBenchmarkInstructions,
  resolveBenchmarkEvidencePaths,
  preflightBenchmarkWorkspace,
  publishBaselineAtomic,
  benchmarkWorkspaceRoot,
  resolveCodexLauncher,
  codexVersion,
  gitRevision,
  CORE_BENCHMARK_PROFILES,
};
