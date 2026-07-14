"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const {
  listScenarioNames,
  listBenchmarkNames,
  resolveBenchmarkNames,
  benchmarkReportEligible,
  resolveContainedPath,
  applyGitBaseline,
  printBenchmarkInstructions,
  resolveBenchmarkEvidencePaths,
  preflightBenchmarkWorkspace,
  publishBaselineAtomic,
  resolveCodexLauncher,
  codexVersion,
  CORE_BENCHMARK_PROFILES,
} = require("./run.js");
const { scenarioFor } = require("./safe-export.js");

test("Windows Codex npm shim resolves to node without shell execution", (t) => {
  const root = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "eval-codex-launcher-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const shim = path.join(root, "codex.cmd");
  const cli = path.join(root, "node_modules", "@openai", "codex", "bin", "codex.js");
  fs.mkdirSync(path.dirname(cli), { recursive: true });
  fs.writeFileSync(shim, "@echo off\n");
  fs.writeFileSync(cli, "process.stdout.write('codex-cli 9.8.7\\n');\n");

  const launcher = resolveCodexLauncher(["--version"], {
    platform: "win32",
    execPath: process.execPath,
    resolveBinFromPath: () => shim,
  });
  assert.deepEqual(launcher, { command: process.execPath, args: [cli, "--version"] });
  assert.equal(codexVersion({ platform: "win32", execPath: process.execPath, resolveBinFromPath: () => shim }), "codex-cli 9.8.7");
});

test("suite discovery keeps exactly seven golden scenarios separate from nine benchmarks", () => {
  assert.equal(listScenarioNames().length, 7);
  assert.equal(listBenchmarkNames().length, 9);
  assert.equal(listScenarioNames().includes("benchmark"), false);
});

test("benchmark selection defaults all to the three-profile core and keeps nine optional as extended", () => {
  assert.deepEqual(resolveBenchmarkNames("small-bugfix"), ["small-bugfix"]);
  assert.deepEqual(resolveBenchmarkNames("all"), CORE_BENCHMARK_PROFILES);
  assert.deepEqual(resolveBenchmarkNames("initial"), CORE_BENCHMARK_PROFILES);
  assert.equal(resolveBenchmarkNames("extended").length, 9);
  assert.throws(() => resolveBenchmarkNames("unknown-profile"), /Unknown benchmark profile/);
});

test("all benchmark manifests expose a live change and expected route", () => {
  for (const name of listBenchmarkNames()) {
    const manifest = scenarioFor(name);
    assert.equal(manifest.group, "benchmark");
    assert.equal(manifest.profile, name);
    assert.equal(typeof manifest.benchmark.change, "string");
    assert.equal(typeof manifest.benchmark.expected_route, "string");
  }
});

test("baseline eligibility requires the complete suite and every structural PASS", () => {
  const all = listBenchmarkNames();
  assert.equal(benchmarkReportEligible(all.map((name) => ({ name, result: { pass: true } })), all), true);
  assert.equal(benchmarkReportEligible(all.slice(1).map((name) => ({ name, result: { pass: true } })), all), false);
  assert.equal(benchmarkReportEligible(all.map((name, index) => ({ name, result: { pass: index !== 0 } })), all), false);
});

test("benchmark instructions force the pending branch without shared .runs state", (t) => {
  const workspaceRoot = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "ospec-benchmark-cli-"));
  t.after(() => fs.rmSync(workspaceRoot, { recursive: true, force: true }));
  const manifest = {
    input: { command: "/sdd-new update-readme", text: "Update README" },
    capture: { gate: false, envelope: false },
    benchmark: { change: "update-readme", expected_route: "lite" },
  };
  let output = "";

  printBenchmarkInstructions("docs-one-file", manifest, workspaceRoot, (chunk) => { output += chunk; });

  assert.match(output, /awaiting-live-run/);
  assert.match(output, /node scripts\/evals\/run\.js benchmark docs-one-file/);
  assert.doesNotMatch(output, /PASS\s+docs-one-file/);
});

test("benchmark change paths reject traversal and absolute or nested changes", (t) => {
  const workspaceRoot = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "ospec-benchmark-path-"));
  t.after(() => fs.rmSync(workspaceRoot, { recursive: true, force: true }));

  assert.equal(
    resolveBenchmarkEvidencePaths(workspaceRoot, "update-readme").changeRoot,
    path.join(workspaceRoot, "openspec", "changes", "update-readme"),
  );
  assert.equal(
    resolveBenchmarkEvidencePaths(workspaceRoot, "update-readme").transcriptPath,
    path.join(workspaceRoot, ".eval-capture", "codex-events.jsonl"),
  );
  for (const change of ["..", "../escape", "nested/change", "nested\\change", path.resolve(workspaceRoot, "absolute")]) {
    assert.throws(() => resolveBenchmarkEvidencePaths(workspaceRoot, change), /benchmark\.change/i);
  }
});

test("benchmark transcript evidence is fixed inside .eval-capture", (t) => {
  const workspaceRoot = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "ospec-benchmark-transcript-path-"));
  t.after(() => fs.rmSync(workspaceRoot, { recursive: true, force: true }));
  for (const declaredTranscriptPath of [
    path.join(workspaceRoot, "outside.jsonl"),
    "../outside.jsonl",
    ".eval-capture/../outside.jsonl",
  ]) {
    assert.throws(
      () => resolveBenchmarkEvidencePaths(workspaceRoot, "update-readme", { transcriptPath: declaredTranscriptPath }),
      /transcript.*\.eval-capture/i,
    );
  }
});

