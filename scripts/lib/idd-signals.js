"use strict";

// Impact signal derivation for IDD changes (openspec/specs/idd/spec.md,
// REQ-idd-006, REQ-idd-008, REQ-idd-012). Signals come first from the declared
// intent and planned paths (source: declaration) and then from the real diff
// (source: diff); each carries the reason it fired. The path-driven signals are
// the K1 hard floors of PP1/PP2 under their IDD names, so the K1 floor is
// reported alongside. Pure: idd-workspace.js reads the diff and the config.

const { classifyChange } = require("./change-classification.js");
const { SIGNALS, isIntentAmbiguous } = require("./idd-contract.js");
const { IMPACT_SIGNALS, matchImpact, normalizePath } = require("./idd-impact.js");
const { IddRecordError, recordGate, recordSignal } = require("./idd-record.js");

// K1 hard-floor evidence key → IDD signal. mechanical_no_behavior has no
// signal: a mechanical change only lowers the floor.
const FLOOR_SIGNALS = Object.freeze({
  data_migration: "persistent-data",
  auth_security: "security-boundary",
  public_api: "public-contract",
  localized_reproducible_bug: "bug-fix",
});

const IMPACT_LABELS = Object.freeze({
  "public-contract": "public contract",
  "persistent-data": "persistent data",
  "security-boundary": "security boundary",
});

const IRREVERSIBLE_OPERATIONS = Object.freeze([
  "drop-table",
  "drop-column",
  "drop-schema",
  "drop-database",
  "truncate-table",
  "delete-data",
  "rewrite-history",
]);

// Read only from added lines of persistent-data files; first match wins.
const DESTRUCTIVE_STATEMENTS = Object.freeze([
  { label: "DROP TABLE", pattern: /\bDROP\s+TABLE\b|\bdrop_?table/i },
  { label: "DROP SCHEMA", pattern: /\bDROP\s+SCHEMA\b/i },
  { label: "DROP DATABASE", pattern: /\bDROP\s+DATABASE\b/i },
  { label: "TRUNCATE", pattern: /\bTRUNCATE\s+(TABLE\s+)?\w/i },
  {
    label: "DROP COLUMN",
    pattern:
      /\bALTER\s+TABLE\b.*\bDROP\s+(?!CONSTRAINT\b|INDEX\b|DEFAULT\b|NOT\s+NULL\b|PRIMARY\b|FOREIGN\b|CHECK\b)|\bdrop_?column\b|\bremove_?column\b/i,
  },
  // Only a complete statement on one line: a WHERE may follow on the next one.
  { label: "DELETE without WHERE", pattern: /^\s*DELETE\s+FROM\s+(?:(?!\bWHERE\b).)*;\s*$/i },
]);

