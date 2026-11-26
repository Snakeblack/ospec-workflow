"use strict";

// The queue of the execution mode choice (E1.109, REQ-idd-032).

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { MAX_ITEMS, RUN_SCHEMA } = require("./auto-run.js");
const { executionMode, itemRequest } = require("./auto-queue.js");

function tempRoot(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ospec-auto-queue-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

function write(root, file, text) {
  fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  fs.writeFileSync(path.join(root, file), text);
}

const roadmap = (rows) => ["# Roadmap", "", "| Phase | Goal |", "| --- | --- |", ...rows.map((row) => `| ${row} | x |`), ""].join("\n");
const ROWS = ["M1. Walking skeleton", "M2. Sign-up", "M3. Billing"];
const alive = () => true;

test("[REQ-idd-032] the pending phases of docs/roadmap.md are the queue, in order, with the run that would work them", (t) => {
  const root = tempRoot(t);
  write(root, "docs/roadmap.md", roadmap(ROWS));
  const { executionMode: mode, warnings } = executionMode(root, { alive });
  assert.deepEqual(warnings, []);
  assert.equal(mode.roadmap, "docs/roadmap.md");
  assert.equal(mode.pending, 3);
  assert.equal(mode.default, "interactive");
  assert.deepEqual(mode.limits, { max_turns: 30 });
  assert.deepEqual(mode.queue.map(({ id, title }) => [id, title]), [["M1", "Walking skeleton"], ["M2", "Sign-up"], ["M3", "Billing"]]);
  assert.equal(mode.queue[1].item, "Work roadmap item M2 of docs/roadmap.md: Sign-up. Name its change m2-<slug>, so the roadmap counts it done.");
  assert.equal(mode.command, `ospec auto start ${mode.queue.map((entry) => `--item "${entry.item}"`).join(" ")}`);
  assert.match(mode.how, /interactively \(the default/);
  assert.match(mode.how, /empty, skipped or undecided answer is interactive: never start the run without their explicit choice/);
  assert.match(mode.how, /ospec auto resume --answer/);
  assert.match(mode.how, /add --host with the session's host \(cursor[^)]*\) and give the user the command to run in a terminal/);
  assert.match(mode.how, /at most 30 turns per item and no spending cap unless they set one/);
  assert.match(mode.how, /--max-cost-usd on a host that reports its cost \(Claude Code, OpenCode\), --max-tokens on one that does not, --max-ai-credits on GitHub Copilot/);
});

test("[REQ-idd-032] a phase with an archived change is done and one with an active change is in progress: neither is queued", (t) => {
  const root = tempRoot(t);
  write(root, "docs/roadmap.md", roadmap([...ROWS, "M4. Reports"]));
  fs.mkdirSync(path.join(root, "idd", "archive", "2026-11-26-m1-skeleton"), { recursive: true });
  fs.mkdirSync(path.join(root, "openspec", "changes", "m2-sign-up"), { recursive: true });
  assert.deepEqual(executionMode(root, { alive }).executionMode.queue.map((entry) => entry.id), ["M3", "M4"]);
});

test("[REQ-idd-032] fewer than two pending phases, no roadmap or one the reader does not recognize offer nothing and warn of nothing", (t) => {
  const root = tempRoot(t);
  assert.deepEqual(executionMode(root, { alive }), { executionMode: null, warnings: [] });
  write(root, "docs/roadmap.md", "# Roadmap\n\n| Status | Item |\n| --- | --- |\n| pending | **E1.2** |\n");
  assert.deepEqual(executionMode(root, { alive }), { executionMode: null, warnings: [] });
  write(root, "docs/roadmap.md", roadmap(ROWS));
  fs.mkdirSync(path.join(root, "idd", "archive", "2026-11-26-m1-skeleton"), { recursive: true });
  fs.mkdirSync(path.join(root, "idd", "archive", "2026-11-26-m2-sign-up"), { recursive: true });
  assert.deepEqual(executionMode(root, { alive }), { executionMode: null, warnings: [] });
});

test("[REQ-idd-032] a roadmap that does not read offers nothing and warns with its file and line", (t) => {
  const root = tempRoot(t);
  write(root, "docs/roadmap.md", roadmap(["M1. Walking skeleton", "no id here"]));
  const { executionMode: mode, warnings } = executionMode(root, { alive });
  assert.equal(mode, null);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /^docs\/roadmap\.md:6: .*; no execution mode is offered until the roadmap reads$/);
});

test("[REQ-idd-032] an SDD project offers no queue, and neither does a configuration that does not parse", (t) => {
  const root = tempRoot(t);
  write(root, "docs/roadmap.md", roadmap(ROWS));
  write(root, "idd/config.yaml", "mode: sdd\n");
  assert.equal(executionMode(root, { alive }).executionMode, null);
  write(root, "idd/config.yaml", "mode: other\n");
  assert.equal(executionMode(root, { alive }).executionMode, null);
  write(root, "idd/config.yaml", "mode: idd\n");
  assert.notEqual(executionMode(root, { alive }).executionMode, null);
});

test("[REQ-idd-032] no queue is offered while an automatic run is active, as inside every session of its conductor", (t) => {
  const root = tempRoot(t);
  write(root, "docs/roadmap.md", roadmap(ROWS));
  const run = (status) => JSON.stringify({ schema: RUN_SCHEMA, id: "auto-20261126-090503", status, pid: process.pid, current: 0, items: [{ text: "x", status: "running" }] });
  for (const status of ["running", "blocked", "paused"]) {
    write(root, ".ospec/auto/auto-20261126-090503/run.json", run(status));
    assert.equal(executionMode(root, { alive }).executionMode, null, status);
  }
  for (const status of ["done", "stopped", "failed"]) {
    write(root, ".ospec/auto/auto-20261126-090503/run.json", run(status));
    assert.notEqual(executionMode(root, { alive }).executionMode, null, status);
  }
  // A running record whose conductor is gone is not active.
  write(root, ".ospec/auto/auto-20261126-090503/run.json", run("running"));
  assert.notEqual(executionMode(root, { alive: () => false }).executionMode, null);
});

test("[REQ-idd-032] the run takes the first 20 pending phases and the block counts them all", (t) => {
  const root = tempRoot(t);
  write(root, "docs/roadmap.md", roadmap(Array.from({ length: MAX_ITEMS + 5 }, (_, index) => `P${index + 1}. Phase ${index + 1}`)));
  const mode = executionMode(root, { alive }).executionMode;
  assert.equal(mode.pending, MAX_ITEMS + 5);
  assert.equal(mode.queue.length, MAX_ITEMS);
  assert.equal(mode.queue.at(-1).id, `P${MAX_ITEMS}`);
  assert.match(mode.how, new RegExp(`these ${MAX_ITEMS} items`));
});

test("[REQ-idd-032] each item names the change key of its phase and stays one shell word", (t) => {
  assert.equal(itemRequest("docs/roadmap.md", { id: "e1.2", label: "E1.2", title: "Pay" }), "Work roadmap item E1.2 of docs/roadmap.md: Pay. Name its change e12-<slug>, so the roadmap counts it done.");
  const root = tempRoot(t);
  write(root, "docs/roadmap.md", roadmap(["M1. Charge $5 with `cash`", "M2. Say \"hi\" and it's done"]));
  const mode = executionMode(root, { alive }).executionMode;
  assert.equal(mode.queue[0].title, "Charge $5 with cash");
  assert.equal(mode.command, `ospec auto start --item 'Work roadmap item M1 of docs/roadmap.md: Charge $5 with cash. Name its change m1-<slug>, so the roadmap counts it done.' --item 'Work roadmap item M2 of docs/roadmap.md: Say "hi" and it'\\''s done. Name its change m2-<slug>, so the roadmap counts it done.'`);
});
