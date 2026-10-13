#!/usr/bin/env node
"use strict";

// Bench CLI (E4.1, E4.2, E4.5).
//   node scripts/evals/bench/bench.js list [--corpus <name>]
//   node scripts/evals/bench/bench.js setup-gentle-ai --gentle-ai-bin <file> [--engram-bin <file>] [--gentle-ai-home <dir>] [--host agy]
//   node scripts/evals/bench/bench.js run --arm sdd --record <id> [--host claude|agy] [--corpus <name>] [--scenario <id>]... [--force]
//   node scripts/evals/bench/bench.js report --record <id>
//   node scripts/evals/bench/bench.js checkpoint --baseline <id> --candidate <id>
// `run` drives real agents and spends tokens: it never runs in `npm test`.
// Each run works in its own opaque directory under the workspaces directory,
// one run at a time (a lock), and once judged its workspace moves to the runs
// directory, next to its transcripts: no run can find another's delivery.

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { armFor } = require("./arms.js");
const { evaluateCheckpoint, loadMargins, renderCheckpoint } = require("./checkpoint.js");
const { DEFAULT_LIMITS, runScenario: defaultRunScenario } = require("./driver.js");
const { buildOspecHome: defaultBuildOspecHome, createAgyHost } = require("./hosts/agy.js");
const { buildPlugin: defaultBuildPlugin, createClaudeHost, resolveClaudeExecutable } = require("./hosts/claude.js");
const {
  homeEnv,
  identifyGentleAi: defaultIdentifyGentleAi,
  identifyGentleAiAgy: defaultIdentifyGentleAiAgy,
  installGentleAi: defaultInstallGentleAi,
  installGentleAiAgy: defaultInstallGentleAiAgy,
  mcpConfig,
  startEngram,
} = require("./hosts/gentle-ai.js");
const { assertSameIdentity, createRecord, renderReport, upsertRun, validateRecord } = require("./record.js");
const { harnessDigest, loadCorpus, scenariosDigest } = require("./scenarios.js");

const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");
const DEFAULTS = Object.freeze({
  host: "claude",
  corpus: "default",
  recordsDir: path.join(__dirname, "records"),
  runsDir: path.join(REPO_ROOT, "scripts", "evals", ".runs", "bench"),
  workspacesDir: path.join(os.tmpdir(), "ospec-bench"),
  configDir: path.join(os.homedir(), ".ospec-bench", "claude"),
});
// Per host: the models of the agent and the persona, the gentle-ai HOME, and
// the limits. agy reports no cost, so a token cap replaces the cost cap (user
// decision, 2026-10-13).
const HOSTS = Object.freeze({
  claude: Object.freeze({
    model: "claude-sonnet-5-5",
    personaModel: "claude-sonnet-5-5",
    gentleAiHome: path.join(os.homedir(), ".ospec-bench", "gentle-ai"),
    limits: DEFAULT_LIMITS,
  }),
  agy: Object.freeze({
    model: "gemini-3.8-flash-high",
    personaModel: "claude-sonnet-5-5-medium",
    gentleAiHome: path.join(os.homedir(), ".ospec-bench", "gentle-ai-agy"),
    limits: Object.freeze({ maxAgentTurns: DEFAULT_LIMITS.maxAgentTurns, maxSetupTurns: DEFAULT_LIMITS.maxSetupTurns, maxCostUsd: null, maxTokens: 30000000 }),
  }),
});
const OPTIONS = Object.freeze({
  "--arm": ["arm", String],
  "--host": ["host", String],
  "--corpus": ["corpus", String],
  "--agy-bin": ["agyBin", String],
  "--max-tokens": ["maxTokens", Number],
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
  "--gentle-ai-home": ["gentleAiHome", String],
  "--gentle-ai-bin": ["gentleAiBin", String],
  "--engram-bin": ["engramBin", String],
});
const EXIT_HOST_QUOTA = 3;
const LOCK_FILE = ".bench.lock";

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

function findOnPath(name, env = process.env) {
  for (const dir of (env.PATH || "").split(path.delimiter).filter(Boolean)) {
    const candidate = path.join(dir, name);
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return null;
}

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === "EPERM";
  }
}

/** Takes the workspaces directory for this process; null when a live run holds it. */
function acquireLock(workspacesDir) {
  fs.mkdirSync(workspacesDir, { recursive: true });
  const lock = path.join(workspacesDir, LOCK_FILE);
  for (;;) {
    try {
      fs.writeFileSync(lock, String(process.pid), { flag: "wx" });
      return { holder: null, release: () => fs.rmSync(lock, { force: true }) };
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      const holder = Number(fs.readFileSync(lock, "utf8"));
      if (holder && isAlive(holder)) return { holder, release: () => {} };
      fs.rmSync(lock, { force: true });
    }
  }
}

