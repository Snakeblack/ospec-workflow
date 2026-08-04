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
const { validateOperationTransition } = require("./operations.js");
const { createMemoryStore } = require("./memory-store.js");
const {
  createPermitLedger,
  mintOperationPermit,
  consumePermit,
  authorizeOperationWithPermit,
} = require("./permits.js");
const {
  DEFAULT_SUBJECT_ID,
  createAuthorityStore,
} = require("../authority-store/index.js");
const {
  requireEffectClass,
  applyEffectPolicy,
  selectIrreversibleAmbiguousNext,
  blockDirectWrite,
} = require("./effect-policy.js");

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

function resolveAuthorityStore(store, subjectId) {
  if (!store) return null;
  if (typeof store.compareAndSwap === "function" && typeof store.load === "function") {
    return store;
  }
  // Bare memory commit is not a public authoritative mutation path.
  if (typeof store.commit === "function" && typeof store.compareAndSwap !== "function") {
    return null;
  }
  return null;
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
    subjectId = DEFAULT_SUBJECT_ID,
    permitLedger = null,
    operationPermit = null,
    transitionOffer = null,
    mintPermit = true,
    irreversibleAmbiguousNext = "decide",
    effect_class = null,
  } = input;

  const authorityStore = resolveAuthorityStore(store, subjectId);
  if (!authorityStore) {
    const error = new Error("authority store with compareAndSwap is required");
    error.code = "authority-store-required";
    throw error;
  }

  const loaded = await authorityStore.load(subjectId);
  if (loaded && loaded.ok === false) {
    return blockedResult(
      { schema_version: 1, status: "ready", nodes: {} },
      [],
      loaded.code || "subject-not-found"
    );
  }

  const state = loaded.state || { schema_version: 1, status: "ready", nodes: {} };
  let journal = Array.isArray(loaded.journal) ? [...loaded.journal] : [];
  const headRevision = loaded.revision;
  let midOpTicket = null;
  async function persistJournal() {
    const jr = await authorityStore.commitJournal(journal, subjectId, headRevision);
    if (jr.mid_op_ticket) midOpTicket = jr.mid_op_ticket;
  }

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
      revision: headRevision,
    };
  }

  const ledger = permitLedger || createPermitLedger();
  let permit = operationPermit;

  if (!permit && mintPermit === true) {
    permit = mintOperationPermit({
      ledger,
      domain: "lifecycle",
      operation,
      subject_id: subjectId,
      expected_revision: headRevision,
      arguments: args,
      budget_ref: input.budget_ref || "budget:none",
    });
  }

  const auth = authorizeOperationWithPermit({
    operation,
    authorityToken,
    operationPermit: permit,
    permitLedger: ledger,
    headRevision,
    transitionOffer,
    subject_id: subjectId,
    arguments: args,
  });
  if (!auth.ok) return blockedResult(state, journal, auth.code);

  const validation = validateOperationTransition(state, { operation, arguments: args });
  if (!validation.ok) {
    return blockedResult(state, journal, validation.code, {
      state_digest: validation.state_digest,
      allowed_operations: validation.allowed_operations,
    });
  }

  if (typeof effectExecutor !== "function") {
    return blockedResult(state, journal, "effect-executor-required");
  }

  if (typeof authorityStore.commitJournal !== "function") {
    return blockedResult(state, journal, "journal-durability-required");
  }

  const operationId = deriveOperationId({ state, operation, arguments: args });
  const reduced = reduceLifecycle(state, {
    operation,
    arguments: args,
    authorityToken,
    operationPermit: permit,
    permitLedger: ledger,
    headRevision,
    effect_class: effect_class || undefined,
  });

  if (reduced.outcome === "blocked") {
    return blockedResult(state, journal, reduced.code || "unauthorized", {
      allowed_operations: reduced.allowed_operations,
    });
  }

  const effectRecords = [];
  for (const effect of reduced.effects) {
    const classCheck = requireEffectClass(effect);
    if (!classCheck.ok) {
      return blockedResult(state, journal, classCheck.code);
    }

    const effectId = deriveEffectId(operationId, effect);
    const existing = journal.find((entry) => entry.effect_id === effectId);
    let decision = reconcileEffect({
      record: existing || { status: "planned", effect_id: effectId },
      effect_class: effect.effect_class,
    });

    if (decision.action === "fail-closed") {
      if (decision.code === "irreversible-ambiguous") {
        const nextKind = selectIrreversibleAmbiguousNext(irreversibleAmbiguousNext);
        return {
          ...blockedResult(state, journal, "irreversible-ambiguous", {
            operation_id: operationId,
          }),
          next_transition: {
            kind: nextKind,
            operation: null,
            reason: "irreversible-ambiguous",
            not_code_defect: true,
          },
        };
      }
      return blockedResult(state, journal, decision.code || "reconciliation-required");
    }

    if (decision.action === "skip") {
      effectRecords.push(existing);
      continue;
    }

    const policy = applyEffectPolicy({
      effect_class: effect.effect_class,
      reconcileAction: decision.action,
      effect_id: effectId,
    });
    if (!policy.ok) {
      return blockedResult(state, journal, policy.code);
    }

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
      effect_class: effect.effect_class,
    });
    journal = upsertJournal(journal, record);
    await persistJournal();

    await checkpoint(hooks, "after-journal", { operation_id: operationId, effect_id: effectId });

    record = createJournalRecord({
      operation_id: operationId,
      effect_id: effectId,
      status: "started",
      result: { barrier: "executing" },
      effect_class: effect.effect_class,
    });
    journal = upsertJournal(journal, record);
    await persistJournal();

    let result;
    try {
      result = await effectExecutor({
        effect_id: effectId,
        kind: effect.kind,
        payload: effect.payload,
        operation_id: operationId,
        effect_class: effect.effect_class,
      });
    } catch (error) {
      if (error && error.code === "kernel-interrupt") {
        if (error.partial !== undefined) {
          record = createJournalRecord({
            operation_id: operationId,
            effect_id: effectId,
            status: "completed",
            result: error.partial || { ok: true },
            effect_class: effect.effect_class,
          });
          journal = upsertJournal(journal, record);
          await persistJournal();
        } else if (record.result && record.result.barrier === "executing") {
          // Mid-executor: effect may have started — never rewrite to pre-effect.
          record = createJournalRecord({
            operation_id: operationId,
            effect_id: effectId,
            status: "unknown",
            result: {
              ok: false,
              error: error && error.message ? String(error.message) : "interrupt-mid-executor",
            },
            effect_class: effect.effect_class,
          });
          journal = upsertJournal(journal, record);
          await persistJournal();
        } else if (isPreEffectStarted(record)) {
          record = createJournalRecord({
            operation_id: operationId,
            effect_id: effectId,
            status: "started",
            result: { barrier: "pre-effect" },
            effect_class: effect.effect_class,
          });
          journal = upsertJournal(journal, record);
          await persistJournal();
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
        effect_class: effect.effect_class,
      });
      journal = upsertJournal(journal, record);
      await persistJournal();

      if (effect.effect_class === "irreversible") {
        const nextKind = selectIrreversibleAmbiguousNext(irreversibleAmbiguousNext);
        return {
          ...blockedResult(state, journal, "irreversible-ambiguous", {
            operation_id: operationId,
            effects: [...effectRecords, record],
          }),
          next_transition: {
            kind: nextKind,
            operation: null,
            reason: "irreversible-ambiguous",
            not_code_defect: true,
          },
        };
      }

      return blockedResult(state, journal, "reconciliation-required", {
        operation_id: operationId,
        effects: [...effectRecords, record],
      });
    }

    if (result && result.ambiguous === true && effect.effect_class === "irreversible") {
      record = createJournalRecord({
        operation_id: operationId,
        effect_id: effectId,
        status: "unknown",
        result,
        effect_class: effect.effect_class,
      });
      journal = upsertJournal(journal, record);
      await persistJournal();
      const nextKind = selectIrreversibleAmbiguousNext(
        result.next_kind || irreversibleAmbiguousNext
      );
      return {
        ...blockedResult(state, journal, "irreversible-ambiguous", {
          operation_id: operationId,
          effects: [...effectRecords, record],
        }),
        next_transition: {
          kind: nextKind,
          operation: null,
          reason: "irreversible-ambiguous",
          not_code_defect: true,
        },
      };
    }

    if (result && result.ok === false) {
      record = createJournalRecord({
        operation_id: operationId,
        effect_id: effectId,
        status: "failed",
        result,
        effect_class: effect.effect_class,
      });
      journal = upsertJournal(journal, record);
      await persistJournal();
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
      effect_class: effect.effect_class,
    });

    journal = upsertJournal(journal, record);
    await persistJournal();
    effectRecords.push(record);

    await checkpoint(hooks, "after-effect", { operation_id: operationId, effect_id: effectId });
  }

  if (effectRecords.some((entry) => entry && entry.status === "failed")) {
    return blockedResult(state, journal, "effect-failed", {
      operation_id: operationId,
      effects: effectRecords,
    });
  }

  const direct = blockDirectWrite({
    hasPermit: Boolean(permit),
    usedCas: true,
    hasEffectClass: reduced.effects.every((e) => requireEffectClass(e).ok),
  });
  if (!direct.ok) {
    return blockedResult(state, journal, direct.code);
  }

  await checkpoint(hooks, "before-state-commit", { operation_id: operationId });
  const budgetsBefore = typeof authorityStore.getBudgets === "function"
    ? authorityStore.getBudgets(subjectId)
    : null;
  const cas = await authorityStore.compareAndSwap(
    subjectId,
    headRevision,
    reduced.state,
    journal,
    midOpTicket
  );
  if (!cas.ok) {
    return blockedResult(state, journal, cas.code || "cas-conflict", {
      operation_id: operationId,
      revision: cas.revision,
      budgets: cas.budgets || budgetsBefore,
      budgets_unchanged: true,
    });
  }
  await checkpoint(hooks, "after-state-commit", { operation_id: operationId });

  const consumed = consumePermit({
    permit_id: permit.permit_id,
    ledger,
    subject_id: subjectId,
    operation,
    revision: cas.revision,
    outcome: reduced.outcome,
  });

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
    revision: cas.revision,
    operation_permit_id: permit.permit_id,
    operation_receipt: consumed.ok ? consumed.receipt : null,
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
  createAuthorityStore,
  createPermitLedger,
  mintOperationPermit,
  reduceLifecycle,
  digestLifecycleState,
  selectTransitions,
  nextTransition,
  KERNEL_VERSION,
  interruptError,
  DEFAULT_SUBJECT_ID,
  // K2a: generic host boundary (no concrete adapter imports).
  hostBoundary: require("./host-boundary.js"),
  // Internalized: bare commit is not a public mutation API on authority subjects.
  _internalMemoryCommit: null,
};
