"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { HOSTS, main, parseArgs } = require("./bench.js");
const { prepareAgentConfig } = require("./hosts/claude.js");

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
    open_facts: null,
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
    prepareAgentConfig: ({ destDir }) => destDir,
    findEngram: () => ({ engram: path.join(dir, "engram") }),
    setupEngram: () => ({ bin: path.join(dir, "engram"), version: "3.4.0" }),
    claudeEngramDigest: () => "e".repeat(64),
    engramMcpBytes: () => 120,
    mcpConfig: () => JSON.stringify({ mcpServers: { engram: { command: "engram" } } }),
    repoCommit: () => "c".repeat(40),
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
  assert.equal(record.host.model, "claude-haiku-5-5");
  assert.equal(record.host.cli_version, "2.1.286");
  assert.equal(record.host.plugin_version, "2.103.0 (engram 3.4.0)");
  assert.equal(record.host.engram_mcp_bytes, 120);
  assert.equal(record.persona.model, "claude-haiku-5-5");
  assert.equal(record.repo_commit, "c".repeat(40));
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
  // Schema 1 runs predate open_facts.
  const legacy = ({ open_facts: _openFacts, ...entry }) => entry;
  write("base", "sdd", [legacy(fakeRun("bugfix", "bugfix"))]);
  write("cand", "idd", [legacy(fakeRun("bugfix", "bugfix", { failing: ["a"] }))]);

  const report = deps(dir);
  assert.equal(await main(["report", "--record", "base", "--records-dir", dir], report), 0);
  assert.match(report.stdout.text, /\| bugfix \|/);

  const checkpoint = deps(dir);
  assert.equal(await main(["checkpoint", "--baseline", "base", "--candidate", "cand", "--records-dir", dir], checkpoint), 1);
  assert.match(checkpoint.stdout.text, /revise/);
  assert.match(checkpoint.stdout.text, /check-regression/);
  assert.match(checkpoint.stdout.text, /quality-missing/);

  const qualityDir = path.join(dir, "quality");
  const arm = { mutation: { score: 80, suite_passes: true } };
  fs.mkdirSync(path.join(qualityDir, "base__cand"), { recursive: true });
  fs.writeFileSync(path.join(qualityDir, "base__cand", "quality.json"), JSON.stringify({ scenarios: { bugfix: { baseline: arm, candidate: arm, judge: { preferred: "tie" } } } }));
  const judged = deps(dir);
  assert.equal(await main(["checkpoint", "--baseline", "base", "--candidate", "cand", "--records-dir", dir, "--quality-dir", qualityDir], judged), 1);
  assert.doesNotMatch(judged.stdout.text, /quality-missing/);
  assert.match(judged.stdout.text, /- Quality: continue/);
});

