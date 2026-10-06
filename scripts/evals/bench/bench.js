#!/usr/bin/env node
"use strict";

// E4.1 bench CLI.
//   node scripts/evals/bench/bench.js list
//   node scripts/evals/bench/bench.js run --arm sdd --record <id> [--scenario <id>]... [--force]
//   node scripts/evals/bench/bench.js report --record <id>
//   node scripts/evals/bench/bench.js checkpoint --baseline <id> --candidate <id>
// `run` drives real agents and spends tokens: it never runs in `npm test`.

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { armFor } = require("./arms.js");
const { evaluateCheckpoint, loadMargins, renderCheckpoint } = require("./checkpoint.js");
const { DEFAULT_LIMITS, runScenario: defaultRunScenario } = require("./driver.js");
const { buildPlugin: defaultBuildPlugin, createClaudeHost, resolveClaudeExecutable } = require("./hosts/claude.js");
const { assertSameIdentity, createRecord, renderReport, upsertRun, validateRecord } = require("./record.js");
const { harnessDigest, loadScenarios, scenariosDigest } = require("./scenarios.js");

const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");
const DEFAULTS = Object.freeze({
  model: "claude-sonnet-5-5",
  personaModel: "claude-sonnet-5-5",
  recordsDir: path.join(__dirname, "records"),
  runsDir: path.join(REPO_ROOT, "scripts", "evals", ".runs", "bench"),
  workspacesDir: path.join(os.tmpdir(), "ospec-bench"),
  configDir: path.join(os.homedir(), ".ospec-bench", "claude"),
});
const OPTIONS = Object.freeze({
  "--arm": ["arm", String],
  "--record": ["record", String],
  "--baseline": ["baseline", String],
  "--candidate": ["candidate", String],
  "--scenario": ["scenarios", String, true],
  "--model": ["model", String],
  "--effort": ["effort", String],
  "--persona-model": ["personaModel", String],
  "--config-dir": ["configDir", String],
  "--claude-bin": ["claudeBin", String],
  "--records-dir": ["recordsDir", String],
  "--runs-dir": ["runsDir", String],
  "--workspaces-dir": ["workspacesDir", String],
  "--max-turns": ["maxAgentTurns", Number],
  "--max-cost": ["maxCostUsd", Number],
  "--repetitions": ["repetitions", Number],
});
const EXIT_HOST_QUOTA = 3;

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const args = { command, scenarios: [], force: false };
  for (let i = 0; i < rest.length; i += 1) {
    const flag = rest[i];
    if (flag === "--force") {
      args.force = true;
      continue;
    }
    const option = OPTIONS[flag];
    if (!option) throw new Error(`unknown option ${flag}`);
    const [key, cast, repeatable] = option;
    const value = cast(rest[i + 1]);
    i += 1;
    if (repeatable) args[key].push(value);
    else args[key] = value;
  }
  return args;
}

function recordPath(recordsDir, id) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id || "")) throw new Error(`record id must be kebab-case: ${id}`);
  return path.join(recordsDir, `${id}.json`);
}

function readRecord(recordsDir, id) {
  return validateRecord(JSON.parse(fs.readFileSync(recordPath(recordsDir, id), "utf8")));
}

function writeRecord(recordsDir, record) {
  fs.mkdirSync(recordsDir, { recursive: true });
  const target = recordPath(recordsDir, record.record_id);
  const temp = `${target}.${process.pid}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(validateRecord(record), null, 2)}\n`);
  fs.renameSync(temp, target);
}

