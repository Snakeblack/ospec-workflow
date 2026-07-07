"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { check, checkBudgetRelationship } = require("./i3-budget-constant.js");

const ROOT = path.resolve(__dirname, "..", "..", "..");

test("check({root: ROOT}) returns [] against the real hooks.json + ospec-state.js (mirrors the legacy assertion)", () => {
  assert.deepEqual(check({ root: ROOT }), []);
});

function makeFixtureRoot(t, { timeoutSec, staleMs, retryAttempts, retryDelayMs }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "i3-fixture-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const hooksDir = path.join(root, "hooks");
  fs.mkdirSync(hooksDir, { recursive: true });
  fs.writeFileSync(
    path.join(hooksDir, "hooks.json"),
    JSON.stringify({ hooks: { SessionStart: [{ type: "command", command: "noop", timeout: timeoutSec }] } })
  );

  const libDir = path.join(root, "scripts", "lib");
  fs.mkdirSync(libDir, { recursive: true });
  fs.writeFileSync(
    path.join(libDir, "ospec-state.js"),
    [
      '"use strict";',
      `module.exports = { LOCK_RETRY_ATTEMPTS: ${retryAttempts}, LOCK_RETRY_DELAY_MS: ${retryDelayMs}, LOCK_STALE_MS: ${staleMs} };`,
    ].join("\n")
  );

  return root;
}

test("synthetic-offender: LOCK_STALE_MS exceeding the declared timeout budget yields one offender naming the mismatch", (t) => {
  const root = makeFixtureRoot(t, { timeoutSec: 2, staleMs: 5000, retryAttempts: 100, retryDelayMs: 15 });

  const offenders = check({ root });

  assert.equal(offenders.length, 1);
  assert.equal(offenders[0].checker, "i3-budget-constant");
  assert.match(offenders[0].expected, /2000/);
  assert.match(offenders[0].actual, /5000/);
  assert.match(offenders[0].message, /exceed/);
});

test("synthetic-offender: LOCK_STALE_MS below the retry-window floor yields one offender for the floor breach", (t) => {
  const root = makeFixtureRoot(t, { timeoutSec: 30, staleMs: 100, retryAttempts: 100, retryDelayMs: 15 });

  const offenders = check({ root });

  assert.equal(offenders.length, 1);
  assert.match(offenders[0].expected, />= 1500ms/);
  assert.match(offenders[0].message, /retry-window floor/);
});

test("checkBudgetRelationship: runtime value both above the ceiling and below its own floor yields two offenders", () => {
  // A runtime value can simultaneously exceed one relationship's ceiling and
  // fall short of a stricter floor when the floor itself sits above the
  // ceiling in this synthetic case — proving the two checks are independent,
  // not mutually exclusive branches.
  const offenders = checkBudgetRelationship({
    declaredCeilingMs: 100,
    runtimeValueMs: 200,
    floorMs: 300,
    declaredPath: "fixture/hooks.json",
    runtimePath: "fixture/ospec-state.js",
    runtimeConstantName: "LOCK_STALE_MS",
  });

  assert.equal(offenders.length, 2);
});

test("WARNING 3 fix: missing scripts/lib/ospec-state.js yields an explicit offender instead of throwing MODULE_NOT_FOUND", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "i3-missing-module-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const hooksDir = path.join(root, "hooks");
  fs.mkdirSync(hooksDir, { recursive: true });
  fs.writeFileSync(
    path.join(hooksDir, "hooks.json"),
    JSON.stringify({ hooks: { SessionStart: [{ type: "command", command: "noop", timeout: 30 }] } })
  );
  // Deliberately do NOT create scripts/lib/ospec-state.js.
  fs.mkdirSync(path.join(root, "scripts", "lib"), { recursive: true });

  const offenders = check({ root });

  assert.equal(offenders.length, 1);
  assert.equal(offenders[0].checker, "i3-budget-constant");
  assert.match(offenders[0].message, /ospec-state\.js/);
  assert.match(offenders[0].message, /could not be (required|loaded)/);
});

test("WARNING 3 fix: syntactically-corrupt ospec-state.js yields an explicit offender instead of crashing", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "i3-corrupt-module-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const hooksDir = path.join(root, "hooks");
  fs.mkdirSync(hooksDir, { recursive: true });
  fs.writeFileSync(
    path.join(hooksDir, "hooks.json"),
    JSON.stringify({ hooks: { SessionStart: [{ type: "command", command: "noop", timeout: 30 }] } })
  );

  const libDir = path.join(root, "scripts", "lib");
  fs.mkdirSync(libDir, { recursive: true });
  fs.writeFileSync(path.join(libDir, "ospec-state.js"), "this is not valid javascript {{{");

  const offenders = check({ root });

  assert.equal(offenders.length, 1);
  assert.equal(offenders[0].checker, "i3-budget-constant");
  assert.match(offenders[0].message, /ospec-state\.js/);
});

test("checkBudgetRelationship: passing values yield []", () => {
  const offenders = checkBudgetRelationship({
    declaredCeilingMs: 5000,
    runtimeValueMs: 5000,
    floorMs: 1500,
    declaredPath: "fixture/hooks.json",
    runtimePath: "fixture/ospec-state.js",
    runtimeConstantName: "LOCK_STALE_MS",
  });

  assert.deepEqual(offenders, []);
});
