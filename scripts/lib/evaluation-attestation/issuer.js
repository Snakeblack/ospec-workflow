"use strict";

const { sha256Fingerprint, stableSerialize } = require("../canonical-json.js");
const {
  authorizeOperationWithPermit,
  prepareOperationReceipt,
  findReplayReceipt,
  assertNotReceiptV1,
} = require("../lifecycle-kernel/permits.js");
const { createJournalRecord } = require("../lifecycle-kernel/journal.js");
const { createCandidateEvaluationAttestation } = require("./index.js");

const ISSUE_OPERATION = "issue-candidate-evaluation-attestation";
const SUBJECT_IDENTITY_DOMAIN = "candidate-evaluation-attestation-subject/v1";
const SUBJECT_ID_PREFIX = "evaluation-attestation:";
const LEDGER_KIND = "evaluation-attestation-ledger/v1";
const EMIT_EFFECT_CLASS = "idempotent-keyed";

// Must mirror the WU2 EXPECTED_REVISION_DOMAIN: the CAS subject identity is
// the same {candidate_id, policy_digest} pair the attestation pins as
// expected_revision, which is what binds the emission to store revisions.
const PERMIT_REJECTION_CODES = Object.freeze({
  "permit-reuse": "EVALUATION_ISSUANCE_PERMIT_REUSE",
  "stale-permit": "EVALUATION_ISSUANCE_PERMIT_STALE",
});

