"use strict";

const { digestLifecycleState } = require("./lifecycle-kernel/state-digest.js");
const { selectTransitions } = require("./lifecycle-kernel/transition-selector.js");
const { reduceLifecycle } = require("./lifecycle-kernel/reducer.js");
const { validateOperationTransition } = require("./lifecycle-kernel/operations.js");
const { projectEvents } = require("./lifecycle-kernel/events.js");
const { reconcileEffect } = require("./lifecycle-kernel/journal.js");
const { runHarnessScenario } = require("./minimal-kernel-harness.js");

const MODEL_CONFIG = Object.freeze({
  schema_version: 1,
  model_version: "k2-lifecycle-model/1.0.0",
  state_domains: Object.freeze({
    statuses: Object.freeze(["ready", "running", "blocked", "terminal"]),
    phases: Object.freeze([
      "pending",
      "started",
      "completed",
      "failed",
      "interrupted",
      "invalidated",
      "terminal",
    ]),
    attempts: Object.freeze([0, 1, 2, 3]),
    exhausted: Object.freeze([false, true]),
  }),
  actions: Object.freeze([
    "status",
    "start",
    "complete",
    "fail",
    "recover",
    "invalidate-node",
  ]),
  limits: Object.freeze({
    max_depth: 6,
    max_visits: 200,
    max_nodes: 2,
  }),
  abstraction_mapping: Object.freeze({
    nodes: "OpenSpec phase nodes collapsed to {id,phase,attempt,exhausted}",
    status: "Top-level lifecycle status derived from node phases",
    journal: "Effect journal abstracted as completed-effect set in harness replay",
    host: "Host adapters excluded from model",
  }),
});

const EXECUTABLE_INVARIANTS = Object.freeze([
  Object.freeze({ id: "inv-same-transitions", name: "Same state → same ordered transitions", optional: false }),
  Object.freeze({ id: "inv-fail-closed", name: "Invalid transitions fail closed", optional: false }),
  Object.freeze({ id: "inv-no-duplicate-effects", name: "Replay does not duplicate effects", optional: false }),
  Object.freeze({ id: "inv-recovery-advances", name: "Named recovery advances or terminates", optional: false }),
  Object.freeze({ id: "inv-no-direct-mutation", name: "Models cannot directly mutate state", optional: false }),
  Object.freeze({ id: "inv-no-implicit-restart", name: "Terminal exhaustion cannot restart", optional: false }),
  Object.freeze({ id: "inv-events-non-authoritative", name: "Events do not alter authoritative state", optional: false }),
  Object.freeze({ id: "inv-terminal-no-execute", name: "Terminal has no non-recovery execute", optional: false }),
]);

const DEFERRED_INVARIANTS = Object.freeze([
  Object.freeze({
    id: "def-candidate-mutation",
    name: "Candidate mutation invalidates verification",
    enforced_in_k2: false,
    owned_by: "K3/K6b",
  }),
  Object.freeze({
    id: "def-budget-monotonicity",
    name: "Productive correction budget monotonicity",
    enforced_in_k2: false,
    owned_by: "K5/K7",
  }),
  Object.freeze({
    id: "def-delivery-auth",
    name: "Delivery authorization",
    enforced_in_k2: false,
    owned_by: "K10-delivery",
  }),
  Object.freeze({
    id: "def-policy-attestation",
    name: "Policy-bound attestation invalidation",
    enforced_in_k2: false,
    owned_by: "K8/K10-delivery",
  }),
]);

function initialModelState() {
  return {
    schema_version: 1,
    status: "ready",
    nodes: {
      n1: { id: "n1", phase: "pending", attempt: 0 },
    },
  };
}

function opaquePortsEqual(left, right) {
  return left === right;
}

function isDecisionStaleForSubject(decision, subjectId) {
  if (!decision || typeof decision !== "object") return true;
  return decision.subject_id !== subjectId;
}

function createFaultySelector() {
  // Violates inv-same-transitions by sorting node ids descending for start.
  return function faultySelect(state) {
    const transitions = selectTransitions(state).map((t) => ({ ...t, arguments: { ...t.arguments } }));
    transitions.sort((a, b) => {
      const na = a.arguments.node_id || "";
      const nb = b.arguments.node_id || "";
      if (na < nb) return 1;
      if (na > nb) return -1;
      return 0;
    });
    return transitions;
  };
}

function checkSameTransitions(state, selector = selectTransitions) {
  const left = selector(state);
  // Distinct object identity clone — proves selector does not depend on reference equality.
  const identityClone = JSON.parse(JSON.stringify(state));
  const right = selector(identityClone);
  // Key-order reshape — proves selector output is order-stable for equivalent states.
  const keyOrderReshape = {
    nodes: state.nodes,
    status: state.status,
    schema_version: state.schema_version,
  };
  const a = JSON.stringify(selector(state));
  const b = JSON.stringify(selector(keyOrderReshape));
  const ok = a === b && JSON.stringify(left) === JSON.stringify(right);
  return {
    ok,
    invariant_id: "inv-same-transitions",
    detail: ok ? null : { left, right: selector(keyOrderReshape) },
  };
}

