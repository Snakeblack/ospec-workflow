"use strict";

// Unified contract lint aggregator (REQ-contract-lint-001).
//
// A single registry of pure checker functions is run to completion — no
// short-circuit on the first failing checker — and every offender from every
// checker is collected into one flat list. `runAllCheckers` is the sole
// aggregation entry point consumed both by `scripts/contract-lint.test.js`
// (the pre-commit/CI harness) and by any ad-hoc caller that wants the full
// offender set for a given repo root.

const { check: checkI1Manifest } = require("./contract-checkers/i1-manifest.js");
const { check: checkCommandsAgents } = require("./contract-checkers/j1-commands-agents.js");
const { check: checkBudgetConstant } = require("./contract-checkers/i3-budget-constant.js");

/**
 * @typedef {Object} Offender
 * @property {string} checker - Name of the checker that reported this offender.
 * @property {string} path - Offending file or artifact path.
 * @property {string} expected - What the contract requires.
 * @property {string} actual - What was actually found.
 * @property {string} message - Self-sufficient, human-readable diagnostic
 *   (REQ-contract-lint-006) — no need to open the checker's source to act on it.
 */

/**
 * @typedef {Object} CheckerContext
 * @property {string} root - Absolute path to the repository root the checker
 *   resolves its own artifact paths from.
 */

/**
 * A pure contract checker: reads whatever artifacts it needs under `ctx.root`
 * and returns the list of offenders found (empty array = pass). MUST NOT
 * mutate the filesystem or network; MUST NOT throw for an expected offender
 * (a thrown error is a checker bug, not a reportable offender — see
 * `runAllCheckers`'s propagation behavior below).
 *
 * @typedef {(ctx: CheckerContext) => Offender[]} Checker
 */

/** @type {Checker[]} */
const DEFAULT_REGISTRY = [checkI1Manifest, checkCommandsAgents, checkBudgetConstant];

/**
 * Runs every checker in `registry` against `ctx` and returns the
 * concatenation of every offender list, without short-circuiting on the
 * first checker that reports offenders (REQ-contract-lint-001). A checker
 * that throws is NOT swallowed — the aggregator lets the error propagate,
 * since a throwing checker is a bug in the checker itself, distinct from a
 * legitimately reported offender.
 *
 * @param {CheckerContext} ctx
 * @param {Checker[]} [registry] - Defaults to the real registered checkers;
 *   callers (tests) MAY override with fakes/spies.
 * @returns {Offender[]}
 */
function runAllCheckers(ctx, registry = DEFAULT_REGISTRY) {
  return registry.flatMap((checker) => checker(ctx));
}

module.exports = { runAllCheckers, DEFAULT_REGISTRY };
