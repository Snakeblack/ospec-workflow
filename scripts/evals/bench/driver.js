"use strict";

// Drives one scenario through one arm with a real agent host:
// 1. materialize the seed repository as a git repository;
// 2. set the project up once (the arm's setup prompts), outside the measurement;
// 3. request the change and keep the conversation going (the persona answers
//    every turn that ends without the change being finished) until the arm
//    says the change is done, or a turn or cost limit stops it;
// 4. judge the delivered workspace with the scenario's hidden checks.
// A host that reports no cost (agy) caps tokens instead (`maxTokens`); a limit
// left undefined does not apply.
// Host errors resume the session without the persona; two in a row stop it.
// A persona that fails twice in a row (`persona-error`, each call already
// retried) stops the run unjudged: nobody would answer the agent's questions.
// An exhausted usage quota stops at once (`host-quota`): the caller ends the
// whole bench run there, because every later turn would fail the same way.
// Only a change that was actually requested is judged; a voided setup leaves
// the seed, which is not the arm's delivery.
// A turn whose tools reached outside the run's own directory (`escapes`, from
// the agy host) voids the run (`workspace-escape`): it is neither judged nor
// counted, because the agent may have read another run's delivery.

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const { listFiles, materializeRepo } = require("./scenarios.js");
const { runChecks } = require("./checks.js");
const { addUsage, emptyUsage, tokenTotal } = require("./transcript.js");

const DEFAULT_LIMITS = Object.freeze({ maxAgentTurns: 30, maxSetupTurns: 6, maxCostUsd: 25 });
const RESUME_AFTER_ERROR = "Continúa donde lo dejaste.";
const TEXT_LIMIT = 1500;
const QUESTION_KINDS = new Set(["question", "approval"]);
// Reasons that leave nothing to judge: the run is not the arm's delivery.
const VOIDED = Object.freeze(["host-quota", "workspace-escape", "persona-error"]);
const SETUP_BRIEF = "Prepara el proyecto para trabajar con ospec-workflow. Todavía no hay ningún cambio que hacer.";

