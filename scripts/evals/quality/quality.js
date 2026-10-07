#!/usr/bin/env node
"use strict";

// Quality comparison of two bench records beyond the hidden checks (E1.6):
//
//   node scripts/evals/quality/quality.js collect --baseline <record> --candidate <record> [--bench-root <dir>] [--limit <n>]
//   node scripts/evals/quality/quality.js judge   --baseline <record> --candidate <record> [--model <id>]
//   node scripts/evals/quality/quality.js report  --baseline <record> --candidate <record>
//
// collect saves each scenario's product diff, its metrics and the mutation
// score of the delivered tests (no model). judge runs the blind pairwise
// review in the bench's Claude configuration. report prints the Markdown
// tables. Results live in scripts/evals/quality/results/<baseline>__<candidate>/.
// This is analysis tooling outside the bench harness: it never changes
// harness_digest.

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const { addedLines, classifyPath, locateWorkspace, metricsFromNumstat, readDelivery, scrubDiff } = require("./deliveries.js");
const { runMutation } = require("./mutation.js");
const { JUDGE_CRITERIA, JUDGE_SCHEMA, aggregateJudgments, buildJudgePrompt } = require("./judge.js");
const { loadScenarios } = require("../bench/scenarios.js");
const { benchEnv, resolveClaudeExecutable } = require("../bench/hosts/claude.js");

const RESULTS_ROOT = path.join(__dirname, "results");
const DEFAULT_BENCH_ROOT = path.join(os.tmpdir(), "ospec-bench");
const DEFAULT_CONFIG_DIR = path.join(os.homedir(), ".ospec-bench", "claude");
const DEFAULT_MODEL = "claude-sonnet-5-5";
const JUDGE_TIMEOUT_MS = 10 * 60 * 1000;
const SOURCE_CODE = /\.[cm]?js$/;

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = { command };
  for (let i = 0; i < rest.length; i += 2) {
    const key = rest[i].replace(/^--/, "");
    options[key] = rest[i + 1];
  }
  if (!["collect", "judge", "report"].includes(command) || !options.baseline || !options.candidate) {
    throw new Error("usage: quality.js collect|judge|report --baseline <record> --candidate <record>");
  }
  return options;
}

function resultsDir(options) {
  return path.join(RESULTS_ROOT, `${options.baseline}__${options.candidate}`);
}

function readResults(dir) {
  const file = path.join(dir, "quality.json");
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : null;
}

function writeResults(dir, results) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "quality.json"), `${JSON.stringify(results, null, 2)}\n`);
}

// The delivered suite as the project declares it.
function suiteCommand(workspace) {
  const manifest = JSON.parse(fs.readFileSync(path.join(workspace, "package.json"), "utf8"));
  const script = manifest.scripts?.test || "node --test";
  const words = script.split(/\s+/);
  if (words[0] === "node") return { file: process.execPath, args: words.slice(1), script };
  return process.platform === "win32"
    ? { file: "cmd.exe", args: ["/d", "/s", "/c", script], script }
    : { file: "sh", args: ["-c", script], script };
}

