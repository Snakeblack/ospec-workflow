#!/usr/bin/env node
"use strict";

// Context baseline report (roadmap E0.0). Builds the 7 targets in memory and
// prints, per target, what a host loads before any work starts.
//   node scripts/measure-context-baseline.js            table + ceiling check
//   node scripts/measure-context-baseline.js --json     full report
//   node scripts/measure-context-baseline.js --update   rewrite the ceilings

const fs = require("node:fs");
const path = require("node:path");
const { ceilingsFrom, findRegressions, measureSource } = require("./lib/context-baseline.js");

const ROOT = path.resolve(__dirname, "..");
const CEILINGS = path.join(ROOT, "scripts", "fixtures", "context-baseline.json");

// Decimal KB, the unit the roadmap targets and the audit use.
function kb(value) {
  return `${(value / 1000).toFixed(1)} KB`;
}

function table(report) {
  const rows = [["target", "always-on", "orchestrator", "skills (installed/listed)", "skill listing", "heaviest agent"]];
  for (const [target, measured] of Object.entries(report.targets)) {
    const [heaviest, agent] = Object.entries(measured.agents).sort(([, a], [, b]) => b.read_bytes - a.read_bytes)[0] || ["-", { read_bytes: 0 }];
    rows.push([target, kb(measured.always_on_bytes), kb(measured.orchestrator.bytes), `${measured.skills_installed}/${measured.skills_listed}`, kb(measured.skill_listing_bytes), `${heaviest} ${kb(agent.read_bytes)}`]);
  }
  const widths = rows[0].map((_, column) => Math.max(...rows.map((row) => row[column].length)));
  return rows.map((row) => row.map((cell, column) => cell.padEnd(widths[column])).join("  ").trimEnd()).join("\n");
}

function main(argv) {
  const report = measureSource(ROOT);
  if (argv.includes("--json")) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return 0;
  }
  if (argv.includes("--update")) {
    fs.writeFileSync(CEILINGS, `${JSON.stringify(ceilingsFrom(report), null, 2)}\n`, "utf8");
    process.stdout.write(`${table(report)}\n\nceilings written to ${path.relative(ROOT, CEILINGS)}\n`);
    return 0;
  }
  process.stdout.write(`${table(report)}\n`);
  const regressions = findRegressions(report, JSON.parse(fs.readFileSync(CEILINGS, "utf8")));
  for (const { target, metric, value, ceiling } of regressions) {
    process.stderr.write(`over ceiling: ${target} ${metric} = ${value} (ceiling ${ceiling ?? "none"})\n`);
  }
  return regressions.length ? 1 : 0;
}

if (require.main === module) {
  process.exitCode = main(process.argv.slice(2));
}

module.exports = { main, table };