test("run --repetitions runs every scenario once per repetition, repetition by repetition", async () => {
  const dir = tempDir();
  const common = ["run", "--arm", "sdd", "--record", "r3", "--repetitions", "2", "--config-dir", dir, "--records-dir", dir, "--runs-dir", dir, "--workspaces-dir", dir, "--scenario", "bugfix", "--scenario", "cli-local"];
  const first = deps(dir);
  assert.equal(await main(common, first), 0);
  assert.deepEqual(first.calls.runs, ["cli-local", "bugfix", "cli-local", "bugfix"]);
  assert.equal(new Set(first.calls.workspaces).size, 4, "each repetition gets its own workspace");
  const record = JSON.parse(fs.readFileSync(path.join(dir, "r3.json"), "utf8"));
  assert.equal(record.schema_version, 3);
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

test("setup-gentle-ai installs into the gentle-ai home and explains the login", async () => {
  const dir = tempDir();
  const installs = [];
  const d = deps(dir, {
    installGentleAi: (options) => installs.push(options),
    identifyGentleAi: () => ({ version: "4.1.1 (engram 3.4.0)", digest: "c".repeat(64) }),
  });
  const home = path.join(dir, "home");
  assert.equal(await main(["setup-gentle-ai", "--gentle-ai-bin", "ga", "--engram-bin", "eg", "--gentle-ai-home", home], d), 0);
  assert.deepEqual(installs, [{ gentleAi: path.resolve("ga"), engram: path.resolve("eg"), home }]);
  assert.match(d.stdout.text, /HOME=".*home" claude/);

  const missing = deps(dir);
  assert.equal(await main(["setup-gentle-ai", "--gentle-ai-home", home], missing), 2);
  assert.match(missing.stderr.text, /--gentle-ai-bin/);
});

test("run --arm gentle-ai identifies the gentle-ai install as the plugin and builds no ospec plugin", async () => {
  const dir = tempDir();
  const home = path.join(dir, "home");
  fs.mkdirSync(home);
  fs.writeFileSync(path.join(home, ".claude.json"), JSON.stringify({ mcpServers: { engram: { command: "engram" } } }));
  const common = ["run", "--arm", "gentle-ai", "--record", "g1", "--config-dir", dir, "--gentle-ai-home", home, "--records-dir", dir, "--runs-dir", dir, "--workspaces-dir", dir, "--scenario", "bugfix"];

  const notInstalled = deps(dir, { identifyGentleAi: () => { throw new Error(`no gentle-ai install in ${home}`); } });
  assert.equal(await main(common, notInstalled), 2);
  assert.match(notInstalled.stderr.text, /setup-gentle-ai/);
  assert.deepEqual(notInstalled.calls.runs, [], "nothing runs");

  let hostOptions = null;
  const d = deps(dir, {
    buildPlugin: () => { throw new Error("the gentle-ai arm must not build the ospec plugin"); },
    identifyGentleAi: ({ home: seen }) => ({ version: `4.1.1 (engram 3.4.0) at ${seen}`, digest: "c".repeat(64) }),
    createHost: (options) => {
      hostOptions = options;
      return { name: "claude-code", version: () => "2.1.296 (Claude Code)" };
    },
  });
  assert.equal(await main(common, d), 0);
  assert.equal(hostOptions.pluginDir, null);
  assert.equal(hostOptions.gentleAi.home, home);
  assert.deepEqual(JSON.parse(hostOptions.gentleAi.mcpConfig), { mcpServers: { engram: { command: "engram" } } });
  assert.equal(typeof hostOptions.gentleAi.startEngram, "function");
  assert.equal(hostOptions.configDir, dir, "the persona keeps the bench configuration");
  const record = JSON.parse(fs.readFileSync(path.join(dir, "g1.json"), "utf8"));
  assert.equal(record.arm, "gentle-ai");
  assert.equal(record.host.plugin_version, `4.1.1 (engram 3.4.0) at ${home}`);
  assert.equal(record.host.plugin_digest, "c".repeat(64));
  assert.match(d.stdout.text, /Plugin: gentle-ai 4\.1\.1/);
});

function agyDeps(dir, overrides = {}) {
  const seen = { host: null, ospecHomes: [], engrams: [] };
  const d = deps(dir, {
    engramMcpBytes: () => 42,
    resolveExecutable: () => { throw new Error("agy runs need no claude executable"); },
    buildPlugin: () => { throw new Error("agy runs build no Claude plugin"); },
    createHost: () => { throw new Error("agy runs create no Claude host"); },
    findAgy: () => "/usr/bin/agy",
    findBwrap: () => "/usr/bin/bwrap",
    buildOspecHome: ({ home, engram }) => {
      seen.ospecHomes.push(home);
      seen.engrams.push(engram);
      return { home, version: "2.134.0", digest: "d".repeat(64) };
    },
    createAgyHost: (options) => {
      seen.host = options;
      return { name: "agy", version: () => "1.3.3" };
    },
    ...overrides,
  });
  return { d, seen };
}

test("run --host agy installs ospec for antigravity as the template, with the agy models and a token cap", async () => {
  const dir = tempDir();
  const { d, seen } = agyDeps(dir);
  const args = ["run", "--host", "agy", "--arm", "idd", "--record", "a1", "--config-dir", path.join(dir, "missing"), "--records-dir", dir, "--runs-dir", dir, "--workspaces-dir", dir, "--scenario", "bugfix"];
  assert.equal(await main(args, d), 0, d.stderr.text);
  assert.deepEqual(seen.ospecHomes, [path.join(dir, "a1", "agy-ospec-home")]);
  assert.equal(seen.host.template, path.join(dir, "a1", "agy-ospec-home"));
  assert.equal(seen.host.executable, "/usr/bin/agy");
  assert.equal(seen.host.model, "gemini-3.8-flash-high");
  assert.equal(seen.host.personaModel, "claude-sonnet-5-5-medium");
  assert.equal(seen.host.personaInvoke, null);
  assert.equal(seen.host.gentleAi, null);
  const record = JSON.parse(fs.readFileSync(path.join(dir, "a1.json"), "utf8"));
  assert.deepEqual(record.host, { name: "agy", cli_version: "1.3.3", model: "gemini-3.8-flash-high", effort: null, plugin_version: "2.134.0", plugin_digest: "d".repeat(64), engram_mcp_bytes: 42 });
  assert.deepEqual(seen.engrams, [path.join(dir, "engram")], "the ospec template gets the gentle-ai arm's engram");
  assert.equal(typeof seen.host.engram.startEngram, "function");
  assert.equal(record.persona.model, "claude-sonnet-5-5-medium");
  assert.equal(record.limits.maxTokens, 30000000);
  assert.equal(record.limits.maxCostUsd, null);
});

test("a grok persona on agy is invoked through the Cursor CLI", async () => {
  const dir = tempDir();
  const { d, seen } = agyDeps(dir);
  const args = ["run", "--host", "agy", "--arm", "idd", "--record", "a2", "--persona-model", "grok-4.7-high", "--records-dir", dir, "--runs-dir", dir, "--workspaces-dir", dir, "--scenario", "bugfix"];
  assert.equal(await main(args, d), 0, d.stderr.text);
  assert.equal(typeof seen.host.personaInvoke, "function");
  assert.equal(seen.host.personaModel, "grok-4.7-high");
  const record = JSON.parse(fs.readFileSync(path.join(dir, "a2.json"), "utf8"));
  assert.equal(record.persona.model, "grok-4.7-high");
});

test("run --arm idd builds the plugin without SDD and writes the router only into the agent config", async () => {
  const dir = tempDir();
  const config = path.join(dir, "config");
  const routerDir = path.join(dir, "plugin", "global-instructions");
  fs.mkdirSync(routerDir, { recursive: true });
  fs.mkdirSync(config);
  fs.writeFileSync(path.join(routerDir, "CLAUDE.md"), "# ospec-workflow\n\nrouter\n");
  fs.writeFileSync(path.join(config, "session"), "login");
  let withSdd = null;
  let hostOptions = null;
  let setup = null;
  const d = deps(dir, {
    prepareAgentConfig,
    setupEngram: (options) => {
      setup = options;
      return { bin: path.join(options.home, "bin", "engram"), version: "3.4.0" };
    },
    buildPlugin: ({ withSdd: flag }) => {
      withSdd = flag;
      return { pluginDir: path.join(dir, "plugin"), version: "2.136.0", digest: "a".repeat(64) };
    },
    createHost: (options) => {
      hostOptions = options;
      return { name: "claude-code", version: () => "2.1.286" };
    },
  });
  const code = await main(["run", "--arm", "idd", "--record", "i1", "--config-dir", config, "--records-dir", dir, "--runs-dir", dir, "--workspaces-dir", dir, "--scenario", "bugfix"], d);
  assert.equal(code, 0, d.stderr.text);
  assert.equal(withSdd, false);
  const agentConfig = path.join(dir, "i1", "agent-config");
  assert.equal(hostOptions.agentConfigDir, agentConfig);
  assert.match(fs.readFileSync(path.join(agentConfig, "CLAUDE.md"), "utf8"), /ospec-workflow:router:begin/);
  assert.equal(fs.existsSync(path.join(config, "CLAUDE.md")), false, "the persona configuration stays without the router");
  assert.equal(fs.readFileSync(path.join(agentConfig, "session"), "utf8"), "login");
  // Engram is set up in the agent's copy (OSP-025), with the claude CLI on the PATH for `engram setup`.
  assert.equal(setup.host, "claude");
  assert.equal(setup.env.CLAUDE_CONFIG_DIR, agentConfig);
  assert.equal(setup.env.PATH.split(path.delimiter)[0], path.dirname("claude.exe"));
  assert.equal(hostOptions.engram.home, path.join(dir, "i1", "engram-home"));
  assert.match(hostOptions.engram.mcpConfig, /engram/);
  const record = JSON.parse(fs.readFileSync(path.join(dir, "i1.json"), "utf8"));
  assert.equal(record.host.plugin_version, "2.136.0 (engram 3.4.0)");
  assert.notEqual(record.host.plugin_digest, "a".repeat(64), "the digest covers the engram plugin too");
  assert.equal(record.host.engram_mcp_bytes, 120);
});

test("an ospec arm without an engram binary stops before running", async () => {
  const dir = tempDir();
  const d = deps(dir, { findEngram: () => ({ engram: null, expected: path.join(dir, "missing", "bin", "engram"), gentleAiHome: path.join(dir, "missing") }) });
  const code = await main(["run", "--arm", "idd", "--record", "n1", "--config-dir", dir, "--records-dir", dir, "--runs-dir", dir, "--workspaces-dir", dir, "--scenario", "bugfix"], d);
  assert.equal(code, 2);
  assert.match(d.stderr.text, /OSP-025.*--engram-bin/);
  assert.deepEqual(d.calls.runs, []);
});

test("run --host agy --arm gentle-ai uses the agy install as the template and starts its Engram per workspace", async () => {
  const dir = tempDir();
  const home = path.join(dir, "gentle-agy");
  const { d, seen } = agyDeps(dir, {
    buildOspecHome: () => { throw new Error("the gentle-ai arm must not install ospec"); },
    identifyGentleAiAgy: ({ home: at }) => ({ version: `4.1.1 at ${at}`, digest: "e".repeat(64) }),
  });
  const args = ["run", "--host", "agy", "--arm", "gentle-ai", "--record", "g2", "--gentle-ai-home", home, "--records-dir", dir, "--runs-dir", dir, "--workspaces-dir", dir, "--scenario", "bugfix"];
  assert.equal(await main(args, d), 0, d.stderr.text);
  assert.equal(seen.host.template, home);
  assert.equal(typeof seen.host.gentleAi.startEngram, "function");
  assert.equal(typeof seen.host.gentleAi.homeEnv, "function");
  const record = JSON.parse(fs.readFileSync(path.join(dir, "g2.json"), "utf8"));
  assert.equal(record.host.plugin_version, `4.1.1 at ${home}`);
  assert.equal(record.host.engram_mcp_bytes, 42);

  const missing = agyDeps(dir, { identifyGentleAiAgy: () => { throw new Error(`no gentle-ai install for agy in ${home}`); } }).d;
  assert.equal(await main([...args.slice(0, 6), "g3", ...args.slice(7)], missing), 2);
  assert.match(missing.stderr.text, /setup-gentle-ai --host agy/);
});

test("run --host agy refuses the sdd arm, a missing agy, and an unknown host", async () => {
  const dir = tempDir();
  const common = ["--record", "x1", "--records-dir", dir, "--runs-dir", dir, "--workspaces-dir", dir, "--scenario", "bugfix"];
  const sdd = agyDeps(dir).d;
  assert.equal(await main(["run", "--host", "agy", "--arm", "sdd", ...common], sdd), 2);
  assert.match(sdd.stderr.text, /not available on agy/);
  const noAgy = agyDeps(dir, { findAgy: () => null }).d;
  assert.equal(await main(["run", "--host", "agy", "--arm", "idd", ...common], noAgy), 2);
  assert.match(noAgy.stderr.text, /--agy-bin/);
  const unknown = agyDeps(dir).d;
  assert.equal(await main(["run", "--host", "codex", "--arm", "idd", ...common], unknown), 2);
  assert.match(unknown.stderr.text, /unknown host codex/);
});

test("setup-gentle-ai --host agy installs gentle-ai for agy and needs no login", async () => {
  const dir = tempDir();
  const installs = [];
  const { d } = agyDeps(dir, {
    installGentleAiAgy: (options) => installs.push(options),
    identifyGentleAiAgy: () => ({ version: "4.1.1 (engram 3.4.0)", digest: "c".repeat(64) }),
  });
  const home = path.join(dir, "home");
  assert.equal(await main(["setup-gentle-ai", "--host", "agy", "--gentle-ai-bin", "ga", "--engram-bin", "eg", "--gentle-ai-home", home], d), 0);
  assert.deepEqual(installs, [{ gentleAi: path.resolve("ga"), engram: path.resolve("eg"), agy: "/usr/bin/agy", home }]);
  assert.match(d.stdout.text, /installed for agy/);
});

test("each host defaults to its own gentle-ai home", async () => {
  const dir = tempDir();
  const seen = [];
  const { d } = agyDeps(dir, {
    identifyGentleAiAgy: ({ home }) => {
      seen.push(home);
      return { version: "4.1.1", digest: "e".repeat(64) };
    },
  });
  const args = ["run", "--host", "agy", "--arm", "gentle-ai", "--record", "g4", "--records-dir", dir, "--runs-dir", dir, "--workspaces-dir", dir, "--scenario", "bugfix"];
  assert.equal(await main(args, d), 0, d.stderr.text);
  assert.deepEqual(seen, [HOSTS.agy.gentleAiHome]);
  assert.notEqual(HOSTS.agy.gentleAiHome, HOSTS.claude.gentleAiHome);
});

// A runScenario that leaves a delivery in its workspace and reports `reasons` in turn.
function deliveringRun(calls, reasons = []) {
  return async ({ scenario, workspaceRoot, runDir }) => {
    calls.push(workspaceRoot);
    fs.mkdirSync(path.join(workspaceRoot, ".git"), { recursive: true });
    fs.writeFileSync(path.join(workspaceRoot, "index.html"), `<p>${calls.length}</p>`);
    fs.mkdirSync(runDir, { recursive: true });
    fs.writeFileSync(path.join(runDir, "change-01.jsonl"), "{}\n");
    const reason = reasons[calls.length - 1] || null;
    if (reason === "workspace-escape") {
      return { ...fakeRun(scenario.id, scenario.profile, { status: "incomplete" }), reason, checks: [], escapes: [{ label: "change", turn: 1, step: 7, tool: "run_command", paths: ["/tmp/ospec-bench/x"] }] };
    }
    return fakeRun(scenario.id, scenario.profile);
  };
}

test("each run works in its own opaque directory and its judged workspace moves to the runs directory", { skip: process.platform === "win32" ? "agy runs only under bubblewrap, on Linux" : false }, async () => {
  const dir = tempDir();
  const workspaces = path.join(dir, "ws");
  const runs = path.join(dir, "runs");
  const seen = [];
  const { d, seen: agy } = agyDeps(dir, { runScenario: deliveringRun(seen) });
  const args = ["run", "--host", "agy", "--arm", "idd", "--record", "a5", "--repetitions", "2", "--records-dir", dir, "--runs-dir", runs, "--workspaces-dir", workspaces, "--scenario", "bugfix"];
  assert.equal(await main(args, d), 0, d.stderr.text);
  for (const workspaceRoot of seen) {
    assert.equal(path.basename(workspaceRoot), "bugfix");
    const opaque = path.dirname(workspaceRoot);
    assert.equal(path.dirname(opaque), workspaces);
    // mkdtemp's six random characters may spell "a5" or "r1" by chance: the
    // name must be those characters alone, with no record, arm, scenario or
    // repetition around them.
    assert.match(path.basename(opaque), /^[A-Za-z0-9]{6}$/, "the directory names neither the record, the arm, the scenario nor the repetition");
    assert.ok(!fs.existsSync(opaque), "nothing of a judged run stays in the workspaces directory");
  }
  assert.equal(fs.readFileSync(path.join(runs, "a5", "bugfix", "r1", "workspace", "index.html"), "utf8"), "<p>1</p>");
  assert.equal(fs.readFileSync(path.join(runs, "a5", "bugfix", "r2", "workspace", "index.html"), "utf8"), "<p>2</p>");
  assert.ok(fs.existsSync(path.join(runs, "a5", "bugfix", "r2", "change-01.jsonl")));
  assert.ok(!fs.existsSync(path.join(workspaces, ".bench.lock")), "the lock is released");
  for (const root of [workspaces, runs, dir, path.resolve(__dirname, "..", "..", "..")]) assert.ok(agy.host.forbidden.includes(root), root);
  const { sandbox } = agy.host;
  assert.equal(sandbox.bwrap, "/usr/bin/bwrap");
  for (const root of [os.tmpdir(), os.homedir(), ...agy.host.forbidden]) assert.ok(sandbox.hide.includes(root), `hides ${root}`);
  assert.ok(sandbox.expose.includes("/usr/bin/agy"));
  assert.ok(sandbox.bin.includes(path.dirname(process.execPath)), "the bench's Node comes first on the agent's PATH");
});

test("run --host agy refuses without bubblewrap, before installing or running anything", async () => {
  const dir = tempDir();
  const { d, seen } = agyDeps(dir, { findBwrap: () => null });
  const args = ["run", "--host", "agy", "--arm", "idd", "--record", "a7", "--records-dir", dir, "--runs-dir", dir, "--workspaces-dir", dir, "--scenario", "bugfix"];
  assert.equal(await main(args, d), 2);
  assert.match(d.stderr.text, /bubblewrap/);
  assert.deepEqual(seen.ospecHomes, []);
  assert.deepEqual(d.calls.runs, []);
});

test("a run that escaped its workspace is kept apart, not recorded, and runs again next time", async () => {
  const dir = tempDir();
  const runs = path.join(dir, "runs");
  const seen = [];
  const { d } = agyDeps(dir, { runScenario: deliveringRun(seen, ["workspace-escape"]) });
  const args = ["run", "--host", "agy", "--arm", "idd", "--record", "a6", "--records-dir", dir, "--runs-dir", runs, "--workspaces-dir", path.join(dir, "ws"), "--scenario", "bugfix"];
  assert.equal(await main(args, d), 0, d.stderr.text);
  assert.match(d.stderr.text, /bugfix: voided \(workspace-escape\), not recorded: change-01 step 7 run_command: \/tmp\/ospec-bench\/x/);
  const voided = path.join(runs, "a6", "bugfix.escaped-1");
  assert.ok(fs.existsSync(path.join(voided, "change-01.jsonl")));
  assert.equal(fs.readFileSync(path.join(voided, "workspace", "index.html"), "utf8"), "<p>1</p>");
  assert.ok(!fs.existsSync(path.join(dir, "a6.json")), "a voided run writes nothing to the record");

  const again = agyDeps(dir, { runScenario: deliveringRun(seen) }).d;
  assert.equal(await main(args, again), 0, again.stderr.text);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, "a6.json"), "utf8")).runs.length, 1);
  assert.equal(fs.readFileSync(path.join(runs, "a6", "bugfix", "workspace", "index.html"), "utf8"), "<p>2</p>");
  assert.ok(fs.existsSync(path.join(voided, "workspace")), "the voided attempt stays for audit");
});

test("runs go one at a time: a live run's lock refuses another, a stale one is taken over", async () => {
  const dir = tempDir();
  const workspaces = path.join(dir, "ws");
  fs.mkdirSync(workspaces);
  const args = ["run", "--arm", "sdd", "--record", "l1", "--config-dir", dir, "--records-dir", dir, "--runs-dir", dir, "--workspaces-dir", workspaces, "--scenario", "bugfix"];
  fs.writeFileSync(path.join(workspaces, ".bench.lock"), String(process.ppid));
  const refused = deps(dir);
  assert.equal(await main(args, refused), 2);
  assert.match(refused.stderr.text, new RegExp(`pid ${process.ppid}`));
  assert.deepEqual(refused.calls.runs, []);

  fs.writeFileSync(path.join(workspaces, ".bench.lock"), "999999999");
  const stale = deps(dir);
  assert.equal(await main(args, stale), 0, stale.stderr.text);
  assert.deepEqual(stale.calls.runs, ["bugfix"]);
});
