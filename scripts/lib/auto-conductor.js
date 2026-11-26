"use strict";

// The conductor of an automatic run (E1.108, REQ-idd-031): `ospec auto` works
// a queue of requests, one IDD change each, with a new headless session per
// item, so no item starts with the context of the previous one. After every
// turn it reads the disk, never the model's words: a closed change is
// committed and the next item starts; an open open-facts gate whose questions
// all carry a recommendation is answered with the source `delegated`
// (REQ-idd-030, ADR 0013); any other gate stops the run for the user. Every
// step is written to .ospec/auto/<run>/run.json before the next one.

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const { AutoError, MAX_ITEMS, RUN_SCHEMA, activeRun, clearStop, isStale, newRunId, processAlive, requestStop, runDir, selectRun, stopRequested, writeRun } = require("./auto-run.js");
const { unavailableReason } = require("./auto-hosts.js");
const { ARCHIVE_ROOT, CHANGE_ROOT, STATE_FILE } = require("./idd-contract.js");
const { CONFIG_FILE, parseIddConfig } = require("./idd-config.js");
const { runCommand } = require("./idd-exec.js");
const { listChanges } = require("./idd-store.js");
const { countTurnEnd, turnsRoot } = require("./turn-fence.js");

// Only the turns of an item are capped by default: a spending cap, on cost or
// on tokens, is the user's choice, since what a turn costs depends on the
// model, the effort and the host.
const DEFAULT_LIMITS = Object.freeze({ max_turns: 30 });
const OSPEC_SCRIPT = path.join(__dirname, "..", "ospec.js");
const STOP_POLL_MS = 250;
const TEXT_CLIP = 80;
const KIND_TYPES = Object.freeze({ bug: "fix", feature: "feat", refactor: "refactor", docs: "docs" });
const CONTINUE = "Continue the change until `ospec close` succeeds. If a gate is open, end your turn with its questions after recording your recommendations.";
const DELEGATED = "The run answered open-facts with your recommendations (source delegated). Continue the change until `ospec close` succeeds.";
const RESUME_AFTER_ERROR = "Continue where you left off.";

// The request of an item and what the run expects of its session.
function brief(run, item) {
  return [
    item.text,
    "",
    `This request runs inside the automatic ospec run ${run.id}. The run answers for the user only where it may, and stops for them anywhere else.`,
    "- Work it as one IDD change until `ospec close` succeeds, and start no other change.",
    "- Before you end a turn with the questions of a gate, record your recommended answer to each with `ospec record recommendation`. The run answers open-facts from them; any other gate waits for the user.",
    "- Do not commit, push, open a pull request or cut a release: the run commits each closed change.",
  ].join("\n");
}

const clip = (text) => {
  const line = String(text).replace(/\s+/g, " ").trim();
  return line.length > TEXT_CLIP ? `${line.slice(0, TEXT_CLIP - 1)}…` : line;
};
// Cents, or four decimals below a cent, so a small cap never reads $0.00.
const money = (value) => `$${value > 0 && value < 0.005 ? value.toFixed(4) : (Math.round(value * 100) / 100).toFixed(2)}`;
const runCost = (run) => Math.round(run.items.reduce((sum, item) => sum + (item.cost_usd || 0), 0) * 1e6) / 1e6;
const runTokens = (run) => run.items.reduce((sum, item) => sum + (item.tokens || 0), 0);
const tokenCount = (value) => (value >= 1e6 ? `${Math.round(value / 1e5) / 10}M` : String(value));
// What the run has spent: cost, or tokens on a host that reports no cost.
const spent = (run, item = null) => {
  const tokens = run.spend === "tokens";
  const value = item ? (tokens ? item.tokens || 0 : item.cost_usd || 0) : tokens ? runTokens(run) : runCost(run);
  return tokens ? `${tokenCount(value)} tokens` : money(value);
};

function defaultGit(root) {
  return (args) => {
    const result = spawnSync("git", args, { cwd: root, encoding: "utf8", windowsHide: true });
    return { status: result.status, stdout: result.stdout || "", stderr: result.stderr || String(result.error || "") };
  };
}

// The conductor's own call to ospec, with OSPEC_AUTO_RUN only when `run` is
// given: the delegated answer of that run (ADR 0013).
function defaultOspec(root, baseEnv = process.env) {
  return (args, { run = null } = {}) => {
    const { OSPEC_AUTO_RUN: _mark, ...env } = baseEnv;
    const result = spawnSync(process.execPath, [OSPEC_SCRIPT, ...args, "--json"], { cwd: root, env: run ? { ...env, OSPEC_AUTO_RUN: run } : env, encoding: "utf8", windowsHide: true });
    let json = null;
    try {
      json = JSON.parse(result.stdout);
    } catch {
      json = null;
    }
    return { code: result.status, json, stderr: result.stderr || "" };
  };
}

