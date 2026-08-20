"use strict";

const { sha256Fingerprint } = require("../canonical-json.js");
const { digestLifecycleState } = require("../lifecycle-kernel/state-digest.js");
const { createMemoryStore } = require("../lifecycle-kernel/memory-store.js");

const DEFAULT_SUBJECT_ID = "lifecycle:default";

const REQUIRED_PERMIT_RECORD_STRINGS = Object.freeze([
  "permit_id",
  "operation_intent_digest",
  "permit_digest",
  "operation",
  "subject_id",
  "arguments_digest",
  "scope_digest",
  "policy_digest",
  "expected_revision",
]);

function digestJournal(journal) {
  const ordered = Array.isArray(journal) ? journal : [];
  return sha256Fingerprint("authority-store:journal", ordered);
}

/**
 * Root digest over the authority bag (consumed permits + receipts).
 *
 * A receipt's own `revision` is a back-reference to the head that contains it,
 * so it is excluded: hashing it would make the root digest self-referential.
 */
function digestAuthority(authority) {
  const src = authority && typeof authority === "object" ? authority : emptyAuthority();
  const receipts = src.receipts || {};
  const normalizedReceipts = {};
  for (const key of Object.keys(receipts)) {
    const receipt = receipts[key];
    if (!receipt || typeof receipt !== "object") {
      normalizedReceipts[key] = receipt;
      continue;
    }
    const { revision, ...rest } = receipt;
    void revision;
    normalizedReceipts[key] = rest;
  }
  return sha256Fingerprint("authority-store:authority-root", {
    permits: src.permits || {},
    receipts: normalizedReceipts,
  });
}

function computeRevision(state, journal, authority = null) {
  return sha256Fingerprint("authority-store:revision", {
    state_digest: digestLifecycleState(state),
    journal_digest: digestJournal(journal),
    authority_root_digest: digestAuthority(authority),
  });
}

function fail(code, extra = {}) {
  return { ok: false, code, ...extra };
}

function emptyAuthority() {
  return { permits: {}, receipts: {} };
}

function cloneAuthority(authority) {
  const src = authority && typeof authority === "object" ? authority : emptyAuthority();
  return {
    permits: JSON.parse(JSON.stringify(src.permits || {})),
    receipts: JSON.parse(JSON.stringify(src.receipts || {})),
  };
}

/**
 * Serializes every read and write on a subject so no caller can observe a head
 * that has advanced past its matching authority bag.
 */
function createMutex() {
  let tail = Promise.resolve();
  return function runExclusive(fn) {
    const result = tail.then(() => fn());
    tail = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  };
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim() !== "";
}

function isCompletePermitRecord(record, permitId) {
  if (!record || typeof record !== "object") return false;
  if (record.permit_id !== permitId) return false;
  if (record.status !== "consumed") return false;
  for (const field of REQUIRED_PERMIT_RECORD_STRINGS) {
    if (!isNonEmptyString(record[field])) return false;
  }
  // Kernel-rule issuance may have no decision id, but the key must be present
  // so an omitted intent can never masquerade as a complete record.
  if (!Object.prototype.hasOwnProperty.call(record, "issuer_decision_id")) return false;
  const decisionId = record.issuer_decision_id;
  if (decisionId !== null && !isNonEmptyString(decisionId)) return false;
  return true;
}

function isCompleteAuthorityCommit(authorityCommit) {
  if (!authorityCommit || typeof authorityCommit !== "object") return false;
  if (!authorityCommit.permit_id || typeof authorityCommit.permit_id !== "string") return false;
  if (authorityCommit.status !== "consumed") return false;
  const receipt = authorityCommit.receipt;
  if (!receipt || typeof receipt !== "object") return false;
  if (receipt.kind !== "operation-receipt/v1") return false;
  if (!receipt.receipt_id || receipt.permit_id !== authorityCommit.permit_id) return false;
  if (!isCompletePermitRecord(authorityCommit.permit_record, authorityCommit.permit_id)) {
    return false;
  }
  return true;
}

/**
 * Prepare the next authority bag (clone + consume + receipt) before mutating head.
 * Throws if receipt cannot be materialized — caller must not advance head.
 */