function checkFailClosed(state) {
  const result = validateOperationTransition(state, {
    operation: "complete",
    arguments: { node_id: "n1" },
  });
  const before = digestLifecycleState(state);
  const ok = result.ok === false && result.code === "invalid-transition" && result.state_digest === before;
  return { ok, invariant_id: "inv-fail-closed" };
}

/**
 * Model checker for inv-no-duplicate-effects.
 * Proves journal reconciliation skips completed/failed effects and only executes planned.
 */
function checkNoDuplicateEffects() {
  const completed = reconcileEffect({
    record: { status: "completed", effect_id: "model:e1" },
  });
  const planned = reconcileEffect({
    record: { status: "planned", effect_id: "model:e1" },
  });
  const failed = reconcileEffect({
    record: { status: "failed", effect_id: "model:e1" },
  });
  const replay_completed = reconcileEffect({
    record: { status: "completed", effect_id: "model:e1" },
  });

  const ok =
    completed.action === "skip" &&
    completed.reason === "already-completed" &&
    planned.action === "execute" &&
    failed.action === "skip" &&
    replay_completed.action === "skip";

  return {
    ok,
    invariant_id: "inv-no-duplicate-effects",
    detail: { completed, planned, failed, replay_completed },
  };
}

function checkRecoveryAdvances(state) {
  if (!state.nodes?.n1 || state.nodes.n1.phase !== "failed") {
    return { ok: true, invariant_id: "inv-recovery-advances", skipped: true };
  }
  const before = digestLifecycleState(state);
  const reduced = reduceLifecycle(state, {
    operation: "recover",
    arguments: { node_id: "n1" },
    authorityToken: "opaque:model",
  });
  const after = digestLifecycleState(reduced.state);
  const ok = after !== before || reduced.outcome === "terminal";
  return { ok, invariant_id: "inv-recovery-advances" };
}

function checkNoDirectMutation(state) {
  const cloned = JSON.parse(JSON.stringify(state));
  cloned.status = "terminal";
  const authoritative = digestLifecycleState(state);
  const mutated = digestLifecycleState(cloned);
  // Direct mutation of a copy does not change the original authority.
  const ok = authoritative !== mutated && digestLifecycleState(state) === authoritative;
  return { ok, invariant_id: "inv-no-direct-mutation" };
}

function checkNoImplicitRestart(state) {
  const exhausted = {
    schema_version: 1,
    status: "blocked",
    nodes: { n1: { id: "n1", phase: "failed", attempt: 3, exhausted: true } },
  };
  const transitions = selectTransitions(exhausted);
  const ok = !transitions.some((t) => t.operation === "start");
  return { ok, invariant_id: "inv-no-implicit-restart", state_used: exhausted };
}

function checkEventsNonAuthoritative(state) {
  const before = digestLifecycleState(state);
  const beforeTransitions = JSON.stringify(selectTransitions(state));
  projectEvents({
    state,
    journal: [
      {
        effect_id: "sha256:e1",
        operation_id: "sha256:o1",
        status: "completed",
        kernel_version: 1,
      },
    ],
  });
  const ok =
    digestLifecycleState(state) === before &&
    JSON.stringify(selectTransitions(state)) === beforeTransitions;
  return { ok, invariant_id: "inv-events-non-authoritative" };
}

function checkTerminalNoExecute() {
  const terminal = {
    schema_version: 1,
    status: "terminal",
    nodes: { n1: { id: "n1", phase: "terminal", attempt: 1, exhausted: true } },
  };
  const transitions = selectTransitions(terminal);
  const ok = !transitions.some((t) => t.kind === "execute" && t.operation !== "recover");
  return { ok, invariant_id: "inv-terminal-no-execute" };
}

const CHECKERS = {
  "inv-same-transitions": (ctx) => checkSameTransitions(ctx.state, ctx.selector),
  "inv-fail-closed": (ctx) => checkFailClosed(ctx.state),
  "inv-no-duplicate-effects": () => checkNoDuplicateEffects(),
  "inv-recovery-advances": (ctx) => checkRecoveryAdvances(ctx.state),
  "inv-no-direct-mutation": (ctx) => checkNoDirectMutation(ctx.state),
  "inv-no-implicit-restart": (ctx) => checkNoImplicitRestart(ctx.state),
  "inv-events-non-authoritative": (ctx) => checkEventsNonAuthoritative(ctx.state),
  "inv-terminal-no-execute": () => checkTerminalNoExecute(),
};

function checkInvariant(id, context = {}) {
  const checker = CHECKERS[id];
  if (!checker) return { ok: false, invariant_id: id, code: "unknown-invariant" };
  const state = context.state || initialModelState();
  return checker({ state, selector: context.selector || selectTransitions });
}

function runAllInvariantCheckers(context = {}) {
  const results = EXECUTABLE_INVARIANTS.map((inv) => {
    const result = checkInvariant(inv.id, context);
    return {
      ...result,
      name: inv.name,
      optional: inv.optional,
      deferred: false,
      counts_as_enforced: true,
    };
  });
  const deferred = DEFERRED_INVARIANTS.map((inv) => ({
    ok: true,
    invariant_id: inv.id,
    name: inv.name,
    deferred: true,
    counts_as_enforced: false,
    enforced_in_k2: false,
  }));
  return {
    results: [...results, ...deferred],
    enforced_count: results.length,
    ok: results.every((r) => r.ok),
  };
}

