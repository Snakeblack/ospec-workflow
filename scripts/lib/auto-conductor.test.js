"use strict";

// The conductor of an automatic run (E1.108, REQ-idd-031) against a real
// project and the real CLI. The host is scripted: each turn runs ospec as the
// session would and counts its turn end, as the end-of-turn hook does.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { resumeRun, startRun, stopRun } = require("./auto-conductor.js");
const { readRun, runIsRunning } = require("./auto-run.js");
const { countTurnEnd } = require("./turn-fence.js");
const { ospecWith, project, stateOf, writeFile } = require("./test-support/ospec-cli.js");

const { OSPEC_AUTO_RUN: _mark, ...SESSION_ENV } = process.env;
const session = (root, ...args) => {
  const result = ospecWith(SESSION_ENV, root, ...args);
  assert.equal(result.code, 0, `${args.join(" ")}: ${result.stderr}${result.stdout}`);
  return result;
};
const OPEN_DOCS = (change, summary, ...facts) => ["record", "intent", "--change", change, "--kind", "docs", "--summary", summary, "--acceptance", "Done.", ...(facts.length ? facts.flatMap((fact) => ["--open-fact", fact]) : ["--no-open-facts", "--basis", "The request fixes every behavior."])];
const closeChange = (root, change) => {
  assert.equal(session(root, "check", "--change", change, "--json").json.verdict, "ready");
  session(root, "close", "--change", change);
};

// A project on a branch of its own, whose checks pass once src/pages.txt says 2.
function runProject(t) {
  const { root, git } = project(t);
  git("switch", "-q", "-c", "feat/run");
  return { root, git };
}

// A host that plays `turns` in order, one per call, and records each prompt.
function scriptedHost(turns, traits = {}) {
  const prompts = [];
  const budgets = [];
  let index = 0;
  return {
    name: "claude",
    reportsCost: true,
    reviewsActions: true,
    ...traits,
    prompts,
    budgets,
    resolve: () => "claude",
    resumeCommand: (id) => `claude --resume ${id}`,
    async turn({ cwd, prompt, sessionId, transcriptPath, signal, budgetUsd, budgetCredits = null }) {
      prompts.push({ prompt, sessionId });
      budgets.push(budgetCredits ?? budgetUsd);
      const play = turns[index];
      index += 1;
      if (!play) throw new Error(`no turn ${index} scripted`);
      fs.mkdirSync(path.dirname(transcriptPath), { recursive: true });
      fs.writeFileSync(transcriptPath, "");
      const result = (await play({ root: cwd, prompt, signal })) || {};
      if (traits.countsTurnEnds !== false) await countTurnEnd(cwd);
      return { session_id: `s-${index}`, final_text: "", cost_usd: 0.01 * index, is_error: false, quota_exhausted: false, aborted: false, ...result };
    },
  };
}

const deps = (host, events = []) => ({ host, failingCheck: () => null, onEvent: (line) => events.push(line) });

