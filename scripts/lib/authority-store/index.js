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

function createAuthorityStore(options = {}) {
  const defaultSubjectId = options.subjectId || DEFAULT_SUBJECT_ID;
  const subjects = new Map();

  function ensureSubject(subjectId, initial) {
    if (subjects.has(subjectId)) return subjects.get(subjectId);
    if (subjectId !== defaultSubjectId && !initial) {
      return null;
    }
    const inner =
      options.store && subjectId === defaultSubjectId
        ? options.store
        : createMemoryStore(initial || options.initial || {});
    const entry = {
      inner,
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
   */
  async function compareAndSwap(subjectId, expectedRevision, nextState, nextJournal, midOpTicket = null) {
    const entry = subjects.get(subjectId);
    if (!entry) {
      return fail("subject-not-found", { subject_id: subjectId, revision: null });
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
      return {
        ok: true,
        revision: currentRevision,
        converged: true,
        budgets: budgetsBefore,
      };
    }

    await entry.inner.commit({ state: nextState, journal: journalToCommit });
    entry.midOpTicket = null;
    if (!stateUnchanged) entry.baselines.clear();
    const after = await entry.inner.load();
    const revision = computeRevision(after.state, after.journal);
    entry.baselines.set(revision, digestLifecycleState(after.state));
    return {
      ok: true,
      revision,
      converged: false,
      budgets: cloneBudgets(entry.budgets),
      budgets_unchanged: JSON.stringify(budgetsBefore) === JSON.stringify(entry.budgets),
    };
  }

  function snapshot(subjectId = defaultSubjectId) {
    const entry = subjects.get(subjectId);
    if (!entry) return null;
    return entry.inner.snapshot();
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