test("public benchmark CLI never scores a preconstructed workspace or publishes a baseline", (t) => {
  const workspaceRoot = path.join(__dirname, ".runs", "benchmark", "docs-one-file");
  const reportPath = path.join(__dirname, "reports", "reference-baseline.md");
  const priorReport = fs.existsSync(reportPath) ? fs.readFileSync(reportPath) : null;
  t.after(() => fs.rmSync(workspaceRoot, { recursive: true, force: true }));
  fs.rmSync(workspaceRoot, { recursive: true, force: true });

  const first = spawnSync(process.execPath, [path.join(__dirname, "run.js"), "benchmark", "docs-one-file"], { encoding: "utf8" });
  assert.equal(first.status, 2);
  fs.mkdirSync(path.join(workspaceRoot, ".eval-capture"), { recursive: true });
  fs.writeFileSync(path.join(workspaceRoot, ".eval-capture", "done.json"), "{}\n");
  fs.writeFileSync(path.join(workspaceRoot, ".eval-capture", "benchmark.json"), "{}\n");
  const replay = spawnSync(process.execPath, [path.join(__dirname, "run.js"), "benchmark", "docs-one-file"], { encoding: "utf8" });
  assert.equal(replay.status, 2);
  assert.match(replay.stdout, /awaiting host-authorized live-driver/i);
  assert.doesNotMatch(replay.stdout, /PASS\s+docs-one-file/);
  assert.deepEqual(fs.existsSync(reportPath) ? fs.readFileSync(reportPath) : null, priorReport);
});

test("live-driver preflight validates state and canonical O1 before observation publication", (t) => {
  const workspaceRoot = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "ospec-benchmark-preflight-"));
  t.after(() => fs.rmSync(workspaceRoot, { recursive: true, force: true }));
  const manifest = {
    benchmark: { change: "update-readme", expected_route: "lite" },
    expect: { state: { status: "verified" } },
  };
  assert.throws(
    () => preflightBenchmarkWorkspace({ manifest, workspaceRoot }),
    /O1 phase-cost evidence is missing/i,
  );
  const evidence = resolveBenchmarkEvidencePaths(workspaceRoot, "update-readme");
  fs.mkdirSync(path.dirname(evidence.costsPath), { recursive: true });
  fs.writeFileSync(evidence.costsPath, `${JSON.stringify({
    phase: "verify", agent: "sdd-verify",
    estimated_prompt_tokens: 1, estimated_artifact_tokens: 1,
    estimated_tool_output_tokens: 1, estimated_output_tokens: 1,
    duration_ms: 1, model_tier: "tier-3", status: "success",
    relaunch: false, ts: "2026-07-12T18:00:00.000Z",
  })}\n`);
  assert.throws(
    () => preflightBenchmarkWorkspace({ manifest, workspaceRoot }),
    /state/i,
  );
  fs.mkdirSync(path.dirname(evidence.statePath), { recursive: true });
  fs.writeFileSync(evidence.statePath, "status: verified\nroute:\n  actual_route: lite\n");
  const preflight = preflightBenchmarkWorkspace({ manifest, workspaceRoot });
  assert.equal(preflight.result.pass, true);
  assert.equal(preflight.costs.invocations, 1);
});

test("atomic baseline publication preserves old content on rename failure and replaces it on success", (t) => {
  const root = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "ospec-baseline-atomic-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const report = path.join(root, "reference-baseline.md");
  fs.writeFileSync(report, "old baseline\n");

  assert.throws(
    () => publishBaselineAtomic(report, "new baseline\n", {
      renameSync() { throw new Error("injected rename failure"); },
    }),
    /injected rename failure/,
  );
  assert.equal(fs.readFileSync(report, "utf8"), "old baseline\n");
  assert.deepEqual(fs.readdirSync(root), ["reference-baseline.md"]);

  publishBaselineAtomic(report, "new baseline\n");
  assert.equal(fs.readFileSync(report, "utf8"), "new baseline\n");
  assert.deepEqual(fs.readdirSync(root), ["reference-baseline.md"]);
});

test("resolveContainedPath constrains resolved target to be strictly inside workspace root", () => {
  const root = path.resolve(__dirname, ".runs");

  // Valid target inside root
  const valid = resolveContainedPath(root, "some-folder");
  assert.equal(valid, path.join(root, "some-folder"));

  // Exactly root is invalid
  assert.throws(() => resolveContainedPath(root, "."));
  assert.throws(() => resolveContainedPath(root, ""));

  // Escaping is invalid
  assert.throws(() => resolveContainedPath(root, "../"));
  assert.throws(() => resolveContainedPath(root, "../../"));
});

test("applyGitBaseline handles empty baseline gracefully", () => {
  const tempDir = fs.mkdtempSync(path.join(__dirname, ".runs", "test-git-baseline-"));
  try {
    // Should return immediately without throwing when marker is absent
    applyGitBaseline(tempDir);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