test("[REQ-idd-031] a run works each item in a new session, answers open-facts from the recommendations and commits each closed change", async (t) => {
  const { root, git } = runProject(t);
  const host = scriptedHost([
    ({ root: cwd }) => {
      session(cwd, ...OPEN_DOCS("fix-readme", "Fix a typo.", "Is the old spelling kept as an alias?", "Is the fix listed in the changelog?"));
      session(cwd, "record", "recommendation", "--change", "fix-readme", "--gate", "open-facts", "--question", "1", "--answer", "No alias.");
      session(cwd, "record", "recommendation", "--change", "fix-readme", "--gate", "open-facts", "--question", "2", "--answer", "Yes, under Fixed.");
    },
    ({ root: cwd }) => {
      writeFile(cwd, "src/pages.txt", "2");
      closeChange(cwd, "fix-readme");
    },
    // The second change opens and closes in one turn.
    ({ root: cwd }) => {
      session(cwd, ...OPEN_DOCS("fix-notes", "Fix the notes."));
      writeFile(cwd, "NOTES.md", "notes\n");
      closeChange(cwd, "fix-notes");
    },
  ]);
  const events = [];
  const run = await startRun({ root, items: ["Fix the typo of the README.", "Fix the notes."], host: "claude", deps: deps(host, events) });

  assert.equal(run.status, "done", events.join("\n"));
  assert.deepEqual(run.items.map((item) => [item.status, item.change, item.turns, item.delegated, item.session_id]), [
    ["closed", "fix-readme", 2, 1, "s-2"],
    ["closed", "fix-notes", 1, 0, "s-3"],
  ]);
  assert.equal(run.items[0].cost_usd, 0.02, "a resumed session reports its cost so far");
  assert.deepEqual(git("log", "--format=%s", "-3").trim().split("\n"), ["docs: Fix the notes.", "docs: Fix a typo.", "base"]);
  assert.equal(git("status", "--porcelain").trim(), "");
  assert.deepEqual(run.items.map((item) => item.commit), git("log", "--format=%H", "-2").trim().split("\n").reverse());

  // Each item starts with the brief in a new session; the delegated answer resumes the same one.
  assert.match(host.prompts[0].prompt, /^Fix the typo of the README\.\n\nThis request runs inside the automatic ospec run auto-/);
  assert.match(host.prompts[0].prompt, /ospec record recommendation/);
  assert.deepEqual(host.prompts.map((entry) => entry.sessionId), [null, "s-1", null]);
  assert.match(host.prompts[1].prompt, /answered open-facts with your recommendations/);
  const archived = fs.readdirSync(path.join(root, "idd", "archive")).find((name) => name.endsWith("-fix-readme"));
  const gate = JSON.parse(fs.readFileSync(path.join(root, "idd", "archive", archived, "state.yaml"), "utf8")).gates[0];
  assert.deepEqual([gate.source, gate.run], ["delegated", run.id]);

  assert.deepEqual(events.filter((line) => !line.startsWith("run ")), [
    "item 1/2 started: Fix the typo of the README.",
    "item 1/2: open-facts answered from the recommendations",
    `item 1/2 closed: fix-readme (2 turns, $0.02), commit ${run.items[0].commit.slice(0, 7)}`,
    "item 2/2 started: Fix the notes.",
    `item 2/2 closed: fix-notes (1 turns, $0.03), commit ${run.items[1].commit.slice(0, 7)}`,
  ]);
  assert.match(events.at(-1), /^run auto-\d{8}-\d{6} done: 2 items closed \(\$0\.05\)$/);
  assert.equal(readRun(root, run.id).status, "done");
  assert.equal(runIsRunning(root, run.id), false);
});

test("[REQ-idd-031] a gate only the user answers blocks the run; resume refuses while it is open and --answer reaches the session as the user's reply", async (t) => {
  const { root } = runProject(t);
  const host = scriptedHost([
    ({ root: cwd }) => {
      session(cwd, ...OPEN_DOCS("fix-readme", "Fix a typo."));
      session(cwd, "record", "gate", "--change", "fix-readme", "--gate", "irreversible-operation", "--open", "--reason", "drop the old pages");
    },
    ({ root: cwd, prompt }) => {
      session(cwd, "record", "gate", "--change", "fix-readme", "--gate", "irreversible-operation", "--resolve", "--answer", prompt, "--source", "user");
      writeFile(cwd, "src/pages.txt", "2");
      closeChange(cwd, "fix-readme");
    },
  ]);
  const events = [];
  const blocked = await startRun({ root, items: ["Fix the typo."], host: "claude", deps: deps(host, events) });
  assert.equal(blocked.status, "blocked");
  assert.equal(blocked.block.gate, "irreversible-operation");
  assert.equal(blocked.block.session_id, "s-1");
  assert.equal(blocked.block.questions.length, 1);
  assert.ok(events.includes("  answer with: ospec auto resume --answer \"<your answer>\""), events.join("\n"));
  assert.ok(events.includes("  or in the session: claude --resume s-1, then: ospec auto resume"));
  assert.equal(runIsRunning(root, blocked.id), false, "a blocked run answers nothing for the user");

  await assert.rejects(resumeRun({ root, deps: deps(host) }), (error) => error.code === "still-blocked" && /irreversible-operation of fix-readme is still open/.test(error.message));
  await assert.rejects(resumeRun({ root, answer: " ", deps: deps(host) }), (error) => error.code === "invalid-answer");

  const done = await resumeRun({ root, answer: "Sí, adelante: las páginas viejas no se usan.", deps: deps(host) });
  assert.equal(done.status, "done");
  assert.deepEqual(host.prompts[1], { prompt: "Sí, adelante: las páginas viejas no se usan.", sessionId: "s-1" });
  assert.equal(done.block, undefined);
});

