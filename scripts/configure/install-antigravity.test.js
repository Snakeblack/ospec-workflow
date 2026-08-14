"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const { main, parseArgs, renderHooksValue } = require("./install-antigravity.js");

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

test("renderHooksValue expands placeholder", () => {
  const rendered = renderHooksValue(
    "node __OSPEC_ANTIGRAVITY_ROOT__/scripts/hooks/ospec-hooks-launch.js session-start",
    "/home/user/.gemini/config",
  );
  assert.equal(
    rendered,
    "node /home/user/.gemini/config/scripts/hooks/ospec-hooks-launch.js session-start",
  );
});
