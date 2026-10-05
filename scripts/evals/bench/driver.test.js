"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { ARMS, armFor } = require("./arms.js");
const { runScenario } = require("./driver.js");

const scenario = {
  id: "cli-local",
  profile: "cli-local",
  brief: "Quiero prioridades.",
  facts: [{ id: "F1", text: "Por defecto, media." }],
  checks: [],
};

function seedRepo() {
  const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), "bench-seed-"));
  fs.writeFileSync(path.join(repoDir, "index.js"), "module.exports = 1;\n");
  return { ...scenario, repoDir };
}

function usage(n) {
  return { input: n, output: n, cache_read: n, cache_creation: n };
}

// A scripted host: each agent turn runs `effects[i]` in the workspace and
// returns `texts[i]`; the persona replies from `replies` in order.
function fakeHost({ texts, effects = [], replies = [], errors = [] }) {
  const calls = { turns: [], persona: [] };
  let index = 0;
  let replyIndex = 0;
  return {
    calls,
    async turn({ cwd, prompt, sessionId, transcriptPath }) {
      const i = index;
      index += 1;
      calls.turns.push({ prompt, sessionId });
      if (effects[i]) effects[i](cwd);
      fs.mkdirSync(path.dirname(transcriptPath), { recursive: true });
      fs.writeFileSync(transcriptPath, `turn ${i}\n`);
      return {
        session_id: "session-1",
        final_text: texts[i] || "",
        usage: usage(10),
        cost_usd: 0.25,
        duration_ms: 900,
        wall_ms: 1000,
        agent_turns: 2,
        subagents: 1,
        is_error: Boolean(errors[i]),
        error: errors[i],
        sha256: "a".repeat(64),
      };
    },
    async persona({ scenario: seen, goal, message }) {
      calls.persona.push(message);
      calls.personaContext = calls.personaContext || [];
      calls.personaContext.push({ brief: seen.brief, facts: seen.facts.length, goal });
      const reply = replies[replyIndex] || { kind: "stopped", answer: "Continúa.", facts_disclosed: [], deviates_from_recommendation: false, unknown_facts: [] };
      replyIndex += 1;
      return { reply, usage: usage(1), cost_usd: 0.01, error: null };
    },
  };
}

const archive = (cwd) => fs.mkdirSync(path.join(cwd, "openspec", "changes", "archive", "2026-10-06-prioridades"), { recursive: true });
const initConfig = (cwd) => {
  fs.mkdirSync(path.join(cwd, "openspec"), { recursive: true });
  fs.writeFileSync(path.join(cwd, "openspec", "config.yaml"), "schema: spec-driven\n");
};
const writeCode = (cwd) => fs.writeFileSync(path.join(cwd, "index.js"), "module.exports = 2;\n");

function dirs() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "bench-driver-"));
  return { workspaceRoot: path.join(base, "ws"), runDir: path.join(base, "run") };
}

test("the sdd arm runs setup, then the change until it is archived, counting the user's turns", async () => {
  const host = fakeHost({
    texts: ["Proyecto inicializado.", "¿Qué prioridad por defecto? Recomiendo media.", "Hecho y archivado."],
    effects: [initConfig, writeCode, archive],
    replies: [{ kind: "question", answer: "Media.", facts_disclosed: ["F1"], deviates_from_recommendation: false, unknown_facts: [] }],
  });
  const checks = () => [{ id: "a", kind: "acceptance", fact: null, pass: true }, { id: "b", kind: "fact", fact: "F1", pass: false, error: "x" }];
  const run = await runScenario({ scenario: seedRepo(), arm: armFor("sdd"), host, ...dirs(), checks });

  assert.equal(run.status, "complete");
  assert.equal(run.setup.status, "complete");
  assert.equal(run.setup.agent_turns, 1);
  assert.equal(host.calls.turns[0].prompt, "/ospec-workflow:sdd-init");
  assert.equal(host.calls.turns[1].prompt, "/ospec-workflow:sdd-new Quiero prioridades.");
  assert.equal(host.calls.turns[1].sessionId, null, "the change starts a fresh session");
  assert.equal(host.calls.turns[2].sessionId, "session-1");
  assert.equal(host.calls.turns[2].prompt, "Media.");

  assert.equal(run.metrics.agent_turns, 2);
  assert.equal(run.metrics.model_turns, 4);
  assert.equal(run.metrics.questions, 1);
  assert.equal(run.metrics.decision_changing_questions, 1);
  assert.equal(run.metrics.interventions, 1);
  assert.deepEqual(run.metrics.usage, usage(20));
  assert.equal(run.metrics.tokens_total, 80);
  assert.equal(run.metrics.cost_usd, 0.5);
  assert.equal(run.metrics.duration_ms, 2000);
  assert.equal(run.metrics.subagents, 2);
  assert.deepEqual(run.facts_disclosed, ["F1"]);
  assert.equal(run.escaped_defects, 1);
  assert.deepEqual(run.changed_files, ["index.js"]);
  assert.equal(run.transcripts.length, 3);
  assert.equal(run.persona.cost_usd, 0.01);
  assert.deepEqual(run.conversation.map((entry) => entry.role), ["agent", "user", "agent"]);
});

