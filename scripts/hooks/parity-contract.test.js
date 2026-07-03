"use strict";

// E1 — Go/JS executable parity contract for the pre-tool-use hook.
// The golden fixtures under internal/testdata/parity/ were previously verified
// ONLY by the Go suite (TestPreToolUse_ParityFixtures), so the JS hook could
// drift silently. This runner executes the REAL JS hook process against the
// same fixtures: one fixture set, two implementations, both in pre-commit/CI.
//
// Defined divergence point: JSON parser error strings are implementation-
// specific (Go: "invalid character ...", V8: "Expected property name ..."), so
// for the fail-open error fixture the reason is compared by its stable prefix
// and the decision fields exactly. Everything else is byte-for-byte.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..", "..");
const FIXTURES_DIR = path.join(ROOT, "internal", "testdata", "parity");
const HOOK_PATH = path.join(ROOT, "scripts", "hooks", "pre-tool-use.js");

const PARSE_ERROR_PREFIX = "The safety hook could not inspect this tool call:";

function cleanEnv() {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (key.startsWith("DISABLE_")) delete env[key];
  }
  return env;
}

function runJsHook(stdin) {
  const result = spawnSync(process.execPath, [HOOK_PATH], {
    input: stdin,
    encoding: "utf8",
    env: cleanEnv(),
    cwd: ROOT,
    shell: false,
  });
  assert.equal(result.status, 0, `hook must exit 0; stderr: ${result.stderr}`);
  return result.stdout.trim();
}

const fixtureFiles = fs
  .readdirSync(FIXTURES_DIR)
  .filter((name) => name.startsWith("pre-tool-use-") && name.endsWith(".json"));

assert.ok(fixtureFiles.length >= 4, "parity fixture set must not shrink");

for (const name of fixtureFiles) {
  test(`parity(js) · ${name}`, () => {
    const fixture = JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, name), "utf8"));
    const actual = runJsHook(fixture.stdin);
    const expected = fixture.expectedStdout;

    const expectedReason = JSON.parse(expected).hookSpecificOutput.permissionDecisionReason;
    if (expectedReason.startsWith(PARSE_ERROR_PREFIX)) {
      const actualParsed = JSON.parse(actual);
      const expectedParsed = JSON.parse(expected);
      assert.equal(actualParsed.hookSpecificOutput.hookEventName, expectedParsed.hookSpecificOutput.hookEventName);
      assert.equal(actualParsed.hookSpecificOutput.permissionDecision, expectedParsed.hookSpecificOutput.permissionDecision);
      assert.ok(
        actualParsed.hookSpecificOutput.permissionDecisionReason.startsWith(PARSE_ERROR_PREFIX),
        "fail-open reason must keep the stable prefix (parser suffix is impl-specific)"
      );
      return;
    }

    assert.equal(actual, expected, `JS output must match the golden fixture byte-for-byte`);
  });
}
