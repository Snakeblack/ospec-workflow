"use strict";

/**
 * Canonical agent identity resolution (REQ-agent-identity-001).
 *
 * Single shared authority consumed by the SubagentStop phase-cost emitter
 * (scripts/hooks/subagent-stop.js), its Go mirror (internal/agentidentity via
 * internal/hooks/subagentstop.go) and bench/CX0 coverage validation
 * (scripts/evals/lib/benchmark.js). Pure functions, no I/O, no registry, no
 * configuration surface: a closed set encoded in code.
 *
 * Prefix grammar (design "Prefix grammar"): a registered name may carry at
 * most one host/plugin prefix expressed as everything before a single ":"
 * separator. The *remainder* — not the prefix — decides ownership: it must be
 * an `sdd-[a-z][a-z0-9-]*` phase agent or one of the six allowlisted review
 * agents. Foreign or double-prefixed names fail closed to UNRESOLVED.
 */

const UNRESOLVED = "unresolved";

const REVIEW_AGENTS = [
  "review-change",
  "review-trust",
  "review-runtime",
  "review-evolution",
  "review-efficiency",
  "review-correction",
];

const REVIEW_AGENT_SET = new Set(REVIEW_AGENTS);

const SDD_AGENT_PATTERN = /^sdd-[a-z][a-z0-9-]*$/;

/**
 * Resolves a registered agent name to exactly one canonical harness agent or
 * to the `UNRESOLVED` sentinel. Never throws: consumers apply their own
 * skip/reject policy on `unresolved` (design "Failure semantics").
 * @param {unknown} rawName nombre registrado crudo del host (puede llevar prefijo)
 * @returns {string} agente canónico o UNRESOLVED
 */
function resolveCanonicalAgent(rawName) {
  if (typeof rawName !== "string") {
    return UNRESOLVED;
  }

  const name = rawName.trim();
  if (!name) {
    return UNRESOLVED;
  }

  let bareName = name;
  if (name.includes(":")) {
    const parts = name.split(":");
    // Exactly one separator with non-empty prefix and non-empty remainder,
    // else the name is malformed/foreign and fails closed.
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      return UNRESOLVED;
    }
    bareName = parts[1];
  }

  if (REVIEW_AGENT_SET.has(bareName) || SDD_AGENT_PATTERN.test(bareName)) {
    return bareName;
  }

  return UNRESOLVED;
}

/**
 * Derives the phase key from a canonical agent name: strips `sdd-` for phase
 * agents; allowlisted review agents are their own phase key; everything else
 * yields "". Semantics preserved verbatim from the prior hook-local
 * derivePhaseKey copies so unprefixed output stays byte-identical (O1).
 * @param {string} canonicalAgent agente canónico (salida de resolveCanonicalAgent)
 * @returns {string} clave de fase ("" cuando no aplica)
 */
function derivePhaseKey(canonicalAgent) {
  if (typeof canonicalAgent !== "string") {
    return "";
  }
  if (canonicalAgent.startsWith("sdd-")) {
    return canonicalAgent.slice("sdd-".length);
  }
  return REVIEW_AGENT_SET.has(canonicalAgent) ? canonicalAgent : "";
}

module.exports = {
  UNRESOLVED,
  REVIEW_AGENTS,
  resolveCanonicalAgent,
  derivePhaseKey,
};
