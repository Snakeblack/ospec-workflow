"use strict";

const {
  authorizeOperation,
  validateOperationTransition,
} = require("./operations.js");
const {
  decrementBudgetMonotonic,
  evaluateNodeBudget,
  evaluateAuthorityBudget,
  isZeroDeltaMutation,
} = require("../execution-budgets.js");

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

  // Monotonic budget decrement on consumed delta if passed
  const consumedDelta = action.consumed || action.delta || args.consumed;
  if (consumedDelta && typeof consumedDelta === "object") {
    if (node && node.budget) {
      node.budget = decrementBudgetMonotonic(node.budget, consumedDelta);
    }
    if (next.authority_budget) {
      next.authority_budget = decrementBudgetMonotonic(next.authority_budget, consumedDelta);
    }
    if (next.budget) {
      next.budget = decrementBudgetMonotonic(next.budget, consumedDelta);
    }
  }

  // Zero-delta mutation detection
  const isZeroDelta =
    action.zero_delta === true ||
    (action.mutation === true &&
      isZeroDeltaMutation({
        modifiedFilesCount: action.modified_files_count || 0,
        changedLines: action.changed_lines || 0,
        stateAdvanced: action.state_advanced || false,
        outputHashBefore: action.output_hash_before,
        outputHashAfter: action.output_hash_after,
      }));

  if (isZeroDelta && node) {
    events.push({
      kind: "zero-delta-attempt",
      subject: nodeId,
      payload: { attempt: node.attempt || 1 },
    });
    node.zero_delta_attempts = Number(node.zero_delta_attempts || 0) + 1;
    if (node.budget) {
      node.budget = decrementBudgetMonotonic(node.budget, { turns: 1, effect_attempts: 1 });
    }
  }

  if (operation === "start") {
    node.phase = "started";
    node.attempt = Number(node.attempt || 0) + 1;
    next.status = "running";

    if (node.budget) {
      node.budget = decrementBudgetMonotonic(node.budget, { turns: 1 });
      const nodeBudgetEval = evaluateNodeBudget(node.budget);
      if (nodeBudgetEval.exhausted) {
        node.exhausted = true;
      }
    }
    if (next.authority_budget) {
      next.authority_budget = decrementBudgetMonotonic(next.authority_budget, { effect_attempts: 1 });
      const authBudgetEval = evaluateAuthorityBudget(next.authority_budget);
      if (authBudgetEval.exhausted) {
        next.exhausted = true;
      }
    }

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

    if (args.failure || action.failure) {
      node.failure = clone(args.failure || action.failure);
    }

    if (
      (node.max_attempts && node.attempt >= node.max_attempts) ||
      (node.budget && typeof node.budget.turns === "number" && node.budget.turns <= 0) ||
      (node.budget && typeof node.budget.effect_attempts === "number" && node.budget.effect_attempts <= 0) ||
      action.exhausted === true
    ) {
      node.exhausted = true;
    }

    pushPersistEffect(effects, `effect:fail:${nodeId}`, nodeId, "failed", effectClass);
    events.push({
      kind: "operation-failed",
      subject: nodeId,
      payload: { failure: node.failure || null, exhausted: Boolean(node.exhausted) },
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
    if (node.exhausted) {
      return {
        state: clone(input),
        effects: [],
        events: [],
        outcome: "blocked",
        code: "node-exhausted",
      };
    }
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
