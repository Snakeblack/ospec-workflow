"use strict";

// The record of an automatic run (E1.108, REQ-idd-031).

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { RUN_SCHEMA, activeRun, clearStop, listRunIds, newRunId, readRun, requestStop, runIsRunning, selectRun, stopRequested, writeRun } = require("./auto-run.js");

function tempRoot(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ospec-auto-run-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

const record = (id, status, extra = {}) => ({ schema: RUN_SCHEMA, id, status, pid: process.pid, current: 0, items: [{ text: "Fix it.", status: "pending" }], ...extra });
const refusedWith = (fn, code, message) => assert.throws(fn, (error) => error.code === code && message.test(error.message));

test("[REQ-idd-031] a run id names its start in UTC", () => {
  assert.equal(newRunId(new Date("2026-11-26T09:05:03.120Z")), "auto-20261126-090503");
});

test("[REQ-idd-031] a run record is written atomically under .ospec/auto, which git ignores, and read back", async (t) => {
  const root = tempRoot(t);
  await writeRun(root, record("auto-20261126-090503", "running"));
  assert.equal(readRun(root, "auto-20261126-090503").status, "running");
  assert.match(fs.readFileSync(path.join(root, ".ospec", ".gitignore"), "utf8"), /\*/);
  assert.deepEqual(fs.readdirSync(path.join(root, ".ospec", "auto", "auto-20261126-090503")), ["run.json"]);
});

test("[REQ-idd-031] an unreadable run record is refused with run-invalid and left as it was", (t) => {
  const root = tempRoot(t);
  const write = (id, text) => {
    fs.mkdirSync(path.join(root, ".ospec", "auto", id), { recursive: true });
    fs.writeFileSync(path.join(root, ".ospec", "auto", id, "run.json"), text);
  };
  write("auto-1", "{not json");
  refusedWith(() => readRun(root, "auto-1"), "run-invalid", /not a JSON object/);
  assert.equal(fs.readFileSync(path.join(root, ".ospec", "auto", "auto-1", "run.json"), "utf8"), "{not json");
  write("auto-2", JSON.stringify(record("auto-2", "running", { schema: "ospec-auto-run/v9" })));
  refusedWith(() => readRun(root, "auto-2"), "run-invalid", /schema is "ospec-auto-run\/v9"/);
  write("auto-3", JSON.stringify(record("auto-4", "running")));
  refusedWith(() => readRun(root, "auto-3"), "run-invalid", /names the run "auto-4"/);
  write("auto-5", JSON.stringify(record("auto-5", "waiting")));
  refusedWith(() => readRun(root, "auto-5"), "run-invalid", /status "waiting"/);
  write("auto-6", JSON.stringify(record("auto-6", "running", { items: [] })));
  refusedWith(() => readRun(root, "auto-6"), "run-invalid", /1 to 20 items/);
  write("auto-7", JSON.stringify(record("auto-7", "running", { items: [{ text: "x", status: "done" }] })));
  refusedWith(() => readRun(root, "auto-7"), "run-invalid", /item 1/);
  write("auto-8", JSON.stringify(record("auto-8", "running", { current: 2 })));
  refusedWith(() => readRun(root, "auto-8"), "run-invalid", /current item/);
  write("auto-10", JSON.stringify(record("auto-10", "running", { spend: "credits" })));
  refusedWith(() => readRun(root, "auto-10"), "run-invalid", /spend "credits" is neither cost nor tokens/);
  // A run from before the field counts its cost.
  write("auto-11", JSON.stringify(record("auto-11", "done")));
  assert.equal(readRun(root, "auto-11").spend, undefined);
  refusedWith(() => readRun(root, "auto-9"), "no-run", /no automatic run auto-9/);
  refusedWith(() => readRun(root, "../x"), "no-run", /kebab-case/);
  // An unreadable run is no active run: it never blocks a new one.
  assert.equal(activeRun(root), null);
});

test("[REQ-idd-031] the active run is the latest one running with a live conductor, blocked or paused", async (t) => {
  const root = tempRoot(t);
  assert.deepEqual(listRunIds(root), []);
  refusedWith(() => selectRun(root), "no-run", /no automatic run in \.ospec\/auto/);
  await writeRun(root, record("auto-20261126-090000", "done"));
  await writeRun(root, record("auto-20261126-100000", "running", { pid: 2 ** 31 - 2 }));
  assert.deepEqual(listRunIds(root), ["auto-20261126-090000", "auto-20261126-100000"]);
  assert.equal(selectRun(root).id, "auto-20261126-100000");
  assert.equal(activeRun(root, () => false), null, "a run whose conductor is gone is not active");
  assert.equal(activeRun(root, () => true).id, "auto-20261126-100000");
  await writeRun(root, record("auto-20261126-110000", "blocked"));
  assert.equal(activeRun(root, () => false).id, "auto-20261126-110000");
});

test("[REQ-idd-031] only a run registered as running with a live conductor answers for the user", async (t) => {
  const root = tempRoot(t);
  await writeRun(root, record("auto-1", "running"));
  assert.equal(runIsRunning(root, "auto-1"), true);
  assert.equal(runIsRunning(root, "auto-1", () => false), false);
  for (const status of ["blocked", "paused", "stopped", "failed", "done"]) {
    await writeRun(root, record("auto-1", status));
    assert.equal(runIsRunning(root, "auto-1"), false, status);
  }
  assert.equal(runIsRunning(root, "auto-2"), false);
  assert.equal(runIsRunning(root, undefined), false);
});

test("[REQ-idd-031] a stop request is a file beside the run record", (t) => {
  const root = tempRoot(t);
  assert.equal(stopRequested(root, "auto-1"), false);
  requestStop(root, "auto-1");
  assert.equal(stopRequested(root, "auto-1"), true);
  clearStop(root, "auto-1");
  assert.equal(stopRequested(root, "auto-1"), false);
});
