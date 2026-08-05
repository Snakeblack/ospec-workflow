"use strict";

const { sha256Fingerprint } = require("../canonical-json.js");

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

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim() !== "";
}

function createPermitLedger() {
  /** @type {Map<string, { permit: object, consumed: boolean, runtime_issued: boolean }>} */
  const entries = new Map();
  /** @type {Map<string, object>} */
  const offers = new Map();
  /** @type {Map<string, { record: object, kind: string, offer_id: string, consumed: boolean }>} */
  const decisions = new Map();
  let seq = 0;
  let offerSeq = 0;
  let decisionSeq = 0;

  return {
    _entries: entries,
    _offers: offers,
    _decisions: decisions,
    nextPermitId() {
      seq += 1;
      return `permit:runtime:${String(seq).padStart(4, "0")}`;
    },
    nextOfferId() {
      offerSeq += 1;
      return `offer:runtime:${String(offerSeq).padStart(4, "0")}`;
    },
    nextDecisionId(prefix) {
      decisionSeq += 1;
      return `${prefix}:runtime:${String(decisionSeq).padStart(4, "0")}`;
    },
    has(permitId) {
      return entries.has(permitId);
    },
    get(permitId) {
      return entries.get(permitId) || null;
    },
    insert(permit) {
      entries.set(permit.permit_id, {
        permit: JSON.parse(JSON.stringify(permit)),
        consumed: false,
        runtime_issued: true,
      });
    },
    markConsumed(permitId) {
      const entry = entries.get(permitId);
      if (!entry) return false;
      entry.consumed = true;
      return true;
    },
    getOffer(offerId) {
      const offer = offers.get(offerId);
      return offer ? JSON.parse(JSON.stringify(offer)) : null;
    },
    getDecision(decisionId) {
      const entry = decisions.get(decisionId);
      return entry
        ? {
            kind: entry.kind,
            offer_id: entry.offer_id,
            consumed: entry.consumed,
            record: JSON.parse(JSON.stringify(entry.record)),
          }
        : null;
    },
    /**
     * Runtime-owned TransitionOffer registration. Caller DTOs alone never authorize issuance.
     */
    registerTransitionOffer(offerInput = {}) {
      if (!offerInput || typeof offerInput !== "object") {
        return { ok: false, code: "issuer-offer-required" };
      }
      if (offerInput.kind != null && offerInput.kind !== TRANSITION_OFFER_KIND) {
        return { ok: false, code: "issuer-offer-required" };
      }
      if (!isNonEmptyString(offerInput.operation)) {
        return { ok: false, code: "issuer-offer-required" };
      }
      const offer_id = isNonEmptyString(offerInput.offer_id)
        ? offerInput.offer_id
        : this.nextOfferId();
      if (offers.has(offer_id)) {
        return { ok: false, code: "issuer-offer-reuse" };
      }
      const offer = {
        schema_version: 1,
        kind: TRANSITION_OFFER_KIND,
        offer_id,
        operation: offerInput.operation,
        subject_id: isNonEmptyString(offerInput.subject_id)
          ? offerInput.subject_id
          : "lifecycle:default",
      };
      offers.set(offer_id, offer);
      return { ok: true, offer_id, offer: JSON.parse(JSON.stringify(offer)) };
    },
    registerPolicyDecision(decisionInput = {}) {
      return registerDecisionRecord(this, decisions, {
        input: decisionInput,
        kind: POLICY_DECISION_KIND,
        idField: "decision_id",
        idPrefix: "pol",
        offers,
      });
    },
    registerHumanDecision(decisionInput = {}) {
      return registerDecisionRecord(this, decisions, {
        input: decisionInput,
        kind: HUMAN_DECISION_KIND,
        idField: "decision_id",
        idPrefix: "hum",
        offers,
      });
    },
    registerKernelRule(ruleInput = {}) {
      return registerDecisionRecord(this, decisions, {
        input: ruleInput,
        kind: KERNEL_RULE_KIND,
        idField: "rule_id",
        idPrefix: "rule",
        offers,
      });
    },
    markDecisionConsumed(decisionId) {
      const entry = decisions.get(decisionId);
      if (!entry) return false;
      entry.consumed = true;
      return true;
    },
  };
}

