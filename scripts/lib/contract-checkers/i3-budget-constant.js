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

function loadCodexProfileSource(loadCodexProfile) {
  const codexProfilePath = "scripts/lib/target-profiles/codex.js";
  try {
    const codexProfile = loadCodexProfile();
    if (!codexProfile || !codexProfile.hooks) {
      return { source: null };
    }
    if (typeof codexProfile.hooks.source !== "string" || !codexProfile.hooks.source) {
      return {
        source: null,
        offender: {
          checker: "i3-budget-constant",
          path: codexProfilePath,
          expected: "a requireable profile exporting hooks.source as a non-empty string",
          actual: JSON.stringify(codexProfile.hooks.source),
          message: `${codexProfilePath} must export hooks.source as a non-empty string`,
        },
      };
    }
    return { source: codexProfile.hooks.source };
  } catch (err) {
    return {
      source: null,
      offender: {
        checker: "i3-budget-constant",
        path: codexProfilePath,
        expected: "a requireable profile exporting hooks.source as a non-empty string",
        actual: err.message,
        message: `${codexProfilePath} could not be required/loaded: ${err.message}`,
      },
    };
  }
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
  const loadCodexProfile = ctx.loadCodexProfile || (() => require("../target-profiles/codex.js"));
  const ospecStatePath = path.join(root, "scripts", "lib", "ospec-state.js");
  const runtimePath = toPosix(path.relative(root, ospecStatePath));

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

  const seenPaths = new Set();
  const configsToCheck = [];

  const defaultSource = "hooks/hooks.json";
  configsToCheck.push({
    source: defaultSource,
    label: "default"
  });
  seenPaths.add(defaultSource);

  const offenders = [];
  const codexProfileResult = loadCodexProfileSource(loadCodexProfile);
  if (codexProfileResult.offender) {
    offenders.push(codexProfileResult.offender);
  } else if (codexProfileResult.source && !seenPaths.has(codexProfileResult.source)) {
    configsToCheck.push({
      source: codexProfileResult.source,
      label: "codex"
    });
    seenPaths.add(codexProfileResult.source);
  }

  for (const config of configsToCheck) {
    const hooksJsonPath = path.join(root, config.source);
    const declaredPath = toPosix(path.relative(root, hooksJsonPath));

    let hooksConfig;
    try {
      hooksConfig = JSON.parse(fs.readFileSync(hooksJsonPath, "utf8"));
    } catch (err) {
      offenders.push({
        checker: "i3-budget-constant",
        path: declaredPath,
        expected: "a valid JSON file declaring hooks.SessionStart[0].timeout",
        actual: err.message,
        message: `${declaredPath} could not be read/parsed as JSON: ${err.message}`,
      });
      continue;
    }

    if (hooksConfig === null || typeof hooksConfig !== "object") {
      offenders.push({
        checker: "i3-budget-constant",
        path: declaredPath,
        expected: "hooks config to be a non-null object",
        actual: hooksConfig === null ? "null" : typeof hooksConfig,
        message: `${declaredPath} hooks config must be a non-null object`,
      });
      continue;
    }

    const sessionStartEntry =
      hooksConfig.hooks && Array.isArray(hooksConfig.hooks.SessionStart) ? hooksConfig.hooks.SessionStart[0] : undefined;
    const sessionStartTimeoutSec = sessionStartEntry && sessionStartEntry.timeout;

    if (typeof sessionStartTimeoutSec !== "number" || sessionStartTimeoutSec <= 0) {
      offenders.push({
        checker: "i3-budget-constant",
        path: declaredPath,
        expected: "hooks.SessionStart[0].timeout to be a positive number",
        actual: JSON.stringify(sessionStartTimeoutSec),
        message: `${declaredPath} SessionStart entry must declare a positive numeric timeout`,
      });
      continue;
    }

    const budgetOffenders = checkBudgetRelationship({
      declaredCeilingMs: sessionStartTimeoutSec * 1000,
      runtimeValueMs: LOCK_STALE_MS,
      floorMs: LOCK_RETRY_ATTEMPTS * LOCK_RETRY_DELAY_MS,
      declaredPath,
      runtimePath,
      runtimeConstantName: "LOCK_STALE_MS",
    });

    offenders.push(...budgetOffenders);
  }

  return offenders;
}

module.exports = { check, checkBudgetRelationship };
