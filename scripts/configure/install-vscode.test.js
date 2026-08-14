"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const { parseArgs, getSettingsPaths } = require("./install-vscode.js");

test("parseArgs parses flags cleanly", () => {
  assert.deepEqual(parseArgs(["--dry-run"]), {
    dryRun: true,
    validate: true,
    source: undefined,
  });
  assert.deepEqual(parseArgs(["--no-validate", "--source", "/custom/src"]), {
    dryRun: false,
    validate: false,
    source: "/custom/src",
  });
});

test("getSettingsPaths returns platform-specific paths", () => {
  const winPaths = getSettingsPaths({ platform: "win32", env: { APPDATA: "C:\\Users\\User\\AppData\\Roaming" } });
  assert.ok(winPaths.length > 0);
  assert.equal(winPaths[0].name, "VS Code");
});
