"use strict";

// The browser checks of the greenfield corpus (E4.5) are only worth something
// if a correct delivery passes all of them and the seed, which has no page
// yet, fails its acceptance while its empty suite passes. Each check opens
// its own headless browser, so they run four at a time; without a
// Chromium-family browser the test is skipped (BENCH_CHROMIUM names one).

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const { findBrowser } = require("./browser.js");
const { listFiles, loadCorpus, materializeRepo } = require("./scenarios.js");

const RUNNER = path.join(__dirname, "check-runner.js");
const REFERENCE_DIR = path.join(__dirname, "__fixtures__", "reference-greenfield");
const CONCURRENCY = 4;
const browser = findBrowser();

function workspace(scenario, { reference }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `bench-${scenario.id}-`));
  materializeRepo(scenario, root);
  if (reference) {
    const overlay = path.join(REFERENCE_DIR, scenario.id);
    for (const file of listFiles(overlay)) fs.copyFileSync(path.join(overlay, file), path.join(root, file));
  }
  return root;
}

function runCheck(scenario, root, check) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [RUNNER, scenario.checksPath, root, check.id], { cwd: root });
    let stdout = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.on("close", () => {
      const line = stdout.trim().split("\n").pop();
      let verdict = null;
      try {
        verdict = JSON.parse(line);
      } catch {
        verdict = { pass: false, error: stdout };
      }
      resolve({ id: check.id, kind: check.kind, pass: verdict.pass === true, error: verdict.error });
    });
  });
}

async function runAll(scenario, root, checks) {
  const results = [];
  const queue = [...checks];
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (queue.length > 0) results.push(await runCheck(scenario, root, queue.shift()));
  }));
  return results;
}

for (const scenario of loadCorpus("greenfield")) {
  test(`${scenario.id}: the reference delivery passes every hidden check`, { skip: browser ? false : "no Chromium-family browser" }, async () => {
    const results = await runAll(scenario, workspace(scenario, { reference: true }), scenario.checks);
    assert.deepEqual(results.filter((result) => !result.pass), []);
  });

  test(`${scenario.id}: the seed fails every acceptance check and keeps its regressions green`, { skip: browser ? false : "no Chromium-family browser" }, async () => {
    const judged = scenario.checks.filter((check) => check.kind !== "fact");
    assert.ok(judged.some((check) => check.kind === "acceptance"));
    const results = await runAll(scenario, workspace(scenario, { reference: false }), judged);
    for (const result of results) assert.equal(result.pass, result.kind === "regression", result.id);
  });
}
