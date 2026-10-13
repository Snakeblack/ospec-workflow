#!/usr/bin/env node
"use strict";

// Quality comparison of two bench records beyond the hidden checks (E1.6, E4.5):
//
//   node scripts/evals/quality/quality.js collect --baseline <record> --candidate <record> [--corpus <name>] [--repetitions <n>] [--bench-root <dir>] [--limit <n>]
//   node scripts/evals/quality/quality.js judge   --baseline <record> --candidate <record> [--corpus <name>] [--repetitions <n>] [--host claude|agy] [--model <id>]
//   node scripts/evals/quality/quality.js report  --baseline <record> --candidate <record>
//
// collect saves each delivery's product diff, its metrics and the mutation
// score of the delivered tests (no model); with repetitions, every repetition
// is a delivery, paired with the same repetition of the other record. judge
// runs the blind pairwise review in the bench's Claude configuration, or on
// agy (no Claude quota). report prints the Markdown tables and, when the
// margins declare one, the quality criterion's verdict. Results live in
// scripts/evals/quality/results/<baseline>__<candidate>/. This is analysis
// tooling outside the bench harness: it never changes harness_digest.

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const { addedLines, classifyPath, locateWorkspace, metricsFromNumstat, readDelivery, scrubDiff } = require("./deliveries.js");
const { inlineScriptLines, runMutation } = require("./mutation.js");
const { JUDGE_CRITERIA, JUDGE_SCHEMA, aggregateJudgments, buildJudgePrompt } = require("./judge.js");
const { loadMargins } = require("../bench/checkpoint.js");
const { loadCorpus } = require("../bench/scenarios.js");
const { taskInterval } = require("../bench/stats.js");
const { isolatedEnv, resultOf, streamInput } = require("../bench/hosts/agy.js");
const { benchEnv, resolveClaudeExecutable } = require("../bench/hosts/claude.js");

const RESULTS_ROOT = path.join(__dirname, "results");
// The bench archives every judged workspace here; records from before E4.5
// left theirs in the workspaces directory (`--bench-root <tmp>/ospec-bench`).
const DEFAULT_BENCH_ROOT = path.join(__dirname, "..", ".runs", "bench");
const DEFAULT_CONFIG_DIR = path.join(os.homedir(), ".ospec-bench", "claude");
const DEFAULT_MODELS = Object.freeze({ claude: "claude-sonnet-5-5", agy: "claude-sonnet-5-5-medium" });
const JUDGE_TIMEOUT_MS = 10 * 60 * 1000;
const SOURCE_CODE = /\.(?:[cm]?js|html?)$/;
const HTML = /\.html?$/;

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

// Every delivery to compare: one per scenario of the corpus and repetition.
// A one-repetition comparison keeps the scenario id as its key.
function deliveries(options) {
  const repetitions = Number(options.repetitions || 1);
  if (!Number.isInteger(repetitions) || repetitions < 1) throw new Error("--repetitions must be a positive integer");
  return loadCorpus(options.corpus || "default").flatMap((scenario) => Array.from({ length: repetitions }, (_, index) => ({
    key: repetitions === 1 ? scenario.id : `${scenario.id}/r${index + 1}`,
    scenario,
    repetition: index + 1,
  })));
}

// Only the added lines of an HTML file inside its inline scripts are code.
function scriptLinesOnly(workspace, added) {
  for (const file of Object.keys(added)) {
    if (!HTML.test(file)) continue;
    const inside = inlineScriptLines(fs.readFileSync(path.join(workspace, file), "utf8"));
    added[file] = added[file].filter((line) => inside.has(line));
    if (added[file].length === 0) delete added[file];
  }
  return added;
}

