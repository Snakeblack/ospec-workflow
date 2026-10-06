"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { main, parseArgs } = require("./bench.js");

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "bench-cli-"));
}

function output() {
  let text = "";
  return { write: (chunk) => { text += chunk; }, get text() { return text; } };
}

function fakeRun(scenarioId, profile, { status = "complete", failing = [] } = {}) {
  const checks = [{ id: "a", kind: "acceptance", fact: null, pass: !failing.includes("a") }];
  return {
    scenario_id: scenarioId,
    profile,
    status,
    reason: status === "complete" ? null : "max-cost",
    setup: null,
    metrics: {
      usage: { input: 1, output: 1, cache_read: 1, cache_creation: 1 },
      tokens_total: 4,
      cost_usd: 0.1,
      duration_ms: 10,
      agent_turns: 1,
      model_turns: 1,
      subagents: 0,
      questions: 0,
      decision_changing_questions: 0,
      interventions: 0,
      host_errors: 0,
    },
    persona: { usage: { input: 0, output: 0, cache_read: 0, cache_creation: 0 }, cost_usd: 0, errors: 0, unknown_facts: [] },
    checks,
    escaped_defects: failing.length,
    facts_disclosed: [],
    changed_files: [],
    conversation: [],
    transcripts: [],
  };
}

function deps(dir, overrides = {}) {
  const calls = { runs: [], workspaces: [] };
  return {
    calls,
    stdout: output(),
    stderr: output(),
    now: () => new Date("2026-10-06T10:00:00Z"),
    resolveExecutable: () => "claude.exe",
    buildPlugin: () => ({ pluginDir: path.join(dir, "plugin"), version: "2.103.0", digest: "a".repeat(64) }),
    createHost: () => ({ name: "claude-code", version: () => "2.1.286 (Claude Code)" }),
    runScenario: async ({ scenario, workspaceRoot }) => {
      calls.runs.push(scenario.id);
      calls.workspaces.push(workspaceRoot);
      return fakeRun(scenario.id, scenario.profile);
    },
    ...overrides,
  };
}

test("parseArgs reads the command and its options", () => {
  const args = parseArgs(["run", "--arm", "sdd", "--record", "r1", "--scenario", "bugfix", "--scenario", "cli-local", "--max-cost", "5"]);
  assert.equal(args.command, "run");
  assert.equal(args.arm, "sdd");
  assert.deepEqual(args.scenarios, ["bugfix", "cli-local"]);
  assert.equal(args.maxCostUsd, 5);
  assert.throws(() => parseArgs(["run", "--bogus"]), /unknown option/);
});

test("list prints every scenario and the corpus digest", async () => {
  const d = deps(tempDir());
  assert.equal(await main(["list"], d), 0);
  for (const id of ["cli-local", "saas-small", "regulated", "brownfield", "public-library", "bugfix"]) assert.match(d.stdout.text, new RegExp(id));
  assert.match(d.stdout.text, /digest [a-f0-9]{64}/);
});

test("run requires the bench configuration directory to exist", async () => {
  const dir = tempDir();
  const d = deps(dir);
  const code = await main(["run", "--arm", "sdd", "--record", "r1", "--config-dir", path.join(dir, "missing"), "--records-dir", dir, "--runs-dir", dir, "--workspaces-dir", dir], d);
  assert.equal(code, 2);
  assert.match(d.stderr.text, /CLAUDE_CONFIG_DIR/);
});

test("run writes the record after each scenario and resumes skipping complete runs", async () => {
  const dir = tempDir();
  const common = ["run", "--arm", "sdd", "--record", "r1", "--config-dir", dir, "--records-dir", dir, "--runs-dir", dir, "--workspaces-dir", dir, "--scenario", "bugfix", "--scenario", "cli-local"];
  const first = deps(dir);
  assert.equal(await main(common, first), 0);
  assert.deepEqual(first.calls.runs, ["cli-local", "bugfix"]);
  const record = JSON.parse(fs.readFileSync(path.join(dir, "r1.json"), "utf8"));
  assert.deepEqual(record.runs.map((run) => run.scenario_id), ["cli-local", "bugfix"]);
  assert.equal(record.host.model, "claude-sonnet-5-5");
  assert.equal(record.host.cli_version, "2.1.286");
  assert.equal(record.persona.model, "claude-sonnet-5-5");
  assert.match(record.harness_digest, /^[a-f0-9]{64}$/);

  const second = deps(dir);
  assert.equal(await main(common, second), 0);
  assert.deepEqual(second.calls.runs, []);

  const forced = deps(dir);
  assert.equal(await main([...common, "--force"], forced), 0);
  assert.deepEqual(forced.calls.runs, ["cli-local", "bugfix"]);

  const otherPlugin = deps(dir, { buildPlugin: () => ({ pluginDir: dir, version: "2.104.0", digest: "f".repeat(64) }) });
  assert.equal(await main(common, otherPlugin), 2);
  assert.match(otherPlugin.stderr.text, /plugin/);
});