async function runCommand(args, deps) {
  const { stdout, stderr } = deps;
  const opts = { ...DEFAULTS, ...Object.fromEntries(Object.entries(args).filter(([, value]) => value !== undefined)) };
  if (!opts.arm || !opts.record) throw new Error("run needs --arm and --record");
  const arm = armFor(opts.arm);
  const repetitions = opts.repetitions === undefined ? 1 : opts.repetitions;
  if (!Number.isInteger(repetitions) || repetitions < 1) throw new Error("--repetitions must be a positive integer");
  if (!fs.existsSync(opts.configDir)) {
    stderr.write(`The bench configuration directory ${opts.configDir} does not exist. Log in once with CLAUDE_CONFIG_DIR set to it (for example \`$env:CLAUDE_CONFIG_DIR="${opts.configDir}"; claude\`), then run again.\n`);
    return 2;
  }
  const corpus = loadScenarios();
  const unknown = opts.scenarios.filter((id) => !corpus.some((scenario) => scenario.id === id));
  if (unknown.length > 0) throw new Error(`unknown scenarios: ${unknown.join(", ")}`);
  const selected = opts.scenarios.length > 0 ? corpus.filter((scenario) => opts.scenarios.includes(scenario.id)) : corpus;
  const limits = {
    ...DEFAULT_LIMITS,
    ...(opts.maxAgentTurns ? { maxAgentTurns: opts.maxAgentTurns } : {}),
    ...(opts.maxCostUsd ? { maxCostUsd: opts.maxCostUsd } : {}),
  };

  const executable = deps.resolveExecutable(opts.claudeBin);
  const recordWorkspaces = path.join(opts.workspacesDir, opts.record);
  const plugin = deps.buildPlugin({ repoRoot: REPO_ROOT, outDir: path.join(recordWorkspaces, "plugin-build") });
  const personaDir = path.join(recordWorkspaces, "persona");
  fs.mkdirSync(personaDir, { recursive: true });
  const host = deps.createHost({
    executable,
    configDir: opts.configDir,
    pluginDir: plugin.pluginDir,
    model: opts.model,
    effort: opts.effort || null,
    personaModel: opts.personaModel,
    personaDir,
  });
  const identity = {
    record_id: opts.record,
    arm: arm.id,
    host: {
      name: host.name,
      cli_version: host.version().replace(/\s*\(.*\)\s*$/, ""),
      model: opts.model,
      effort: opts.effort || null,
      plugin_version: plugin.version,
      plugin_digest: plugin.digest,
    },
    persona: { model: opts.personaModel },
    scenarios_digest: scenariosDigest(corpus),
    harness_digest: harnessDigest(),
    limits,
    repetitions,
  };

  let record;
  if (fs.existsSync(recordPath(opts.recordsDir, opts.record))) {
    record = readRecord(opts.recordsDir, opts.record);
    try {
      assertSameIdentity(record, identity);
    } catch (error) {
      stderr.write(`${error.message}\n`);
      return 2;
    }
  } else {
    record = createRecord({ ...identity, recorded_at: deps.now().toISOString() });
  }

  // Repetition by repetition, so an interrupted run already covers every
  // scenario once before it repeats any.
  for (let repetition = 1; repetition <= repetitions; repetition += 1) {
    for (const scenario of selected) {
      const label = repetitions > 1 ? `${scenario.id} #${repetition}` : scenario.id;
      const existing = record.runs.find((run) => run.scenario_id === scenario.id && run.repetition === repetition);
      if (existing && existing.status === "complete" && !args.force) {
        stdout.write(`${label}: already complete in ${opts.record}, skipped\n`);
        continue;
      }
      const slot = repetitions > 1 ? path.join(scenario.id, `r${repetition}`) : scenario.id;
      const workspaceRoot = path.join(recordWorkspaces, slot);
      stdout.write(`${label}: running in ${workspaceRoot}\n`);
      const run = await deps.runScenario({
        scenario,
        arm,
        host,
        workspaceRoot,
        runDir: path.join(opts.runsDir, opts.record, slot),
        limits,
      });
      if (run.reason === "host-quota") {
        // Nothing usable: every later turn would fail the same way. Keep the
        // record as it was so the same command resumes after the reset.
        const last = [...run.conversation].reverse().find((entry) => entry.role === "agent");
        stderr.write(`${label}: the host's usage quota is exhausted (${last ? last.text : "no message"}). Stopped without recording it; run the same command again after the reset.\n`);
        return EXIT_HOST_QUOTA;
      }
      record = upsertRun(record, { scenario_id: run.scenario_id, repetition, ...run });
      writeRecord(opts.recordsDir, record);
      stdout.write(`${label}: ${run.status}${run.reason ? ` (${run.reason})` : ""}, ${run.metrics.tokens_total} tokens, ${run.escaped_defects} escaped\n`);
    }
  }
  stdout.write(renderReport(record));
  return 0;
}

async function main(argv, deps = {}) {
  const io = {
    stdout: process.stdout,
    stderr: process.stderr,
    now: () => new Date(),
    resolveExecutable: (bin) => resolveClaudeExecutable(bin || undefined),
    buildPlugin: defaultBuildPlugin,
    createHost: createClaudeHost,
    runScenario: defaultRunScenario,
    ...deps,
  };
  try {
    const args = parseArgs(argv);
    const recordsDir = args.recordsDir || DEFAULTS.recordsDir;
    if (args.command === "list") {
      const corpus = loadScenarios();
      for (const scenario of corpus) {
        io.stdout.write(`${scenario.id} (${scenario.profile}): ${scenario.title} — ${scenario.facts.length} facts, ${scenario.checks.length} checks\n`);
      }
      io.stdout.write(`digest ${scenariosDigest(corpus)}\n`);
      return 0;
    }
    if (args.command === "run") return await runCommand(args, io);
    if (args.command === "report") {
      io.stdout.write(renderReport(readRecord(recordsDir, args.record)));
      return 0;
    }
    if (args.command === "checkpoint") {
      const { margins, digest } = loadMargins();
      const result = evaluateCheckpoint({
        baseline: readRecord(recordsDir, args.baseline),
        candidate: readRecord(recordsDir, args.candidate),
        margins,
        margins_digest: digest,
      });
      io.stdout.write(renderCheckpoint(result));
      return result.decision === "continue" ? 0 : 1;
    }
    io.stderr.write("usage: bench.js list | run --arm <arm> --record <id> [--repetitions <n>] | report --record <id> | checkpoint --baseline <id> --candidate <id>\n");
    return 2;
  } catch (error) {
    io.stderr.write(`${error.message}\n`);
    return 2;
  }
}

if (require.main === module) {
  main(process.argv.slice(2)).then((code) => { process.exitCode = code; });
}

module.exports = { DEFAULTS, main, parseArgs };
