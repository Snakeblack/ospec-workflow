"use strict";

// Temporary experiment (windows-test-hotspots): times Windows PowerShell 5.1
// starts under the variants that could explain ~16 s per hook call, and a cold
// versus cached ospec-hooks build. Removed before merge.

const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const systemRoot = process.env.SystemRoot || "C:\\Windows";
const powershell = path.join(systemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
const psArgs = ["-NoProfile", "-NonInteractive", "-Command"];
const fresh = () => fs.mkdtempSync(path.join(os.tmpdir(), "ps-exp-"));

function time(label, program, args, env = process.env, options = {}) {
  const runs = [];
  for (let i = 0; i < 3; i += 1) {
    const started = process.hrtime.bigint();
    const result = spawnSync(program, args, { env, encoding: "utf8", timeout: 180000, ...options });
    runs.push(Number(process.hrtime.bigint() - started) / 1e6);
    if (result.status !== 0) console.log(`  ${label} exit ${result.status} ${result.error || ""} ${(result.stderr || "").slice(0, 300)}`);
  }
  console.log(`${label.padEnd(58)} ${runs.map((ms) => `${(ms / 1000).toFixed(2)} s`).join("  ")}`);
}

console.log(`PSModulePath entries: ${(process.env.PSModulePath || "").split(";").length}`);
for (const dir of (process.env.PSModulePath || "").split(";")) {
  let count = "?";
  try { count = fs.readdirSync(dir).length; } catch {}
  console.log(`  ${dir} (${count})`);
}

const home = fresh();
const variants = [
  ["cmd /c node -e 0", process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", "node -e 0"], process.env],
  ["powershell exit 0", powershell, [...psArgs, "exit 0"], process.env],
  ["powershell node -e 0", powershell, [...psArgs, "node -e 0"], process.env],
  ["powershell node -e 0, test HOME/USERPROFILE", powershell, [...psArgs, "node -e 0"], { ...process.env, HOME: home, USERPROFILE: home }],
  ["powershell node -e 0, PSModulePath = $PSHOME only", powershell, [...psArgs, "node -e 0"], { ...process.env, PSModulePath: path.join(path.dirname(powershell), "Modules") }],
  ["powershell node -e 0, PSModuleAnalysisCachePath fresh", powershell, [...psArgs, "node -e 0"], { ...process.env, PSModuleAnalysisCachePath: path.join(fresh(), "cache") }],
  ["powershell & node.exe -e 0 (full path)", powershell, [...psArgs, `& '${process.execPath}' -e 0`], process.env],
  ["powershell node -e 0, test HOME + PSModulePath $PSHOME", powershell, [...psArgs, "node -e 0"], { ...process.env, HOME: home, USERPROFILE: home, PSModulePath: path.join(path.dirname(powershell), "Modules") }],
];
for (const [label, program, args, env] of variants) time(label, program, args, env);

const repo = path.resolve(__dirname, "..", "..");
const bin = path.join(fresh(), "ospec-hooks.exe");
const goCache = fresh();
time("go build, fresh GOCACHE (cold, then cached x2)", "go", ["build", "-o", bin, "./cmd/ospec-hooks"], { ...process.env, GOCACHE: goCache }, { cwd: repo });