test("report and checkpoint read records from disk", async () => {
  const dir = tempDir();
  const write = (id, arm, runs) => fs.writeFileSync(path.join(dir, `${id}.json`), JSON.stringify({
    schema_version: 1,
    record_id: id,
    arm,
    recorded_at: "2026-10-06T10:00:00Z",
    host: { name: "claude-code", cli_version: "2.1.286", model: "claude-sonnet-5-5", effort: null, plugin_version: "2.103.0", plugin_digest: "a".repeat(64) },
    persona: { model: "claude-haiku-4-5-20251001" },
    scenarios_digest: "b".repeat(64),
    harness_digest: "f".repeat(64),
    limits: {},
    runs,
  }));
  write("base", "sdd", [fakeRun("bugfix", "bugfix")]);
  write("cand", "idd", [fakeRun("bugfix", "bugfix", { failing: ["a"] })]);

  const report = deps(dir);
  assert.equal(await main(["report", "--record", "base", "--records-dir", dir], report), 0);
  assert.match(report.stdout.text, /\| bugfix \|/);

  const checkpoint = deps(dir);
  assert.equal(await main(["checkpoint", "--baseline", "base", "--candidate", "cand", "--records-dir", dir], checkpoint), 1);
  assert.match(checkpoint.stdout.text, /revise/);
  assert.match(checkpoint.stdout.text, /check-regression/);
});

test("run --repetitions runs every scenario once per repetition, repetition by repetition", async () => {
  const dir = tempDir();
  const common = ["run", "--arm", "sdd", "--record", "r3", "--repetitions", "2", "--config-dir", dir, "--records-dir", dir, "--runs-dir", dir, "--workspaces-dir", dir, "--scenario", "bugfix", "--scenario", "cli-local"];
  const first = deps(dir);
  assert.equal(await main(common, first), 0);
  assert.deepEqual(first.calls.runs, ["cli-local", "bugfix", "cli-local", "bugfix"]);
  assert.equal(new Set(first.calls.workspaces).size, 4, "each repetition gets its own workspace");
  const record = JSON.parse(fs.readFileSync(path.join(dir, "r3.json"), "utf8"));
  assert.equal(record.schema_version, 2);
  assert.equal(record.repetitions, 2);
  assert.deepEqual(record.runs.map((run) => `${run.scenario_id}#${run.repetition}`), ["cli-local#1", "cli-local#2", "bugfix#1", "bugfix#2"]);
  assert.match(first.stdout.text, /Mean per scenario/);

  const resumed = deps(dir);
  assert.equal(await main(common, resumed), 0);
  assert.deepEqual(resumed.calls.runs, []);
  const otherCount = deps(dir);
  assert.equal(await main(common.map((arg) => (arg === "2" ? "3" : arg)), otherCount), 2);
  assert.match(otherCount.stderr.text, /repetitions/);
});

test("an exhausted host quota stops the whole run without recording the interrupted scenario", async () => {
  const dir = tempDir();
  const common = ["run", "--arm", "sdd", "--record", "rq", "--config-dir", dir, "--records-dir", dir, "--runs-dir", dir, "--workspaces-dir", dir, "--scenario", "bugfix", "--scenario", "cli-local"];
  const limited = deps(dir, {
    runScenario: async ({ scenario }) => (scenario.id === "cli-local"
      ? fakeRun(scenario.id, scenario.profile)
      : { ...fakeRun(scenario.id, scenario.profile, { status: "incomplete" }), reason: "host-quota", checks: [], escaped_defects: 0, conversation: [{ role: "agent", text: "You've hit your session limit · resets 11:20am" }] }),
  });
  assert.equal(await main(common, limited), 3);
  assert.match(limited.stderr.text, /quota/);
  assert.match(limited.stderr.text, /resets 11:20am/);
  const record = JSON.parse(fs.readFileSync(path.join(dir, "rq.json"), "utf8"));
  assert.deepEqual(record.runs.map((run) => run.scenario_id), ["cli-local"]);

  const resumed = deps(dir);
  assert.equal(await main(common, resumed), 0);
  assert.deepEqual(resumed.calls.runs, ["bugfix"]);
});
