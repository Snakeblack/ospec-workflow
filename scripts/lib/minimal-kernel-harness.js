"use strict";

const {
  runKernelOperation,
  createAuthorityStore,
  createMemoryStore,
  digestLifecycleState,
  selectTransitions,
  interruptError,
  DEFAULT_SUBJECT_ID,
} = require("./lifecycle-kernel/index.js");

const HARNESS_KIND = "minimal-kernel-harness/v1";

/**
 * Minimal Kernel Harness — public-API headless scenario runner.
 * Conformance MUST go through runKernelOperation, not private reducers alone.
 * Host-fault ownership remains with the peer Headless Conformance Host (K2a).
 */
async function runHarnessScenario(scenario = {}) {
  const {
    id = "anonymous",
    initialState,
    operations = [],
    effectExecutor,
    clock = () => 0,
    checkpointInterrupt = null,
    scenarioInterrupt = null,
    budgets = null,
    subjectId = DEFAULT_SUBJECT_ID,
  } = scenario;

  const store = createAuthorityStore({
    subjectId,
    initial: { state: initialState, journal: scenario.initialJournal || [] },
    budgets: budgets || { attempts: 0, corrections: 0 },
  });
  const executedEffects = [];
  const defaultExecutor = async (effect) => {
    executedEffects.push(effect.effect_id);
    return { ok: true };
  };
  const executor = typeof effectExecutor === "function" ? effectExecutor : defaultExecutor;

  const history = [];
  let halted = null;

  const hooks = {
    async onCheckpoint(at) {
      if (checkpointInterrupt && at === checkpointInterrupt) {
        throw interruptError(at);
      }
    },
  };

  for (let index = 0; index < operations.length; index += 1) {
    const step = operations[index];
    if (scenarioInterrupt === `before-op:${index}`) {
      halted = { reason: "interrupt", at: scenarioInterrupt };
      break;
    }

    let result;
    try {
      result = await runKernelOperation({
        operation: step.operation,
        arguments: step.arguments || {},
        authorityToken: step.authorityToken ?? null,
        operationPermit: step.operationPermit,
        permitLedger: step.permitLedger,
        mintPermit: step.mintPermit !== undefined ? step.mintPermit : true,
        transitionOffer: step.transitionOffer,
        irreversibleAmbiguousNext: step.irreversibleAmbiguousNext || scenario.irreversibleAmbiguousNext,
        effect_class: step.effect_class || scenario.effect_class || null,
        store,
        subjectId,
        effectExecutor: async (effect) => {
          if (scenarioInterrupt === `before-effect:${effect.effect_id}`) {
            throw interruptError(scenarioInterrupt);
          }
          const out = await executor(effect);
          if (scenarioInterrupt === `after-effect:${effect.effect_id}`) {
            const error = interruptError(scenarioInterrupt);
            error.partial = out;
            throw error;
          }
          return out;
        },
        clock,
        hooks,
      });
    } catch (error) {
      if (error && error.code === "kernel-interrupt") {
        halted = { reason: "interrupt", at: error.at };
        break;
      }
      throw error;
    }

    history.push({
      operation: step.operation,
      state_digest: result.state_digest,
      outcome: result.outcome,
      next_transition: result.next_transition,
      code: result.code,
      revision: result.revision,
      budgets: result.budgets,
    });

    if (result.next_transition && result.next_transition.kind === "decide") {
      halted = {
        reason: "decision-required",
        decision: result.next_transition,
      };
      break;
    }

    if (result.next_transition && result.next_transition.kind === "stop") {
      halted = {
        reason: "stop",
        decision: result.next_transition,
      };
      break;
    }

    if (result.outcome === "blocked" && result.code) {
      halted = { reason: "blocked", code: result.code, budgets: result.budgets };
      break;
    }

    if (scenarioInterrupt === `after-op:${index}`) {
      halted = { reason: "interrupt", at: scenarioInterrupt };
      break;
    }
  }

  const snapshot = store.snapshot();
  const status = await runKernelOperation({ operation: "status", store, subjectId, clock });

  return {
    scenario_id: id,
    initial_state_digest: digestLifecycleState(initialState || snapshot.state),
    final_state_digest: status.state_digest,
    outcome: halted
      ? halted.reason === "decision-required"
        ? "decision-required"
        : halted.reason === "stop"
          ? "stop"
          : halted.reason
      : status.outcome,
    operations: history,
    effects: executedEffects,
    events: status.events,
    transitions: status.transitions,
    next_transition: status.next_transition,
    halted,
    snapshot,
    budgets: store.getBudgets(subjectId),
    revision: status.revision,
    store,
  };
}

