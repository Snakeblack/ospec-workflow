"use strict";

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

    if (node.exhausted && (node.phase === "failed" || node.phase === "interrupted" || node.phase === "terminal")) {
      continue;
    }

    if (node.phase === "interrupted" || node.phase === "failed") {
      out.push(transition("execute", "recover", id));
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
      ({ node }) => node && node.exhausted
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