/** Moves a run's workspace out of its opaque directory to `dest`, then removes that directory. */
function archiveWorkspace(runRoot, workspaceRoot, dest) {
  if (fs.existsSync(workspaceRoot)) {
    fs.rmSync(dest, { recursive: true, force: true });
    fs.cpSync(workspaceRoot, dest, {
      recursive: true,
      verbatimSymlinks: true,
      filter: (source) => {
        const stat = fs.lstatSync(source);
        return stat.isFile() || stat.isDirectory() || stat.isSymbolicLink();
      },
    });
  }
  fs.rmSync(runRoot, { recursive: true, force: true });
}

// The first free `<runDir>.escaped-<n>`.
function escapedDir(runDir) {
  for (let n = 1; ; n += 1) {
    const candidate = `${runDir}.escaped-${n}`;
    if (!fs.existsSync(candidate)) return candidate;
  }
}

function hostFor(name) {
  const host = HOSTS[name];
  if (!host) throw new Error(`unknown host ${name}; known hosts: ${Object.keys(HOSTS).join(", ")}`);
  return host;
}

function setupGentleAiCommand(args, deps) {
  const { stdout, stderr } = deps;
  const hostName = args.host || DEFAULTS.host;
  const home = path.resolve(args.gentleAiHome || hostFor(hostName).gentleAiHome);
  const engram = args.engramBin || findOnPath("engram");
  if (!args.gentleAiBin || !engram) {
    stderr.write("setup-gentle-ai needs --gentle-ai-bin (a gentle-ai build) and an engram binary (--engram-bin, or engram on PATH)\n");
    return 2;
  }
  if (hostName === "agy") {
    const agy = args.agyBin || deps.findAgy();
    if (!agy) {
      stderr.write("setup-gentle-ai --host agy needs the agy CLI (--agy-bin, or agy on PATH)\n");
      return 2;
    }
    deps.installGentleAiAgy({ gentleAi: path.resolve(args.gentleAiBin), engram: path.resolve(engram), agy, home });
    const { version, digest } = deps.identifyGentleAiAgy({ home });
    stdout.write(`gentle-ai ${version} installed for agy in ${home} (${digest.slice(0, 12)}). agy keeps its login outside HOME, so run --host agy --arm gentle-ai next.\n`);
    return 0;
  }
  deps.installGentleAi({ gentleAi: path.resolve(args.gentleAiBin), engram: path.resolve(engram), home });
  const { version, digest } = deps.identifyGentleAi({ home });
  stdout.write(`gentle-ai ${version} installed in ${home} (${digest.slice(0, 12)}). Log in once with HOME set to it (\`HOME="${home}" claude\`), then run --arm gentle-ai.\n`);
  return 0;
}