function collectArm(record, { key, scenario, repetition }, options, dir) {
  const workspace = locateWorkspace(options["bench-root"] || DEFAULT_BENCH_ROOT, record, scenario.id, repetition);
  const delivery = readDelivery(workspace);
  const diffFile = path.join(dir, "deliveries", record, `${key.replace("/", "-")}.diff`);
  fs.mkdirSync(path.dirname(diffFile), { recursive: true });
  fs.writeFileSync(diffFile, delivery.diff);

  const command = suiteCommand(workspace);
  const suite = countTests(workspace, command);
  const added = scriptLinesOnly(workspace, addedLines(delivery.zeroContext));
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
  for (const item of deliveries(options)) {
    process.stdout.write(`${item.key}: collecting\n`);
    const entry = results.scenarios[item.key] || {};
    entry.baseline = collectArm(options.baseline, item, options, dir);
    entry.candidate = collectArm(options.candidate, item, options, dir);
    results.scenarios[item.key] = entry;
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

// The judge on agy: a fresh, rule-free HOME, plan mode, and the prompt on
// stdin, since two diffs can exceed the length limit of an argument.
function judgeOnceAgy({ prompt, model }) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "ospec-judge-"));
  try {
    const result = spawnSync("agy", [
      "--model", model,
      "--input-format", "stream-json",
      "--output-format", "stream-json",
      "--json-schema", JSON.stringify(JUDGE_SCHEMA),
      "--mode", "plan",
      "--print=",
    ], {
      cwd: home,
      input: streamInput(prompt),
      env: isolatedEnv(process.env, home),
      encoding: "utf8",
      timeout: JUDGE_TIMEOUT_MS,
      maxBuffer: 64 * 1024 * 1024,
      windowsHide: true,
    });
    const output = resultOf(result.stdout || "");
    if (!output || !output.structured_output) throw new Error(`judge returned no verdict: ${(result.stderr || result.stdout || "").slice(0, 500)}`);
    return { verdict: output.structured_output, cost_usd: null };
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
}

function judge(options) {
  const dir = resultsDir(options);
  const results = readResults(dir);
  if (!results) throw new Error("run collect first");
  const host = options.host || "claude";
  if (!DEFAULT_MODELS[host]) throw new Error(`unknown judge host ${host}; known hosts: ${Object.keys(DEFAULT_MODELS).join(", ")}`);
  const model = options.model || DEFAULT_MODELS[host];
  const configDir = options["config-dir"] || DEFAULT_CONFIG_DIR;
  for (const { key, scenario } of deliveries(options)) {
    const entry = results.scenarios[key];
    if (!entry) throw new Error(`no collected deliveries for ${key}; run collect with the same --corpus and --repetitions`);
    if (entry.judge) continue;
    const diffs = {
      baseline: scrubDiff(fs.readFileSync(path.join(dir, entry.baseline.diff), "utf8")),
      candidate: scrubDiff(fs.readFileSync(path.join(dir, entry.candidate.diff), "utf8")),
    };
    const requirements = scenario.facts.map((fact) => fact.text);
    const judgments = [];
    let cost = 0;
    for (const order of [["baseline", "candidate"], ["candidate", "baseline"]]) {
      process.stdout.write(`${key}: judging ${order[0]} as A\n`);
      const prompt = buildJudgePrompt({ brief: scenario.brief, requirements, first: diffs[order[0]], second: diffs[order[1]] });
      const { verdict, cost_usd: spent } = host === "agy" ? judgeOnceAgy({ prompt, model }) : judgeOnce({ prompt, model, configDir });
      judgments.push({ order, verdict });
      cost += spent || 0;
    }
    entry.judge = { host, model, cost_usd: host === "agy" ? null : Math.round(cost * 10000) / 10000, ...aggregateJudgments(judgments), judgments };
    writeResults(dir, results);
  }
  return results;
}

function mean(values) {
  const present = values.filter((value) => typeof value === "number");
  return present.length ? Math.round((present.reduce((a, b) => a + b, 0) / present.length) * 100) / 100 : null;
}

// A delivery's mutation score for the quality criterion: a suite that fails
// before any mutant protects nothing and counts as 0; a delivery with no code
// to mutate has no score and is left out.
function criterionScore(arm) {
  if (arm.mutation.suite_passes === false) return 0;
  return typeof arm.mutation.score === "number" ? arm.mutation.score : null;
}