test("[REQ-idd-031] open-facts with a question without recommendation blocks the run with its cause", async (t) => {
  const { root } = runProject(t);
  const host = scriptedHost([
    ({ root: cwd }) => {
      session(cwd, ...OPEN_DOCS("fix-readme", "Fix a typo.", "Is the old spelling kept?", "Is it in the changelog?"));
      session(cwd, "record", "recommendation", "--change", "fix-readme", "--gate", "open-facts", "--question", "1", "--answer", "No.");
      session(cwd, "record", "recommendation", "--change", "fix-readme", "--gate", "open-facts", "--question", "2", "--none");
    },
  ]);
  const run = await startRun({ root, items: ["Fix the typo."], host: "claude", deps: deps(host) });
  assert.equal(run.status, "blocked");
  assert.deepEqual([run.block.gate, run.block.cause, run.block.questions], ["open-facts", "a question has no recommendation", ["Is the old spelling kept?", "Is it in the changelog?"]]);
  assert.equal(stateOf(root, "fix-readme").gates[0].status, "open");
});

test("[REQ-idd-031] stop ends the turn in progress and leaves the run stopped, and resume continues the same session", async (t) => {
  const { root } = runProject(t);
  const host = scriptedHost([
    async ({ root: cwd, signal }) => {
      session(cwd, ...OPEN_DOCS("fix-readme", "Fix a typo."));
      const stopping = await stopRun({ root: cwd });
      assert.equal(stopping.stopping, true);
      const started = Date.now();
      while (!signal.aborted && Date.now() - started < 5000) await new Promise((resolve) => setTimeout(resolve, 20));
      assert.ok(signal.aborted, "the conductor aborts the turn within a second");
      assert.ok(Date.now() - started < 1000);
      return { aborted: true, is_error: true, error: "stopped" };
    },
    ({ root: cwd }) => {
      writeFile(cwd, "src/pages.txt", "2");
      closeChange(cwd, "fix-readme");
    },
  ]);
  const stopped = await startRun({ root, items: ["Fix the typo."], host: "claude", deps: deps(host) });
  assert.deepEqual([stopped.status, stopped.reason], ["stopped", "stop-requested"]);
  await assert.rejects(stopRun({ root }), (error) => error.code === "run-not-active");
  const done = await resumeRun({ root, deps: deps(host) });
  assert.equal(done.status, "done");
  assert.deepEqual(host.prompts[1].sessionId, "s-1");
  assert.match(host.prompts[1].prompt, /^Continue the change until `ospec close` succeeds/);
});