function materializeAuthorityCommit(currentAuthority, authorityCommit) {
  const nextAuthority = cloneAuthority(currentAuthority);
  const record = authorityCommit.permit_record;
  nextAuthority.permits[authorityCommit.permit_id] = {
    permit_id: authorityCommit.permit_id,
    status: "consumed",
    operation_intent_digest: record.operation_intent_digest,
    permit_digest: record.permit_digest,
    operation: record.operation,
    subject_id: record.subject_id,
    arguments_digest: record.arguments_digest,
    scope_digest: record.scope_digest,
    policy_digest: record.policy_digest,
    issuer_decision_id: record.issuer_decision_id === undefined ? null : record.issuer_decision_id,
    expected_revision: record.expected_revision,
  };
  nextAuthority.receipts[authorityCommit.permit_id] = JSON.parse(
    JSON.stringify(authorityCommit.receipt)
  );
  return nextAuthority;
}

function createAuthorityStore(options = {}) {
  const defaultSubjectId = options.subjectId || DEFAULT_SUBJECT_ID;
  const subjects = new Map();

  function ensureSubject(subjectId, initial) {
    if (subjects.has(subjectId)) return subjects.get(subjectId);
    if (subjectId !== defaultSubjectId && !initial) {
      return null;
    }
    const seed = initial || options.initial || {};
    const inner =
      options.store && subjectId === defaultSubjectId
        ? options.store
        : createMemoryStore(seed);
    const entry = {
      inner,
      authority: cloneAuthority(seed.authority),
      budgets: freezeBudgets(options.budgets),
      baselines: new Map(),
      midOpTicket: null,
      midOpSeq: 0,
      lock: createMutex(),
      // Pre-CAS coherent view served to synchronous readers while a commit is in flight.
      inflight: null,
    };
    subjects.set(subjectId, entry);
    return entry;
  }

  ensureSubject(defaultSubjectId, options.initial);

  async function loadLocked(entry, subjectId) {
    const loaded = await entry.inner.load();
    if (loaded.authority) {
      entry.authority = cloneAuthority(loaded.authority);
    }
    if (loaded.budgets) {
      entry.budgets = freezeBudgets(loaded.budgets);
    }
    const state = loaded.state;
    const journal = loaded.journal;
    const stateDigest = digestLifecycleState(state);
    const revision = computeRevision(state, journal, entry.authority);
    entry.baselines.set(revision, stateDigest);
    return {
      ok: true,
      subject_id: subjectId,
      state: JSON.parse(JSON.stringify(state)),
      journal: JSON.parse(JSON.stringify(journal)),
      revision,
      state_digest: stateDigest,
      budgets: cloneBudgets(entry.budgets),
      authority: cloneAuthority(entry.authority),
    };
  }

  async function load(subjectId = defaultSubjectId) {
    const entry = subjects.get(subjectId);
    if (!entry) {
      return fail("subject-not-found", { subject_id: subjectId, revision: null });
    }
    return entry.lock(() => loadLocked(entry, subjectId));
  }

  /**
   * Mid-op journal durability (phase 1 of the two-phase write protocol).
   *
   * Persists journal entries without a CAS revision check so effect barriers can
   * be durable before the final state commit. This advances journal_digest (and
   * therefore the head revision) while leaving state unchanged.
   *
   * Pair with compareAndSwap(expectedRevision = load().revision): after this
   * call, expectedRevision will no longer equal head; CAS still succeeds when
   * the load-time state_digest baseline is intact (see compareAndSwap).
   */
  async function commitJournal(nextJournal, subjectId = defaultSubjectId, fromRevision = null) {
    const entry = subjects.get(subjectId);
    if (!entry) return fail("subject-not-found", { subject_id: subjectId });
    if (typeof entry.inner.commitJournal !== "function") {
      return fail("journal-durability-required");
    }
    return entry.lock(async () => {
      await entry.inner.commitJournal(nextJournal);
      const loaded = await entry.inner.load();
      const revision = computeRevision(loaded.state, loaded.journal, entry.authority);
      let mid_op_ticket = null;
      if (fromRevision != null && fromRevision !== "") {
        const stateDigest = digestLifecycleState(loaded.state);
        mid_op_ticket = sha256Fingerprint("authority-store:mid-op-ticket", {
          from_revision: fromRevision,
          state_digest: stateDigest,
          seq: ++entry.midOpSeq,
        });
        entry.midOpTicket = { token: mid_op_ticket, fromRevision, stateDigest };
      }
      return { ok: true, mid_op_ticket, revision };
    });
  }

  /**
   * CAS commit (phase 2 of the two-phase mid-op write protocol).
   *
   * Succeeds when either:
   *   1) exactMatch — expectedRevision === current head revision, or
   *   2) midOpWithWriterTicket — same as above plus a matching mid_op_ticket
   *      from commitJournal(fromRevision) tied to expectedRevision.
   *
   * Baseline invariant: load() pins state_digest for expectedRevision; CAS
   * accepts a stale revision only while that digest is still the live state.
   *
   * expectedRevision may differ from head after commitJournal because journal
   * durability advances journal_digest (and thus head revision) without
   * changing state; same-writer CAS succeeds when nextJournal matches the
   * journal already persisted. A foreign commitJournal without that journal
   * view fails closed.
   *
   * When authorityCommit is provided (including null), it MUST be a complete
   * { permit_id, receipt, permit_record, status: "consumed" } or CAS fails
   * closed with authority-commit-incomplete and does not advance the head.
   * Omitted (undefined) keeps non-permit CAS paths working for store unit tests.
   */
  async function compareAndSwap(
    subjectId,
    expectedRevision,
    nextState,
    nextJournal,
    midOpTicket = null,
    authorityCommit = undefined
  ) {
    const entry = subjects.get(subjectId);
    if (!entry) {
      return fail("subject-not-found", { subject_id: subjectId, revision: null });
    }
    return entry.lock(() =>
      compareAndSwapLocked(
        entry,
        expectedRevision,
        nextState,
        nextJournal,
        midOpTicket,
        authorityCommit
      )
    );
  }

  async function compareAndSwapLocked(
    entry,
    expectedRevision,
    nextState,
    nextJournal,
    midOpTicket,
    authorityCommit
  ) {
    const permitAuthorized = authorityCommit !== undefined;
    if (permitAuthorized && !isCompleteAuthorityCommit(authorityCommit)) {
      const loaded = await entry.inner.load();
      return fail("authority-commit-incomplete", {
        revision: computeRevision(loaded.state, loaded.journal, entry.authority),
        budgets: cloneBudgets(entry.budgets),
      });
    }

    const loaded = await entry.inner.load();
    const currentRevision = computeRevision(loaded.state, loaded.journal, entry.authority);
    const currentStateDigest = digestLifecycleState(loaded.state);
    const budgetsBefore = cloneBudgets(entry.budgets);

    const journalToCommit = nextJournal !== undefined ? nextJournal : loaded.journal;
    const currentJournalDigest = digestJournal(loaded.journal);

    const baselineStateDigest = entry.baselines.get(expectedRevision);
    const exactMatch = expectedRevision === currentRevision;
    // Mid-op path: load-time revision is stale after commitJournal, but baseline
    // state_digest is intact and caller proves journal continuity (see JSDoc).
    const ticket = entry.midOpTicket;
    const midOpWithWriterTicket =
      baselineStateDigest != null &&
      baselineStateDigest === currentStateDigest &&
      nextJournal !== undefined &&
      digestJournal(nextJournal) === currentJournalDigest &&
      midOpTicket != null &&
      ticket != null &&
      midOpTicket === ticket.token &&
      expectedRevision === ticket.fromRevision &&
      baselineStateDigest === ticket.stateDigest;

    if (!exactMatch && !midOpWithWriterTicket) {
      return {
        ok: false,
        code:
          expectedRevision == null || expectedRevision === ""
            ? "stale-revision"
            : "cas-conflict",
        revision: currentRevision,
        budgets: budgetsBefore,
      };
    }

    const stateUnchanged = digestLifecycleState(nextState) === currentStateDigest;
    if (stateUnchanged && digestJournal(journalToCommit) === digestJournal(loaded.journal)) {
      if (permitAuthorized) {
        const existingReceipt = entry.authority.receipts[authorityCommit.permit_id];
        const existingPermit = entry.authority.permits[authorityCommit.permit_id];
        if (existingReceipt && existingPermit && existingPermit.status === "consumed") {
          return {
            ok: true,
            revision: currentRevision,
            converged: true,
            budgets: budgetsBefore,
            operation_receipt: JSON.parse(JSON.stringify(existingReceipt)),
          };
        }
        // Heal/co-write: convergent intent without bag receipt must persist consume+receipt
        // before returning ok (never ok with null/ephemeral receipt). The bag is part of the
        // revision, so the healed head advances even though state and journal did not.
        const nextAuthority = materializeAuthorityCommit(entry.authority, authorityCommit);
        const healedRevision = computeRevision(loaded.state, loaded.journal, nextAuthority);
        const stored = nextAuthority.receipts[authorityCommit.permit_id];
        if (stored && (stored.revision === "pending" || stored.revision == null)) {
          stored.revision = healedRevision;
        }
        const persisted = await entry.inner.commit({
          state: loaded.state,
          journal: loaded.journal,
          authority: nextAuthority,
          budgets: entry.budgets,
          expectedRevision: currentRevision,
        });
        if (persisted?.ok === false) {
          return {
            ...persisted,
            budgets: budgetsBefore,
          };
        }
        entry.authority = nextAuthority;
        entry.baselines.set(healedRevision, currentStateDigest);
        return {
          ok: true,
          revision: healedRevision,
          converged: true,
          budgets: budgetsBefore,
          operation_receipt: JSON.parse(JSON.stringify(stored)),
        };
      }
      return {
        ok: true,
        revision: currentRevision,
        converged: true,
        budgets: budgetsBefore,
        operation_receipt: null,
      };
    }

    // Prepare the next authority bag without publishing it: an inner commit that
    // throws must leave the bag exactly as it was.
    const nextAuthority = permitAuthorized
      ? materializeAuthorityCommit(entry.authority, authorityCommit)
      : entry.authority;

    const winningRevision = computeRevision(nextState, journalToCommit, nextAuthority);
    if (permitAuthorized) {
      const stored = nextAuthority.receipts[authorityCommit.permit_id];
      if (stored && (stored.revision === "pending" || stored.revision == null)) {
        stored.revision = winningRevision;
      }
    }

    // Synchronous readers keep seeing the pre-CAS pair until state and bag are both published.
    entry.inflight = {
      state: JSON.parse(JSON.stringify(loaded.state)),
      journal: JSON.parse(JSON.stringify(loaded.journal)),
      authority: cloneAuthority(entry.authority),
    };
    try {
      const persisted = await entry.inner.commit({
        state: nextState,
        journal: journalToCommit,
        authority: nextAuthority,
        budgets: entry.budgets,
        expectedRevision: currentRevision,
      });
      if (persisted?.ok === false) {
        return {
          ...persisted,
          budgets: budgetsBefore,
        };
      }
      entry.authority = nextAuthority;
    } finally {
      entry.inflight = null;
    }

    entry.midOpTicket = null;
    if (!stateUnchanged) entry.baselines.clear();

    const after = await entry.inner.load();
    const revision = computeRevision(after.state, after.journal, entry.authority);
    entry.baselines.set(revision, digestLifecycleState(after.state));

    return {
      ok: true,
      revision,
      converged: false,
      budgets: cloneBudgets(entry.budgets),
      budgets_unchanged: JSON.stringify(budgetsBefore) === JSON.stringify(entry.budgets),
      operation_receipt: permitAuthorized
        ? JSON.parse(JSON.stringify(entry.authority.receipts[authorityCommit.permit_id]))
        : null,
    };
  }

  function snapshot(subjectId = defaultSubjectId) {
    const entry = subjects.get(subjectId);
    if (!entry) return null;
    if (entry.inflight) {
      return {
        state: JSON.parse(JSON.stringify(entry.inflight.state)),
        journal: JSON.parse(JSON.stringify(entry.inflight.journal)),
        authority: cloneAuthority(entry.inflight.authority),
      };
    }
    const innerSnap = entry.inner.snapshot();
    return {
      state: innerSnap.state,
      journal: innerSnap.journal,
      authority: cloneAuthority(entry.authority),
    };
  }

  const storeInstance = {
    subjectId: defaultSubjectId,
    load,
    compareAndSwap,
    commitJournal,
    snapshot,
    computeRevision,
    getBudgets(subjectId = defaultSubjectId) {
      const entry = subjects.get(subjectId);
      return entry ? cloneBudgets(entry.budgets) : null;
    },
  };

  return storeInstance;
}

function createAuthorityRuntime(options = {}) {
  const store = createAuthorityStore(options);
  return {
    store,
  };
}

function freezeBudgets(budgets) {
  if (!budgets || typeof budgets !== "object") {
    return Object.freeze({ attempts: 0, corrections: 0 });
  }
  const frozen = {};
  for (const [k, v] of Object.entries(budgets)) {
    frozen[k] = typeof v === "object" && v !== null ? Object.freeze(JSON.parse(JSON.stringify(v))) : v;
  }
  if (frozen.attempts === undefined) frozen.attempts = 0;
  if (frozen.corrections === undefined) frozen.corrections = 0;
  return Object.freeze(frozen);
}

function cloneBudgets(budgets) {
  if (!budgets || typeof budgets !== "object") {
    return { attempts: 0, corrections: 0 };
  }
  return JSON.parse(JSON.stringify(budgets));
}

module.exports = {
  DEFAULT_SUBJECT_ID,
  digestJournal,
  digestAuthority,
  computeRevision,
  createAuthorityStore,
  createAuthorityRuntime,
};
