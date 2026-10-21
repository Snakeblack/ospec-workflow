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
const STDERR_TAIL_CHARS = 2048;
// A Windows runner under the rest of the suite loses a browser, or a page that
// never finishes loading, now and then (#344): such a check, and only such a
// check, runs once more and the first failure stays in the TAP diagnostics. A check that fails its assertion
// prints a verdict and is never retried.
const INFRA_RETRIES = process.platform === "win32" ? 1 : 0;
const INFRA_FAILURE = /without a verdict|DevTools port|DevTools connection|could not connect to ws:|the page did not finish loading/;
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

function runCheckOnce(scenario, root, check) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [RUNNER, scenario.checksPath, root, check.id], { cwd: root });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr = (stderr + chunk).slice(-STDERR_TAIL_CHARS); });
    child.on("close", (code, signal) => {
      const line = stdout.trim().split("\n").pop();
      let verdict = null;
      try {
        verdict = JSON.parse(line);
      } catch {
        const exit = signal ? `signal ${signal}` : `code ${code}`;
        verdict = { pass: false, error: `the check runner exited with ${exit} without a verdict; stdout: ${stdout.trim()}; stderr: ${stderr.trim()}` };
      }
      resolve({ id: check.id, kind: check.kind, pass: verdict.pass === true, error: verdict.error });
    });
  });
}

const retriable = (result) => !result.pass && INFRA_FAILURE.test(result.error || "");

async function runCheck(t, scenario, root, check) {
  let result = await runCheckOnce(scenario, root, check);
  for (let retry = 0; retry < INFRA_RETRIES && retriable(result); retry += 1) {
    t.diagnostic(`retrying ${check.id} after an infrastructure failure: ${result.error}`);
    result = await runCheckOnce(scenario, root, check);
  }
  return result;
}

async function runAll(t, scenario, root, checks) {
  const results = [];
  const queue = [...checks];
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (queue.length > 0) results.push(await runCheck(t, scenario, root, queue.shift()));
  }));
  return results;
}

test("only a check that failed without a verdict from its page is retried", () => {
  const infra = [
    "the check runner exited with 1 without a verdict; stdout: ; stderr: ",
    "the browser did not open its DevTools port within 15000 ms",
    "Page.navigate: the browser closed its DevTools connection",
    "could not connect to ws://127.0.0.1:9222/devtools/browser/x",
    "the page did not finish loading",
  ];
  for (const error of infra) assert.equal(retriable({ pass: false, error }), true, error);
  assert.equal(retriable({ pass: false, error: "expected 3 recipes, found 2" }), false);
  assert.equal(retriable({ pass: false, error: "" }), false);
  assert.equal(retriable({ pass: false }), false);
  assert.equal(retriable({ pass: true, error: "the page did not finish loading" }), false);
});

for (const scenario of loadCorpus("greenfield")) {
  test(`${scenario.id}: the reference delivery passes every hidden check`, { skip: browser ? false : "no Chromium-family browser" }, async (t) => {
    const results = await runAll(t, scenario, workspace(scenario, { reference: true }), scenario.checks);
    assert.deepEqual(results.filter((result) => !result.pass), []);
  });

  test(`${scenario.id}: the seed fails every acceptance check and keeps its regressions green`, { skip: browser ? false : "no Chromium-family browser" }, async (t) => {
    const judged = scenario.checks.filter((check) => check.kind !== "fact");
    assert.ok(judged.some((check) => check.kind === "acceptance"));
    const results = await runAll(t, scenario, workspace(scenario, { reference: false }), judged);
    for (const result of results) assert.equal(result.pass, result.kind === "regression", result.id);
  });
}
