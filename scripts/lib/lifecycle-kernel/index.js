"use strict";

const { reduceLifecycle } = require("./reducer.js");
const { digestLifecycleState, KERNEL_VERSION } = require("./state-digest.js");
const { selectTransitions, nextTransition } = require("./transition-selector.js");
const {
  deriveOperationId,
  deriveEffectId,
  createJournalRecord,
  reconcileEffect,
} = require("./journal.js");
const { projectEvents } = require("./events.js");
const { authorizeOperation, validateOperationTransition } = require("./operations.js");

function createMemoryStore(initial = {}) {
  let state = initial.state
    ? JSON.parse(JSON.stringify(initial.state))
    : { schema_version: 1, status: "ready", nodes: {} };
  let journal = Array.isArray(initial.journal)
    ? JSON.parse(JSON.stringify(initial.journal))
    : [];

  return {
    async load() {
      return {
        state: JSON.parse(JSON.stringify(state)),
        journal: JSON.parse(JSON.stringify(journal)),
      };
    },
    async commitJournal(nextJournal) {
      journal = JSON.parse(JSON.stringify(nextJournal));
      return { journal };
    },
    async commit({ state: nextState, journal: nextJournal }) {
      state = JSON.parse(JSON.stringify(nextState));
      journal = JSON.parse(JSON.stringify(nextJournal));
      return { state, journal };
    },
    snapshot() {
      return {
        state: JSON.parse(JSON.stringify(state)),
        journal: JSON.parse(JSON.stringify(journal)),
      };
    },
  };
}

function interruptError(at) {
  const error = new Error(`kernel-interrupt:${at}`);
  error.code = "kernel-interrupt";
  error.at = at;
  return error;
}

async function checkpoint(hooks, at, context) {
  if (!hooks || typeof hooks.onCheckpoint !== "function") return;
  await hooks.onCheckpoint(at, context);
}

function blockedResult(state, journal, code, extra = {}) {
  return {
    schema_version: 1,
    kernel_version: KERNEL_VERSION,
    state_digest: digestLifecycleState(state),
    status: { lifecycle_status: state.status, nodes: state.nodes || {} },
    transitions: selectTransitions(state),
    next_transition: nextTransition(state),
    outcome: "blocked",
    code,
    events: projectEvents({ state, journal }),
    ...extra,
  };
}

