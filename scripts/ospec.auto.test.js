"use strict";

// The contract of `ospec auto` (E1.108, REQ-idd-031) as a child process: its
// usage, its refusals and how it reports a run. The conductor itself is pinned
// in scripts/lib/auto-conductor.test.js with a scripted host.

const test = require("node:test");
const assert = require("node:assert");

const { ospec, plainRoot, project, writeFile } = require("./lib/test-support/ospec-cli.js");

const RUN = {
  schema: "ospec-auto-run/v1",
  id: "auto-20261126-090503",
  host: "claude",
  model: null,
  branch: "feat/run",
  limits: { max_turns: 30, max_cost_usd: 25 },
  status: "blocked",
  reason: "gate",
  pid: 2 ** 31 - 2,
  created_at: "2026-11-26T09:05:03.000Z",
  current: 1,
  block: { gate: "irreversible-operation", questions: ["This operation is destructive or irreversible. Approve it?"], session_id: "s-2" },
  items: [
    { text: "Fix the typo.", status: "closed", change: "fix-readme", session_id: "s-1", turns: 2, cost_usd: 0.5, delegated: 1, commit: "0123456789abcdef" },
    { text: "Drop the old pages.", status: "running", change: "drop-pages", session_id: "s-2", turns: 1, cost_usd: 0.25, delegated: 0, commit: null },
    { text: "Then the notes.", status: "pending", change: null, session_id: null, turns: 0, cost_usd: 0, delegated: 0, commit: null },
  ],
};

test("[REQ-idd-031] ospec auto names its subcommands and refuses a bad call before it runs anything", (t) => {
  const { root } = project(t);
  const unknown = ospec(root, "auto", "go");
  assert.strictEqual(unknown.code, 2);
  assert.match(unknown.stderr, /auto takes one of start, status, resume, stop \(usage\)/);
  assert.match(unknown.stderr, /ospec auto start --item <request>/);
  assert.match(ospec(root, "auto", "start").stderr, /auto start needs --item <request>, once per request/);
  assert.match(ospec(root, "auto", "start", "--item", "x", "--max-turns", "many").stderr, /--max-turns takes a whole number, got "many"/);
  assert.match(ospec(root, "auto", "status", "--item", "x").stderr, /auto status does not take --item/);
  const agy = ospec(root, "auto", "start", "--item", "x", "--host", "agy", "--json");
  assert.strictEqual(agy.code, 1);
  assert.deepStrictEqual([agy.json.error.code, agy.json.error.how], ["host-unavailable", "the other hosts come with E1.110, each once verified live"]);
  const main = ospec(root, "auto", "start", "--item", "x", "--json");
  assert.strictEqual(main.json.error.code, "default-branch");
  assert.strictEqual(ospec(plainRoot(t), "auto", "start", "--item", "x", "--json").json.error.code, "not-a-git-repo");
});

test("[REQ-idd-031] ospec auto status reports the latest run, its block and each item; stop stops a run waiting for the user", (t) => {
  const { root } = project(t);
  const none = ospec(root, "auto", "status", "--json");
  assert.deepStrictEqual([none.code, none.json.error.code], [1, "no-run"]);

  writeFile(root, `.ospec/auto/${RUN.id}/run.json`, JSON.stringify(RUN));
  const status = ospec(root, "auto", "status");
  assert.strictEqual(status.code, 0, status.stderr);
  assert.deepStrictEqual(status.stdout.trimEnd().split("\n"), [
    "run auto-20261126-090503: blocked at item 2/3, 1/3 closed, $0.75 on claude",
    "blocked at irreversible-operation",
    "  - This operation is destructive or irreversible. Approve it?",
    "answer with: ospec auto resume --answer \"<your answer>\"",
    "item 1/3 closed: fix-readme (2 turns, $0.50), commit 0123456, open-facts delegated 1",
    "item 2/3 running: drop-pages (1 turns, $0.25), session s-2",
    "item 3/3 pending: Then the notes.",
  ]);
  assert.strictEqual(ospec(root, "auto", "status", "--run", RUN.id, "--json").json.run.block.gate, "irreversible-operation");

  const stopped = ospec(root, "auto", "stop");
  assert.strictEqual(stopped.stdout, `run ${RUN.id}: stopped\n`);
  assert.strictEqual(ospec(root, "auto", "status", "--json").json.run.status, "stopped");
  assert.strictEqual(ospec(root, "auto", "stop", "--json").json.error.code, "run-not-active");

  writeFile(root, `.ospec/auto/${RUN.id}/run.json`, "{");
  const invalid = ospec(root, "auto", "status", "--json");
  assert.deepStrictEqual([invalid.json.error.code, invalid.json.error.how], ["run-invalid", `nothing was changed; remove .ospec/auto/${RUN.id} to forget this run`]);
});
