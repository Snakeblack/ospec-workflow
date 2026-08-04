"use strict";

const {
  authorizeOperation,
  validateOperationTransition,
} = require("./operations.js");

const DEFAULT_EFFECT_CLASS = "idempotent-keyed";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function pushPersistEffect(effects, effectId, nodeId, phase, effectClass = DEFAULT_EFFECT_CLASS) {
  effects.push({
    effect_id: effectId,
    kind: "persist-node",
    payload: { node_id: nodeId, phase },
    effect_class: effectClass,
  });
}

function reduceLifecycle(state, action = {}) {
  const input = state && typeof state === "object" ? state : { schema_version: 1, status: "ready", nodes: {} };
  const operation = action.operation;
  const args = action.arguments && typeof action.arguments === "object" ? action.arguments : {};

  if (operation === "status") {
    return {
      state: clone(input),
      effects: [],
      events: [{ kind: "status-read", subject: null, payload: {} }],
      outcome: "advanced",
    };
  }

  const auth = authorizeOperation({
    operation,
    authorityToken: action.authorityToken,
    operationPermit: action.operationPermit,
    permitLedger: action.permitLedger,
    headRevision: action.headRevision,
    transitionOffer: action.transitionOffer,
  });
  if (!auth.ok) {
    return {
      state: clone(input),
      effects: [],
      events: [],
      outcome: "blocked",
      code: auth.code,
    };
  }

  const validation = validateOperationTransition(input, { operation, arguments: args });
  if (!validation.ok) {
    return {
      state: clone(input),
      effects: [],
      events: [],
      outcome: "blocked",
      code: validation.code,
      allowed_operations: validation.allowed_operations,
    };
  }

  const next = clone(input);
  const nodeId = args.node_id;
  const node = next.nodes[nodeId];
  const effects = [];
  const events = [];
  const effectClass = action.effect_class || DEFAULT_EFFECT_CLASS;

  if (operation === "start") {
    node.phase = "started";
    node.attempt = Number(node.attempt || 0) + 1;
    next.status = "running";
    pushPersistEffect(effects, `effect:start:${nodeId}`, nodeId, "started", effectClass);
    events.push({
      kind: "operation-started",
      subject: nodeId,
      payload: { attempt: node.attempt },
    });
    return { state: next, effects, events, outcome: "advanced" };
  }

  if (operation === "complete") {
    node.phase = "completed";
    next.status = allTerminal(next) ? "terminal" : next.status;
    pushPersistEffect(effects, `effect:complete:${nodeId}`, nodeId, "completed", effectClass);
    events.push({
      kind: "operation-completed",
      subject: nodeId,
      payload: {},
    });
    return {
      state: next,
      effects,
      events,
      outcome: next.status === "terminal" ? "terminal" : "advanced",
    };
  }

  if (operation === "fail") {
    node.phase = "failed";
    next.status = "blocked";
    pushPersistEffect(effects, `effect:fail:${nodeId}`, nodeId, "failed", effectClass);
    events.push({
      kind: "operation-failed",
      subject: nodeId,
      payload: {},
    });
    return { state: next, effects, events, outcome: "blocked" };
  }

  if (operation === "invalidate-node") {
    node.phase = "invalidated";
    pushPersistEffect(effects, `effect:invalidate:${nodeId}`, nodeId, "invalidated", effectClass);
    events.push({
      kind: "node-invalidated",
      subject: nodeId,
      payload: {},
    });
    return { state: next, effects, events, outcome: "advanced" };
  }

  if (operation === "recover") {
    node.phase = "pending";
    next.status = "ready";
    pushPersistEffect(effects, `effect:recover:${nodeId}`, nodeId, "pending", effectClass);
    events.push({
      kind: "operation-recovered",
      subject: nodeId,
      payload: {},
    });
    return { state: next, effects, events, outcome: "advanced" };
  }

  return {
    state: clone(input),
    effects: [],
    events: [],
    outcome: "blocked",
    code: "unknown-operation",
  };
}

function allTerminal(state) {
  const nodes = state.nodes || {};
  const values = Object.values(nodes);
  if (values.length === 0) return false;
  return values.every((node) =>
    node.phase === "completed" ||
    node.phase === "terminal" ||
    node.phase === "invalidated"
  );
}

module.exports = { reduceLifecycle, DEFAULT_EFFECT_CLASS };