// The checks of idd/config.yaml, run on the tree as it is; the first failing
// one, or null.
function defaultChecks(root) {
  return () => {
    let text = "";
    try {
      text = fs.readFileSync(path.join(root, CONFIG_FILE), "utf8");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    for (const check of parseIddConfig(text).checks || []) {
      if (runCommand(check.command, { cwd: root }).exit_code !== 0) return check;
    }
    return null;
  };
}

function dependencies(root, deps) {
  return {
    git: defaultGit(root),
    ospec: defaultOspec(root),
    failingCheck: defaultChecks(root),
    alive: processAlive,
    pid: process.pid,
    now: () => new Date(),
    onEvent: () => {},
    ...deps,
  };
}

const lines = (output) => output.split("\n").map((line) => line.trimEnd()).filter(Boolean);

function treeStatus(git) {
  const status = git(["status", "--porcelain", "--untracked-files=all"]);
  if (status.status !== 0) throw new AutoError("git-failed", `git status failed: ${status.stderr.trim()}`);
  return lines(status.stdout);
}

// The default branch: origin/HEAD's, else the configured init.defaultBranch,
// main and master.
function defaultBranches(git) {
  const remote = git(["symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD"]);
  if (remote.status === 0 && remote.stdout.trim()) return [remote.stdout.trim().replace(/^[^/]+\//, "")];
  const init = git(["config", "--get", "init.defaultBranch"]);
  return [...new Set([...(init.status === 0 && init.stdout.trim() ? [init.stdout.trim()] : []), "main", "master"])];
}

async function openChanges(root) {
  return (await listChanges(root)).filter((state) => state.status === "open");
}

// The changes an item's session opened or closed: the open ones, since the
// item started with none, and the archives git does not track yet, since the
// tree was clean and the run commits each closed change.
async function observe(root, git) {
  const open = (await openChanges(root)).map((state) => state.change);
  // Untracked, or staged by a commit that failed.
  const names = new Set(lines(git(["status", "--porcelain", "--untracked-files=all", "--", ARCHIVE_ROOT]).stdout)
    .filter((line) => (line.startsWith("??") || line.startsWith("A")) && line.slice(3).startsWith(`${ARCHIVE_ROOT}/`))
    .map((line) => line.slice(3 + ARCHIVE_ROOT.length + 1).split("/")[0]));
  const archived = [...names].sort().flatMap((name) => {
    const id = /^\d{4}-\d{2}-\d{2}-(.+)$/.exec(name)?.[1];
    return id && fs.existsSync(path.join(root, ARCHIVE_ROOT, name, STATE_FILE)) ? [{ id, dir: path.join(ARCHIVE_ROOT, name) }] : [];
  });
  return { open, archived };
}

function readState(root, relativeDir) {
  return JSON.parse(fs.readFileSync(path.join(root, relativeDir, STATE_FILE), "utf8"));
}

// What changes when a turn moves the item on: the change's state, and the tree.
function fingerprint(root, git, change) {
  const hash = crypto.createHash("sha256");
  if (change) {
    try {
      hash.update(fs.readFileSync(path.join(root, CHANGE_ROOT, change, STATE_FILE)));
    } catch {
      hash.update("no-state");
    }
  }
  hash.update(git(["status", "--porcelain", "--untracked-files=all"]).stdout);
  hash.update(git(["diff", "--no-ext-diff", "HEAD"]).stdout);
  return hash.digest("hex");
}

function questionsOf(decision) {
  if (!decision) return [];
  if (Array.isArray(decision.questions)) return decision.questions.map(String);
  return decision.question ? [String(decision.question)] : [];
}

function allRecommended(decision) {
  const questions = questionsOf(decision);
  const recommended = new Set((decision?.recommendations || []).filter((entry) => entry.none !== true && typeof entry.answer === "string").map((entry) => entry.question));
  return questions.length > 0 && questions.every((question) => recommended.has(question));
}

function emitBlock(run, host, emit) {
  const { block } = run;
  const label = `item ${run.current + 1}/${run.items.length}`;
  emit(`${label} blocked at ${block.gate}${block.cause ? ` (${block.cause})` : ""}`);
  for (const question of block.questions) emit(`  - ${question}`);
  emit(`  answer with: ospec auto resume --answer "<your answer>"`);
  if (block.session_id && host.resumeCommand) emit(`  or in the session: ${host.resumeCommand(block.session_id)}, then: ospec auto resume`);
}

async function stopWith(root, run, status, reason, emit, detail = null) {
  run.status = status;
  run.reason = reason;
  if (detail) run.detail = detail;
  else delete run.detail;
  await writeRun(root, run);
  const label = `item ${Math.min(run.current + 1, run.items.length)}/${run.items.length}`;
  emit(`run ${run.id} ${status} at ${label}: ${reason}${detail ? `: ${detail}` : ""}`);
  const raise = { "max-turns": " --max-turns <n>", "max-cost": " --max-cost-usd <usd>", "max-tokens": " --max-tokens <n>" }[reason];
  if (status !== "done") emit(`  continue with: ospec auto resume${status === "failed" && raise ? raise : ""}`);
  return run;
}

async function commitItem(root, run, item, archive, deps) {
  const state = readState(root, archive.dir);
  const subject = `${KIND_TYPES[state.intent?.kind] || "chore"}: ${String(state.intent?.summary || archive.id).replace(/\s+/g, " ").trim()}`;
  if (treeStatus(deps.git).length > 0) {
    const added = deps.git(["add", "-A"]);
    const committed = added.status === 0 ? deps.git(["commit", "-q", "-m", subject]) : added;
    if (committed.status !== 0) {
      return { failed: (committed.stderr || committed.stdout).trim().split("\n").slice(-5).join(" ") || "git commit failed" };
    }
    item.commit = deps.git(["rev-parse", "HEAD"]).stdout.trim();
  }
  item.change = archive.id;
  item.status = "closed";
  item.closed_at = deps.now().toISOString();
  return {};
}

async function closeItem(root, run, item, label, archive, deps) {
  const outcome = await commitItem(root, run, item, archive, deps);
  if (outcome.failed) return stopWith(root, run, "failed", "commit-failed", deps.onEvent, outcome.failed);
  await writeRun(root, run);
  deps.onEvent(`${label} closed: ${item.change} (${item.turns} turns, ${spent(run, item)})${item.commit ? `, commit ${item.commit.slice(0, 7)}` : ""}`);
  return null;
}

// One turn of the item's session, killed when the user asks the run to stop.
async function hostTurn(root, run, item, message, deps) {
  const controller = new AbortController();
  const poll = setInterval(() => {
    if (stopRequested(root, run.id)) controller.abort();
  }, STOP_POLL_MS);
  try {
    const transcriptPath = path.join(runDir(root, run.id), `item-${run.current + 1}-turn-${String(item.turns).padStart(2, "0")}.jsonl`);
    // What is left of the run's cost cap, for a host that caps its own turn.
    const budgetUsd = run.limits.max_cost_usd !== undefined ? Math.max(0, run.limits.max_cost_usd - runCost(run)) : null;
    return await deps.host.turn({ cwd: root, prompt: message, sessionId: item.session_id, transcriptPath, signal: controller.signal, budgetUsd });
  } finally {
    clearInterval(poll);
  }
}

// Drives the current item until its change is closed (null) or the run stops
// (the run, with its status).
async function driveItem(root, run, item, label, deps, firstMessage) {
  const emit = deps.onEvent;
  let message = firstMessage;
  let errors = 0;
  let stalls = 0;
  let previous = fingerprint(root, deps.git, item.change);

  if (message === null) {
    const seen = await observe(root, deps.git);
    const archive = seen.archived.find((entry) => entry.id === item.change) || (seen.open.length === 0 && seen.archived.length === 1 ? seen.archived[0] : null);
    if (archive) return closeItem(root, run, item, label, archive, deps);
    message = CONTINUE;
  }

  for (;;) {
    if (stopRequested(root, run.id)) {
      clearStop(root, run.id);
      return stopWith(root, run, "stopped", "stop-requested", emit);
    }
    if (item.turns >= run.limits.max_turns) return stopWith(root, run, "failed", "max-turns", emit, `${item.turns} turns`);
    if (run.limits.max_cost_usd !== undefined && runCost(run) >= run.limits.max_cost_usd) return stopWith(root, run, "failed", "max-cost", emit, money(runCost(run)));
    if (run.limits.max_tokens !== undefined && runTokens(run) >= run.limits.max_tokens) return stopWith(root, run, "failed", "max-tokens", emit, spent(run));

    item.turns += 1;
    const turn = await hostTurn(root, run, item, message, deps);
    item.session_id = turn.session_id || item.session_id;
    // A resumed session reports its cost so far, not the turn's; tokens come
    // per turn, or as the session's total so far.
    item.cost_usd = Math.max(item.cost_usd || 0, Number(turn.cost_usd) || 0);
    if (run.spend === "tokens") {
      item.tokens = turn.session_tokens !== undefined ? Math.max(item.tokens || 0, Number(turn.session_tokens) || 0) : (item.tokens || 0) + (Number(turn.tokens) || 0);
    }
    await writeRun(root, run);

    if (turn.aborted || stopRequested(root, run.id)) {
      clearStop(root, run.id);
      return stopWith(root, run, "stopped", "stop-requested", emit);
    }
    // A host whose end-of-turn hook does not run headless: the conductor saw
    // the session's process end, which is the turn end that hook would count.
    if (deps.host.countsTurnEnds === false) await countTurnEnd(turnsRoot(root));

    // The disk decides, whatever the turn said.
    const seen = await observe(root, deps.git);
    const touched = [...new Set([...seen.open, ...seen.archived.map((entry) => entry.id)])];
    if (touched.length > 1) return stopWith(root, run, "failed", "several-changes", emit, touched.join(", "));
    if (touched.length === 1) item.change = touched[0];
    const archive = seen.archived[0];
    if (archive) return closeItem(root, run, item, label, archive, deps);

    if (turn.quota_exhausted) return stopWith(root, run, "paused", "host-quota", emit, turn.error || null);
    if (turn.budget_exhausted) return stopWith(root, run, "failed", "max-cost", emit, money(runCost(run)));
    if (turn.is_error) {
      errors += 1;
      if (errors >= 2 || !item.session_id) return stopWith(root, run, "failed", "host-error", emit, turn.error || null);
      message = RESUME_AFTER_ERROR;
      continue;
    }
    errors = 0;

    if (item.change) {
      const next = deps.ospec(["next", "--change", item.change]).json;
      const step = next?.next_step;
      if (step?.action === "resolve-gate") {
        const decision = next.pending_decision;
        let cause = null;
        if (step.gate === "open-facts" && allRecommended(decision)) {
          const answered = deps.ospec(["record", "gate", "--change", item.change, "--gate", "open-facts", "--resolve", "--source", "delegated"], { run: run.id });
          if (answered.code === 0) {
            item.delegated = (item.delegated || 0) + 1;
            await writeRun(root, run);
            emit(`${label}: open-facts answered from the recommendations`);
            message = DELEGATED;
            stalls = 0;
            previous = fingerprint(root, deps.git, item.change);
            continue;
          }
          cause = answered.json?.error?.message || "the delegated answer was refused";
        } else if (step.gate === "open-facts") {
          cause = "a question has no recommendation";
        }
        run.status = "blocked";
        run.reason = "gate";
        run.block = { gate: step.gate, questions: questionsOf(decision), session_id: item.session_id, ...(cause ? { cause } : {}) };
        await writeRun(root, run);
        emitBlock(run, deps.host, emit);
        return run;
      }
    }

    const current = fingerprint(root, deps.git, item.change);
    stalls = current === previous ? stalls + 1 : 0;
    previous = current;
    if (stalls >= 2) return stopWith(root, run, "failed", "no-progress", emit, "two turns in a row changed neither the change nor the tree");
    message = CONTINUE;
  }
}

// Before an item: nothing left from the previous one.
async function itemRefusal(root, git) {
  const open = await openChanges(root);
  if (open.length > 0) return { reason: "open-change", detail: open.map((state) => state.change).join(", ") };
  if (treeStatus(git).length > 0) return { reason: "dirty-tree", detail: "commit or stash what is not part of the run" };
  return null;
}

async function drive(root, run, deps, firstMessage = null) {
  run.status = "running";
  run.reason = null;
  delete run.block;
  delete run.detail;
  run.pid = deps.pid;
  clearStop(root, run.id);
  await writeRun(root, run);
  let message = firstMessage;
  while (run.current < run.items.length) {
    const item = run.items[run.current];
    const label = `item ${run.current + 1}/${run.items.length}`;
    if (item.status === "pending") {
      const refusal = await itemRefusal(root, deps.git);
      if (refusal) return stopWith(root, run, "failed", refusal.reason, deps.onEvent, refusal.detail);
      Object.assign(item, { status: "running", started_at: deps.now().toISOString() });
      await writeRun(root, run);
      deps.onEvent(`${label} started: ${clip(item.text)}`);
      message = brief(run, item);
    }
    const stopped = await driveItem(root, run, item, label, deps, message);
    if (stopped) return stopped;
    message = null;
    run.current += 1;
    await writeRun(root, run);
  }
  run.status = "done";
  run.reason = null;
  await writeRun(root, run);
  deps.onEvent(`run ${run.id} done: ${run.items.length} ${run.items.length === 1 ? "item" : "items"} closed (${spent(run)})`);
  return run;
}

function requireHost(deps) {
  try {
    deps.host.resolve();
  } catch (error) {
    throw new AutoError("host-not-found", `the ${deps.host.name} host cannot run: ${error.message}`, "install it and sign in, then run again");
  }
}

// The cost cap takes a host that reports its cost, the token cap one that does not.
function limitsFrom({ maxTurns, maxCostUsd, maxTokens }, base, host) {
  const limits = { ...base };
  if (maxTurns !== undefined) {
    if (!Number.isSafeInteger(maxTurns) || maxTurns < 1) throw new AutoError("invalid-limit", `--max-turns must be a whole number of turns from 1, got ${maxTurns}`);
    limits.max_turns = maxTurns;
  }
  if (maxCostUsd !== undefined) {
    if (!host.reportsCost) throw new AutoError("invalid-limit", `${host.name} reports no cost: cap the run with --max-tokens`);
    if (!Number.isFinite(maxCostUsd) || maxCostUsd <= 0) throw new AutoError("invalid-limit", `--max-cost-usd must be a positive amount, got ${maxCostUsd}`);
    limits.max_cost_usd = maxCostUsd;
  }
  if (maxTokens !== undefined) {
    if (host.reportsCost) throw new AutoError("invalid-limit", `${host.name} reports its cost: cap the run with --max-cost-usd`);
    if (!Number.isSafeInteger(maxTokens) || maxTokens < 1) throw new AutoError("invalid-limit", `--max-tokens must be a whole number from 1, got ${maxTokens}`);
    limits.max_tokens = maxTokens;
  }
  return limits;
}

function refuseHost(name) {
  const reason = unavailableReason(name);
  if (reason) throw new AutoError("host-unavailable", `ospec auto cannot drive ${JSON.stringify(name)}: ${reason}`);
}

function refuseActive(run) {
  throw new AutoError("run-active", `the automatic run ${run.id} is ${run.status}: one run at a time per repository`, run.status === "running" ? `stop it with ospec auto stop --run ${run.id}` : `continue it with ospec auto resume --run ${run.id}, or stop it with ospec auto stop --run ${run.id}`);
}

/**
 * Starts a run of `items` on `host` and drives it until it is done or stops.
 * `deps.host` is the host adapter (auto-hosts.js); the other deps default to
 * the real git, ospec, checks and clock.
 */
async function startRun({ root, items, host, model = null, maxTurns, maxCostUsd, maxTokens, deps: given = {} }) {
  const deps = dependencies(root, given);
  refuseHost(host);
  if (!Array.isArray(items) || items.length === 0 || items.length > MAX_ITEMS) throw new AutoError("invalid-items", `a run takes 1 to ${MAX_ITEMS} items, got ${items?.length ?? 0}`);
  const blank = items.findIndex((text) => typeof text !== "string" || text.trim() === "");
  if (blank !== -1) throw new AutoError("invalid-items", `item ${blank + 1} is empty: each --item is the request of one change`);
  const limits = limitsFrom({ maxTurns, maxCostUsd, maxTokens }, DEFAULT_LIMITS, deps.host);
  const active = activeRun(root, deps.alive);
  if (active) refuseActive(active);
  const open = await openChanges(root);
  if (open.length > 0) throw new AutoError("open-change", `IDD change ${open.map((state) => state.change).join(", ")} is open: a run starts with none`, "close or abandon it first");
  const branch = deps.git(["branch", "--show-current"]).stdout.trim();
  if (!branch) throw new AutoError("detached-head", "HEAD is detached: the run commits each change on a branch", "switch to a branch first: git switch -c <type>/<name>");
  if (defaultBranches(deps.git).includes(branch)) throw new AutoError("default-branch", `${branch} is the default branch: the run commits each change, and never there`, "create a branch for the run first: git switch -c <type>/<name>");
  const dirty = treeStatus(deps.git);
  if (dirty.length > 0) throw new AutoError("dirty-tree", `the working tree has ${dirty.length} uncommitted ${dirty.length === 1 ? "path" : "paths"}: each change of the run starts clean`, "commit or stash them first");
  requireHost(deps);
  const failing = deps.failingCheck();
  if (failing) throw new AutoError("checks-failing", `check ${failing.name} fails on HEAD (${failing.command}): the run starts from green checks`, "fix it first, as its own change");

  const created = deps.now();
  const run = {
    schema: RUN_SCHEMA,
    id: newRunId(created),
    host,
    model,
    branch,
    limits,
    spend: deps.host.reportsCost ? "cost" : "tokens",
    status: "running",
    reason: null,
    pid: deps.pid,
    created_at: created.toISOString(),
    current: 0,
    items: items.map((text) => ({ text, status: "pending", change: null, session_id: null, turns: 0, cost_usd: 0, ...(deps.host.reportsCost ? {} : { tokens: 0 }), delegated: 0, commit: null })),
  };
  if (fs.existsSync(path.join(runDir(root, run.id), "run.json"))) throw new AutoError("run-active", `the automatic run ${run.id} already exists`, "wait a second and start again");
  await writeRun(root, run);
  const cap = limits.max_tokens !== undefined ? `and ${tokenCount(limits.max_tokens)} tokens` : limits.max_cost_usd !== undefined ? `and ${money(limits.max_cost_usd)}` : "with no spending cap";
  const review = deps.host.reviewsActions ? "" : `; ${host} runs every action its configuration does not deny, without review`;
  deps.onEvent(`run ${run.id} started: ${items.length} ${items.length === 1 ? "item" : "items"} on ${host} (at most ${limits.max_turns} turns per item ${cap}${review})`);
  return drive(root, run, deps);
}

/** Continues a run that stopped, with the user's answer to its block when given. */
async function resumeRun({ root, id, answer, maxTurns, maxCostUsd, maxTokens, deps: given = {} }) {
  const deps = dependencies(root, given);
  const run = selectRun(root, id);
  if (run.status === "done") throw new AutoError("run-done", `the automatic run ${run.id} is done: every item is closed`, "start a new one with ospec auto start");
  refuseHost(run.host);
  if (run.status === "running" && !isStale(run, deps.alive)) refuseActive(run);
  const other = activeRun(root, deps.alive);
  if (other && other.id !== run.id) refuseActive(other);
  run.limits = limitsFrom({ maxTurns, maxCostUsd, maxTokens }, run.limits, deps.host);
  const item = run.items[run.current];
  if (answer !== undefined) {
    if (typeof answer !== "string" || answer.trim() === "") throw new AutoError("invalid-answer", "--answer is the user's answer: it cannot be empty");
    if (!item || item.status !== "running" || !item.session_id) throw new AutoError("invalid-answer", `item ${run.current + 1} of ${run.id} has no session to answer in`, "resume without --answer");
  } else if (run.status === "blocked" && item?.change) {
    const step = deps.ospec(["next", "--change", item.change]).json?.next_step;
    if (step?.action === "resolve-gate") {
      throw new AutoError("still-blocked", `gate ${step.gate} of ${item.change} is still open: the run waits for the user's answer`, `answer with ospec auto resume --answer "<your answer>"${item.session_id && deps.host.resumeCommand ? `, or in the session: ${deps.host.resumeCommand(item.session_id)}` : ""}`);
    }
  }
  requireHost(deps);
  deps.onEvent(`run ${run.id} resumed at item ${Math.min(run.current + 1, run.items.length)}/${run.items.length}`);
  return drive(root, run, deps, answer === undefined ? null : answer);
}

/**
 * Stops the run: a running conductor ends its turn in progress and stops; a
 * run waiting for the user, or one whose conductor is gone, stops at once.
 */
async function stopRun({ root, id, deps: given = {} }) {
  const deps = dependencies(root, given);
  const run = selectRun(root, id);
  if (run.status === "running" && !isStale(run, deps.alive)) {
    requestStop(root, run.id);
    return { run, stopping: true };
  }
  if (!["running", "blocked", "paused"].includes(run.status)) throw new AutoError("run-not-active", `the automatic run ${run.id} is ${run.status}: there is nothing to stop`);
  run.status = "stopped";
  run.reason = "stop-requested";
  await writeRun(root, run);
  return { run, stopping: false };
}

module.exports = { DEFAULT_LIMITS, allRecommended, brief, defaultBranches, resumeRun, runCost, runTokens, spent, startRun, stopRun };
