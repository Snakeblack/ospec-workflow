"use strict";

const { digestLifecycleState } = require("./state-digest.js");
const { authorizeOperationWithPermit } = require("./permits.js");

const OPERATIONS = Object.freeze([
  Object.freeze({ name: "status", mutates: false }),
  Object.freeze({ name: "start", mutates: true }),
  Object.freeze({ name: "complete", mutates: true }),
  Object.freeze({ name: "fail", mutates: true }),
  Object.freeze({ name: "invalidate-node", mutates: true }),
  Object.freeze({ name: "recover", mutates: true }),
  Object.freeze({ name: "repair", mutates: true }),
  Object.freeze({ name: "replan", mutates: true }),
  Object.freeze({ name: "escalate", mutates: false }),
  Object.freeze({ name: "stop", mutates: false }),
  Object.freeze({ name: "decide", mutates: false }),
]);

const OPERATION_BY_NAME = new Map(OPERATIONS.map((op) => [op.name, op]));

function getNode(state, nodeId) {
  if (!state || typeof state !== "object") return null;
  const nodes = state.nodes;
  if (!nodes || typeof nodes !== "object") return null;
  return nodes[nodeId] || null;
}

function allowedOperationsFor(state, nodeId) {
  const node = getNode(state, nodeId);
  if (!node) return ["status", "escalate", "stop", "decide"];
  const phase = node.phase;
  if (phase === "pending") return ["status", "start", "invalidate-node", "stop"];
  if (phase === "started") return ["status", "complete", "fail", "invalidate-node", "stop"];
  if (phase === "interrupted" || phase === "failed") {
    return ["status", "recover", "repair", "replan", "escalate", "stop", "decide", "invalidate-node"];
  }
  if (phase === "completed" || phase === "terminal" || phase === "invalidated") {
    return ["status", "stop"];
  }
  return ["status", "stop"];
}

/**
 * Authorize a lifecycle operation.
 * Mutating ops require a runtime-minted OperationPermit; AuthorityToken alone is insufficient.
 */
function authorizeOperation({
  operation,
  authorityToken = null,
  operationPermit = null,
  permitLedger = null,
  headRevision = null,
  transitionOffer = null,
} = {}) {
  const meta = OPERATION_BY_NAME.get(operation);
  if (!meta) {
    return { ok: false, code: "unknown-operation" };
  }
  if (!meta.mutates) return { ok: true };

  return authorizeOperationWithPermit({
    operation,
    authorityToken,
    operationPermit,
    permitLedger,
    headRevision,
    transitionOffer,
  });
}

function failClosed(state, code, allowed_operations) {
  return {
    ok: false,
    code,
    state_digest: digestLifecycleState(state),
    allowed_operations,
  };
}

function validateOperationTransition(state, action = {}) {
  const operation = action.operation;
  const args = action.arguments && typeof action.arguments === "object" ? action.arguments : {};
  const nodeId = args.node_id;

  if (!OPERATION_BY_NAME.has(operation)) {
    return failClosed(state, "unknown-operation", ["status"]);
  }

  if (operation === "status") {
    return { ok: true };
  }

  const node = getNode(state, nodeId);
  const allowed = allowedOperationsFor(state, nodeId);

  if (operation === "start") {
    if (!node || node.phase !== "pending") {
      return failClosed(state, "invalid-transition", allowed);
    }
    return { ok: true };
  }

  if (operation === "complete") {
    if (!node || node.phase !== "started") {
      return failClosed(state, "invalid-transition", allowed);
    }
    return { ok: true };
  }

  if (operation === "fail") {
    if (!node || node.phase !== "started") {
      return failClosed(state, "invalid-transition", allowed);
    }
    return { ok: true };
  }

  if (operation === "invalidate-node") {
    if (!node) {
      return failClosed(state, "invalid-transition", allowed);
    }
    if (node.phase === "invalidated" || node.phase === "terminal") {
      return failClosed(state, "invalid-transition", allowed);
    }
    return { ok: true };
  }

  if (operation === "recover" || operation === "repair") {
    if (!node || (node.phase !== "interrupted" && node.phase !== "failed")) {
      return failClosed(state, "invalid-transition", allowed);
    }
    return { ok: true };
  }

  if (operation === "replan") {
    if (!node || (node.phase !== "interrupted" && node.phase !== "failed")) {
      return failClosed(state, "invalid-transition", allowed);
    }
    return { ok: true };
  }

  if (operation === "escalate") {
    return { ok: true };
  }

  if (operation === "stop" || operation === "decide") {
    return { ok: true };
  }

  return failClosed(state, "invalid-transition", allowed);
}

module.exports = {
  OPERATIONS,
  authorizeOperation,
  validateOperationTransition,
  allowedOperationsFor,
};