function fail(reason_code, error, extra = {}) {
  return { ok: false, reason_code, error: error || reason_code, ...extra };
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value, keys) {
  if (!isRecord(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

/**
 * Deterministic CAS subject for an evaluation emission. It is derived from the
 * replay-validated {candidate_id, policy_digest} pair, so one subject collects
 * every emission attempt for the same candidate under the same policy and no
 * other emission can collide with it.
 */
function computeEvaluationSubjectId({ candidate_id, policy_digest } = {}) {
  if (typeof candidate_id !== "string" || candidate_id === "" ||
    typeof policy_digest !== "string" || policy_digest === "") {
    throw new TypeError("computeEvaluationSubjectId requires non-empty candidate_id and policy_digest strings");
  }
  return `${SUBJECT_ID_PREFIX}${sha256Fingerprint(SUBJECT_IDENTITY_DOMAIN, {
    candidate_id,
    policy_digest,
  })}`;
}

/**
 * The emission arguments a permit must be minted over: the operation, the CAS
 * subject, and the attestation identity. A permit minted over anything else
 * cannot authorize this emission.
 */
function emissionPermitArguments(subjectId, attestationId) {
  return Object.freeze({
    operation: ISSUE_OPERATION,
    subject_id: subjectId,
    attestation_id: attestationId,
  });
}

function freshLedgerState() {
  return { schema_version: 1, kind: LEDGER_KIND, attestations: {} };
}

function normalizeLedgerState(state) {
  if (!isRecord(state)) return null;
  if (Object.keys(state).length === 0) return freshLedgerState();
  if (state.kind === LEDGER_KIND && isRecord(state.attestations)) return state;
  return null;
}

/**
 * Emits a candidate-evaluation-attestation/v1 through the authority
 * infrastructure: the WU2 pure constructor is the sole attestation authority
 * (every constructor rejection, including EVALUATION_K7_NO_MODEL_DEFERRED, is
 * returned verbatim before any store read or write), and the store write is a
 * permit-authorized compareAndSwap on the deterministic evaluation subject.
 *
 * Ordering follows the kernel house pattern: load head, exact-replay check by
 * permit receipt, authorize against the head revision, then one atomic CAS
 * carrying next_state, next_journal, the consumed permit, and its
 * OperationReceipt in the winning revision. A competing revision between
 * authorization and CAS fails closed; an interruption with an unknown outcome
 * is reconciled by re-presenting the same inputs (exact replay converges when
 * the commit landed, a fresh authorized CAS when it did not).
 *
 * @returns {Promise<
 *   | { ok: true, attestation: object, subject_id: string, revision: string, replayed: boolean, converged: boolean, operation_receipt: object }
 *   | { ok: false, reason_code: string, error: string }
 * >}
 */
async function issueCandidateEvaluationAttestation(input) {
  const requiredKeys = [
    "store",
    "permitLedger",
    "operationPermit",
    "binding",
    "lineage",
    "issuance",
    "phase",
    "issuer_version",
    "runtime_version",
    "issued_at",
  ];
  if (!isRecord(input) || !exactKeys(input, requiredKeys)) {
    return fail(
      "EVALUATION_ISSUANCE_INPUT_INVALID",
      "input must contain exactly store, permitLedger, operationPermit, and the WU2 constructor inputs (binding, lineage, issuance, phase, issuer_version, runtime_version, issued_at)"
    );
  }
  const { store, permitLedger } = input;
  const permit = input.operationPermit;
  if (!store || typeof store.load !== "function" || typeof store.compareAndSwap !== "function") {
    return fail(
      "EVALUATION_ISSUANCE_STORE_INVALID",
      "store must be an authority store exposing load and compareAndSwap"
    );
  }

  // The issuer never relaxes WU2 rejections: a rejected emission writes
  // nothing and consumes nothing, not even a live permit.
  const created = createCandidateEvaluationAttestation({
    binding: input.binding,
    lineage: input.lineage,
    issuance: input.issuance,
    phase: input.phase,
    issuer_version: input.issuer_version,
    runtime_version: input.runtime_version,
    issued_at: input.issued_at,
  });
  if (!created.ok) return created;
  const attestation = created.attestation;

  const subjectId = computeEvaluationSubjectId({
    candidate_id: attestation.candidate_id,
    policy_digest: attestation.policy_digest,
  });

  const loaded = await store.load(subjectId);
  if (!loaded || loaded.ok === false || typeof loaded.revision !== "string" || loaded.revision === "") {
    return fail(
      "EVALUATION_ISSUANCE_SUBJECT_NOT_FOUND",
      `authority store exposes no subject ${subjectId}; construct it with the derived evaluation subject id`,
      { subject_id: subjectId, cause: loaded && loaded.code }
    );
  }
  const headRevision = loaded.revision;
  const authorityBag = loaded.authority || { permits: {}, receipts: {} };
  const ledgerState = normalizeLedgerState(loaded.state);
  if (!ledgerState) {
    return fail(
      "EVALUATION_ISSUANCE_STATE_DIVERGENT",
      `subject ${subjectId} holds a state that is not an ${LEDGER_KIND}`,
      { subject_id: subjectId, revision: headRevision }
    );
  }

  const emissionArgs = emissionPermitArguments(subjectId, attestation.attestation_id);
  const argumentsDigest = sha256Fingerprint("permit:arguments", emissionArgs);

  // Exact replay first (REQ-operation-permits-006 / REQ-authority-store-004):
  // a consumed permit with a matching stored receipt returns the prior
  // OperationReceipt; no second permit is consumed and no second head advance
  // is invented.
  const replayReceipt = isRecord(permit)
    ? findReplayReceipt(authorityBag, permit, ISSUE_OPERATION, subjectId, argumentsDigest)
    : null;
  if (replayReceipt) {
    const stored = ledgerState.attestations[attestation.attestation_id];
    if (!stored || stableSerialize(stored) !== stableSerialize(attestation)) {
      return fail(
        "EVALUATION_ISSUANCE_STATE_DIVERGENT",
        "replay receipt exists but the stored attestation diverges from the recomputed emission",
        { subject_id: subjectId, revision: headRevision }
      );
    }
    const replayCheck = assertNotReceiptV1(replayReceipt);
    if (!replayCheck.ok) {
      return fail(
        "EVALUATION_ISSUANCE_RECEIPT_INVALID",
        "stored replay receipt is not an operation-receipt/v1",
        { subject_id: subjectId, revision: headRevision, cause: replayCheck.code }
      );
    }
    return {
      ok: true,
      attestation,
      subject_id: subjectId,
      revision: headRevision,
      replayed: true,
      converged: true,
      operation_receipt: replayReceipt,
    };
  }

  const auth = authorizeOperationWithPermit({
    operation: ISSUE_OPERATION,
    operationPermit: permit,
    permitLedger,
    headRevision,
    subject_id: subjectId,
    arguments: emissionArgs,
    arguments_digest: argumentsDigest,
    authority: authorityBag,
  });
  if (!auth.ok) {
    return fail(
      PERMIT_REJECTION_CODES[auth.code] || "EVALUATION_ISSUANCE_PERMIT_REJECTED",
      `permit authorization failed: ${auth.code}`,
      { subject_id: subjectId, revision: headRevision, cause: auth.code }
    );
  }

  // Persisted intent comes from the ledger-held permit, never from the
  // caller-presented copy.
  const ledgerEntry = permitLedger && typeof permitLedger.get === "function"
    ? permitLedger.get(permit.permit_id)
    : null;
  const issuedPermit = ledgerEntry ? ledgerEntry.permit : null;
  if (!issuedPermit) {
    return fail(
      "EVALUATION_ISSUANCE_PERMIT_REJECTED",
      "permit authorization failed: permit-not-runtime-issued",
      { subject_id: subjectId, revision: headRevision, cause: "permit-not-runtime-issued" }
    );
  }

  const receipt = prepareOperationReceipt({
    permit_id: permit.permit_id,
    subject_id: subjectId,
    operation: ISSUE_OPERATION,
    expected_revision: headRevision,
    outcome: "advanced",
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
      issuer_decision_id: issuedPermit.issuer_decision_id === undefined
        ? null
        : issuedPermit.issuer_decision_id,
      expected_revision: issuedPermit.expected_revision,
    },
  };

  const nextState = {
    ...ledgerState,
    attestations: { ...ledgerState.attestations, [attestation.attestation_id]: attestation },
  };
  const nextJournal = [
    ...(Array.isArray(loaded.journal) ? loaded.journal : []),
    createJournalRecord({
      operation_id: `${ISSUE_OPERATION}:${attestation.attestation_id}`,
      effect_id: `emit-attestation:${attestation.attestation_id}`,
      status: "completed",
      effect_class: EMIT_EFFECT_CLASS,
      result: {
        attestation_id: attestation.attestation_id,
        subject_id: subjectId,
        permit_id: permit.permit_id,
      },
    }),
  ];

  let cas;
  try {
    cas = await store.compareAndSwap(
      subjectId,
      headRevision,
      nextState,
      nextJournal,
      null,
      authorityCommit
    );
  } catch (error) {
    return fail(
      "EVALUATION_ISSUANCE_INTERRUPTED",
      `emission outcome unknown (${error.message}); reconcile by re-presenting the same inputs`,
      { subject_id: subjectId, revision: headRevision }
    );
  }
  if (!cas || cas.ok === false) {
    // The authority store marks a lost race only with code "cas-conflict"
    // (revision mismatch at the outer CAS guard or at the backing store's own
    // revision check, which it propagates verbatim). Any other typed {ok:false}
    // — durability error, inner-commit failure, guard rejection — is a commit
    // failure, not a race; the store's code is preserved verbatim so callers
    // reconciling or diagnosing see the real cause.
    const cause = cas ? cas.code : "cas-unavailable";
    const base = { subject_id: subjectId, revision: cas ? cas.revision : null, cause };
    if (cause === "cas-conflict") {
      return fail(
        "EVALUATION_ISSUANCE_CAS_CONFLICT",
        `stale writer lost the CAS race: ${cause}`,
        base
      );
    }
    return fail(
      "EVALUATION_ISSUANCE_COMMIT_FAILED",
      cas
        ? `authority store commit failed: ${cause}`
        : "authority store compareAndSwap returned no typed result",
      base
    );
  }

  // The bag is the sole durable consume truth; the process-local ledger is
  // only an issued mirror, so it is marked after the winning CAS.
  if (permitLedger && typeof permitLedger.markConsumed === "function") {
    permitLedger.markConsumed(permit.permit_id);
  }

  const committed = cas.operation_receipt
    || (await store.load(subjectId)).authority?.receipts?.[permit.permit_id]
    || null;
  if (!committed) {
    return fail(
      "EVALUATION_ISSUANCE_RECEIPT_INVALID",
      "winning revision exposes no operation receipt for the consumed permit",
      { subject_id: subjectId, revision: cas.revision }
    );
  }
  const committedCheck = assertNotReceiptV1(committed);
  if (!committedCheck.ok) {
    return fail(
      "EVALUATION_ISSUANCE_RECEIPT_INVALID",
      "committed receipt is not an operation-receipt/v1",
      { subject_id: subjectId, revision: cas.revision, cause: committedCheck.code }
    );
  }

  return {
    ok: true,
    attestation,
    subject_id: subjectId,
    revision: cas.revision,
    replayed: false,
    converged: cas.converged === true,
    operation_receipt: committed,
  };
}

module.exports = {
  ISSUE_OPERATION,
  computeEvaluationSubjectId,
  emissionPermitArguments,
  issueCandidateEvaluationAttestation,
};
