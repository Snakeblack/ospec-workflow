"use strict";

const { sha256Fingerprint } = require("../canonical-json.js");
const {
  createPermitAuthorityIssuer,
  mintOperationPermit,
  issueOperationPermit,
  isPermitAuthorityIssuer,
  computeOperationIntentDigest,
  computePermitDigest,
} = require("./internal/permit-authority.js");

const EFFECT_CLASSES = Object.freeze([
  "pure",
  "idempotent-keyed",
  "probeable",
  "compensatable",
  "irreversible",
]);

const POLICY_DECISION_KIND = "policy-decision/v1";
const HUMAN_DECISION_KIND = "human-decision/v1";
const KERNEL_RULE_KIND = "kernel-rule/v1";
const TRANSITION_OFFER_KIND = "transition-offer/v1";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

/**
 * Reader-only ledger view. It can answer "was this issued/consumed?" but it
 * cannot register offers/decisions, insert permits, or allocate ids.
 */
function createPermitLedger() {
  /** @type {Map<string, { permit: object, consumed: boolean, runtime_issued: boolean }>} */
  const entries = new Map();
  /** @type {Map<string, object>} */
  const offers = new Map();
  /** @type {Map<string, object>} */
  const decisions = new Map();

  function denied() {
    return { ok: false, code: "issuer-capability-required" };
  }

  return {
    _entries: entries,
    _offers: offers,
    _decisions: decisions,
    has(permitId) {
      return entries.has(permitId);
    },
    get(permitId) {
      return entries.get(permitId) || null;
    },
    getOffer(offerId) {
      const offer = offers.get(offerId);
      return offer ? clone(offer) : null;
    },
    getDecision(decisionId) {
      const entry = decisions.get(decisionId);
      return entry ? clone(entry) : null;
    },
    registerTransitionOffer: denied,
    registerPolicyDecision: denied,
    registerHumanDecision: denied,
    registerKernelRule: denied,
  };
}

function authorizeMutation({
  permit,
  headRevision,
  ledger,
  transitionOffer = null,
  operation = null,
  subject_id = null,
  arguments: mutationArgs = null,
  arguments_digest = null,
  authority = null,
} = {}) {
  if (transitionOffer && !permit) {
    return { ok: false, code: "unauthorized", reason: "offer-only" };
  }
  if (!permit || typeof permit !== "object") {
    return { ok: false, code: "unauthorized" };
  }

  // Bag is sole durable consume truth across restart; process Map may be empty.
  if (
    authority &&
    typeof authority === "object" &&
    authority.permits &&
    authority.permits[permit.permit_id] &&
    authority.permits[permit.permit_id].status === "consumed"
  ) {
    return { ok: false, code: "permit-reuse" };
  }

  if (!ledger || typeof ledger.get !== "function") {
    return { ok: false, code: "permit-not-runtime-issued" };
  }

  const entry = ledger.get(permit.permit_id);
  if (!entry || entry.runtime_issued !== true) {
    return { ok: false, code: "permit-not-runtime-issued" };
  }
  if (entry.consumed) {
    return { ok: false, code: "permit-reuse" };
  }
  if (permit.expected_revision !== headRevision) {
    return { ok: false, code: "stale-permit" };
  }
  if (permit.single_use !== true) {
    return { ok: false, code: "unauthorized" };
  }

  const ledgerPermit = entry.permit;
  if (ledgerPermit.expected_revision !== permit.expected_revision) {
    return { ok: false, code: "stale-permit" };
  }
  if (permit.operation !== ledgerPermit.operation) {
    return { ok: false, code: "unauthorized" };
  }
  if (permit.subject_id !== ledgerPermit.subject_id) {
    return { ok: false, code: "unauthorized" };
  }
  if (permit.arguments_digest !== ledgerPermit.arguments_digest) {
    return { ok: false, code: "unauthorized" };
  }

  if (operation != null && operation !== permit.operation) {
    return { ok: false, code: "unauthorized" };
  }
  if (subject_id != null && subject_id !== permit.subject_id) {
    return { ok: false, code: "unauthorized" };
  }
  const requestedDigest =
    arguments_digest != null
      ? arguments_digest
      : mutationArgs != null
        ? sha256Fingerprint("permit:arguments", mutationArgs)
        : null;
  if (requestedDigest != null && requestedDigest !== permit.arguments_digest) {
    return { ok: false, code: "unauthorized" };
  }

  return { ok: true };
}

