"use strict";

const fs = require("node:fs");
const path = require("node:path");

/**
 * Scope guard for lifecycle-kernel / Graph / receipt modules.
 * K2a: generic host-contract ports are allowed; concrete host product
 * imports/exports remain forbidden. Later slices (Candidate/Graph authority/
 * attestation/delivery) stay out of scope.
 */

const FORBIDDEN_SYMBOL_PATTERNS = [
  /\bCapabilityProof\b/,
  /\bcreateClaudeHostAdapter\b/,
  /\bAskUserQuestion\b/,
  /\bExecutionGraph\b/,
  /\bexecution_graph\b/,
  /\bexecution-graph\b/,
  /\bObligationManifest\b/,
  /\bcreateCandidate\b/,
  /\bCandidateIdentity\b/,
  /\bcandidate_identity\b/,
  /\bproductiveBudget\b/,
  /\bproductive_budget\b/,
  /\bproductive-budget\b/,
  /\bverifyAttestation\b/,
  /\battestationAuthority\b/,
  /\bdeliveryAuthorization\b/,
  /\bdelivery_authorization\b/,
  /\bdelivery-auth(?:orization)?\b/i,
];

const FORBIDDEN_MODULE_PATTERNS = [
  /host-adapters[\\/]+claude/i,
  /target-profiles[\\/]+claude/i,
  /capability-proof/i,
  /execution-graph/i,
  /obligation-manifest/i,
  /productive-budget/i,
  /delivery-auth/i,
  /attestation-runtime/i,
  /candidate-identity/i,
];

/** Allowed generic host-contract module references (not concrete hosts). */
const ALLOWED_MODULE_PATTERNS = [/host-contract/i, /host-boundary/i];

function stripStringsAndComments(source) {
  return String(source ?? "")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/.*$/gm, "$1")
    .replace(/'(?:\\.|[^'\\])*'/g, "''")
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
    .replace(/`(?:\\.|[^`\\])*`/g, "``")
    .replace(/\/(?:\\\/|[^/\n])+\/[gimsuy]*/g, " ");
}

function isScopeGuardFile(fileLabel) {
  return /(^|[\\/])scope-guard\.js$/.test(String(fileLabel).replace(/\\/g, "/"));
}

function isAllowedGenericHostReference(raw, fileLabel) {
  const haystack = `${raw}\n${fileLabel}`;
  return ALLOWED_MODULE_PATTERNS.some((pattern) => pattern.test(haystack));
}

function scanSourceForScopeViolations(source, fileLabel = "<source>") {
  const raw = String(source ?? "");
  const code = stripStringsAndComments(raw);
  const violations = [];

  // The guard module enumerates banned identifiers; skip self-scan of symbols.
  if (!isScopeGuardFile(fileLabel)) {
    for (const pattern of FORBIDDEN_SYMBOL_PATTERNS) {
      if (pattern.test(code)) {
        violations.push({
          kind: "symbol",
          pattern: pattern.source,
          file: fileLabel,
        });
      }
    }
  }

  for (const pattern of FORBIDDEN_MODULE_PATTERNS) {
    if (isScopeGuardFile(fileLabel)) continue;
    // Only treat require/import/from path references as module imports.
    // Path strings in exclusion inventories (e.g. k1-compat) must not false-positive.
    const importLines = String(raw)
      .split(/\r?\n/)
      .filter((line) => /\brequire\s*\(|\bimport\s+|from\s+['"]/.test(line))
      .join("\n");
    if (pattern.test(importLines) || (pattern.test(fileLabel) && /host-adapters|target-profiles/i.test(pattern.source))) {
      violations.push({
        kind: "module",
        pattern: pattern.source,
        file: fileLabel,
      });
    }
  }

  return { ok: violations.length === 0, violations };
}

function assertK2SourceInScope(source, fileLabel = "<source>") {
  const result = scanSourceForScopeViolations(source, fileLabel);
  if (!result.ok) {
    const error = new Error(
      `K2 scope violation in ${fileLabel}: ${result.violations
        .map((v) => v.pattern)
        .join(", ")}`
    );
    error.code = "k2-scope-violation";
    error.violations = result.violations;
    throw error;
  }
  return result;
}

function listK2ProductionSources(kernelDir) {
  const root = path.resolve(kernelDir);
  if (!fs.existsSync(root)) return [];

  const results = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const absolute = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name.startsWith("__") || entry.name === "node_modules") continue;
        walk(absolute);
        continue;
      }
      if (!entry.isFile()) continue;
      if (!entry.name.endsWith(".js")) continue;
      if (entry.name.endsWith(".test.js")) continue;
      results.push(absolute);
    }
  }
  walk(root);
  return results.sort();
}

function assertK2TreeInScope(kernelDir) {
  const sources = listK2ProductionSources(kernelDir);
  const allViolations = [];
  for (const absolute of sources) {
    const relative = path.basename(absolute);
    const source = fs.readFileSync(absolute, "utf8");
    const result = scanSourceForScopeViolations(source, relative);
    if (!result.ok) allViolations.push(...result.violations);
  }
  if (allViolations.length > 0) {
    const error = new Error(
      `K2 tree scope violations: ${allViolations
        .map((v) => `${v.file}:${v.pattern}`)
        .join("; ")}`
    );
    error.code = "k2-scope-violation";
    error.violations = allViolations;
    throw error;
  }
  return { ok: true, scanned: sources.length, violations: [] };
}

module.exports = {
  FORBIDDEN_SYMBOL_PATTERNS,
  FORBIDDEN_MODULE_PATTERNS,
  ALLOWED_MODULE_PATTERNS,
  scanSourceForScopeViolations,
  assertK2SourceInScope,
  listK2ProductionSources,
  assertK2TreeInScope,
  isAllowedGenericHostReference,
};