function defaultGit(cwd, args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr || result.error}`);
  return result.stdout.trim();
}

function clip(text) {
  const value = String(text || "");
  return value.length > TEXT_LIMIT ? `${value.slice(0, TEXT_LIMIT)}…` : value;
}

const round = (value) => Math.round(value * 1e6) / 1e6;
const fileList = (output) => (output ? output.split("\n").map((file) => file.trim()).filter(Boolean).sort() : []);

function prepareWorkspace(scenario, workspaceRoot, git) {
  fs.rmSync(workspaceRoot, { recursive: true, force: true });
  materializeRepo(scenario, workspaceRoot);
  git(workspaceRoot, ["init", "-q", "-b", "main"]);
  git(workspaceRoot, ["config", "user.name", "bench"]);
  git(workspaceRoot, ["config", "user.email", "bench@example.invalid"]);
  git(workspaceRoot, ["config", "commit.gpgsign", "false"]);
  // ospec's session data (.ospec/) is never versioned, as in an installed
  // project; the exclude keeps it out of every commit whatever the plugin does.
  fs.mkdirSync(path.join(workspaceRoot, ".git", "info"), { recursive: true });
  fs.appendFileSync(path.join(workspaceRoot, ".git", "info", "exclude"), "\n.ospec/\n");
  git(workspaceRoot, ["add", "-A"]);
  git(workspaceRoot, ["commit", "-q", "-m", "base"]);
  return git(workspaceRoot, ["rev-parse", "HEAD"]);
}

function snapshotCommit(workspaceRoot, git, message) {
  git(workspaceRoot, ["add", "-A"]);
  git(workspaceRoot, ["commit", "-q", "--allow-empty", "--no-verify", "-m", message]);
  return git(workspaceRoot, ["rev-parse", "HEAD"]);
}

function emptyConversation() {
  return {
    status: "incomplete",
    reason: null,
    agent_turns: 0,
    model_turns: 0,
    usage: emptyUsage(),
    cost_usd: 0,
    duration_ms: 0,
    subagents: 0,
    questions: 0,
    decision_changing_questions: 0,
    interventions: 0,
    host_errors: 0,
    facts_disclosed: [],
    persona: { usage: emptyUsage(), cost_usd: 0, errors: 0, unknown_facts: [] },
    conversation: [],
    transcripts: [],
  };
}

async function converse({ host, persona, prompt, cwd, runDir, label, maxTurns, maxCostUsd, maxTokens, isDone }) {
  const state = emptyConversation();
  let sessionId = null;
  let message = prompt;
  let consecutiveErrors = 0;
  let consecutivePersonaErrors = 0;

  for (;;) {
    state.agent_turns += 1;
    const transcriptPath = path.join(runDir, `${label}-${String(state.agent_turns).padStart(2, "0")}.jsonl`);
    const turn = await host.turn({ cwd, prompt: message, sessionId, transcriptPath });
    sessionId = turn.session_id || sessionId;
    state.model_turns += turn.agent_turns;
    state.usage = addUsage(state.usage, turn.usage);
    state.cost_usd = round(state.cost_usd + turn.cost_usd);
    state.duration_ms += turn.wall_ms;
    state.subagents += turn.subagents;
    state.transcripts.push({ label, turn: state.agent_turns, sha256: turn.sha256 });
    state.conversation.push({ role: "agent", text: clip(turn.final_text), tokens: tokenTotal(turn.usage), ...(turn.is_error ? { error: turn.error } : {}) });

    if (turn.escapes && turn.escapes.length > 0) {
      state.reason = "workspace-escape";
      state.escapes = turn.escapes.map((escape) => ({ label, turn: state.agent_turns, ...escape }));
      return state;
    }
    if (isDone()) {
      state.status = "complete";
      return state;
    }
    if (turn.quota_exhausted) {
      state.host_errors += 1;
      state.reason = "host-quota";
      return state;
    }
    if (state.agent_turns >= maxTurns) {
      state.reason = label === "setup" ? "setup-incomplete" : "max-agent-turns";
      return state;
    }
    if (maxCostUsd != null && state.cost_usd >= maxCostUsd) {
      state.reason = "max-cost";
      return state;
    }
    if (maxTokens != null && tokenTotal(state.usage) >= maxTokens) {
      state.reason = "max-tokens";
      return state;
    }
    if (turn.is_error) {
      state.host_errors += 1;
      consecutiveErrors += 1;
      if (consecutiveErrors >= 2 || !sessionId) {
        state.reason = "host-error";
        return state;
      }
      message = RESUME_AFTER_ERROR;
      continue;
    }
    consecutiveErrors = 0;

    const { reply, usage, cost_usd: personaCost, error } = await host.persona({ ...persona, message: turn.final_text });
    state.persona.usage = addUsage(state.persona.usage, usage);
    state.persona.cost_usd = round(state.persona.cost_usd + personaCost);
    if (error) state.persona.errors += 1;
    consecutivePersonaErrors = error ? consecutivePersonaErrors + 1 : 0;
    if (consecutivePersonaErrors >= 2) {
      state.reason = "persona-error";
      state.persona_error = error;
      return state;
    }
    state.persona.unknown_facts.push(...(reply.unknown_facts || []));
    state.interventions += 1;
    if (QUESTION_KINDS.has(reply.kind)) {
      state.questions += 1;
      if (reply.facts_disclosed.length > 0 || reply.deviates_from_recommendation) state.decision_changing_questions += 1;
    }
    for (const fact of reply.facts_disclosed) if (!state.facts_disclosed.includes(fact)) state.facts_disclosed.push(fact);
    state.conversation.push({
      role: "user",
      kind: reply.kind,
      text: clip(reply.answer),
      facts_disclosed: reply.facts_disclosed,
      deviates_from_recommendation: reply.deviates_from_recommendation,
    });
    message = reply.answer;
  }
}

/**
 * @returns {Promise<object>} One run entry of a bench record.
 */
async function runScenario({
  scenario,
  arm,
  host,
  workspaceRoot,
  runDir,
  limits = DEFAULT_LIMITS,
  git = defaultGit,
  checks = runChecks,
}) {
  const bounds = { ...DEFAULT_LIMITS, ...limits };
  fs.mkdirSync(runDir, { recursive: true });
  const seedCommit = prepareWorkspace(scenario, workspaceRoot, git);
  const setupPersona = { scenario: { ...scenario, brief: SETUP_BRIEF, facts: [] }, goal: arm.setupGoal };

  let setup = null;
  for (const [index, prompt] of arm.setupPrompts.entries()) {
    setup = await converse({
      host, persona: setupPersona, prompt, cwd: workspaceRoot, runDir, label: index === 0 ? "setup" : `setup${index + 1}`,
      maxTurns: bounds.maxSetupTurns, maxCostUsd: bounds.maxCostUsd, maxTokens: bounds.maxTokens, isDone: () => arm.isSetupDone(workspaceRoot),
    });
    if (setup.status !== "complete") break;
  }
  const setupSummary = setup && {
    status: setup.status,
    reason: setup.reason,
    agent_turns: setup.agent_turns,
    usage: setup.usage,
    cost_usd: setup.cost_usd,
    duration_ms: setup.duration_ms,
    interventions: setup.interventions,
  };
  const base = snapshotCommit(workspaceRoot, git, "setup");
  // Setup may add its own files (openspec/, settings) but never edit the seed.
  const seedFiles = new Set(listFiles(scenario.repoDir));
  const setupChanged = git(workspaceRoot, ["diff", "--name-only", seedCommit, base]);
  const modifiedSeed = fileList(setupChanged).filter((file) => seedFiles.has(file));
  if (setupSummary) setupSummary.modified_seed = modifiedSeed;

  const setupReason = setup && VOIDED.includes(setup.reason) ? setup.reason : "setup-incomplete";
  const skipReason = setup && setup.status !== "complete" ? setupReason : modifiedSeed.length > 0 ? "setup-modified-seed" : null;
  let change;
  try {
    change = skipReason
      ? { ...emptyConversation(), reason: skipReason, ...(setup && setup.escapes ? { escapes: setup.escapes } : {}), ...(setup && setup.persona_error ? { persona_error: setup.persona_error } : {}) }
      : await converse({
        host, persona: { scenario, goal: arm.goal }, prompt: arm.changePrompt(scenario), cwd: workspaceRoot, runDir, label: "change",
        maxTurns: bounds.maxAgentTurns, maxCostUsd: bounds.maxCostUsd, maxTokens: bounds.maxTokens, isDone: () => arm.isComplete(workspaceRoot, base),
      });
  } finally {
    if (host.release) host.release(workspaceRoot);
  }

  git(workspaceRoot, ["add", "-A"]);
  const changedFiles = fileList(git(workspaceRoot, ["diff", "--cached", "--name-only", base]));
  const judged = !skipReason && !VOIDED.includes(change.reason);
  const results = judged ? checks(scenario, workspaceRoot) : [];

  return {
    scenario_id: scenario.id,
    profile: scenario.profile,
    status: change.status,
    reason: change.reason,
    setup: setupSummary,
    metrics: {
      usage: change.usage,
      tokens_total: tokenTotal(change.usage),
      cost_usd: change.cost_usd,
      duration_ms: change.duration_ms,
      agent_turns: change.agent_turns,
      model_turns: change.model_turns,
      subagents: change.subagents,
      questions: change.questions,
      decision_changing_questions: change.decision_changing_questions,
      interventions: change.interventions,
      host_errors: change.host_errors,
    },
    persona: change.persona,
    checks: results,
    escaped_defects: results.filter((result) => !result.pass).length,
    facts_disclosed: change.facts_disclosed.slice().sort(),
    changed_files: changedFiles,
    open_facts: judged && arm.openFacts ? arm.openFacts(workspaceRoot, base) : null,
    conversation: change.conversation,
    transcripts: [...(setup ? setup.transcripts : []), ...change.transcripts],
    ...(change.escapes ? { escapes: change.escapes } : {}),
    ...(change.persona_error ? { persona_error: change.persona_error } : {}),
  };
}

module.exports = { DEFAULT_LIMITS, prepareWorkspace, runScenario };