function authorizeOperationWithPermit(input = {}) {
  const {
    operation,
    authorityToken,
    operationPermit,
    permitLedger,
    headRevision,
    transitionOffer,
    subject_id = null,
    arguments: mutationArgs = null,
    arguments_digest = null,
    authority = null,
  } = input;

  // Non-mutating status is always allowed without a permit.
  if (operation === "status") return { ok: true };

  if (!operationPermit) {
    // Token alone is never sufficient; offer alone is never sufficient.
    if (transitionOffer) return { ok: false, code: "unauthorized" };
    if (typeof authorityToken === "string" && authorityToken.trim() !== "") {
      return { ok: false, code: "unauthorized" };
    }
    return { ok: false, code: "unauthorized" };
  }

  return authorizeMutation({
    permit: operationPermit,
    headRevision,
    ledger: permitLedger,
    transitionOffer,
    operation,
    subject_id,
    arguments: mutationArgs,
    arguments_digest,
    authority,
  });
}

function consumePermit({ permit_id, ledger, subject_id, operation, revision, outcome } = {}) {
  if (!ledger || typeof ledger.get !== "function") {
    const error = new Error("permit ledger required");
    error.code = "permit-ledger-required";
    throw error;
  }
  const entry = ledger.get(permit_id);
  if (!entry || entry.runtime_issued !== true) {
    return { ok: false, code: "permit-not-runtime-issued" };
  }
  if (entry.consumed) {
    return { ok: false, code: "permit-reuse" };
  }
  if (typeof ledger.markConsumed !== "function") {
    return { ok: false, code: "issuer-capability-required" };
  }
  if (entry.permit.expected_revision !== revision && revision != null) {
    // Consume binds to post-CAS revision for the receipt; stale check uses pre-CAS head at authorize.
  }
  ledger.markConsumed(permit_id);
  const receipt = prepareOperationReceipt({
    permit_id,
    subject_id: subject_id || entry.permit.subject_id,
    operation: operation || entry.permit.operation,
    expected_revision: revision || entry.permit.expected_revision,
    outcome: outcome || "advanced",
    operation_intent_digest: entry.permit.operation_intent_digest || null,
    arguments_digest: entry.permit.arguments_digest || null,
  });
  if (revision != null) receipt.revision = revision;
  return { ok: true, receipt };
}

function prepareOperationReceipt({
  permit_id,
  subject_id,
  operation,
  expected_revision,
  outcome = "advanced",
  operation_intent_digest = null,
  arguments_digest = null,
} = {}) {
  return {
    schema_version: 1,
    kind: "operation-receipt/v1",
    receipt_id: sha256Fingerprint("operation-receipt", {
      permit_id,
      subject_id,
      operation,
      expected_revision,
      operation_intent_digest: operation_intent_digest || null,
      arguments_digest: arguments_digest || null,
    }),
    permit_id,
    subject_id,
    operation,
    revision: expected_revision,
    outcome,
    operation_intent_digest: operation_intent_digest || null,
    arguments_digest: arguments_digest || null,
  };
}

function findReplayReceipt(authority, permit, operation, subjectId, arguments_digest = null) {
  if (!authority || !permit || typeof permit !== "object") return null;
  const permits = authority.permits || {};
  const receipts = authority.receipts || {};
  const stored = permits[permit.permit_id];
  if (!stored || stored.status !== "consumed") return null;
  const receipt = receipts[permit.permit_id];
  if (!receipt || receipt.kind !== "operation-receipt/v1") return null;
  if (receipt.operation !== operation) return null;
  if (subjectId != null && receipt.subject_id !== subjectId) return null;
  if (stored.operation != null && stored.operation !== operation) return null;
  if (subjectId != null && stored.subject_id != null && stored.subject_id !== subjectId) {
    return null;
  }
  if (arguments_digest != null) {
    const storedDigest =
      stored.arguments_digest != null ? stored.arguments_digest : receipt.arguments_digest;
    if (storedDigest == null || storedDigest !== arguments_digest) return null;
  }
  return clone(receipt);
}

function assertNotReceiptV1(receipt) {
  if (!receipt || receipt.kind === "receipt/v1" || receipt.candidate_id) {
    return { ok: false, code: "receipt-family-mismatch" };
  }
  if (receipt.kind !== "operation-receipt/v1") {
    return { ok: false, code: "receipt-family-mismatch" };
  }
  return { ok: true };
}

module.exports = {
  EFFECT_CLASSES,
  createPermitLedger,
  authorizeMutation,
  authorizeOperationWithPermit,
  consumePermit,
  prepareOperationReceipt,
  computeOperationIntentDigest,
  computePermitDigest,
  findReplayReceipt,
  assertNotReceiptV1,
  POLICY_DECISION_KIND,
  HUMAN_DECISION_KIND,
  KERNEL_RULE_KIND,
  TRANSITION_OFFER_KIND,
};
