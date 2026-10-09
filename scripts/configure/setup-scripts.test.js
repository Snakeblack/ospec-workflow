"use strict";

// E1.24: PowerShell's npm.ps1 swallows the `--` separator, so `npm run
// setup:codex -- --no-sdd` fails there. Every target also has fixed
// `:sdd` / `:no-sdd` scripts that need no separator.

const assert = require("node:assert/strict");
const test = require("node:test");

const { scripts } = require("../../package.json");

const TARGETS = ["claude", "copilot", "opencode", "codex", "vscode", "cursor", "antigravity"];

for (const target of TARGETS) {
  test(`setup:${target} has fixed :sdd and :no-sdd scripts`, () => {
    const base = scripts[`setup:${target}`];
    assert.ok(base, `setup:${target} exists`);
    assert.equal(scripts[`setup:${target}:sdd`], `${base} --with-sdd`);
    assert.equal(scripts[`setup:${target}:no-sdd`], `${base} --no-sdd`);
  });
}