// The agent host of a run, with the plugin (or gentle-ai install) it records.
// Returns null after explaining what is missing.
function prepareHost(opts, arm, recordWorkspaces, personaDir, deps) {
  const { stderr } = deps;
  const hostDefaults = hostFor(opts.host);
  if (opts.host === "agy") {
    const executable = opts.agyBin || deps.findAgy();
    if (!executable) {
      stderr.write("The agy CLI is not on PATH; pass --agy-bin.\n");
      return null;
    }
    const bwrap = deps.findBwrap();
    if (!bwrap) {
      stderr.write("agy runs need bubblewrap (bwrap on PATH, Linux only): agy reads the whole disk, and the sandbox is what keeps the bench's checks and other runs out of its reach.\n");
      return null;
    }
    let plugin;
    let gentleAi = null;
    let template;
    if (arm.id === "gentle-ai") {
      template = path.resolve(opts.gentleAiHome || hostDefaults.gentleAiHome);
      try {
        plugin = { ...deps.identifyGentleAiAgy({ home: template }) };
      } catch (error) {
        stderr.write(`${error.message}. Install it with \`bench.js setup-gentle-ai --host agy --gentle-ai-bin <file> --gentle-ai-home ${template}\`, then run again.\n`);
        return null;
      }
      gentleAi = { startEngram, homeEnv };
    } else {
      plugin = deps.buildOspecHome({ repoRoot: REPO_ROOT, home: path.join(recordWorkspaces, "agy-ospec-home") });
      template = plugin.home;
    }
    // Everything of the bench an agent must not read: other runs, their
    // archives and records, this repository (hidden checks), the installs.
    // The sandbox also empties the system temp directory and the user's HOME.
    const forbidden = [...new Set([opts.workspacesDir, opts.runsDir, opts.recordsDir, REPO_ROOT, path.join(os.homedir(), ".ospec-bench")].map((dir) => path.resolve(dir)))];
    const agyBin = fs.existsSync(executable) ? fs.realpathSync(executable) : path.resolve(executable);
    const sandbox = {
      bwrap,
      hide: [os.tmpdir(), os.homedir(), ...forbidden],
      expose: [agyBin, path.dirname(path.dirname(process.execPath))],
      bin: [path.dirname(process.execPath), path.dirname(agyBin)],
    };
    const host = deps.createAgyHost({ executable, template, model: opts.model, personaModel: opts.personaModel, personaDir, gentleAi, forbidden, sandbox });
    return { host, plugin };
  }
  if (!fs.existsSync(opts.configDir)) {
    stderr.write(`The bench configuration directory ${opts.configDir} does not exist. Log in once with CLAUDE_CONFIG_DIR set to it (for example \`$env:CLAUDE_CONFIG_DIR="${opts.configDir}"; claude\`), then run again.\n`);
    return null;
  }
  const executable = deps.resolveExecutable(opts.claudeBin);
  // gentle-ai replaces the ospec plugin: its install in the gentle-ai HOME is
  // what the record identifies as the plugin.
  let plugin;
  let gentleAi = null;
  if (arm.id === "gentle-ai") {
    const home = path.resolve(opts.gentleAiHome || hostDefaults.gentleAiHome);
    try {
      plugin = { pluginDir: null, ...deps.identifyGentleAi({ home }) };
    } catch (error) {
      stderr.write(`${error.message}. Install it with \`bench.js setup-gentle-ai --gentle-ai-bin <file> --gentle-ai-home ${home}\` and log in once with \`HOME="${home}" claude\`, then run again.\n`);
      return null;
    }
    gentleAi = { home, startEngram, mcpConfig: mcpConfig(home) };
  } else {
    plugin = deps.buildPlugin({ repoRoot: REPO_ROOT, outDir: path.join(recordWorkspaces, "plugin-build") });
  }
  const host = deps.createHost({
    executable,
    configDir: opts.configDir,
    pluginDir: plugin.pluginDir,
    gentleAi,
    model: opts.model,
    effort: opts.effort || null,
    personaModel: opts.personaModel,
    personaDir,
  });
  return { host, plugin };
}

async function runCommand(args, deps) {
  const { stdout, stderr } = deps;
  const defined = Object.fromEntries(Object.entries(args).filter(([, value]) => value !== undefined));
  const hostName = defined.host || DEFAULTS.host;
  const hostDefaults = hostFor(hostName);
  const opts = { ...DEFAULTS, model: hostDefaults.model, personaModel: hostDefaults.personaModel, ...defined, host: hostName };
  if (!opts.arm || !opts.record) throw new Error("run needs --arm and --record");
  const arm = armFor(opts.arm, { host: opts.host });
  const repetitions = opts.repetitions === undefined ? 1 : opts.repetitions;
  if (!Number.isInteger(repetitions) || repetitions < 1) throw new Error("--repetitions must be a positive integer");
  const corpus = loadCorpus(opts.corpus);
  const unknown = opts.scenarios.filter((id) => !corpus.some((scenario) => scenario.id === id));
  if (unknown.length > 0) throw new Error(`unknown scenarios: ${unknown.join(", ")}`);
  const selected = opts.scenarios.length > 0 ? corpus.filter((scenario) => opts.scenarios.includes(scenario.id)) : corpus;
  const limits = {
    ...hostDefaults.limits,
    ...(opts.maxAgentTurns ? { maxAgentTurns: opts.maxAgentTurns } : {}),
    ...(opts.maxCostUsd ? { maxCostUsd: opts.maxCostUsd } : {}),
    ...(opts.maxTokens ? { maxTokens: opts.maxTokens } : {}),
  };

  const lock = acquireLock(opts.workspacesDir);
  if (lock.holder) {
    stderr.write(`Another bench run (pid ${lock.holder}) is using ${opts.workspacesDir}; runs go one at a time, so wait for it to finish.\n`);
    return 2;
  }
  try {
    return await runLocked(args, opts, arm, corpus, selected, repetitions, limits, deps);
  } finally {
    lock.release();
  }
}