const COMMENT_LINE = /^\s*(--|#|\/\/)/;
const ALWAYS_REASON = "every change with a resolved intent";
const SIGNAL_ORDER = SIGNALS.map((signal) => signal.id);

function sortedPaths(paths) {
  return [...new Set((paths || []).map(normalizePath))].sort();
}

// For each impact signal, the sorted paths that hit it and the first pattern.
// A published path is reported as published, not as a pattern.
function impactHits(paths, patterns) {
  const hits = new Map();
  for (const file of sortedPaths(paths)) {
    for (const { signal, pattern } of matchImpact(file, patterns)) {
      if (!hits.has(signal)) hits.set(signal, { pattern, paths: [] });
      hits.get(signal).paths.push(file);
    }
  }
  return hits;
}

function impactReason(signal, { pattern, paths }, patterns) {
  const more = paths.length > 1 ? ` and ${paths.length - 1} more` : "";
  const why = (patterns.published || []).includes(pattern) ? "published by package.json" : `matches ${pattern}`;
  return `${IMPACT_LABELS[signal]}: touches ${paths[0]}${more} (${why})`;
}

function destructiveStatement(diff, patterns) {
  const addedLines = diff.addedLines || {};
  for (const file of sortedPaths(diff.paths)) {
    if (!matchImpact(file, patterns).some((hit) => hit.signal === "persistent-data")) continue;
    const lines = addedLines[file] || [];
    for (const { label, pattern } of DESTRUCTIVE_STATEMENTS) {
      if (lines.some((line) => !COMMENT_LINE.test(line) && pattern.test(line))) {
        return `irreversible operation: ${label} in ${file}`;
      }
    }
  }
  return null;
}

function floorOf(intent, signalIds) {
  const impact = {};
  for (const [key, signal] of Object.entries(FLOOR_SIGNALS)) {
    if (signalIds.has(signal)) impact[key] = true;
  }
  if (intent.kind === "docs") impact.docs_only = true;
  return classifyChange({ impact }).risk;
}

/**
 * @param {{
 *   intent: {kind: string} | null,   null while the intent is ambiguous
 *   strictTdd?: boolean,
 *   declaration?: {paths?: string[], workUnits?: number, nonObviousDecision?: boolean, operations?: string[]},
 *   diff?: {paths?: string[], addedLines?: Record<string, string[]>},
 *   patterns: object,                resolvePatterns() of idd-impact.js
 * }} input
 */
function deriveSignals({ intent, strictTdd = false, declaration = {}, diff = {}, patterns }) {
  if (!intent) return { signals: [], gates: [], floor: null, floor_source: null };

  const found = new Map();
  const add = (id, reason, source) => {
    if (!found.has(id)) found.set(id, { id, reason, source });
  };

  add("always", ALWAYS_REASON, "declaration");
  if (strictTdd && intent.kind !== "docs") add("strict-tdd", "the project declares strict_tdd", "declaration");
  if (intent.kind === "bug") add("bug-fix", "the intent is a bug fix", "declaration");
  if ((declaration.workUnits || 0) > 1) {
    add("multi-unit-or-decision", `declared ${declaration.workUnits} work units`, "declaration");
  } else if (declaration.nonObviousDecision) {
    add("multi-unit-or-decision", "declared a non-obvious decision", "declaration");
  }
  for (const [source, paths] of [
    ["declaration", declaration.paths],
    ["diff", diff.paths],
  ]) {
    const hits = impactHits(paths, patterns);
    for (const signal of IMPACT_SIGNALS) {
      if (hits.has(signal)) add(signal, impactReason(signal, hits.get(signal), patterns), source);
    }
  }

  const gates = [];
  const operation = (declaration.operations || []).find((op) => IRREVERSIBLE_OPERATIONS.includes(op));
  const gateReason = operation ? `irreversible operation: declared ${operation}` : destructiveStatement(diff, patterns);
  if (gateReason) gates.push({ id: "irreversible-operation", reason: gateReason });

  const signals = [...found.values()].sort((a, b) => SIGNAL_ORDER.indexOf(a.id) - SIGNAL_ORDER.indexOf(b.id));
  const risk = floorOf(intent, new Set(found.keys()));
  return { signals, gates, floor: risk.floor, floor_source: risk.floor_source };
}

// Records what a derivation adds to the stored state. Signals and gates already
// recorded stay as they are, and a signal the derivation misses is never
// dropped (REQ-idd-006).
function applyDerivation(state, derivation) {
  if (state.status === "closed") throw new IddRecordError("change-closed", `change ${state.change} is closed`);
  if (isIntentAmbiguous(state)) {
    throw new IddRecordError("ambiguous-intent-open", "no signal is derived while the intent is ambiguous");
  }
  let current = state;
  const added = { signals: [], gates: [] };
  for (const signal of derivation.signals) {
    const result = recordSignal(current, signal);
    if (result.changed) added.signals.push(signal.id);
    current = result.state;
  }
  for (const gate of derivation.gates) {
    const result = recordGate(current, { id: gate.id, action: "open", reason: gate.reason });
    if (result.changed) added.gates.push(gate.id);
    current = result.state;
  }
  return { state: current, changed: added.signals.length + added.gates.length > 0, added };
}

module.exports = {
  DESTRUCTIVE_STATEMENTS,
  FLOOR_SIGNALS,
  IRREVERSIBLE_OPERATIONS,
  applyDerivation,
  deriveSignals,
};
