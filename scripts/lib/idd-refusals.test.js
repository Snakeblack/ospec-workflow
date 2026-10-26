"use strict";

// E1.45 cli-one-word-invocation (B5): every refusal of the ospec CLI says how
// to get past it, or is marked by design, with no baseline of exceptions. The
// codes come from the CLI's own sources, so a new refusal fails here until it
// gets one or the other.

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const { REFUSALS, refusalHow } = require("./idd-refusals.js");

const SCRIPTS = path.join(__dirname, "..");
const COMMANDS = ["status", "next", "record", "signals", "check", "run", "review", "close", "doctor", "team", "snapshot", "foundation"];

// The CLI and every module it requires, as the build gathers its runtime.
function cliModules() {
  const seen = new Set();
  const queue = ["ospec.js"];
  while (queue.length > 0) {
    const rel = queue.shift();
    if (seen.has(rel)) continue;
    seen.add(rel);
    const source = fs.readFileSync(path.join(SCRIPTS, rel), "utf8");
    for (const [, dep] of source.matchAll(/require\(\s*["'](\.[^"']+)["']\s*\)/g)) {
      if (dep.endsWith(".json")) continue;
      queue.push(path.posix.normalize(path.posix.join(path.posix.dirname(rel), dep.endsWith(".js") ? dep : `${dep}.js`)));
    }
  }
  return [...seen].sort();
}

// The constructs that raise a coded refusal: the refuse and problem helpers,
// the helpers that require a text, an error built with its code, and an error
// class with a fixed code.
const RAISES = [
  /\b(?:refuse|problem)\(\s*"([a-z][a-z0-9-]*)"/g,
  /\b(?:requireText|text)\(\s*[\w.]+\s*,\s*"([a-z][a-z0-9-]*)"/g,
  /\bnew [A-Z]\w*Error\(\s*"([a-z][a-z0-9-]*)"/g,
  /\bthis\.code = "([a-z][a-z0-9-]*)"/g,
];

function thrownCodes() {
  const codes = new Map();
  for (const rel of cliModules()) {
    const source = fs.readFileSync(path.join(SCRIPTS, rel), "utf8");
    for (const pattern of RAISES) {
      for (const match of source.matchAll(pattern)) {
        const site = `scripts/${rel}:${source.slice(0, match.index).split("\n").length}`;
        codes.set(match[1], [...(codes.get(match[1]) || []), site]);
      }
    }
  }
  return codes;
}

const thrown = thrownCodes();

test("the scan finds the refusals of every construct", () => {
  for (const code of ["change-closed", "reason-required", "answer-incomplete", "not-a-git-repo", "config-invalid", "team-invalid", "usage", "cite-unresolved", "map-missing", "roadmap-missing"]) {
    assert.ok(thrown.has(code), `${code} not found`);
  }
});

test("every code the CLI throws says how to get past it or is marked by design", () => {
  const missing = [...thrown].filter(([code]) => !Object.hasOwn(REFUSALS, code)).map(([code, sites]) => `${code} (${sites[0]})`);
  assert.deepStrictEqual(missing, []);
  for (const [code, entry] of Object.entries(REFUSALS)) {
    const declared = typeof entry === "string" ? entry.trim() !== "" : typeof entry?.byDesign === "string" && entry.byDesign.trim() !== "";
    assert.ok(declared, `${code}: a how or { byDesign: <why> }`);
  }
});

test("the table holds no code the CLI no longer throws", () => {
  assert.deepStrictEqual(Object.keys(REFUSALS).filter((code) => !thrown.has(code)), []);
});

test("a how names only commands the CLI has", () => {
  for (const [code, entry] of Object.entries(REFUSALS)) {
    if (typeof entry !== "string") continue;
    for (const [, command] of entry.matchAll(/\bospec ([a-z]+)/g)) assert.ok(COMMANDS.includes(command), `${code}: ospec ${command}`);
  }
});

test("refusalHow names the change when it is known, and nothing for a refusal by design", () => {
  assert.match(refusalHow("evidence-stale", { change: "fix-it" }), /ospec check --change fix-it/);
  assert.match(refusalHow("evidence-stale"), /ospec check --change <id>/);
  const byDesign = Object.keys(REFUSALS).find((code) => typeof REFUSALS[code] !== "string");
  assert.strictEqual(refusalHow(byDesign, { change: "fix-it" }), null);
  assert.strictEqual(refusalHow("no-such-code"), null);
});