test("[REQ-idd-031] a spent quota pauses the run; host errors, the turn limit and turns without progress fail it on its item", async (t) => {
  const quota = runProject(t).root;
  const paused = await startRun({ root: quota, items: ["Fix it."], host: "claude", deps: deps(scriptedHost([() => ({ is_error: true, quota_exhausted: true, error: "usage limit" })])) });
  assert.deepEqual([paused.status, paused.reason, paused.detail], ["paused", "host-quota", "usage limit"]);

  const errors = runProject(t).root;
  const erring = scriptedHost([() => ({ is_error: true, error: "exit 1" }), () => ({ is_error: true, error: "exit 1" })]);
  const failed = await startRun({ root: errors, items: ["Fix it."], host: "claude", deps: deps(erring) });
  assert.deepEqual([failed.status, failed.reason, failed.current], ["failed", "host-error", 0]);
  assert.equal(erring.prompts[1].prompt, "Continue where you left off.");

  const idle = runProject(t).root;
  const stalled = await startRun({ root: idle, items: ["Fix it.", "Then this."], host: "claude", deps: deps(scriptedHost([() => {}, () => {}])) });
  assert.deepEqual([stalled.status, stalled.reason, stalled.items[1].status], ["failed", "no-progress", "pending"]);

  const busy = runProject(t).root;
  const capped = await startRun({ root: busy, items: ["Fix it."], host: "claude", maxTurns: 1, deps: deps(scriptedHost([({ root: cwd }) => session(cwd, ...OPEN_DOCS("fix-readme", "Fix a typo."))])) });
  assert.deepEqual([capped.status, capped.reason], ["failed", "max-turns"]);
  const raised = await resumeRun({ root: busy, maxTurns: 3, deps: deps(scriptedHost([({ root: cwd }) => { writeFile(cwd, "src/pages.txt", "2"); closeChange(cwd, "fix-readme"); }])) });
  assert.deepEqual([raised.status, raised.limits.max_turns], ["done", 3]);
});

test("[REQ-idd-031] a host that reports no cost is capped by tokens, per turn or as its session's total, and one without review says so", async (t) => {
  const { root } = runProject(t);
  const events = [];
  const cursor = scriptedHost([
    ({ root: cwd }) => {
      session(cwd, ...OPEN_DOCS("fix-readme", "Fix a typo."));
      return { tokens: 1_200_000 };
    },
    ({ root: cwd }) => {
      writeFile(cwd, "src/pages.txt", "2");
      closeChange(cwd, "fix-readme");
      return { tokens: 300_000 };
    },
  ], { name: "cursor", reportsCost: false, reviewsActions: false });
  const done = await startRun({ root, items: ["Fix the typo."], host: "cursor", deps: deps(cursor, events) });
  assert.deepEqual([done.status, done.limits, done.spend, done.items[0].tokens], ["done", { max_turns: 30 }, "tokens", 1_500_000]);
  assert.match(events[0], /on cursor \(at most 30 turns per item with no spending cap; cursor runs every action its configuration does not deny, without review\)$/);
  assert.match(events.at(-1), /closed \(1\.5M tokens\)$/);

  const busy = runProject(t).root;
  const totals = scriptedHost([
    ({ root: cwd }) => {
      session(cwd, ...OPEN_DOCS("fix-readme", "Fix a typo."));
      return { session_tokens: 4000 };
    },
    () => ({ session_tokens: 9000 }),
  ], { name: "cursor", reportsCost: false });
  const capped = await startRun({ root: busy, items: ["Fix it."], host: "cursor", maxTokens: 5000, deps: deps(totals) });
  assert.deepEqual([capped.status, capped.reason, capped.detail, capped.items[0].tokens], ["failed", "max-tokens", "9000 tokens", 9000]);
  await assert.rejects(resumeRun({ root: busy, maxCostUsd: 5, deps: deps(totals) }), (error) => error.code === "invalid-limit");
});

test("[REQ-idd-031] a host that reviews actions only on some accounts says so on the run's first line", async (t) => {
  const { root } = runProject(t);
  const events = [];
  const agy = scriptedHost([({ root: cwd }) => {
    session(cwd, ...OPEN_DOCS("fix-readme", "Fix a typo."));
    writeFile(cwd, "src/pages.txt", "2");
    closeChange(cwd, "fix-readme");
    return { tokens: 1000 };
  }], { name: "antigravity", reportsCost: false, reviewsActions: false, reviewNote: "antigravity reviews each action only where the account has --mode auto" });
  const done = await startRun({ root, items: ["Fix it."], host: "antigravity", deps: deps(agy, events) });
  assert.equal(done.status, "done");
  assert.match(events[0], /on antigravity \(at most 30 turns per item with no spending cap; antigravity reviews each action only where the account has --mode auto\)$/);
});