test("a change that never archives stops at the turn limit as incomplete and is still judged", async () => {
  const host = fakeHost({ texts: ["init", "paso 1", "paso 2", "paso 3"], effects: [initConfig] });
  let judged = false;
  const run = await runScenario({
    scenario: seedRepo(),
    arm: armFor("sdd"),
    host,
    ...dirs(),
    limits: { maxAgentTurns: 3, maxCostUsd: 100 },
    checks: () => { judged = true; return []; },
  });
  assert.equal(run.status, "incomplete");
  assert.equal(run.reason, "max-agent-turns");
  assert.equal(run.metrics.agent_turns, 3);
  assert.equal(run.metrics.interventions, 2);
  assert.equal(run.metrics.questions, 0);
  assert.ok(judged);
});

test("the cost limit stops a run", async () => {
  const host = fakeHost({ texts: ["init", "uno", "dos"], effects: [initConfig] });
  const run = await runScenario({
    scenario: seedRepo(), arm: armFor("sdd"), host, ...dirs(), limits: { maxAgentTurns: 30, maxCostUsd: 0.5 }, checks: () => [],
  });
  assert.equal(run.status, "incomplete");
  assert.equal(run.reason, "max-cost");
  assert.equal(run.metrics.agent_turns, 2);
});

test("host errors resume without the persona and two in a row stop the run", async () => {
  const host = fakeHost({ texts: ["init", "", "", ""], effects: [initConfig], errors: [undefined, "error_during_execution", "error_during_execution"] });
  const run = await runScenario({ scenario: seedRepo(), arm: armFor("sdd"), host, ...dirs(), checks: () => [] });
  assert.equal(run.status, "incomplete");
  assert.equal(run.reason, "host-error");
  assert.equal(run.metrics.host_errors, 2);
  assert.equal(run.metrics.interventions, 0);
  assert.equal(host.calls.persona.length, 0);
});

test("a setup that never produces its config makes the run incomplete before the change", async () => {
  const host = fakeHost({ texts: ["no pude", "sigo sin poder", "nada"] });
  const run = await runScenario({
    scenario: seedRepo(), arm: armFor("sdd"), host, ...dirs(), limits: { maxAgentTurns: 30, maxCostUsd: 100, maxSetupTurns: 2 }, checks: () => [],
  });
  assert.equal(run.status, "incomplete");
  assert.equal(run.reason, "setup-incomplete");
  assert.equal(host.calls.turns.length, 2);
});

test("the setup persona never sees the change request, its facts, or its goal", async () => {
  const host = fakeHost({ texts: ["¿Qué escala?", "Inicializado.", "Hecho."], effects: [null, initConfig, archive] });
  await runScenario({ scenario: seedRepo(), arm: armFor("sdd"), host, ...dirs(), checks: () => [] });
  const [setupContext] = host.calls.personaContext;
  assert.doesNotMatch(setupContext.brief, /prioridades/);
  assert.equal(setupContext.facts, 0);
  assert.equal(setupContext.goal, armFor("sdd").setupGoal);
});

test("a setup that edits the seed is incomplete and the change is not requested", async () => {
  const host = fakeHost({ texts: ["Inicializado y de paso arreglado.", "no debería llegar"], effects: [(cwd) => { initConfig(cwd); writeCode(cwd); }] });
  const run = await runScenario({ scenario: seedRepo(), arm: armFor("sdd"), host, ...dirs(), checks: () => [] });
  assert.equal(run.status, "incomplete");
  assert.equal(run.reason, "setup-modified-seed");
  assert.deepEqual(run.setup.modified_seed, ["index.js"]);
  assert.equal(host.calls.turns.length, 1);
});

test("the idd arm is declared but unavailable until E1.6", () => {
  assert.equal(ARMS.idd.available, false);
  assert.throws(() => armFor("idd"), /E1\.6/);
  assert.throws(() => armFor("odd"), /unknown arm/);
});