async function runLocked(args, opts, arm, corpus, selected, repetitions, limits, deps) {
  const { stdout, stderr } = deps;
  const recordWorkspaces = path.join(opts.workspacesDir, opts.record);
  const personaDir = path.join(recordWorkspaces, "persona");
  fs.mkdirSync(personaDir, { recursive: true });
  const prepared = prepareHost(opts, arm, recordWorkspaces, personaDir, deps);
  if (!prepared) return 2;
  const { host, plugin } = prepared;
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

  // An interrupted bench stops what the host started (gentle-ai's Engram).
  const interrupt = (signal) => {
    if (host.releaseAll) host.releaseAll();
    process.exit(signal === "SIGINT" ? 130 : 143);
  };
  process.once("SIGINT", interrupt);
  process.once("SIGTERM", interrupt);
  try {
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
        const runDir = path.join(opts.runsDir, opts.record, slot);
        // The opaque directory is the run's own: its parent holds nothing the agent may read.
        const runRoot = fs.mkdtempSync(path.join(opts.workspacesDir, path.sep));
        const workspaceRoot = path.join(runRoot, scenario.id);
        stdout.write(`${label}: running in ${workspaceRoot}\n`);
        let run;
        try {
          run = await deps.runScenario({ scenario, arm, host, workspaceRoot, runDir, limits });
        } catch (error) {
          fs.rmSync(runRoot, { recursive: true, force: true });
          throw error;
        }
        if (run.reason === "workspace-escape") {
          const voided = escapedDir(runDir);
          fs.mkdirSync(path.dirname(voided), { recursive: true });
          if (fs.existsSync(runDir)) fs.renameSync(runDir, voided);
          archiveWorkspace(runRoot, workspaceRoot, path.join(voided, "workspace"));
          const where = run.escapes.map((escape) => `${escape.label}-${String(escape.turn).padStart(2, "0")} step ${escape.step} ${escape.tool}: ${escape.paths.join(", ")}`).join("; ");
          stderr.write(`${label}: voided (workspace-escape), not recorded: ${where}. Kept in ${voided}; run the same command again to repeat it.\n`);
          continue;
        }
        if (run.reason === "host-quota") fs.rmSync(runRoot, { recursive: true, force: true });
        else archiveWorkspace(runRoot, workspaceRoot, path.join(runDir, "workspace"));
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
  } finally {
    process.removeListener("SIGINT", interrupt);
    process.removeListener("SIGTERM", interrupt);
  }
}

async function main(argv, deps = {}) {
  const io = {
    stdout: process.stdout,
    stderr: process.stderr,
    now: () => new Date(),
    resolveExecutable: (bin) => resolveClaudeExecutable(bin || undefined),
    findAgy: () => findOnPath(process.platform === "win32" ? "agy.exe" : "agy"),
    findBwrap: () => (process.platform === "linux" ? findOnPath("bwrap") : null),
    buildPlugin: defaultBuildPlugin,
    buildOspecHome: defaultBuildOspecHome,
    identifyGentleAi: defaultIdentifyGentleAi,
    identifyGentleAiAgy: defaultIdentifyGentleAiAgy,
    installGentleAi: defaultInstallGentleAi,
    installGentleAiAgy: defaultInstallGentleAiAgy,
    createHost: createClaudeHost,
    createAgyHost,
    runScenario: defaultRunScenario,
    ...deps,
  };
  try {
    const args = parseArgs(argv);
    const recordsDir = args.recordsDir || DEFAULTS.recordsDir;
    if (args.command === "list") {
      const corpus = loadCorpus(args.corpus || DEFAULTS.corpus);
      for (const scenario of corpus) {
        io.stdout.write(`${scenario.id} (${scenario.profile}): ${scenario.title} — ${scenario.facts.length} facts, ${scenario.checks.length} checks\n`);
      }
      io.stdout.write(`digest ${scenariosDigest(corpus)}\n`);
      return 0;
    }
    if (args.command === "setup-gentle-ai") return setupGentleAiCommand(args, io);
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
    io.stderr.write("usage: bench.js list [--corpus <name>] | setup-gentle-ai --gentle-ai-bin <file> [--engram-bin <file>] [--gentle-ai-home <dir>] [--host agy] | run --arm <arm> --record <id> [--host claude|agy] [--corpus <name>] [--repetitions <n>] | report --record <id> | checkpoint --baseline <id> --candidate <id>\n");
    return 2;
  } catch (error) {
    io.stderr.write(`${error.message}\n`);
    return 2;
  }
}

if (require.main === module) {
  main(process.argv.slice(2)).then((code) => { process.exitCode = code; });
}

module.exports = { DEFAULTS, HOSTS, main, parseArgs };
