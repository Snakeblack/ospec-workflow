"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const { main, parseArgs } = require("./install-global-opencode.js");

test("parseArgs handles arguments cleanly", () => {
  assert.deepEqual(parseArgs(["--dry-run"]), {
    dryRun: true,
    validate: true,
    source: undefined,
    dest: undefined,
  });
  assert.deepEqual(parseArgs(["--dest", "/custom/dest"]), {
    dryRun: false,
    validate: true,
    source: undefined,
    dest: "/custom/dest",
  });
});