/**
 * Fault-matrix helpers exercised only via public runHarnessScenario / runKernelOperation.
 */
async function runCasConflictFault(scenario = {}) {
  const base = {
    schema_version: 1,
    status: "ready",
    nodes: { n1: { id: "n1", phase: "pending", attempt: 0 } },
  };
  const store = createAuthorityStore({
    initial: { state: base },
    budgets: { attempts: 2, corrections: 1 },
  });
  const budgetsBefore = store.getBudgets();
  const head = await store.load();

  const winnerState = {
    schema_version: 1,
    status: "running",
    nodes: { n1: { id: "n1", phase: "started", attempt: 1 } },
  };
  const loserState = {
    schema_version: 1,
    status: "blocked",
    nodes: { n1: { id: "n1", phase: "failed", attempt: 1 } },
  };

  const win = await store.compareAndSwap("lifecycle:default", head.revision, winnerState, []);
  const lose = await store.compareAndSwap("lifecycle:default", head.revision, loserState, []);

  return {
    scenario_id: scenario.id || "fault:cas-conflict",
    winner_ok: win.ok,
    loser_ok: lose.ok,
    loser_code: lose.code,
    budgets_before: budgetsBefore,
    budgets_after: store.getBudgets(),
    budgets_unchanged:
      JSON.stringify(budgetsBefore) === JSON.stringify(store.getBudgets()),
  };
}

async function snapshotRoundTrip(state, journal = []) {
  const store = createAuthorityStore({ initial: { state, journal } });
  const before = await runKernelOperation({ operation: "status", store });
  const snap = store.snapshot();
  const restored = createAuthorityStore({ initial: snap });
  const after = await runKernelOperation({ operation: "status", store: restored });
  return {
    before_digest: before.state_digest,
    after_digest: after.state_digest,
    before_transitions: before.transitions,
    after_transitions: after.transitions,
    ok:
      before.state_digest === after.state_digest &&
      JSON.stringify(before.transitions) === JSON.stringify(after.transitions),
  };
}

function assertPublicApiConformance({ usedRunKernelOperation, usedReducerOnly }) {
  if (usedReducerOnly && !usedRunKernelOperation) {
    const error = new Error(
      "K2 conformance incomplete: reducer-only tests cannot satisfy harness requirements"
    );
    error.code = "harness-conformance-incomplete";
    throw error;
  }
  return { ok: true };
}

/**
 * Peer invocation: host-fault matrix is owned by Headless Conformance Host.
 * The harness must not invent adapter-local delivery or capability policy.
 *
 * @param {{adapter:object, fixtures?:object[], proof_material?:object}} input
 */
function peerHostFaultMatrix(input) {
  const {
    runHostFaultMatrix,
    KIND: conformanceKind,
  } = require("./headless-conformance-host.js");
  const matrix = runHostFaultMatrix(input || {});
  return {
    harness_kind: HARNESS_KIND,
    peer_kind: conformanceKind,
    owns_host_policy: false,
    owns_capability_proof_issuance: false,
    owns_product_host_activation: false,
    fault_driver: "headless-conformance-host",
    matrix,
  };
}

function getHarnessKind() {
  return HARNESS_KIND;
}

module.exports = {
  HARNESS_KIND,
  getHarnessKind,
  runHarnessScenario,
  runCasConflictFault,
  snapshotRoundTrip,
  assertPublicApiConformance,
  peerHostFaultMatrix,
  createMemoryStore,
  createAuthorityStore,
  runKernelOperation,
  digestLifecycleState,
  selectTransitions,
};