test("[REQ-idd-031] GitHub Copilot is capped by the AI credits of its sessions, each turn gets what is left, and the other caps are refused", async (t) => {
  const refused = (promise) => assert.rejects(promise, (error) => error.code === "invalid-limit");
  const { root } = runProject(t);
  const events = [];
  const copilot = scriptedHost([
    ({ root: cwd }) => {
      session(cwd, ...OPEN_DOCS("fix-readme", "Fix a typo."));
      return { session_credits: 12 };
    },
    () => ({ session_credits: 41.5 }),
  ], { name: "github-copilot", spend: "credits", reportsCost: false, reviewsActions: false });
  const capped = await startRun({ root, items: ["Fix it."], host: "github-copilot", maxAiCredits: 40, deps: deps(copilot, events) });
  assert.deepEqual([capped.status, capped.reason, capped.detail, capped.spend, capped.limits, capped.items[0].credits], ["failed", "max-credits", "41.50 AI credits", "credits", { max_turns: 30, max_ai_credits: 40 }, 41.5]);
  assert.deepEqual(copilot.budgets, [40, 28]);
  assert.match(events[0], /on github-copilot \(at most 30 turns per item and 40\.00 AI credits; github-copilot runs every action its configuration does not deny, without review\)$/);
  assert.equal(events.at(-1), "  continue with: ospec auto resume --max-ai-credits <credits>");
  const other = scriptedHost([], { name: "github-copilot", spend: "credits", reportsCost: false });
  await refused(startRun({ root: runProject(t).root, items: ["x"], host: "github-copilot", maxTokens: 5000, deps: deps(other) }));
  await refused(startRun({ root: runProject(t).root, items: ["x"], host: "github-copilot", maxCostUsd: 5, deps: deps(other) }));
  await refused(startRun({ root: runProject(t).root, items: ["x"], host: "claude", maxAiCredits: 30, deps: deps(scriptedHost([])) }));
  await refused(startRun({ root: runProject(t).root, items: ["x"], host: "github-copilot", maxAiCredits: 0, deps: deps(other) }));
});

test("[REQ-idd-031] a cost cap is optional; each turn gets what is left of it, and a turn the host's own cap ends fails the run with max-cost", async (t) => {
  const { root } = runProject(t);
  const events = [];
  const capped = scriptedHost([
    ({ root: cwd }) => {
      session(cwd, ...OPEN_DOCS("fix-readme", "Fix a typo."));
      return { cost_usd: 0.75 };
    },
    () => ({ cost_usd: 1.9, is_error: true, budget_exhausted: true, error: "Reached maximum budget ($1.2500)" }),
  ]);
  const failed = await startRun({ root, items: ["Fix it."], host: "claude", maxCostUsd: 2, deps: deps(capped, events) });
  assert.deepEqual([failed.status, failed.reason, failed.detail, failed.limits], ["failed", "max-cost", "$1.90", { max_turns: 30, max_cost_usd: 2 }]);
  assert.deepEqual(capped.budgets, [2, 1.25]);
  assert.match(events[0], /\(at most 30 turns per item and \$2\.00\)$/);
  assert.equal(events.at(-1), "  continue with: ospec auto resume --max-cost-usd <usd>");
  const tiny = await startRun({ root: runProject(t).root, items: ["Fix it."], host: "claude", maxCostUsd: 0.003, deps: deps(scriptedHost([() => ({ cost_usd: 0.0048, is_error: true, budget_exhausted: true })]), events) });
  assert.deepEqual([tiny.reason, tiny.detail], ["max-cost", "$0.0048"]);
  assert.ok(events.some((line) => /\(at most 30 turns per item and \$0\.0030\)$/.test(line)));

  const free = runProject(t).root;
  const uncapped = scriptedHost([({ root: cwd }) => {
    session(cwd, ...OPEN_DOCS("fix-readme", "Fix a typo."));
    writeFile(cwd, "src/pages.txt", "2");
    closeChange(cwd, "fix-readme");
    return { cost_usd: 40 };
  }]);
  const done = await startRun({ root: free, items: ["Fix it."], host: "claude", deps: deps(uncapped, events) });
  assert.deepEqual([done.status, done.limits, done.spend, uncapped.budgets[0]], ["done", { max_turns: 30 }, "cost", null]);
  assert.ok(events.some((line) => /on claude \(at most 30 turns per item with no spending cap\)$/.test(line)));
});

