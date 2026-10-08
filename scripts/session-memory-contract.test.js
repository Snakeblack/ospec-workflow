"use strict";

// REQ-session-memory-001/002/003/004/005/006/007: Engram is never an authority.
// Scans decision-path code and shipped agent/skill sources for Engram or mem_*
// references; only the addendum and the neutral sdd-phase-common table row may
// mention them. Also pins the addendum landmarks (LLM compliance itself is
// inspection-only and out of scope for an automated test).

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "..");
const SCAN_TARGETS = [
  "scripts/lib",
  "scripts/hooks",
  "internal",
  "cmd",
  "schemas/kernel",
  "hooks/hooks.json",
  ".mcp.json",
  "agents",
  "commands",
  "skills",
  "rules",
];
const ALLOWLIST = new Set([
  "rules/engram-session-memory.instructions.md",
  "skills/_shared/sdd-phase-common.md",
]);
// `ospec doctor` detects whether Engram is installed, read-only and never as an
// error (REQ-session-memory-002 exception, adr-20261002-003 amendment).
const DIAGNOSIS = ["scripts/lib/engram-detect.js", "scripts/lib/ospec-doctor.js"];
for (const rel of DIAGNOSIS) ALLOWLIST.add(rel);
// Target profiles only list the addendum path in their `drop` arrays (ADR-001);
// that is generator confinement config, not a decision path.
const ALLOWLIST_PREFIXES = ["scripts/lib/target-profiles/"];
const PATTERN = /engram|\bmem_[a-z_]+/i;
const SKIP_EXT = /\.(exe|png|jpg|gif|zip|gz|wasm|bin)$/i;

function walk(rel, acc) {
  const abs = path.join(ROOT, rel);
  let stat;
  try { stat = fs.statSync(abs); } catch { return acc; }
  if (stat.isFile()) { acc.push(rel); return acc; }
  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".git") continue;
    walk(`${rel}/${entry.name}`, acc);
  }
  return acc;
}

test("the doctor's Engram diagnosis reads no memory and never fails a run", () => {
  for (const rel of DIAGNOSIS) {
    const source = fs.readFileSync(path.join(ROOT, rel), "utf8");
    assert.doesNotMatch(source, /\bmem_[a-z_]+/, `${rel} must not call mem_* tools`);
  }
  const doctor = fs.readFileSync(path.join(ROOT, "scripts/lib/ospec-doctor.js"), "utf8");
  const engram = doctor.slice(doctor.indexOf("function claudeEngramCheck"), doctor.indexOf("// --- project"));
  assert.ok(engram.length > 0, "claudeEngramCheck is missing");
  assert.doesNotMatch(engram, /status: "error"/, "an Engram result is never an error");
});

test("no decision-path or shipped source references Engram outside the allowlist", () => {
  const offenders = [];
  for (const target of SCAN_TARGETS) {
    for (const rel of walk(target, [])) {
      if (ALLOWLIST.has(rel) || ALLOWLIST_PREFIXES.some((prefix) => rel.startsWith(prefix)) || SKIP_EXT.test(rel) || /\.test\.js$/.test(rel) || /_test\.go$/.test(rel)) continue;
      if (PATTERN.test(fs.readFileSync(path.join(ROOT, rel), "utf8"))) offenders.push(rel);
    }
  }
  assert.deepEqual(offenders, []);
});

test("addendum pins trust boundary, pointer convention, state-first recall and failure policy", () => {
  const text = fs.readFileSync(path.join(ROOT, "rules/engram-session-memory.instructions.md"), "utf8");
  const landmarks = [
    /only when the Engram `mem_\*` tools are present/i,
    /untrusted data/i,
    /conflict to investigate/i,
    /Live state wins/,
    /Never save secrets/,
    /`sdd\/\{change\}\/\{phase\}`/,
    /`capture_prompt: false`/,
    /first resolve the next phase from `state\.yaml`/i,
    /never retry/i,
    /never pass a bare path as a field value/i,
  ];
  for (const re of landmarks) assert.match(text, re, `addendum missing landmark ${re}`);
});
