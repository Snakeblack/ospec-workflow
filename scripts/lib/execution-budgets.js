"use strict";

const DEFAULT_NODE_BUDGET = Object.freeze({
  schema_version: 1,
  turns: 10,
  patches: 10,
  commands: 25,
  wall_time_minutes: 30,
  changed_lines: 400,
  allowed_paths: Object.freeze([]),
});

const DEFAULT_AUTHORITY_BUDGET = Object.freeze({
  schema_version: 1,
  effect_attempts: 3,
  authority_mutations: 10,
  evidence_runs: 20,
  review_sweeps: 1,
});

/**
 * Evaluates whether any declared quota in a budget envelope is exhausted.
 * Evaluates the 6 node dimensions (turns, patches, commands, wall_time_minutes, changed_lines, allowed_paths)
 * and the 4 authority dimensions (effect_attempts, authority_mutations, evidence_runs, review_sweeps).
 *
 * @param {Object} [budget] - Budget object or envelope
 * @param {Object} [consumed] - Consumed telemetry or counters
 * @param {Object} [options]
 * @param {boolean} [options.isAuthority]
 * @param {boolean} [options.isNode]
 * @param {string[]} [options.modifiedPaths]
 * @returns {{ ok: boolean, exhausted: boolean, dimension?: string, code?: string, remaining: Object, violations: string[] }}
 */
function isBudgetExhausted(budget = {}, consumed = {}, options = {}) {
  const b = budget || {};
  const c = consumed || {};
  const violations = [];
  const remaining = {};

  const numericNodeKeys = ["turns", "patches", "commands", "wall_time_minutes", "changed_lines"];
  const numericAuthKeys = ["effect_attempts", "authority_mutations", "evidence_runs", "review_sweeps"];

  for (const key of [...numericNodeKeys, ...numericAuthKeys]) {
    if (b[key] !== undefined && typeof b[key] === "number") {
      const limit = b[key];
      const used = Number(c[key] || 0);
      remaining[key] = Math.max(0, limit - used);
    }
  }

  // 1. Check Node Dimensions
  // turns: limit <= 0 or consumed >= limit
  if (b.turns !== undefined && typeof b.turns === "number") {
    const limit = b.turns;
    const used = Number(c.turns || 0);
    if (limit <= 0 || used >= limit) {
      return { ok: false, exhausted: true, dimension: "turns", code: "BUDGET_EXHAUSTED", remaining, violations };
    }
  }

  // patches: limit <= 0 or consumed >= limit (if consumed is provided, consumed > limit or limit <= 0 or consumed >= limit when limit == 0)
  if (b.patches !== undefined && typeof b.patches === "number") {
    const limit = b.patches;
    const used = Number(c.patches || 0);
    if (limit <= 0 || used > limit || (c.patches !== undefined && used >= limit)) {
      return { ok: false, exhausted: true, dimension: "patches", code: "BUDGET_EXHAUSTED", remaining, violations };
    }
  }

  // commands: limit <= 0 or consumed >= limit
  if (b.commands !== undefined && typeof b.commands === "number") {
    const limit = b.commands;
    const used = Number(c.commands || 0);
    if (limit <= 0 || used > limit || (c.commands !== undefined && used >= limit)) {
      return { ok: false, exhausted: true, dimension: "commands", code: "BUDGET_EXHAUSTED", remaining, violations };
    }
  }

  // wall_time_minutes: limit <= 0 or consumed >= limit
  if (b.wall_time_minutes !== undefined && typeof b.wall_time_minutes === "number") {
    const limit = b.wall_time_minutes;
    const used = Number(c.wall_time_minutes || 0);
    if (limit <= 0 || used >= limit) {
      return { ok: false, exhausted: true, dimension: "wall_time_minutes", code: "BUDGET_EXHAUSTED", remaining, violations };
    }
  }

  // changed_lines: limit <= 0 or consumed > limit
  if (b.changed_lines !== undefined && typeof b.changed_lines === "number") {
    const limit = b.changed_lines;
    const used = Number(c.changed_lines || 0);
    if (limit <= 0 || used > limit) {
      return { ok: false, exhausted: true, dimension: "changed_lines", code: "BUDGET_EXHAUSTED", remaining, violations };
    }
  }

  // allowed_paths: check if modified paths are outside allowed globs
  const pathsToCheck = c.modified_paths || options.modifiedPaths || options.modified_paths;
  if (Array.isArray(b.allowed_paths) && b.allowed_paths.length > 0 && Array.isArray(pathsToCheck) && pathsToCheck.length > 0) {
    for (const modPath of pathsToCheck) {
      if (!isPathAllowed(modPath, b.allowed_paths)) {
        violations.push(`Modified path '${modPath}' violates bounded allowed_paths: [${b.allowed_paths.join(", ")}]`);
      }
    }
    if (violations.length > 0) {
      return { ok: false, exhausted: true, dimension: "allowed_paths", code: "ALLOWED_PATHS_VIOLATION", remaining, violations };
    }
  }

  // 2. Check Authority Dimensions
  // effect_attempts: limit <= 0 or consumed >= limit
  if (b.effect_attempts !== undefined && typeof b.effect_attempts === "number") {
    const limit = b.effect_attempts;
    const used = Number(c.effect_attempts || 0);
    if (limit <= 0 || used >= limit) {
      return { ok: false, exhausted: true, dimension: "effect_attempts", code: "AUTHORITY_BUDGET_EXHAUSTED", remaining, violations };
    }
  }

  // authority_mutations: limit <= 0 or consumed > limit (or consumed >= limit when limit == 0)
  if (b.authority_mutations !== undefined && typeof b.authority_mutations === "number") {
    const limit = b.authority_mutations;
    const used = Number(c.authority_mutations || 0);
    if (limit <= 0 || used > limit || (c.authority_mutations !== undefined && used >= limit)) {
      return { ok: false, exhausted: true, dimension: "authority_mutations", code: "AUTHORITY_BUDGET_EXHAUSTED", remaining, violations };
    }
  }

  // evidence_runs: limit <= 0 or consumed > limit (or consumed >= limit when limit == 0)
  if (b.evidence_runs !== undefined && typeof b.evidence_runs === "number") {
    const limit = b.evidence_runs;
    const used = Number(c.evidence_runs || 0);
    if (limit <= 0 || used > limit || (c.evidence_runs !== undefined && used >= limit)) {
      return { ok: false, exhausted: true, dimension: "evidence_runs", code: "AUTHORITY_BUDGET_EXHAUSTED", remaining, violations };
    }
  }

  // review_sweeps: limit <= 0 or consumed > limit (or consumed >= limit when limit == 0)
  if (b.review_sweeps !== undefined && typeof b.review_sweeps === "number") {
    const limit = b.review_sweeps;
    const used = Number(c.review_sweeps || 0);
    if (limit <= 0 || used > limit || (c.review_sweeps !== undefined && used >= limit)) {
      return { ok: false, exhausted: true, dimension: "review_sweeps", code: "AUTHORITY_BUDGET_EXHAUSTED", remaining, violations };
    }
  }

  return { ok: true, exhausted: false, remaining, violations: [] };
}

