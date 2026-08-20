"use strict";

const { isBudgetExhausted } = require("../execution-budgets.js");
const { resolvePrimaryFailure } = require("../causal-failure.js");
const { getAllowlistedTransitions } = require("../failure-recovery.js");

/**
 * Explicit total priority for valid transitions.
 * Lower number = higher priority. Secondary key = node_id ascending.
 */
const OPERATION_PRIORITY = Object.freeze({
  recover: 10,
  repair: 10,
  start: 20,
  complete: 30,
  fail: 40,
  "invalidate-node": 50,
  replan: 80,
  escalate: 85,
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
    return [transition("decide", "escalate", null), transition("stop", "stop", null)];
  }

  const out = [];
  for (const { id, node } of nodeEntries(state)) {
    if (!node || typeof node !== "object") continue;

    const isExhausted =
      Boolean(node.exhausted) ||
      (node.budget && isBudgetExhausted(node.budget).exhausted);

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
        for (const op of allowedOps) {
          if (op === "repair" || op === "recover") {
            if (remainingAttempts > 0 && !isExhausted) {
              out.push(transition("execute", "recover", id, { primary_failure: primaryFailure }));
            }
          } else if (op === "replan") {
            out.push(transition("decide", "replan", id, { primary_failure: primaryFailure }));
          } else if (op === "escalate") {
            out.push(transition("decide", "escalate", id, { primary_failure: primaryFailure }));
          } else if (op === "stop") {
            out.push(transition("stop", "stop", id, { primary_failure: primaryFailure }));
          }
        }
      } else {
        if (!isExhausted) {
          out.push(transition("execute", "recover", id));
        }
      }
      continue;
    }
    if (node.phase === "pending") {
      if (!isExhausted) {
        out.push(transition("execute", "start", id));
      }
      continue;
    }
    if (node.phase === "started") {
      out.push(transition("execute", "complete", id));
      out.push(transition("execute", "fail", id));
      continue;
    }
  }

  if (out.length === 0) {
    const allFailures = [
      ...(Array.isArray(state.failures) ? state.failures : []),
      ...nodeEntries(state).map(({ node }) => node?.failure).filter(Boolean),
    ];
    const primary = resolvePrimaryFailure(allFailures);
    if (primary) {
      const allowed = getAllowlistedTransitions(primary.category, { remainingAttempts: 0 });
      const fallbackTransitions = [];
      if (allowed.includes("escalate")) {
        fallbackTransitions.push(transition("decide", "escalate", null, { primary_failure: primary }));
      } else if (allowed.includes("replan")) {
        fallbackTransitions.push(transition("decide", "replan", null, { primary_failure: primary }));
      }
      fallbackTransitions.push(transition("stop", "stop", null));
      return fallbackTransitions;
    }

    const exhausted = nodeEntries(state).some(
      ({ node }) => node && (node.exhausted || (node.budget && isBudgetExhausted(node.budget).exhausted))
    );
    if (exhausted || state.status === "blocked") {
      return [transition("decide", "escalate", null), transition("stop", "stop", null)];
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
