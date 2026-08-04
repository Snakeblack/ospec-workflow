"use strict";

const fs = require("node:fs");
const path = require("node:path");

const K2_COVERED_OPS = new Set([
  "status",
  "start",
  "complete",
  "fail",
  "invalidate-node",
  "recover",
]);

const PROSE_LIFECYCLE_PATTERNS = [
  /\barchiv(?:e|ed|ing)\b/i,
  /\bmark(?:ed)?\s+(?:the\s+)?(?:change|status)\s+as\b/i,
  /\bcomplete(?:d)?\s+(?:the\s+)?(?:operation|phase|change)\b/i,
  /\brecover(?:y|ed)?\s+(?:the\s+)?(?:operation|node)\b/i,
  /\bstart(?:ed)?\s+(?:the\s+)?(?:operation|node)\b/i,
];

/**
 * Compatibility boundary for routing: structured K2 ops only; fixed policy preserved.
 * OperationPermit cannot override OpenSpec/Git semantic facts — bridges remain non-authoritative.
 */
function routeK2Operation(action = {}) {
  if (!action || !K2_COVERED_OPS.has(action.operation)) {
    return { ok: false, code: "unknown-k2-operation", route_policy: "fixed", adaptive: false };
  }
  return {
    ok: true,
    source: "k2",
    operation: action.operation,
    arguments: action.arguments || {},
    authorityToken: action.authorityToken || null,
    operationPermit: action.operationPermit || null,
    route_policy: "fixed",
    adaptive: false,
    // Permits authorize kernel mutations; they do not become a second lifecycle authority.
    second_lifecycle_authority: false,
    openspec_git_sole_authority: true,
  };
}

/**
 * Reject attempts to treat OperationPermit as OpenSpec/Git semantic override.
 */
function assertPermitDoesNotOverrideAuthority({ permit, openspecFact, gitFact } = {}) {
  if (permit && (openspecFact === undefined || gitFact === undefined)) {
    return {
      ok: false,
      code: "authority-facts-required",
      hint: "OpenSpec/Git facts remain sole semantic authority",
    };
  }
  if (permit && permit.overrides_openspec === true) {
    return { ok: false, code: "permit-cannot-override-openspec" };
  }
  if (permit && permit.overrides_git === true) {
    return { ok: false, code: "permit-cannot-override-git" };
  }
  return {
    ok: true,
    second_lifecycle_authority: false,
    openspec_git_sole_authority: true,
  };
}

/**
 * Review-lineage bridge: consume K2 op without resetting immutable history.
 */
function bridgeReviewLineage({ lineage, k2Operation }) {
  if (!lineage || typeof lineage !== "object") {
    return { ok: false, code: "lineage-required" };
  }
  void k2Operation;
  return {
    ok: true,
    reset: false,
    lineage: {
      candidate: lineage.candidate,
      findings: Array.isArray(lineage.findings) ? [...lineage.findings] : [],
      attempts: Array.isArray(lineage.attempts) ? [...lineage.attempts] : [],
      revision: lineage.revision,
    },
  };
}

/**
 * Archive bridge: preserve journal history and rollback capability.
 */
function bridgeArchiveTransaction({ journal, k2Operation }) {
  if (!Array.isArray(journal)) {
    return { ok: false, code: "journal-required" };
  }
  void k2Operation;
  return {
    ok: true,
    journal: journal.map((entry) => ({ ...entry })),
    rollback_supported: true,
    history_rewritten: false,
  };
}

/**
 * Stop prose interpretation for lifecycle ops covered by K2.
 */
function rejectProseLifecycleOperation({ prose, coveredOperations = [] }) {
  const text = String(prose || "");
  const covered = new Set(coveredOperations);
  const looksLifecycle = PROSE_LIFECYCLE_PATTERNS.some((re) => re.test(text));
  if (!looksLifecycle) {
    return { ok: true, reason: "non-lifecycle-prose" };
  }
  // If any K2 covered ops exist, reject prose lifecycle instructions.
  if (covered.size > 0 || K2_COVERED_OPS.size > 0) {
    return {
      ok: false,
      code: "prose-lifecycle-rejected",
      hint: "Use a structured K2 kernel operation instead of prose lifecycle instructions",
    };
  }
  return { ok: true };
}

function listJsFiles(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "configure") continue;
      listJsFiles(absolute, acc);
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".js") && !entry.name.endsWith(".test.js")) {
      acc.push(absolute);
    }
  }
  return acc;
}

/**
 * True when source defines reduceLifecycle (function/const/arrow/exports), not mere imports/re-exports.
 */
function sourceDefinesReduceLifecycle(source) {
  if (typeof source !== "string" || !source) return false;
  const definitionPatterns = [
    /\bfunction\s+reduceLifecycle\b/,
    /\breduceLifecycle\s*=\s*async\s*function\b/,
    /\breduceLifecycle\s*=\s*function\b/,
    /\b(?:const|let|var)\s+reduceLifecycle\s*=/,
    /\breduceLifecycle\s*=\s*async\s*\(/,
    /\breduceLifecycle\s*=\s*\(/,
    /\breduceLifecycle\s*=\s*async\s*[A-Za-z_$][\w$]*/,
    /\bexports\.reduceLifecycle\s*=/,
    /\bmodule\.exports\.reduceLifecycle\s*=/,
  ];
  return definitionPatterns.some((pattern) => pattern.test(source));
}

/**
 * Ensure only lifecycle-kernel owns reduceLifecycle.
 */
function assertSingleLifecycleReducer(rootDir) {
  const scriptsLib = path.join(rootDir, "scripts", "lib");
  const files = listJsFiles(scriptsLib);
  const extra = [];
  for (const absolute of files) {
    const relative = path.relative(rootDir, absolute).split(path.sep).join("/");
    if (relative === "scripts/lib/lifecycle-kernel/reducer.js") continue;
    // index.js re-exports; allow require of reducer but not a second function definition.
    if (relative === "scripts/lib/lifecycle-kernel/index.js") continue;
    const source = fs.readFileSync(absolute, "utf8");
    if (sourceDefinesReduceLifecycle(source)) {
      extra.push(relative);
    }
  }
  return { ok: extra.length === 0, extra_reducers: extra };
}

module.exports = {
  routeK2Operation,
  bridgeReviewLineage,
  bridgeArchiveTransaction,
  rejectProseLifecycleOperation,
  assertSingleLifecycleReducer,
  sourceDefinesReduceLifecycle,
  assertPermitDoesNotOverrideAuthority,
  K2_COVERED_OPS,
};