/**
 * The quality criterion the margins declare (E4.5): the candidate's mean
 * mutation score may trail the baseline's by at most
 * `max_mutation_score_deficit` points, and the blind review may prefer the
 * baseline in both orders in at most `max_consistent_baseline_preferences`
 * pairs. Every pair must be judged.
 */
function evaluateQuality(results, criterion) {
  const entries = Object.values(results.scenarios);
  const scores = (arm) => entries.map((entry) => criterionScore(entry[arm])).filter((value) => value !== null);
  const mutation = { baseline: taskInterval(scores("baseline")), candidate: taskInterval(scores("candidate")) };
  const reasons = [];
  if (mutation.baseline.mean === null || mutation.candidate.mean === null) {
    reasons.push("a record has no mutation score to compare");
  } else {
    const deficit = Math.round((mutation.baseline.mean - mutation.candidate.mean) * 100) / 100;
    if (deficit > criterion.max_mutation_score_deficit) {
      reasons.push(`the candidate's mean mutation score trails the baseline's by ${deficit} points (margin ${criterion.max_mutation_score_deficit})`);
    }
  }
  const judged = entries.filter((entry) => entry.judge);
  if (judged.length < entries.length) reasons.push(`${entries.length - judged.length} of ${entries.length} pairs are not judged`);
  const baselinePreferences = judged.filter((entry) => entry.judge.preferred === "baseline").length;
  if (baselinePreferences > criterion.max_consistent_baseline_preferences) {
    reasons.push(`the blind review prefers the baseline in both orders in ${baselinePreferences} pairs (margin ${criterion.max_consistent_baseline_preferences})`);
  }
  return { decision: reasons.length === 0 ? "continue" : "revise", mutation, pairs: judged.length, baseline_preferences: baselinePreferences, reasons };
}

function renderInterval(interval) {
  if (interval.mean === null) return "—";
  const ci = interval.ci95 ? ` (IC 95 %: ${interval.ci95.map((value) => Math.round(value * 10) / 10).join(" a ")})` : "";
  return `${Math.round(interval.mean * 10) / 10} %${ci}`;
}

function report(options, { margins = null } = {}) {
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
      judged.every(([, e]) => e.judge.host === "agy")
        ? `Puntuaciones base / candidato (1–5), medias de las dos posiciones. Juez: ${judged[0][1].judge.model} en agy, sin coste en dólares.`
        : `Puntuaciones base / candidato (1–5), medias de las dos posiciones. Coste del juez: $${judged.reduce((s, [, e]) => s + (e.judge.cost_usd || 0), 0).toFixed(2)}.`,
    );
  }
  if (margins && margins.quality) {
    const verdict = evaluateQuality(results, margins.quality);
    lines.push(
      "",
      `## Criterio de calidad (\`${margins.margins_version}\`)`,
      "",
      `- Mutation score medio: ${renderInterval(verdict.mutation.baseline)} → ${renderInterval(verdict.mutation.candidate)}; margen: el candidato no queda más de ${margins.quality.max_mutation_score_deficit} puntos por debajo.`,
      `- Revisión ciega: prefiere la base en los dos órdenes en ${verdict.baseline_preferences} de ${verdict.pairs} pares; margen: como mucho ${margins.quality.max_consistent_baseline_preferences}.`,
      `- Decisión: **${verdict.decision}**${verdict.reasons.length ? `. ${verdict.reasons.join("; ")}.` : "."}`,
    );
  }
  return lines.join("\n");
}

function main(argv) {
  const options = parseArgs(argv);
  if (options.command === "collect") collect(options);
  if (options.command === "judge") judge(options);
  process.stdout.write(`${report(options, { margins: loadMargins().margins })}\n`);
}

if (require.main === module) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = { evaluateQuality, report, suiteCommand };
