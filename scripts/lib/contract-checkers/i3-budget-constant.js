"use strict";

// I3 checker: declared-budget<->runtime-constant coherence (REQ-contract-lint-004).
//
// Extracted (not reimplemented) from `scripts/lib/ospec-state.test.js`
// (~928-957): `hooks/hooks.json`'s `SessionStart` timeout budget versus the
// lock module's `LOCK_STALE_MS`/`LOCK_RETRY_ATTEMPTS`/`LOCK_RETRY_DELAY_MS`
// constants. The relationship MUST hold in both directions — the runtime
// stale-window constant MUST NOT exceed the declared timeout ceiling, and
// MUST NOT fall below the retry-window floor.
//
// Generalized as "declared value in, runtime constant in, relationship
// assertion in" (`checkBudgetRelationship`) so a future budget/constant pair
// can reuse the same shape without inventing a new checker type. A single
// parameterized helper reused once (the SessionStart/LOCK_* pair) is
// sufficient for this change — no plugin registry for hypothetical future
// pairs is introduced.

const fs = require("node:fs");
const path = require("node:path");

function toPosix(relativePath) {
  return relativePath.split(path.sep).join("/");
}

/**
 * Generalized declared-budget<->runtime-constant relationship check: the
 * runtime value MUST be `<= declaredCeilingMs` (does not exceed the declared
 * budget) and `>= floorMs` (does not fall below the declared floor).
 *
 * @param {{declaredCeilingMs: number, runtimeValueMs: number, floorMs: number,
 *   declaredPath: string, runtimePath: string, runtimeConstantName: string}} params
 * @returns {import("../contract-lint.js").Offender[]}
 */
function checkBudgetRelationship({
  declaredCeilingMs,
  runtimeValueMs,
  floorMs,
  declaredPath,
  runtimePath,
  runtimeConstantName,
}) {
  const offenders = [];

  if (!(runtimeValueMs <= declaredCeilingMs)) {
    offenders.push({
      checker: "i3-budget-constant",
      path: runtimePath,
      expected: `${runtimeConstantName} <= ${declaredCeilingMs}ms (declared budget in ${declaredPath})`,
      actual: `${runtimeConstantName} = ${runtimeValueMs}ms`,
      message: `${runtimeConstantName} (${runtimeValueMs}ms) must not exceed the declared timeout budget (${declaredCeilingMs}ms) in ${declaredPath}`,
    });
  }

  if (!(runtimeValueMs >= floorMs)) {
    offenders.push({
      checker: "i3-budget-constant",
      path: runtimePath,
      expected: `${runtimeConstantName} >= ${floorMs}ms (retry-window floor)`,
      actual: `${runtimeConstantName} = ${runtimeValueMs}ms`,
      message: `${runtimeConstantName} (${runtimeValueMs}ms) must be >= the retry-window floor (${floorMs}ms)`,
    });
  }

  return offenders;
}

/**
 * Reference instance: `hooks/hooks.json`'s `SessionStart` timeout versus
 * `scripts/lib/ospec-state.js`'s `LOCK_STALE_MS`/`LOCK_RETRY_ATTEMPTS`/
 * `LOCK_RETRY_DELAY_MS` constants.
 *
 * @param {{root: string}} ctx
 * @returns {import("../contract-lint.js").Offender[]}
 */
function check(ctx) {
  const root = ctx.root;
  const hooksJsonPath = path.join(root, "hooks", "hooks.json");
  const ospecStatePath = path.join(root, "scripts", "lib", "ospec-state.js");
  const declaredPath = toPosix(path.relative(root, hooksJsonPath));
  const runtimePath = toPosix(path.relative(root, ospecStatePath));

  let hooksConfig;
  try {
    hooksConfig = JSON.parse(fs.readFileSync(hooksJsonPath, "utf8"));
  } catch (err) {
    return [
      {
        checker: "i3-budget-constant",
        path: declaredPath,
        expected: "a valid JSON file declaring hooks.SessionStart[0].timeout",
        actual: err.message,
        message: `${declaredPath} could not be read/parsed as JSON: ${err.message}`,
      },
    ];
  }

  const sessionStartEntry =
    hooksConfig.hooks && Array.isArray(hooksConfig.hooks.SessionStart) ? hooksConfig.hooks.SessionStart[0] : undefined;
  const sessionStartTimeoutSec = sessionStartEntry && sessionStartEntry.timeout;

  if (typeof sessionStartTimeoutSec !== "number" || sessionStartTimeoutSec <= 0) {
    return [
      {
        checker: "i3-budget-constant",
        path: declaredPath,
        expected: "hooks.SessionStart[0].timeout to be a positive number",
        actual: JSON.stringify(sessionStartTimeoutSec),
        message: `${declaredPath} SessionStart entry must declare a positive numeric timeout`,
      },
    ];
  }

  let lockModule;
  try {
    lockModule = require(ospecStatePath);
  } catch (err) {
    return [
      {
        checker: "i3-budget-constant",
        path: runtimePath,
        expected: "a requireable module exporting LOCK_RETRY_ATTEMPTS, LOCK_RETRY_DELAY_MS, LOCK_STALE_MS",
        actual: err.message,
        message: `${runtimePath} could not be required/loaded: ${err.message}`,
      },
    ];
  }

  const { LOCK_RETRY_ATTEMPTS, LOCK_RETRY_DELAY_MS, LOCK_STALE_MS } = lockModule;

  return checkBudgetRelationship({
    declaredCeilingMs: sessionStartTimeoutSec * 1000,
    runtimeValueMs: LOCK_STALE_MS,
    floorMs: LOCK_RETRY_ATTEMPTS * LOCK_RETRY_DELAY_MS,
    declaredPath,
    runtimePath,
    runtimeConstantName: "LOCK_STALE_MS",
  });
}

module.exports = { check, checkBudgetRelationship };