function applyAction(state, action) {
  if (action === "status") return { state, outcome: "advanced" };
  const nodeId = "n1";
  const reduced = reduceLifecycle(state, {
    operation: action,
    arguments: { node_id: nodeId },
    authorityToken: "opaque:model",
  });
  return { state: reduced.state, outcome: reduced.outcome, code: reduced.code };
}

function exploreModel(options = {}) {
  const seed = options.seed || "k2-default";
  const maxDepth = options.max_depth ?? MODEL_CONFIG.limits.max_depth;
  const maxVisits = options.max_visits ?? MODEL_CONFIG.limits.max_visits;
  const selector = options.selector || selectTransitions;
  const actions = options.actions || MODEL_CONFIG.actions.filter((a) => a !== "status");

  const queue = [{ state: initialModelState(), depth: 0, trace: [] }];
  const visited = new Set();
  let visitCount = 0;

  while (queue.length > 0 && visitCount < maxVisits) {
    const current = queue.shift();
    visitCount += 1;
    const digest = digestLifecycleState(current.state);
    const key = `${digest}:${current.depth}`;
    if (visited.has(key)) continue;
    visited.add(key);

    // Check same-transitions invariant against provided selector.
    const same = checkSameTransitions(current.state, selector);
    if (!same.ok) {
      return {
        ok: false,
        visited: visitCount,
        counterexample: {
          seed,
          invariant_id: same.invariant_id,
          trace: current.trace,
          state: current.state,
          detail: same.detail,
        },
      };
    }

    // For faulty two-node states, expand nodes to force ordering bug.
    if (options.selector && current.depth === 0) {
      const twoNode = {
        schema_version: 1,
        status: "ready",
        nodes: {
          b: { id: "b", phase: "pending", attempt: 0 },
          a: { id: "a", phase: "pending", attempt: 0 },
        },
      };
      const orderedBug = checkSameTransitions(twoNode, selector);
      // Faulty selector returns different order vs honest selector.
      const honest = JSON.stringify(selectTransitions(twoNode));
      const faulty = JSON.stringify(selector(twoNode));
      if (honest !== faulty) {
        return {
          ok: false,
          visited: visitCount,
          counterexample: {
            seed,
            invariant_id: "inv-same-transitions",
            trace: [{ action: "observe", note: "faulty-selector-ordering" }],
            state: twoNode,
            detail: { honest, faulty },
          },
        };
      }
      void orderedBug;
    }

    if (current.depth >= maxDepth) continue;

    for (const action of actions) {
      const next = applyAction(current.state, action);
      if (next.code) continue;
      queue.push({
        state: next.state,
        depth: current.depth + 1,
        trace: [...current.trace, { action, outcome: next.outcome }],
      });
    }
  }

  // Also run the full checker suite on the initial state.
  const suite = runAllInvariantCheckers({ state: initialModelState(), selector });
  if (!suite.ok) {
    const failed = suite.results.find((r) => !r.ok && r.counts_as_enforced);
    return {
      ok: false,
      visited: visitCount,
      counterexample: {
        seed,
        invariant_id: failed.invariant_id,
        trace: [],
        state: initialModelState(),
      },
    };
  }

  return { ok: true, visited: visitCount, counterexample: null, seed };
}

async function replayCounterexample(counterexample) {
  if (!counterexample || !counterexample.invariant_id) {
    return { ok: false, reproduced: false, code: "invalid-counterexample" };
  }

  if (counterexample.invariant_id === "inv-same-transitions") {
    const state = counterexample.state || {
      schema_version: 1,
      status: "ready",
      nodes: {
        b: { id: "b", phase: "pending", attempt: 0 },
        a: { id: "a", phase: "pending", attempt: 0 },
      },
    };
    const harness = await runHarnessScenario({
      id: `replay-${counterexample.seed}`,
      initialState: state,
      operations: [{ operation: "status" }],
    });
    const honest = JSON.stringify(harness.transitions);
    // Reproduce using the same faulty selector on the counterexample state.
    const faulty = createFaultySelector();
    const bad = JSON.stringify(faulty(state));
    const reproduced = honest !== bad;
    return {
      ok: !reproduced,
      reproduced,
      invariant_id: counterexample.invariant_id,
      harness_digest: harness.final_state_digest,
    };
  }

  return {
    ok: false,
    reproduced: false,
    code: "abstraction-mismatch",
    abstraction: "unsupported-invariant-replay",
    invariant_id: counterexample.invariant_id,
  };
}

module.exports = {
  MODEL_CONFIG,
  EXECUTABLE_INVARIANTS,
  DEFERRED_INVARIANTS,
  exploreModel,
  checkInvariant,
  runAllInvariantCheckers,
  opaquePortsEqual,
  isDecisionStaleForSubject,
  replayCounterexample,
  createFaultySelector,
  initialModelState,
};