function registerDecisionRecord(ledger, decisions, { input, kind, idField, idPrefix, offers }) {
  if (!input || typeof input !== "object") {
    return { ok: false, code: "issuer-decision-required" };
  }
  if (input.kind != null && input.kind !== kind) {
    return { ok: false, code: "issuer-decision-required" };
  }
  if (!isNonEmptyString(input.offer_id) || !offers.has(input.offer_id)) {
    return { ok: false, code: "issuer-offer-not-registered" };
  }
  const offer = offers.get(input.offer_id);
  const operation = isNonEmptyString(input.operation) ? input.operation : offer.operation;
  if (operation !== offer.operation) {
    return { ok: false, code: "issuer-decision-offer-mismatch" };
  }
  const subject_id = isNonEmptyString(input.subject_id) ? input.subject_id : offer.subject_id;
  if (subject_id !== offer.subject_id) {
    return { ok: false, code: "issuer-decision-offer-mismatch" };
  }

  const id = isNonEmptyString(input[idField]) ? input[idField] : ledger.nextDecisionId(idPrefix);
  if (decisions.has(id)) {
    return { ok: false, code: "issuer-decision-reuse" };
  }

  const record = {
    schema_version: 1,
    kind,
    [idField]: id,
    offer_id: input.offer_id,
    operation,
    subject_id,
  };
  decisions.set(id, {
    kind,
    offer_id: input.offer_id,
    consumed: false,
    record,
  });
  return { ok: true, [idField]: id, record: JSON.parse(JSON.stringify(record)) };
}

function mintOperationPermit(input = {}) {
  const ledger = input.ledger;
  if (!ledger || typeof ledger.insert !== "function") {
    const error = new Error("permit ledger required for runtime mint");
    error.code = "permit-ledger-required";
    throw error;
  }

  const permit = {
    schema_version: 1,
    kind: "operation-permit/v1",
    permit_id: input.permit_id || ledger.nextPermitId(),
    domain: input.domain || "lifecycle",
    operation: input.operation,
    subject_id: input.subject_id || "lifecycle:default",
    expected_revision: input.expected_revision,
    arguments_digest: input.arguments_digest || sha256Fingerprint("permit:arguments", input.arguments || {}),
    scope_digest: input.scope_digest || sha256Fingerprint("permit:scope", { subject_id: input.subject_id || "lifecycle:default" }),
    policy_digest: input.policy_digest || sha256Fingerprint("permit:policy", { policy: "fixed-default" }),
    budget_ref: input.budget_ref || "budget:none",
    single_use: true,
  };

  if (input.issuer_decision_id) {
    permit.issuer_decision_id = input.issuer_decision_id;
  }
  if (input.offer_id) {
    permit.offer_id = input.offer_id;
  }

  if (!permit.operation || !permit.expected_revision) {
    const error = new Error("operation and expected_revision required to mint permit");
    error.code = "permit-mint-invalid";
    throw error;
  }

  ledger.insert(permit);
  return JSON.parse(JSON.stringify(permit));
}

/**
 * Controlled issuer: runtime-registered offer_id + decision_id|rule_id + expected_revision.
 * Fabricated DTOs (transitionOffer / policyDecision objects) are rejected.
 */