function countTests(workspace, command) {
  const result = spawnSync(command.file, command.args, { cwd: workspace, encoding: "utf8", timeout: 120000, windowsHide: true });
  const match = /(?:ℹ|#) tests (\d+)/.exec(result.stdout || "");
  return { passes: result.status === 0, tests: match ? Number(match[1]) : null };
}

function collectArm(record, scenario, options, dir) {
  const workspace = locateWorkspace(options["bench-root"] || DEFAULT_BENCH_ROOT, record, scenario);
  const delivery = readDelivery(workspace);
  const diffFile = path.join(dir, "deliveries", record, `${scenario}.diff`);
  fs.mkdirSync(path.dirname(diffFile), { recursive: true });
  fs.writeFileSync(diffFile, delivery.diff);

  const command = suiteCommand(workspace);
  const suite = countTests(workspace, command);
  const added = addedLines(delivery.zeroContext);
  const sourceFiles = delivery.product.filter((file) => classifyPath(file) === "source" && SOURCE_CODE.test(file) && added[file]);
  const mutation = runMutation({ workspace, added, sourceFiles, command, limit: Number(options.limit || 60) });
  return {
    diff: path.relative(dir, diffFile).replace(/\\/g, "/"),
    metrics: { ...metricsFromNumstat(delivery.numstat), suite_passes: suite.passes, suite_tests: suite.tests },
    mutation,
  };
}

function collect(options) {
  const dir = resultsDir(options);
  const results = readResults(dir) || { baseline: options.baseline, candidate: options.candidate, scenarios: {} };
  for (const scenario of loadScenarios()) {
    process.stdout.write(`${scenario.id}: collecting\n`);
    const entry = results.scenarios[scenario.id] || {};
    entry.baseline = collectArm(options.baseline, scenario.id, options, dir);
    entry.candidate = collectArm(options.candidate, scenario.id, options, dir);
    results.scenarios[scenario.id] = entry;
    writeResults(dir, results);
  }
  return results;
}

function judgeOnce({ prompt, model, configDir }) {
  const executable = resolveClaudeExecutable();
  const args = [
    "-p",
    "--model", model,
    "--tools", "",
    "--strict-mcp-config",
    "--no-session-persistence",
    "--output-format", "json",
    "--json-schema", JSON.stringify(JUDGE_SCHEMA),
  ];
  const result = spawnSync(executable, args, {
    input: prompt,
    env: benchEnv(process.env, configDir),
    encoding: "utf8",
    timeout: JUDGE_TIMEOUT_MS,
    maxBuffer: 64 * 1024 * 1024,
    windowsHide: true,
  });
  if (result.status !== 0) throw new Error(`judge failed: ${result.stderr || result.stdout}`);
  const output = JSON.parse(result.stdout);
  if (!output.structured_output) throw new Error(`judge returned no verdict: ${result.stdout.slice(0, 500)}`);
  return { verdict: output.structured_output, cost_usd: output.total_cost_usd ?? null };
}

function judge(options) {
  const dir = resultsDir(options);
  const results = readResults(dir);
  if (!results) throw new Error("run collect first");
  const model = options.model || DEFAULT_MODEL;
  const configDir = options["config-dir"] || DEFAULT_CONFIG_DIR;
  for (const scenario of loadScenarios()) {
    const entry = results.scenarios[scenario.id];
    if (entry.judge) continue;
    const diffs = {
      baseline: scrubDiff(fs.readFileSync(path.join(dir, entry.baseline.diff), "utf8")),
      candidate: scrubDiff(fs.readFileSync(path.join(dir, entry.candidate.diff), "utf8")),
    };
    const requirements = scenario.facts.map((fact) => fact.text);
    const judgments = [];
    let cost = 0;
    for (const order of [["baseline", "candidate"], ["candidate", "baseline"]]) {
      process.stdout.write(`${scenario.id}: judging ${order[0]} as A\n`);
      const prompt = buildJudgePrompt({ brief: scenario.brief, requirements, first: diffs[order[0]], second: diffs[order[1]] });
      const { verdict, cost_usd: spent } = judgeOnce({ prompt, model, configDir });
      judgments.push({ order, verdict });
      cost += spent || 0;
    }
    entry.judge = { model, cost_usd: Math.round(cost * 10000) / 10000, ...aggregateJudgments(judgments), judgments };
    writeResults(dir, results);
  }
  return results;
}

function mean(values) {
  const present = values.filter((value) => typeof value === "number");
  return present.length ? Math.round((present.reduce((a, b) => a + b, 0) / present.length) * 100) / 100 : null;
}

function report(options) {
  const results = readResults(resultsDir(options));
  if (!results) throw new Error("run collect first");
  const rows = Object.entries(results.scenarios);
  const fmt = (value) => (value == null ? "—" : String(value));
  const lines = [
    `# Calidad: \`${results.baseline}\` frente a \`${results.candidate}\``,
    "",
    "## Diff y tests (sin modelo)",
    "",
    "| Escenario | Líneas fuente (base → cand.) | Líneas test | Test/fuente | Docs/tipos tocados | Tests del suite | Mutation score |",
    "| --- | --- | --- | --- | --- | --- | --- |",
  ];
  for (const [id, entry] of rows) {
    const b = entry.baseline;
    const c = entry.candidate;
    const docs = (arm) => arm.metrics.files.docs + arm.metrics.files.types;
    const score = (arm) => (arm.mutation.score == null ? "—" : `${arm.mutation.score} % (${arm.mutation.killed}/${arm.mutation.total})`);
    lines.push(
      `| ${id} | ${b.metrics.added.source} → ${c.metrics.added.source} | ${b.metrics.added.test} → ${c.metrics.added.test} | ${fmt(b.metrics.test_to_source)} → ${fmt(c.metrics.test_to_source)} | ${docs(b)} → ${docs(c)} | ${fmt(b.metrics.suite_tests)} → ${fmt(c.metrics.suite_tests)} | ${score(b)} → ${score(c)} |`,
    );
  }
  lines.push(
    "",
    `Mutation score medio: ${fmt(mean(rows.map(([, e]) => e.baseline.mutation.score)))} % → ${fmt(mean(rows.map(([, e]) => e.candidate.mutation.score)))} %.`,
  );
  if (rows.some(([, entry]) => entry.judge)) {
    lines.push(
      "",
      "## Revisión a ciegas por pares",
      "",
      `| Escenario | ${JUDGE_CRITERIA.join(" | ")} | Preferida |`,
      `| --- | ${JUDGE_CRITERIA.map(() => "---").join(" | ")} | --- |`,
    );
    for (const [id, entry] of rows) {
      if (!entry.judge) continue;
      const cells = JUDGE_CRITERIA.map((c) => `${entry.judge.scores.baseline[c]} / ${entry.judge.scores.candidate[c]}`);
      lines.push(`| ${id} | ${cells.join(" | ")} | ${entry.judge.preferred} |`);
    }
    const judged = rows.filter(([, entry]) => entry.judge);
    const avg = (arm, c) => mean(judged.map(([, e]) => e.judge.scores[arm][c]));
    lines.push(
      `| **Media** | ${JUDGE_CRITERIA.map((c) => `${avg("baseline", c)} / ${avg("candidate", c)}`).join(" | ")} | |`,
      "",
      `Puntuaciones base / candidato (1–5), medias de las dos posiciones. Coste del juez: $${judged.reduce((s, [, e]) => s + (e.judge.cost_usd || 0), 0).toFixed(2)}.`,
    );
  }
  return lines.join("\n");
}

function main(argv) {
  const options = parseArgs(argv);
  if (options.command === "collect") collect(options);
  if (options.command === "judge") judge(options);
  process.stdout.write(`${report(options)}\n`);
}

if (require.main === module) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = { report, suiteCommand };