/**
 * Checks if a node budget is exhausted.
 */
function isNodeBudgetExhausted(budget, consumed = {}, options = {}) {
  const b = { ...DEFAULT_NODE_BUDGET, ...budget };
  return isBudgetExhausted(b, consumed, { ...options, isNode: true });
}

/**
 * Checks if an authority budget is exhausted.
 */
function isAuthorityBudgetExhausted(budget, consumed = {}, options = {}) {
  const b = { ...DEFAULT_AUTHORITY_BUDGET, ...budget };
  return isBudgetExhausted(b, consumed, { ...options, isAuthority: true });
}

/**
 * Evaluates node execution budget against consumed telemetry.
 * @param {Object} [budget]
 * @param {Object} [consumed]
 * @returns {{ ok: boolean, exhausted: boolean, dimension?: string, remaining: Object, code?: string }}
 */
function evaluateNodeBudget(budget = DEFAULT_NODE_BUDGET, consumed = {}) {
  const b = { ...DEFAULT_NODE_BUDGET, ...budget };
  const c = consumed || {};

  const turnsLimit = Number(b.turns ?? 10);
  const turnsConsumed = Number(c.turns || 0);

  const patchesLimit = Number(b.patches ?? 10);
  const patchesConsumed = Number(c.patches || 0);

  const commandsLimit = Number(b.commands ?? 25);
  const commandsConsumed = Number(c.commands || 0);

  const wallTimeLimit = Number(b.wall_time_minutes ?? 30);
  const wallTimeConsumed = Number(c.wall_time_minutes || 0);

  const changedLinesLimit = Number(b.changed_lines ?? 400);
  const changedLinesConsumed = Number(c.changed_lines || 0);

  const remaining = {
    turns: Math.max(0, turnsLimit - turnsConsumed),
    patches: Math.max(0, patchesLimit - patchesConsumed),
    commands: Math.max(0, commandsLimit - commandsConsumed),
    wall_time_minutes: Math.max(0, wallTimeLimit - wallTimeConsumed),
    changed_lines: Math.max(0, changedLinesLimit - changedLinesConsumed),
  };

  if (turnsConsumed >= turnsLimit) {
    return { ok: false, exhausted: true, dimension: "turns", remaining, code: "BUDGET_EXHAUSTED" };
  }
  if (patchesConsumed > patchesLimit) {
    return { ok: false, exhausted: true, dimension: "patches", remaining, code: "BUDGET_EXHAUSTED" };
  }
  if (commandsConsumed > commandsLimit) {
    return { ok: false, exhausted: true, dimension: "commands", remaining, code: "BUDGET_EXHAUSTED" };
  }
  if (wallTimeConsumed >= wallTimeLimit) {
    return { ok: false, exhausted: true, dimension: "wall_time_minutes", remaining, code: "BUDGET_EXHAUSTED" };
  }
  if (changedLinesConsumed > changedLinesLimit) {
    return { ok: false, exhausted: true, dimension: "changed_lines", remaining, code: "BUDGET_EXHAUSTED" };
  }

  return { ok: true, exhausted: false, remaining };
}