function issueOperationPermit(input = {}) {
  const {
    ledger,
    offer_id = null,
    decision_id = null,
    rule_id = null,
    expected_revision,
    subject_id = null,
    // Legacy fabricated DTO fields — rejected closed.
    transitionOffer = null,
    policyDecision = null,
    humanDecision = null,
    kernelRule = null,
    arguments: mutationArgs = null,
    arguments_digest = null,
    scope_digest = null,
    policy_digest = null,
    budget_ref = null,
  } = input;

  if (!ledger || typeof ledger.insert !== "function") {
    return { ok: false, code: "permit-ledger-required" };
  }

  // Reject fabricated DTOs: issuance must bind to runtime-owned registry ids only.
  if (transitionOffer != null || policyDecision != null || humanDecision != null || kernelRule != null) {
    return { ok: false, code: "issuer-fabricated-decision" };
  }

  if (!isNonEmptyString(expected_revision)) {
    return { ok: false, code: "permit-mint-invalid" };
  }
  if (!isNonEmptyString(offer_id) || typeof ledger.getOffer !== "function") {
    return { ok: false, code: "issuer-offer-not-registered" };
  }

  const offer = ledger.getOffer(offer_id);
  if (!offer) {
    return { ok: false, code: "issuer-offer-not-registered" };
  }

  const present = [];
  if (decision_id != null) present.push("decision");
  if (rule_id != null) present.push("rule");
  if (present.length === 0) {
    return { ok: false, code: "issuer-decision-required" };
  }
  if (present.length > 1) {
    return { ok: false, code: "issuer-decision-ambiguous" };
  }

  const lookupId = decision_id != null ? decision_id : rule_id;
  if (!isNonEmptyString(lookupId) || typeof ledger.getDecision !== "function") {
    return { ok: false, code: "issuer-decision-not-registered" };
  }
  const decisionEntry = ledger.getDecision(lookupId);
  if (!decisionEntry) {
    return { ok: false, code: "issuer-decision-not-registered" };
  }
  if (decisionEntry.consumed) {
    return { ok: false, code: "issuer-decision-consumed" };
  }
  if (decisionEntry.offer_id !== offer_id) {
    return { ok: false, code: "issuer-decision-offer-mismatch" };
  }

  if (decision_id != null) {
    if (
      decisionEntry.kind !== POLICY_DECISION_KIND &&
      decisionEntry.kind !== HUMAN_DECISION_KIND
    ) {
      return { ok: false, code: "issuer-decision-not-registered" };
    }
  } else if (decisionEntry.kind !== KERNEL_RULE_KIND) {
    return { ok: false, code: "issuer-decision-not-registered" };
  }

  const operation = offer.operation;
  const resolvedSubject =
    subject_id != null ? subject_id : offer.subject_id || "lifecycle:default";
  if (resolvedSubject !== offer.subject_id) {
    return { ok: false, code: "issuer-decision-offer-mismatch" };
  }
  if (decisionEntry.record.operation !== operation) {
    return { ok: false, code: "issuer-decision-offer-mismatch" };
  }
  if (decisionEntry.record.subject_id !== resolvedSubject) {
    return { ok: false, code: "issuer-decision-offer-mismatch" };
  }

  const permit = mintOperationPermit({
    ledger,
    operation,
    expected_revision,
    subject_id: resolvedSubject,
    arguments: mutationArgs || {},
    arguments_digest: arguments_digest || undefined,
    scope_digest: scope_digest || undefined,
    policy_digest: policy_digest || undefined,
    budget_ref: budget_ref || undefined,
    offer_id,
    issuer_decision_id: lookupId,
  });

  if (typeof ledger.markDecisionConsumed === "function") {
    ledger.markDecisionConsumed(lookupId);
  }

  return { ok: true, permit };
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
  });
  if (revision != null) receipt.revision = revision;
  return { ok: true, receipt };
}

/**
 * Build an OperationReceipt before CAS so it can be co-committed in authorityCommit.
 * receipt_id is bound to permit + operation + subject + expected_revision (stable across replay).
 */
function prepareOperationReceipt({
  permit_id,
  subject_id,
  operation,
  expected_revision,
  outcome = "advanced",
} = {}) {
  return {
    schema_version: 1,
    kind: "operation-receipt/v1",
    receipt_id: sha256Fingerprint("operation-receipt", {
      permit_id,
      subject_id,
      operation,
      expected_revision,
    }),
    permit_id,
    subject_id,
    operation,
    revision: expected_revision,
    outcome,
  };
}

/**
 * Exact-replay lookup against the Authority Store authority bag.
 * Binds arguments_digest when provided so non-identical args never short-circuit.
 */
function findReplayReceipt(authority, permit, operation, subjectId, arguments_digest = null) {
  if (!authority || !permit || typeof permit !== "object") return null;
  const permits = authority.permits || {};
  const receipts = authority.receipts || {};
  const entry = permits[permit.permit_id];
  if (!entry || entry.status !== "consumed") return null;
  const receipt = receipts[permit.permit_id];
  if (!receipt || receipt.kind !== "operation-receipt/v1") return null;
  if (receipt.operation !== operation) return null;
  if (subjectId != null && receipt.subject_id !== subjectId) return null;
  if (arguments_digest != null && permit.arguments_digest !== arguments_digest) return null;
  return JSON.parse(JSON.stringify(receipt));
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
  mintOperationPermit,
  issueOperationPermit,
  authorizeMutation,
  authorizeOperationWithPermit,
  consumePermit,
  prepareOperationReceipt,
  findReplayReceipt,
  assertNotReceiptV1,
  POLICY_DECISION_KIND,
  HUMAN_DECISION_KIND,
  KERNEL_RULE_KIND,
  TRANSITION_OFFER_KIND,
};
