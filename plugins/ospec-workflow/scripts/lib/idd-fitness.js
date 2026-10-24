"use strict";

// Fitness functions of an IDD change (openspec/specs/idd/spec.md, REQ-idd-022).
// The ADRs and quality scenarios in a change's `impacts` bring their fitness
// functions as the change's base commit holds them, so the change cannot
// weaken the check that guards it. A `Check:` line of an ADR, or a `checks`
// entry of a v2 quality scenario, is a command `ospec check` runs; a fitness
// function without one is a manual checklist item that never blocks the close
// (ADR-0005). Pure: idd-workspace.js reads the base, ospec.js runs commands.

const { GATED_IMPACTS } = require("./idd-contract.js");

const LABELS = Object.freeze({ adr: "ADR", scenario: "quality scenario" });

function referenceLabel(entry) {
  return `${LABELS[entry.kind]} ${entry.id}`;
}

// A departure the user approved: the change amends, supersedes or contradicts
// the reference and adr-amend-or-contradict is resolved.
function isExempt(state, entry) {
  if (!GATED_IMPACTS.includes(entry.impact)) return false;
  return state.gates.some((gate) => gate.id === "adr-amend-or-contradict" && gate.status === "resolved");
}

function fitnessOf(entry, sources) {
  if (entry.kind === "adr") {
    const adr = sources.adrs?.get(entry.id);
    if (!adr || adr.status === "superseded") return null;
    return { path: adr.path, checks: adr.checks || [], manual: adr.fitness || null };
  }
  const scenario = sources.scenarios?.get(entry.id);
  if (!scenario) return null;
  return { path: scenario.path, checks: scenario.checks || [], manual: scenario.description || null };
}

/**
 * @param {object} state an IDD change state
 * @param {{adrs?: Map, scenarios?: Map}} sources the fitness functions at the change's base
 * @returns {{checks: object[], manual: object[]}} executable checks and manual items, in impacts order
 */
function fitnessPlan(state, sources) {
  const checks = [];
  const manual = [];
  for (const entry of state.impacts || []) {
    if (isExempt(state, entry)) continue;
    const fitness = fitnessOf(entry, sources);
    if (!fitness) continue;
    const ref = { kind: entry.kind, id: entry.id, path: fitness.path };
    if (fitness.checks.length > 0) {
      for (const command of fitness.checks) checks.push({ ...ref, command });
      continue;
    }
    if (!fitness.manual) continue;
    const attestation = (state.attestations || []).find((item) => item.kind === entry.kind && item.id === entry.id);
    manual.push({ ...ref, fitness: fitness.manual, evidence: attestation?.evidence ?? null });
  }
  return { checks, manual };
}

/** The reason the first failing fitness run blocks, citing its ADR or scenario, or null. */
function fitnessReason(runs) {
  const failed = runs.find((run) => run.exit_code !== 0);
  if (!failed) return null;
  const [kind, id] = failed.ref.split(":");
  return `${referenceLabel({ kind, id })}: fitness check \`${failed.command}\` failed with exit code ${failed.exit_code}`;
}

module.exports = {
  fitnessPlan,
  fitnessReason,
  referenceLabel,
};