/**
 * Evaluates authority effect budget against consumed actions.
 * @param {Object} [budget]
 * @param {Object} [consumed]
 * @returns {{ ok: boolean, exhausted: boolean, dimension?: string, remaining: Object, code?: string }}
 */
function evaluateAuthorityBudget(budget = DEFAULT_AUTHORITY_BUDGET, consumed = {}) {
  const b = { ...DEFAULT_AUTHORITY_BUDGET, ...budget };
  const c = consumed || {};

  const attemptsLimit = Number(b.effect_attempts ?? 3);
  const attemptsConsumed = Number(c.effect_attempts || 0);

  const mutationsLimit = Number(b.authority_mutations ?? 10);
  const mutationsConsumed = Number(c.authority_mutations || 0);

  const runsLimit = Number(b.evidence_runs ?? 20);
  const runsConsumed = Number(c.evidence_runs || 0);

  const sweepsLimit = Number(b.review_sweeps ?? 1);
  const sweepsConsumed = Number(c.review_sweeps || 0);

  const remaining = {
    effect_attempts: Math.max(0, attemptsLimit - attemptsConsumed),
    authority_mutations: Math.max(0, mutationsLimit - mutationsConsumed),
    evidence_runs: Math.max(0, runsLimit - runsConsumed),
    review_sweeps: Math.max(0, sweepsLimit - sweepsConsumed),
  };

  if (attemptsConsumed >= attemptsLimit) {
    return { ok: false, exhausted: true, dimension: "effect_attempts", remaining, code: "AUTHORITY_BUDGET_EXHAUSTED" };
  }
  if (mutationsConsumed > mutationsLimit) {
    return { ok: false, exhausted: true, dimension: "authority_mutations", remaining, code: "AUTHORITY_BUDGET_EXHAUSTED" };
  }
  if (runsConsumed > runsLimit) {
    return { ok: false, exhausted: true, dimension: "evidence_runs", remaining, code: "AUTHORITY_BUDGET_EXHAUSTED" };
  }
  if (sweepsConsumed > sweepsLimit) {
    return { ok: false, exhausted: true, dimension: "review_sweeps", remaining, code: "AUTHORITY_BUDGET_EXHAUSTED" };
  }

  return { ok: true, exhausted: false, remaining };
}

/**
 * Monotonically decrements a budget by consumed delta without negative underflow.
 * @param {Object} budget
 * @param {Object} delta
 * @returns {Object} newBudget
 */
function decrementBudgetMonotonic(budget, delta = {}) {
  if (!budget || typeof budget !== "object") return budget;
  const result = { ...budget };
  const d = delta || {};

  const numericKeys = [
    "turns",
    "patches",
    "commands",
    "wall_time_minutes",
    "changed_lines",
    "effect_attempts",
    "authority_mutations",
    "evidence_runs",
    "review_sweeps",
  ];

  for (const key of numericKeys) {
    if (result[key] !== undefined && typeof result[key] === "number") {
      const dec = Number(d[key] || 0);
      result[key] = Math.max(0, result[key] - dec);
    }
  }

  return result;
}

