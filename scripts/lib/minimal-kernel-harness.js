"use strict";

const {
  runKernelOperation,
  createMemoryStore,
  digestLifecycleState,
  selectTransitions,
  interruptError,
} = require("./lifecycle-kernel/index.js");

/**
 * Minimal Kernel Harness — public-API headless scenario runner.
 * Conformance MUST go through runKernelOperation, not private reducers alone.
 */
async function runHarnessScenario(scenario = {}) {
  const {
    id = "anonymous",
    initialState,
    operations = [],
    effectExecutor,
    clock = () => 0,
    // Shell checkpoint barrier tokens, e.g. "before-journal" | "after-journal" | "after-effect".
    checkpointInterrupt = null,
    // Scenario-step tokens, e.g. "before-op:0" | "after-op:0" | "before-effect:<id>" | "after-effect:<id>".
    scenarioInterrupt = null,
  } = scenario;

  const store = createMemoryStore({ state: initialState, journal: scenario.initialJournal || [] });
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
        authorityToken: step.authorityToken ?? "opaque:harness",
        store,
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
    });

    if (result.next_transition && result.next_transition.kind === "decide") {
      halted = {
        reason: "decision-required",
        decision: result.next_transition,
      };
      break;
    }

    if (result.outcome === "blocked" && result.code) {
      halted = { reason: "blocked", code: result.code };
      break;
    }

    if (scenarioInterrupt === `after-op:${index}`) {
      halted = { reason: "interrupt", at: scenarioInterrupt };
      break;
    }
  }

  const snapshot = store.snapshot();
  const status = await runKernelOperation({ operation: "status", store, clock });

  return {
    scenario_id: id,
    initial_state_digest: digestLifecycleState(initialState || snapshot.state),
    final_state_digest: status.state_digest,
    outcome: halted
      ? halted.reason === "decision-required"
        ? "decision-required"
        : halted.reason
      : status.outcome,
    operations: history,
    effects: executedEffects,
    events: status.events,
    transitions: status.transitions,
    next_transition: status.next_transition,
    halted,
    snapshot,
  };
}

async function snapshotRoundTrip(state, journal = []) {
  const store = createMemoryStore({ state, journal });
  const before = await runKernelOperation({ operation: "status", store });
  const snap = store.snapshot();
  const restored = createMemoryStore(snap);
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

module.exports = {
  runHarnessScenario,
  snapshotRoundTrip,
  assertPublicApiConformance,
  createMemoryStore,
  runKernelOperation,
  digestLifecycleState,
  selectTransitions,
};
