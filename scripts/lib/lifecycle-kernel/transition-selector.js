"use strict";

const { resolvePrimaryFailure } = require("../causal-failure.js");
const { getAllowlistedTransitions } = require("../failure-recovery.js");

/**
 * Explicit total priority for valid transitions.
 * Lower number = higher priority. Secondary key = node_id ascending.
 */
const OPERATION_PRIORITY = Object.freeze({
  recover: 10,
  start: 20,
  complete: 30,
  fail: 40,
  "invalidate-node": 50,
  decide: 90,
  stop: 100,
});

function nodeEntries(state) {
  const nodes = state && state.nodes && typeof state.nodes === "object" ? state.nodes : {};
  return Object.keys(nodes)
    .sort()
    .map((id) => ({ id, node: nodes[id] }));
}

function transition(kind, operation, nodeId, extra = {}) {
  const item = {
    kind,
    operation,
    arguments: nodeId == null ? {} : { node_id: nodeId },
  };
  return { ...item, ...extra };
}

function selectTransitions(state) {
  if (!state || typeof state !== "object") return [transition("stop", "stop", null)];

  if (state.status === "terminal") {
    return [transition("decide", "decide", null), transition("stop", "stop", null)];
  }

  const out = [];
  for (const { id, node } of nodeEntries(state)) {
    if (!node || typeof node !== "object") continue;

    const isExhausted =
      Boolean(node.exhausted) ||
      (node.budget && typeof node.budget.turns === "number" && node.budget.turns <= 0) ||
      (node.budget && typeof node.budget.effect_attempts === "number" && node.budget.effect_attempts <= 0);

    if (isExhausted && (node.phase === "failed" || node.phase === "interrupted" || node.phase === "terminal")) {
      continue;
    }

    if (node.phase === "interrupted" || node.phase === "failed") {
      // Check causal failure taxonomy allowlist if failure descriptor is present
      const failures = [node.failure, ...(Array.isArray(node.failures) ? node.failures : []), ...(Array.isArray(state.failures) ? state.failures : [])].filter(Boolean);
      const primaryFailure = resolvePrimaryFailure(failures);

      if (primaryFailure) {
        const remainingAttempts = (node.budget && typeof node.budget.turns === "number")
          ? node.budget.turns
          : Math.max(0, 3 - Number(node.attempt || 0));

        const allowedOps = getAllowlistedTransitions(primaryFailure.category, { remainingAttempts });
        // Only permit automatic recover if repair or direct retry is allowlisted
        if (allowedOps.includes("repair") && remainingAttempts > 0) {
          out.push(transition("execute", "recover", id, { primary_failure: primaryFailure }));
        }
      } else {
        out.push(transition("execute", "recover", id));
      }
      continue;
    }
    if (node.phase === "pending") {
      out.push(transition("execute", "start", id));
      continue;
    }
    if (node.phase === "started") {
      out.push(transition("execute", "complete", id));
      out.push(transition("execute", "fail", id));
      continue;
    }
  }

  if (out.length === 0) {
    const exhausted = nodeEntries(state).some(
      ({ node }) => node && (node.exhausted || (node.budget && node.budget.turns <= 0))
    );
    if (exhausted || state.status === "blocked") {
      return [transition("decide", "decide", null), transition("stop", "stop", null)];
    }
    return [transition("stop", "stop", null)];
  }

  out.sort((a, b) => {
    const pa = OPERATION_PRIORITY[a.operation] ?? 999;
    const pb = OPERATION_PRIORITY[b.operation] ?? 999;
    if (pa !== pb) return pa - pb;
    const na = a.arguments.node_id || "";
    const nb = b.arguments.node_id || "";
    if (na < nb) return -1;
    if (na > nb) return 1;
    return 0;
  });

  return out;
}

function nextTransition(state) {
  const transitions = selectTransitions(state);
  return transitions[0] || transition("stop", "stop", null);
}

module.exports = {
  OPERATION_PRIORITY,
  selectTransitions,
  nextTransition,
};