async function runKernelOperation(input = {}) {
  const {
    operation,
    arguments: args = {},
    authorityToken = null,
    store,
    effectExecutor,
    clock = null,
    hooks = null,
  } = input;

  if (!store || typeof store.load !== "function" || typeof store.commit !== "function") {
    const error = new Error("kernel store is required");
    error.code = "store-required";
    throw error;
  }

  const loaded = await store.load();
  const state = loaded.state || { schema_version: 1, status: "ready", nodes: {} };
  let journal = Array.isArray(loaded.journal) ? [...loaded.journal] : [];

  // clock is injected for shell use but excluded from semantic digest.
  void clock;

  if (operation === "status") {
    const transitions = selectTransitions(state);
    const events = projectEvents({ state, journal });
    return {
      schema_version: 1,
      kernel_version: KERNEL_VERSION,
      state_digest: digestLifecycleState(state),
      status: {
        lifecycle_status: state.status,
        nodes: state.nodes || {},
      },
      transitions,
      next_transition: nextTransition(state),
      outcome: state.status === "terminal" ? "terminal" : "advanced",
      events,
    };
  }

  const auth = authorizeOperation({ operation, authorityToken });
  if (!auth.ok) return blockedResult(state, journal, auth.code);

  const validation = validateOperationTransition(state, { operation, arguments: args });
  if (!validation.ok) {
    return blockedResult(state, journal, validation.code, {
      state_digest: validation.state_digest,
      allowed_operations: validation.allowed_operations,
    });
  }

  // Mutating ops require an effectExecutor; only non-mutating status may omit it.
  if (typeof effectExecutor !== "function") {
    return blockedResult(state, journal, "effect-executor-required");
  }

  // Mid-operation journal durability is mandatory to prevent duplicate effects on resume.
  if (typeof store.commitJournal !== "function") {
    return blockedResult(state, journal, "journal-durability-required");
  }

  const operationId = deriveOperationId({ state, operation, arguments: args });
  const reduced = reduceLifecycle(state, {
    operation,
    arguments: args,
    authorityToken,
  });

  const effectRecords = [];
  for (const effect of reduced.effects) {
    const effectId = deriveEffectId(operationId, effect);
    const existing = journal.find((entry) => entry.effect_id === effectId);
    let decision = reconcileEffect({
      record: existing || { status: "planned", effect_id: effectId },
    });

    if (decision.action === "fail-closed") {
      return blockedResult(state, journal, decision.code || "reconciliation-required");
    }

    if (decision.action === "skip") {
      effectRecords.push(existing);
      continue;
    }

    // Self-describing journal actions: retry-execute (safe pre-effect) vs execute (planned).
    if (decision.action === "retry-execute") {
      decision = { action: "execute", reason: decision.reason || "started-pre-effect-safe-retry" };
    } else if (decision.action === "reconcile") {
      return blockedResult(state, journal, "reconciliation-required");
    } else if (decision.action !== "execute") {
      return blockedResult(state, journal, "reconciliation-required");
    }

    await checkpoint(hooks, "before-journal", { operation_id: operationId, effect_id: effectId });

    let record = createJournalRecord({
      operation_id: operationId,
      effect_id: effectId,
      status: "started",
      result: { barrier: "pre-effect" },
    });
    journal = upsertJournal(journal, record);
    await store.commitJournal(journal);

    await checkpoint(hooks, "after-journal", { operation_id: operationId, effect_id: effectId });

    // Durable in-flight mark: crash after this point is not a safe blind re-execute.
    record = createJournalRecord({
      operation_id: operationId,
      effect_id: effectId,
      status: "started",
      result: { barrier: "executing" },
    });
    journal = upsertJournal(journal, record);
    await store.commitJournal(journal);

    let result;
    try {
      result = await effectExecutor({
        effect_id: effectId,
        kind: effect.kind,
        payload: effect.payload,
        operation_id: operationId,
      });
    } catch (error) {
      if (error && error.code === "kernel-interrupt") {
        // Controlled harness interrupt: leave journal as-is for the interrupt point.
        // before-effect → restore pre-effect for safe resume; after-effect with partial → complete.
        if (error.partial !== undefined) {
          record = createJournalRecord({
            operation_id: operationId,
            effect_id: effectId,
            status: "completed",
            result: error.partial || { ok: true },
          });
          journal = upsertJournal(journal, record);
          await store.commitJournal(journal);
        } else if (isPreEffectStarted(record) || (record.result && record.result.barrier === "executing")) {
          // scenarioInterrupt before-effect: executor never completed; restore pre-effect.
          record = createJournalRecord({
            operation_id: operationId,
            effect_id: effectId,
            status: "started",
            result: { barrier: "pre-effect" },
          });
          journal = upsertJournal(journal, record);
          await store.commitJournal(journal);
        }
        throw error;
      }

      record = createJournalRecord({
        operation_id: operationId,
        effect_id: effectId,
        status: "unknown",
        result: {
          ok: false,
          error: error && error.message ? String(error.message) : "ambiguous-executor-failure",
        },
      });
      journal = upsertJournal(journal, record);
      await store.commitJournal(journal);
      return blockedResult(state, journal, "reconciliation-required", {
        operation_id: operationId,
        effects: [...effectRecords, record],
      });
    }

    if (result && result.ok === false) {
      record = createJournalRecord({
        operation_id: operationId,
        effect_id: effectId,
        status: "failed",
        result,
      });
      journal = upsertJournal(journal, record);
      await store.commitJournal(journal);
      return blockedResult(state, journal, "effect-failed", {
        operation_id: operationId,
        effects: [...effectRecords, record],
      });
    }

    record = createJournalRecord({
      operation_id: operationId,
      effect_id: effectId,
      status: "completed",
      result: result || { ok: true },
    });

    journal = upsertJournal(journal, record);
    await store.commitJournal(journal);
    effectRecords.push(record);

    await checkpoint(hooks, "after-effect", { operation_id: operationId, effect_id: effectId });
  }

  if (effectRecords.some((entry) => entry && entry.status === "failed")) {
    return blockedResult(state, journal, "effect-failed", {
      operation_id: operationId,
      effects: effectRecords,
    });
  }

  await checkpoint(hooks, "before-state-commit", { operation_id: operationId });
  await store.commit({ state: reduced.state, journal });
  await checkpoint(hooks, "after-state-commit", { operation_id: operationId });

  const events = projectEvents({ state: reduced.state, journal });
  const transitions = selectTransitions(reduced.state);

  return {
    schema_version: 1,
    kernel_version: KERNEL_VERSION,
    state_digest: digestLifecycleState(reduced.state),
    status: {
      lifecycle_status: reduced.state.status,
      nodes: reduced.state.nodes || {},
    },
    transitions,
    next_transition: nextTransition(reduced.state),
    outcome: reduced.outcome,
    events,
    operation_id: operationId,
    effects: effectRecords,
  };
}

function upsertJournal(journal, record) {
  const next = journal.filter((entry) => entry.effect_id !== record.effect_id);
  next.push(record);
  next.sort((a, b) => {
    const ea = a.effect_id || "";
    const eb = b.effect_id || "";
    if (ea < eb) return -1;
    if (ea > eb) return 1;
    return 0;
  });
  return next;
}

function isPreEffectStarted(record) {
  return (
    record &&
    record.status === "started" &&
    record.result &&
    record.result.barrier === "pre-effect"
  );
}

module.exports = {
  runKernelOperation,
  createMemoryStore,
  reduceLifecycle,
  digestLifecycleState,
  selectTransitions,
  nextTransition,
  KERNEL_VERSION,
  interruptError,
};
