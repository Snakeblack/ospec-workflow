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
  _internalCreateIssuer: createPermitAuthorityIssuer,
  isPermitAuthorityIssuer,
  issueOperationPermit,
  authorizeOperationWithPermit,
  prepareOperationReceipt,
  findReplayReceipt,
} = require("./permits.js");
const {
  DEFAULT_SUBJECT_ID,
  createAuthorityStore,
  createAuthorityRuntime,
} = require("../authority-store/index.js");
const { sha256Fingerprint } = require("../canonical-json.js");
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
    mintPermit = false,
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
  const authorityBag = loaded.authority || { permits: {}, receipts: {} };
  let midOpTicket = null;
  async function persistJournal() {
    const jr = await authorityStore.commitJournal(journal, subjectId, headRevision);
    if (!jr || jr.ok === false) {
      const err = new Error(jr?.code || "journal-commit-failed");
      err.code = jr?.code || "journal-commit-failed";
      throw err;
    }
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

  // K2.1b: public auto-mint is rejected; controlled issuer is the only issuance path.
  if (mintPermit === true) {
    return blockedResult(state, journal, "auto-mint-disabled", {
      revision: headRevision,
      operation_receipt: null,
    });
  }

  const ledger = permitLedger;
  const permit = operationPermit || null;
  const argumentsDigest = sha256Fingerprint("permit:arguments", args);

  if (permitLedger && !isPermitAuthorityIssuer(permitLedger)) {
    return blockedResult(state, journal, "issuer-capability-required", {
      revision: headRevision,
      operation_receipt: null,
    });
  }

  // Exact replay: consumed permit + matching receipt in authority bag → return prior receipt.
  const replayReceipt = findReplayReceipt(
    authorityBag,
    permit,
    operation,
    subjectId,
    argumentsDigest
  );
  if (replayReceipt) {
    const events = projectEvents({ state, journal });
    const transitions = selectTransitions(state);
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
      outcome: replayReceipt.outcome || "advanced",
      events,
      revision: headRevision,
      operation_permit_id: permit.permit_id,
      operation_receipt: replayReceipt,
      replayed: true,
    };
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
    arguments_digest: argumentsDigest,
    authority: authorityBag,
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

  // Persisted intent comes from the ledger-held permit, never from the
  // caller-presented copy.
  const ledgerEntry = ledger.get(permit.permit_id);
  const issuedPermit = ledgerEntry ? ledgerEntry.permit : null;
  if (!issuedPermit) {
    return blockedResult(state, journal, "permit-not-runtime-issued", {
      operation_id: operationId,
      revision: headRevision,
      operation_receipt: null,
    });
  }

  const receipt = prepareOperationReceipt({
    permit_id: permit.permit_id,
    subject_id: subjectId,
    operation,
    expected_revision: headRevision,
    outcome: reduced.outcome,
    operation_intent_digest: issuedPermit.operation_intent_digest,
    arguments_digest: issuedPermit.arguments_digest,
  });
  receipt.revision = "pending";
  const authorityCommit = {
    permit_id: permit.permit_id,
    receipt,
    status: "consumed",
    permit_record: {
      permit_id: issuedPermit.permit_id,
      status: "consumed",
      operation_intent_digest: issuedPermit.operation_intent_digest,
      permit_digest: issuedPermit.permit_digest,
      operation: issuedPermit.operation,
      subject_id: issuedPermit.subject_id,
      arguments_digest: issuedPermit.arguments_digest,
      scope_digest: issuedPermit.scope_digest,
      policy_digest: issuedPermit.policy_digest,
      issuer_decision_id: issuedPermit.issuer_decision_id || null,
      expected_revision: issuedPermit.expected_revision,
    },
  };

  const cas = await authorityStore.compareAndSwap(
    subjectId,
    headRevision,
    reduced.state,
    journal,
    midOpTicket,
    authorityCommit
  );
  if (!cas.ok) {
    return blockedResult(state, journal, cas.code || "cas-conflict", {
      operation_id: operationId,
      revision: cas.revision,
      budgets: cas.budgets || budgetsBefore,
      budgets_unchanged: true,
      operation_receipt: null,
    });
  }
  await checkpoint(hooks, "after-state-commit", { operation_id: operationId });

  // Process-local Map is issued-only mirror; bag is sole consume truth after CAS.
  if (typeof ledger.markConsumed === "function") {
    ledger.markConsumed(permit.permit_id);
  }

  const committedReceipt =
    cas.operation_receipt ||
    (await authorityStore.load(subjectId)).authority?.receipts?.[permit.permit_id] ||
    null;
  if (!committedReceipt) {
    return blockedResult(reduced.state, journal, "authority-commit-incomplete", {
      operation_id: operationId,
      revision: cas.revision,
      budgets: cas.budgets || budgetsBefore,
      budgets_unchanged: true,
      operation_receipt: null,
    });
  }

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
    operation_receipt: committedReceipt,
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

function createKernelRuntime(options = {}) {
  const permitIssuer = createPermitAuthorityIssuer();
  const store = options.store || createAuthorityStore(options);

  return {
    async runOperation(input = {}) {
      return runKernelOperation({
        ...input,
        store,
        permitLedger: permitIssuer,
      });
    },
    issuePermitForSelectedTransition(input = {}) {
      if (input.offer_id && (input.decision_id || input.rule_id)) {
        return issueOperationPermit({
          ...input,
          ledger: permitIssuer,
        });
      }

      const subject_id = input.subject_id || options.subjectId || DEFAULT_SUBJECT_ID;
      const operation = input.operation || input.transitionOffer?.operation;

      const offerInput = input.transitionOffer || {
        operation,
        subject_id,
      };
      const offerReg = permitIssuer.registerTransitionOffer(offerInput);
      if (!offerReg.ok) return offerReg;

      let decision_id = input.decision_id || null;
      let rule_id = input.rule_id || null;

      if (!decision_id && !rule_id) {
        if (input.policyDecision) {
          const reg = permitIssuer.registerPolicyDecision({
            ...input.policyDecision,
            offer_id: offerReg.offer_id,
            operation,
            subject_id,
          });
          if (!reg.ok) return reg;
          decision_id = reg.decision_id;
        } else if (input.humanDecision) {
          const reg = permitIssuer.registerHumanDecision({
            ...input.humanDecision,
            offer_id: offerReg.offer_id,
            operation,
            subject_id,
          });
          if (!reg.ok) return reg;
          decision_id = reg.decision_id;
        } else {
          const kernelRule = input.kernelRule || {
            kind: "kernel-rule/v1",
            operation,
            subject_id,
          };
          const reg = permitIssuer.registerKernelRule({
            ...kernelRule,
            offer_id: offerReg.offer_id,
            operation,
            subject_id,
          });
          if (!reg.ok) return reg;
          rule_id = reg.rule_id;
        }
      }

      return issueOperationPermit({
        ledger: permitIssuer,
        offer_id: offerReg.offer_id,
        decision_id,
        rule_id,
        expected_revision: input.expected_revision,
        subject_id,
        arguments: input.arguments || {},
      });
    },
    async getStatus(subjectId = options.subjectId || DEFAULT_SUBJECT_ID) {
      return runKernelOperation({
        operation: "status",
        store,
        subjectId,
      });
    },
    snapshot(subjectId = options.subjectId || DEFAULT_SUBJECT_ID) {
      return store.snapshot(subjectId);
    },
  };
}

module.exports = {
  createKernelRuntime,
  runKernelOperation,
  createMemoryStore,
  createAuthorityStore,
  createAuthorityRuntime,
  createPermitLedger,
  isPermitAuthorityIssuer,
  issueOperationPermit,
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
