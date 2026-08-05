"use strict";

const { sha256Fingerprint } = require("../canonical-json.js");
const { digestLifecycleState } = require("../lifecycle-kernel/state-digest.js");
const { createMemoryStore } = require("../lifecycle-kernel/memory-store.js");

const DEFAULT_SUBJECT_ID = "lifecycle:default";

function digestJournal(journal) {
  const ordered = Array.isArray(journal) ? journal : [];
  return sha256Fingerprint("authority-store:journal", ordered);
}

function computeRevision(state, journal) {
  return sha256Fingerprint("authority-store:revision", {
    state_digest: digestLifecycleState(state),
    journal_digest: digestJournal(journal),
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

function isCompleteAuthorityCommit(authorityCommit) {
  if (!authorityCommit || typeof authorityCommit !== "object") return false;
  if (!authorityCommit.permit_id || typeof authorityCommit.permit_id !== "string") return false;
  if (authorityCommit.status !== "consumed") return false;
  const receipt = authorityCommit.receipt;
  if (!receipt || typeof receipt !== "object") return false;
  if (receipt.kind !== "operation-receipt/v1") return false;
  if (!receipt.receipt_id || receipt.permit_id !== authorityCommit.permit_id) return false;
  return true;
}

/**
 * Prepare the next authority bag (clone + consume + receipt) before mutating head.
 * Throws if receipt cannot be materialized — caller must not advance head.
 */
function materializeAuthorityCommit(currentAuthority, authorityCommit) {
  const nextAuthority = cloneAuthority(currentAuthority);
  nextAuthority.permits[authorityCommit.permit_id] = {
    permit_id: authorityCommit.permit_id,
    status: "consumed",
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
    };
    subjects.set(subjectId, entry);
    return entry;
  }

  ensureSubject(defaultSubjectId, options.initial);

  async function load(subjectId = defaultSubjectId) {
    const entry = subjects.get(subjectId);
    if (!entry) {
      return fail("subject-not-found", { subject_id: subjectId, revision: null });
    }
    const loaded = await entry.inner.load();
    const state = loaded.state;
    const journal = loaded.journal;
    const stateDigest = digestLifecycleState(state);
    const revision = computeRevision(state, journal);
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
    await entry.inner.commitJournal(nextJournal);
    const loaded = await entry.inner.load();
    const revision = computeRevision(loaded.state, loaded.journal);
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
   * { permit_id, receipt, status: "consumed" } or CAS fails closed with
   * authority-commit-incomplete and does not advance the head. Omitted
   * (undefined) keeps non-permit CAS paths working for store unit tests.
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

    const permitAuthorized = authorityCommit !== undefined;
    if (permitAuthorized && !isCompleteAuthorityCommit(authorityCommit)) {
      const loaded = await entry.inner.load();
      return fail("authority-commit-incomplete", {
        revision: computeRevision(loaded.state, loaded.journal),
        budgets: cloneBudgets(entry.budgets),
      });
    }

    const loaded = await entry.inner.load();
    const currentRevision = computeRevision(loaded.state, loaded.journal);
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
        // before returning ok (never ok with null/ephemeral receipt).
        const nextAuthority = materializeAuthorityCommit(entry.authority, authorityCommit);
        const stored = nextAuthority.receipts[authorityCommit.permit_id];
        if (stored && (stored.revision === "pending" || stored.revision == null)) {
          stored.revision = currentRevision;
        }
        entry.authority = nextAuthority;
        return {
          ok: true,
          revision: currentRevision,
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

    // Prepare authority bag before head mutation so load/snapshot never observe
    // an advanced head without matching consume+receipt. Roll back bag if commit fails.
    let previousAuthority = null;
    if (permitAuthorized) {
      const nextAuthority = materializeAuthorityCommit(entry.authority, authorityCommit);
      previousAuthority = entry.authority;
      entry.authority = nextAuthority;
    }

    try {
      await entry.inner.commit({ state: nextState, journal: journalToCommit });
    } catch (err) {
      if (previousAuthority) entry.authority = previousAuthority;
      throw err;
    }
    entry.midOpTicket = null;
    if (!stateUnchanged) entry.baselines.clear();

    const after = await entry.inner.load();
    const revision = computeRevision(after.state, after.journal);
    entry.baselines.set(revision, digestLifecycleState(after.state));

    // Bind receipt.revision to the winning head when caller left a placeholder.
    if (permitAuthorized) {
      const stored = entry.authority.receipts[authorityCommit.permit_id];
      if (stored && (stored.revision === "pending" || stored.revision == null)) {
        stored.revision = revision;
      }
    }

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
    const innerSnap = entry.inner.snapshot();
    return {
      state: innerSnap.state,
      journal: innerSnap.journal,
      authority: cloneAuthority(entry.authority),
    };
  }

  return {
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
}

function freezeBudgets(budgets) {
  const base = budgets && typeof budgets === "object" ? budgets : { attempts: 0, corrections: 0 };
  return Object.freeze({
    attempts: Number(base.attempts) || 0,
    corrections: Number(base.corrections) || 0,
  });
}

function cloneBudgets(budgets) {
  return {
    attempts: budgets.attempts,
    corrections: budgets.corrections,
  };
}

module.exports = {
  DEFAULT_SUBJECT_ID,
  digestJournal,
  computeRevision,
  createAuthorityStore,
};
