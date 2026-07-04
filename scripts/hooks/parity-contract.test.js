"use strict";

// E1 — Go/JS executable parity contract for the hook fixture family.
// The golden fixtures under internal/testdata/parity/ were previously verified
// ONLY by the Go suite, so the JS hooks could drift silently. This runner
// executes the REAL JS hook process against the same fixtures for EVERY hook
// in the fixture family table below: one fixture set, two implementations,
// both in pre-commit/CI.
//
// Defined divergence point: implementation-specific message text (e.g. a JSON
// parser error string) is never asserted byte-for-byte for a fail-open
// fixture — only stable, implementation-independent fields are compared
// exactly, and any divergent text is compared by shared prefix only.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..", "..");
const FIXTURES_DIR = path.join(ROOT, "internal", "testdata", "parity");

const PARSE_ERROR_PREFIX = "The safety hook could not inspect this tool call:";

function cleanEnv() {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (key.startsWith("DISABLE_")) delete env[key];
  }
  return env;
}

function runHook(hookPath, stdin) {
  const result = spawnSync(process.execPath, [hookPath], {
    input: stdin,
    encoding: "utf8",
    env: cleanEnv(),
    cwd: ROOT,
    shell: false,
  });
  assert.equal(result.status, 0, `hook must exit 0; stderr: ${result.stderr}`);
  return result.stdout.trim();
}

// Fixture-family table (hooks spec, MODIFIED Requirement: Go/JS Executable
// Parity Contract E1, "Fixture family table"). Each entry knows how to spawn
// its hook, its fixture prefix/floor, and how to compare actual vs. expected
// for its documented fail-open fixture(s), if any.
const FIXTURE_FAMILY = [
  {
    hook: "PreToolUse",
    prefix: "pre-tool-use-",
    hookPath: path.join(ROOT, "scripts", "hooks", "pre-tool-use.js"),
    floor: 4,
    // Identifies the fail-open fixture by its expectedStdout content, then
    // compares only the stable fields exactly and the reason by prefix.
    isFailOpen(expected) {
      const parsed = JSON.parse(expected);
      return parsed.hookSpecificOutput.permissionDecisionReason.startsWith(PARSE_ERROR_PREFIX);
    },
    assertFailOpen(actual, expected) {
      const actualParsed = JSON.parse(actual);
      const expectedParsed = JSON.parse(expected);
      assert.equal(
        actualParsed.hookSpecificOutput.hookEventName,
        expectedParsed.hookSpecificOutput.hookEventName,
      );
      assert.equal(
        actualParsed.hookSpecificOutput.permissionDecision,
        expectedParsed.hookSpecificOutput.permissionDecision,
      );
      assert.ok(
        actualParsed.hookSpecificOutput.permissionDecisionReason.startsWith(PARSE_ERROR_PREFIX),
        "fail-open reason must keep the stable prefix (parser suffix is impl-specific)",
      );
    },
  },
  {
    hook: "SubagentStop",
    prefix: "subagent-stop-",
    hookPath: path.join(ROOT, "scripts", "hooks", "subagent-stop.js"),
    floor: 4,
    // A missing/malformed json:result-envelope fence is the documented
    // fail-open case for SubagentStop (hooks spec §8a.1).
    isFailOpen(_expected, fixtureName) {
      return fixtureName.includes("malformed-envelope");
    },
    assertFailOpen(actual, expected) {
      // No implementation-specific message text is surfaced for an envelope
      // failure (stdout is just {"continue":true}), so the stable field
      // (continue:true) is asserted exactly; nothing else is compared.
      assert.equal(JSON.parse(actual).continue, true);
      assert.equal(JSON.parse(expected).continue, true);
    },
    // SubagentStop fixtures reference fixed placeholders for their `cwd`
    // field so the same static JSON works on every machine/OS without ever
    // resolving to a real repo (which could otherwise find and mutate this
    // very change's state.yaml). Substitute each token with its matching
    // checked-in fixture workspace right before spawning: the openspec-free
    // one (no active change) and the phase-cost one (one active change,
    // `demo`, per REQ-hooks-001).
    prepareStdin(rawStdin) {
      const workspace = path.join(FIXTURES_DIR, "subagent-stop-workspace");
      const phaseCostWorkspace = path.join(
        FIXTURES_DIR,
        "subagent-stop-phase-cost-workspace",
      );
      const escapedWorkspace = JSON.stringify(workspace).slice(1, -1);
      const escapedPhaseCostWorkspace = JSON.stringify(phaseCostWorkspace).slice(1, -1);
      return rawStdin
        .split("__SUBAGENT_STOP_FIXTURE_WORKSPACE__")
        .join(escapedWorkspace)
        .split("__SUBAGENT_STOP_PHASE_COST_WORKSPACE__")
        .join(escapedPhaseCostWorkspace);
    },
  },
];

for (const family of FIXTURE_FAMILY) {
  const fixtureFiles = fs
    .readdirSync(FIXTURES_DIR)
    .filter((name) => name.startsWith(family.prefix) && name.endsWith(".json"));

  assert.ok(
    fixtureFiles.length >= family.floor,
    `${family.hook} parity fixture set must not shrink below ${family.floor}`,
  );

  for (const name of fixtureFiles) {
    test(`parity(js) · ${family.hook} · ${name}`, () => {
      const fixture = JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, name), "utf8"));
      const stdin = family.prepareStdin ? family.prepareStdin(fixture.stdin) : fixture.stdin;
      const actual = runHook(family.hookPath, stdin);
      const expected = fixture.expectedStdout;

      if (family.isFailOpen(expected, name)) {
        family.assertFailOpen(actual, expected);
        return;
      }

      assert.equal(actual, expected, `${family.hook} output must match the golden fixture byte-for-byte`);
    });
  }
}
