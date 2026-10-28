#!/usr/bin/env node
"use strict";

// Context baseline report (roadmap E0.0). Builds the 7 targets in memory and
// prints, per target, what a host loads before any work starts.
//   node scripts/measure-context-baseline.js            table + ceiling and budget check
//   node scripts/measure-context-baseline.js --json     full report
//   node scripts/measure-context-baseline.js --update   rewrite the ceilings
//     [--allow-growth <metric> --reason "<why>"]...     each metric that rises (E4.3)

const fs = require("node:fs");
const path = require("node:path");
const { findRegressions, measureSource, updateCeilings } = require("./lib/context-baseline.js");

const ROOT = path.resolve(__dirname, "..");
const CEILINGS = path.join(ROOT, "scripts", "fixtures", "context-baseline.json");
const BUDGET = path.join(ROOT, "scripts", "fixtures", "context-budget.json");
const USAGE = 'usage: node scripts/measure-context-baseline.js [--json | --update [--allow-growth <metric> --reason "<why>"]...]';

// Decimal KB, the unit the roadmap targets and the audit use.
function kb(value) {
  return `${(value / 1000).toFixed(1)} KB`;
}

function table(report) {
  const rows = [["target", "always-on", "router + idd", "+ memory loop", "orchestrator", "skills (installed/listed)", "skill listing", "heaviest agent"]];
  for (const [target, measured] of Object.entries(report.targets)) {
    const [heaviest, agent] = Object.entries(measured.agents).sort(([, a], [, b]) => b.read_bytes - a.read_bytes)[0] || ["-", { read_bytes: 0 }];
    rows.push([
      target, kb(measured.always_on_bytes), kb(measured.default_flow_bytes), kb(measured.memory_flow_bytes), kb(measured.orchestrator.bytes),
      `${measured.skills_installed}/${measured.skills_listed}`, kb(measured.skill_listing_bytes), `${heaviest} ${kb(agent.read_bytes)}`,
    ]);
  }
  const widths = rows[0].map((_, column) => Math.max(...rows.map((row) => row[column].length)));
  return rows.map((row) => row.map((cell, column) => cell.padEnd(widths[column])).join("  ").trimEnd()).join("\n");
}

class UsageError extends Error {}

function parseArgs(argv) {
  const options = { json: argv.includes("--json"), update: argv.includes("--update"), grants: [] };
  const metrics = [];
  const reasons = [];
  argv.forEach((arg, index) => {
    if (arg !== "--allow-growth" && arg !== "--reason") return;
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--") || !value.trim()) throw new UsageError(`${arg} needs a value`);
    (arg === "--allow-growth" ? metrics : reasons).push(value);
  });
  if ((metrics.length || reasons.length) && !options.update) throw new UsageError("--allow-growth and --reason go with --update");
  if (metrics.length !== reasons.length) throw new UsageError("each --allow-growth needs its own --reason");
  const repeated = metrics.find((metric, index) => metrics.indexOf(metric) !== index);
  if (repeated) throw new UsageError(`--allow-growth ${repeated} is repeated`);
  options.grants = metrics.map((metric, index) => ({ metric, reason: reasons[index] }));
  return options;
}

function readJson(file) {
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : null;
}

function rise({ metric, targets }) {
  const values = Object.entries(targets).map(([target, [from, to]]) => `${target} ${from ?? "none"} → ${to}`).join(", ");
  return `grows: ${metric} (${values}); rerun with --allow-growth ${metric} --reason "<why>"\n`;
}

function regression({ kind, target, metric, value, ceiling }) {
  const subject = metric === "target" ? target : `${target} ${metric}`;
  if (kind === "budget") return `over budget: ${subject} = ${value} (budget ${ceiling})\n`;
  if (kind === "over") return `over ceiling: ${subject} = ${value} (ceiling ${ceiling}); reduce it or run --update\n`;
  if (kind === "missing") return `no ceiling: ${subject}; run --update\n`;
  if (value === null) return `ceiling without a measure: ${subject}; run --update\n`;
  return `below ceiling: ${subject} = ${value} (ceiling ${ceiling}); run --update\n`;
}

function update(report, options, io) {
  const result = updateCeilings(report, readJson(io.ceilingsPath), {
    grants: options.grants, budget: readJson(io.budgetPath), version: io.version,
  });
  if (!result.ceilings) {
    for (const metric of result.unused) io.stderr.write(`usage: --allow-growth ${metric}: it does not grow\n`);
    for (const entry of result.ungranted) io.stderr.write(rise(entry));
    for (const entry of result.overBudget) io.stderr.write(regression(entry));
    return result.unused.length ? 2 : 1;
  }
  fs.writeFileSync(io.ceilingsPath, `${JSON.stringify(result.ceilings, null, 2)}\n`, "utf8");
  io.stdout.write(`${table(report)}\n\nceilings written to ${path.relative(ROOT, io.ceilingsPath)}\n`);
  return 0;
}

function main(argv, {
  measure = () => measureSource(ROOT),
  ceilingsPath = CEILINGS,
  budgetPath = BUDGET,
  version = require("../package.json").version,
  stdout = process.stdout,
  stderr = process.stderr,
} = {}) {
  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    stderr.write(`usage: ${error.message}\n${USAGE}\n`);
    return 2;
  }
  const report = measure();
  if (options.json) {
    stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return 0;
  }
  if (options.update) return update(report, options, { ceilingsPath, budgetPath, version, stdout, stderr });
  stdout.write(`${table(report)}\n`);
  const regressions = findRegressions(report, readJson(ceilingsPath) || {}, readJson(budgetPath));
  for (const entry of regressions) stderr.write(regression(entry));
  return regressions.length ? 1 : 0;
}

if (require.main === module) {
  process.exitCode = main(process.argv.slice(2));
}

module.exports = { main, table };