/**
 * Checks patch diff lines and paths against node budget quotas.
 * @param {Object} params
 * @param {string|Object} params.patch
 * @param {number} [params.changedLinesLimit]
 * @param {string[]} [params.allowedPaths]
 * @returns {{ ok: boolean, code?: string, changed_lines: number, violations: string[] }}
 */
function checkPatchBounds({ patch, changedLinesLimit, allowedPaths }) {
  const { changed_lines, modified_paths } = parsePatchInfo(patch);

  if (typeof changedLinesLimit === "number" && changed_lines > changedLinesLimit) {
    return {
      ok: false,
      code: "CHANGED_LINES_LIMIT_EXCEEDED",
      changed_lines,
      violations: [`Changed lines (${changed_lines}) exceeds limit (${changedLinesLimit})`],
    };
  }

  if (Array.isArray(allowedPaths) && allowedPaths.length > 0) {
    const violations = [];
    for (const modPath of modified_paths) {
      if (!isPathAllowed(modPath, allowedPaths)) {
        violations.push(modPath);
      }
    }
    if (violations.length > 0) {
      return {
        ok: false,
        code: "ALLOWED_PATHS_VIOLATION",
        changed_lines,
        violations,
      };
    }
  }

  return { ok: true, changed_lines, violations: [] };
}

function parsePatchInfo(patch) {
  if (!patch) return { changed_lines: 0, modified_paths: [] };
  if (typeof patch === "object" && !Array.isArray(patch) && typeof patch.changed_lines === "number") {
    return {
      changed_lines: patch.changed_lines,
      modified_paths: Array.isArray(patch.modified_paths) ? patch.modified_paths : [],
    };
  }

  const text = String(patch);
  const lines = text.split(/\r?\n/);
  let additions = 0;
  let deletions = 0;
  const paths = new Set();

  for (const line of lines) {
    if (line.startsWith("+++ b/")) {
      paths.add(line.slice(6).trim());
    } else if (line.startsWith("--- a/")) {
      paths.add(line.slice(6).trim());
    } else if (line.startsWith("diff --git a/")) {
      const match = /^diff --git a\/(.+?) b\/(.+?)$/.exec(line);
      if (match) {
        paths.add(match[2].trim());
      }
    } else if (line.startsWith("+") && !line.startsWith("+++")) {
      additions += 1;
    } else if (line.startsWith("-") && !line.startsWith("---")) {
      deletions += 1;
    }
  }

  return {
    changed_lines: additions + deletions,
    modified_paths: Array.from(paths),
  };
}

function isPathAllowed(targetPath, allowedGlobs) {
  const normTarget = targetPath.replace(/\\/g, "/");
  return allowedGlobs.some((pattern) => matchGlobPattern(normTarget, pattern.replace(/\\/g, "/")));
}

function matchGlobPattern(str, pattern) {
  if (pattern === str || pattern === "*" || pattern === "**") return true;

  const regexPattern = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\/\*\*\//g, "/(?:.+/)?")
    .replace(/\*\*\//g, "(?:.+/)?")
    .replace(/\/\*\*/g, "(?:/.*)?")
    .replace(/\*\*/g, ".*")
    .replace(/\*/g, "[^/]*");

  const regex = new RegExp(`^${regexPattern}$`);
  return regex.test(str);
}

/**
 * Detects whether an effect-bearing mutation step produced zero semantic progress.
 * @param {Object} params
 * @param {number} [params.modifiedFilesCount]
 * @param {number} [params.changedLines]
 * @param {boolean} [params.stateAdvanced]
 * @param {string} [params.outputHashBefore]
 * @param {string} [params.outputHashAfter]
 * @returns {boolean}
 */
function isZeroDeltaMutation({
  modifiedFilesCount = 0,
  changedLines = 0,
  stateAdvanced = false,
  outputHashBefore,
  outputHashAfter,
} = {}) {
  if (stateAdvanced === true) return false;
  if (Number(modifiedFilesCount || 0) > 0) return false;
  if (Number(changedLines || 0) > 0) return false;

  if (outputHashBefore && outputHashAfter && outputHashBefore !== outputHashAfter) {
    return false;
  }

  return true;
}

module.exports = {
  DEFAULT_NODE_BUDGET,
  DEFAULT_AUTHORITY_BUDGET,
  isBudgetExhausted,
  isNodeBudgetExhausted,
  isAuthorityBudgetExhausted,
  evaluateNodeBudget,
  evaluateAuthorityBudget,
  decrementBudgetMonotonic,
  checkPatchBounds,
  isZeroDeltaMutation,
};