test("[REQ-idd-031] on a host whose end-of-turn hook does not run headless the conductor counts each turn end, so open-facts is delegated", async (t) => {
  const { root } = runProject(t);
  const host = scriptedHost([
    ({ root: cwd }) => {
      session(cwd, ...OPEN_DOCS("fix-readme", "Fix a typo.", "Is the old spelling kept as an alias?"));
      session(cwd, "record", "recommendation", "--change", "fix-readme", "--gate", "open-facts", "--question", "1", "--answer", "No alias.");
    },
    ({ root: cwd }) => {
      writeFile(cwd, "src/pages.txt", "2");
      closeChange(cwd, "fix-readme");
    },
  ], { name: "cursor", reportsCost: false, countsTurnEnds: false });
  const done = await startRun({ root, items: ["Fix the typo."], host: "cursor", deps: deps(host) });
  assert.deepEqual([done.status, done.items[0].delegated], ["done", 1]);
  assert.equal(fs.readFileSync(path.join(root, ".ospec", "turns"), "utf8").trim(), "2");
});

test("[REQ-idd-031] a session that opens two changes fails the run, and a refused commit fails it until resume commits", async (t) => {
  const two = runProject(t).root;
  const several = await startRun({ root: two, items: ["Fix it."], host: "claude", deps: deps(scriptedHost([({ root: cwd }) => {
    session(cwd, ...OPEN_DOCS("fix-readme", "Fix a typo."));
    session(cwd, ...OPEN_DOCS("fix-notes", "Fix the notes."));
  }])) });
  assert.deepEqual([several.status, several.reason, several.detail], ["failed", "several-changes", "fix-notes, fix-readme"]);

  const { root, git } = runProject(t);
  const hook = path.join(root, ".git", "hooks", "commit-msg");
  fs.writeFileSync(hook, "#!/bin/sh\necho 'rejected by the commit-msg hook' >&2\nexit 1\n", { mode: 0o755 });
  const refused = await startRun({ root, items: ["Fix it."], host: "claude", deps: deps(scriptedHost([({ root: cwd }) => {
    session(cwd, ...OPEN_DOCS("fix-readme", "Fix a typo."));
    writeFile(cwd, "src/pages.txt", "2");
    closeChange(cwd, "fix-readme");
  }])) });
  if (process.platform !== "win32") {
    assert.deepEqual([refused.status, refused.reason], ["failed", "commit-failed"]);
    assert.match(refused.detail, /rejected by the commit-msg hook/);
    fs.rmSync(hook);
    const done = await resumeRun({ root, deps: deps(scriptedHost([])) });
    assert.equal(done.status, "done");
    assert.equal(git("log", "--format=%s", "-1").trim(), "docs: Fix a typo.");
  }
});

