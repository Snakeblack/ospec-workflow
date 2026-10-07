"use strict";

// The harness exception of margins.json lets the checkpoint compare records of
// different harness digests. It is only worth something if it is verified:
// every digest must be rebuilt from today's harness with the declared files
// restored to their copies in __fixtures__ (so nothing else changed), the last
// candidate digest must be today's, and the baseline arm must behave as it did.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { ARMS } = require("./arms.js");
const { loadMargins } = require("./checkpoint.js");
const { harnessDigest, listFiles, loadScenarios } = require("./scenarios.js");

const BENCH_DIR = __dirname;
const BASELINE_DIR = path.join(BENCH_DIR, "__fixtures__", "harness-baseline");
const IDD2_DIR = path.join(BENCH_DIR, "__fixtures__", "harness-idd-2");
const { margins } = loadMargins();
const exception = margins.harness_exception;

const isHarnessFile = (file) => file.endsWith(".js") && !file.endsWith(".test.js") && !/^(scenarios|__fixtures__|records)\//.test(file);

// The digest of the current harness with each file of `copies` replaced by
// its copy in the given directory.
function rebuiltDigest(copies) {
  const rebuilt = fs.mkdtempSync(path.join(os.tmpdir(), "bench-harness-"));
  for (const file of listFiles(BENCH_DIR).filter(isHarnessFile)) {
    const source = copies[file] ? path.join(copies[file], file) : path.join(BENCH_DIR, file);
    fs.mkdirSync(path.dirname(path.join(rebuilt, file)), { recursive: true });
    fs.copyFileSync(source, path.join(rebuilt, file));
  }
  return harnessDigest(rebuilt);
}

const recordDigest = (id) => JSON.parse(fs.readFileSync(path.join(BENCH_DIR, "records", `${id}.json`), "utf8")).harness_digest;

test("the last declared candidate digest is the current harness", () => {
  assert.ok(exception, "margins.json declares a harness exception");
  assert.equal(harnessDigest(), exception.candidate_digests.at(-1), "a harness change after the exception needs a new declaration");
});

test("restoring the declared files rebuilds the baseline digest, so nothing else changed", () => {
  assert.deepEqual(listFiles(BASELINE_DIR), [...exception.changed_files].sort(), "the fixture holds exactly the declared files");
  const baselineCopies = Object.fromEntries(exception.changed_files.map((file) => [file, BASELINE_DIR]));
  assert.equal(rebuiltDigest(baselineCopies), exception.baseline_digest);
  assert.equal(recordDigest("sdd-baseline-3"), exception.baseline_digest, "the exception names the committed baseline");
});

test("the earlier candidate digest is the idd-1 and idd-2 harness, rebuilt from its own copies", () => {
  // idd-1 and idd-2 ran with today's arms.js, the checkpoint.js of v2.109.0 and
  // the baseline's hosts/claude.js, which built the plugin without flags.
  const [earlier] = exception.candidate_digests;
  assert.deepEqual(listFiles(IDD2_DIR), ["checkpoint.js"], "the idd-2 fixture holds only what changed after it");
  assert.equal(rebuiltDigest({ "checkpoint.js": IDD2_DIR, "hosts/claude.js": BASELINE_DIR }), earlier);
  for (const id of ["idd-1", "idd-2"]) assert.equal(recordDigest(id), earlier, `${id} ran with the earlier candidate harness`);
});

test("the baseline arm behaves as it did in the baseline harness", () => {
  const { ARMS: BASELINE_ARMS } = require(path.join(BASELINE_DIR, "arms.js"));
  const before = BASELINE_ARMS[margins.baseline_arm];
  const now = ARMS[margins.baseline_arm];
  for (const key of ["id", "available", "goal", "setupGoal"]) assert.equal(now[key], before[key], key);
  assert.deepEqual(now.setupPrompts, before.setupPrompts);
  for (const scenario of loadScenarios()) assert.equal(now.changePrompt(scenario), before.changePrompt(scenario), scenario.id);

  const root = fs.mkdtempSync(path.join(os.tmpdir(), "bench-arm-"));
  const states = [
    () => {},
    () => fs.mkdirSync(path.join(root, "openspec", "changes", "archive"), { recursive: true }),
    () => fs.writeFileSync(path.join(root, "openspec", "config.yaml"), "schema: spec-driven\n"),
    () => fs.writeFileSync(path.join(root, "openspec", "changes", "archive", "loose-file"), ""),
    () => fs.mkdirSync(path.join(root, "openspec", "changes", "archive", "2026-10-07-x")),
  ];
  for (const [index, apply] of states.entries()) {
    apply();
    assert.equal(now.isSetupDone(root), before.isSetupDone(root), `isSetupDone, state ${index}`);
    assert.equal(now.isComplete(root), before.isComplete(root), `isComplete, state ${index}`);
  }
});