test("[REQ-idd-031] start refuses an unsupported host, a bad queue, the default branch, a dirty tree, an open change, failing checks and a second run", async (t) => {
  const refused = (promise, code) => assert.rejects(promise, (error) => error.code === code, code);
  const { root, git } = runProject(t);
  const host = scriptedHost([]);
  await refused(startRun({ root, items: ["x"], host: "agy", deps: deps(host) }), "host-unavailable");
  await assert.rejects(startRun({ root, items: ["x"], host: "vscode", deps: deps(host) }), (error) => error.code === "host-unavailable" && /VS Code has no headless mode/.test(error.message));
  await refused(startRun({ root, items: ["x"], host: "claude", maxTokens: 1000, deps: deps(host) }), "invalid-limit");
  await refused(startRun({ root, items: ["x"], host: "cursor", maxCostUsd: 5, deps: deps(scriptedHost([], { name: "cursor", reportsCost: false })) }), "invalid-limit");
  await refused(startRun({ root, items: [], host: "claude", deps: deps(host) }), "invalid-items");
  await refused(startRun({ root, items: Array(21).fill("x"), host: "claude", deps: deps(host) }), "invalid-items");
  await refused(startRun({ root, items: ["x", " "], host: "claude", deps: deps(host) }), "invalid-items");
  await refused(startRun({ root, items: ["x"], host: "claude", maxTurns: 0, deps: deps(host) }), "invalid-limit");

  git("switch", "-q", "main");
  await refused(startRun({ root, items: ["x"], host: "claude", deps: deps(host) }), "default-branch");
  git("switch", "-q", "feat/run");
  writeFile(root, "stray.txt", "x");
  await refused(startRun({ root, items: ["x"], host: "claude", deps: deps(host) }), "dirty-tree");
  fs.rmSync(path.join(root, "stray.txt"));
  // The project's own check fails on HEAD: src/pages.txt still says 1.
  await refused(startRun({ root, items: ["x"], host: "claude", deps: { host, onEvent: () => {} } }), "checks-failing");
  session(root, ...OPEN_DOCS("fix-readme", "Fix a typo."));
  await refused(startRun({ root, items: ["x"], host: "claude", deps: deps(host) }), "open-change");
  fs.rmSync(path.join(root, "idd", "fix-readme"), { recursive: true });

  const blocked = await startRun({ root, items: ["x"], host: "claude", deps: deps(scriptedHost([({ root: cwd }) => {
    session(cwd, ...OPEN_DOCS("fix-readme", "Fix a typo."));
    session(cwd, "record", "gate", "--change", "fix-readme", "--gate", "irreversible-operation", "--open", "--reason", "drop the old pages");
  }])) });
  assert.equal(blocked.status, "blocked");
  fs.rmSync(path.join(root, "idd", "fix-readme"), { recursive: true });
  await refused(startRun({ root, items: ["x"], host: "claude", deps: deps(host) }), "run-active");
  await refused(startRun({ root, items: ["x"], host: "claude", deps: { ...deps({ ...host, resolve: () => { throw new Error("claude CLI not found on PATH"); } }) } }), "run-active");
});

test("[REQ-idd-031] a run whose conductor is gone is not running: it answers nothing, stop marks it stopped and resume takes it over", async (t) => {
  const { root } = runProject(t);
  const gone = () => false;
  const blocked = await startRun({ root, items: ["x"], host: "claude", deps: deps(scriptedHost([({ root: cwd }) => {
    session(cwd, ...OPEN_DOCS("fix-readme", "Fix a typo."));
    session(cwd, "record", "gate", "--change", "fix-readme", "--gate", "irreversible-operation", "--open", "--reason", "drop the old pages");
  }])) });
  // A conductor killed mid-turn leaves its run marked running.
  const file = path.join(root, ".ospec", "auto", blocked.id, "run.json");
  fs.writeFileSync(file, JSON.stringify({ ...readRun(root, blocked.id), status: "running", pid: 2 ** 31 - 2 }));
  assert.equal(runIsRunning(root, blocked.id, gone), false);
  const stopped = await stopRun({ root, deps: { alive: gone } });
  assert.deepEqual([stopped.stopping, stopped.run.status], [false, "stopped"]);
  assert.equal(readRun(root, blocked.id).status, "stopped");

  fs.writeFileSync(file, JSON.stringify({ ...readRun(root, blocked.id), status: "running", pid: 2 ** 31 - 2 }));
  const host = scriptedHost([() => {}]);
  const again = await resumeRun({ root, deps: { ...deps(host), alive: (pid) => pid === process.pid } });
  assert.deepEqual([again.status, again.block.gate, again.pid], ["blocked", "irreversible-operation", process.pid]);
  assert.equal(host.prompts[0].sessionId, "s-1", "the run goes on in the item's session");
});

test("[REQ-idd-031] start refuses a host that is not installed", async (t) => {
  const { root } = runProject(t);
  const missing = { ...scriptedHost([]), resolve: () => { throw new Error("claude CLI not found on PATH"); } };
  await assert.rejects(startRun({ root, items: ["x"], host: "claude", deps: deps(missing) }), (error) => error.code === "host-not-found" && /claude CLI not found/.test(error.message));
});
