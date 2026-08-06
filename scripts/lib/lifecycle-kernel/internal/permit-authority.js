"use strict";

const { randomUUID } = require("node:crypto");
const { sha256Fingerprint } = require("../../canonical-json.js");

const POLICY_DECISION_KIND = "policy-decision/v1";
const HUMAN_DECISION_KIND = "human-decision/v1";
const KERNEL_RULE_KIND = "kernel-rule/v1";
const TRANSITION_OFFER_KIND = "transition-offer/v1";

const PERMIT_AUTHORITY_ISSUER = Symbol("ospec.permitAuthorityIssuer");

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim() !== "";
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function isPermitAuthorityIssuer(ledger) {
  return Boolean(
    ledger && typeof ledger === "object" && ledger[PERMIT_AUTHORITY_ISSUER] === true
  );
}

function createPermitAuthorityIssuer() {
  /** @type {Map<string, { permit: object, consumed: boolean, runtime_issued: boolean }>} */
  const entries = new Map();
  /** @type {Map<string, object>} */
  const offers = new Map();
  /** @type {Map<string, { record: object, kind: string, offer_id: string, consumed: boolean }>} */
  const decisions = new Map();

  return {
    [PERMIT_AUTHORITY_ISSUER]: true,
    _entries: entries,
    _offers: offers,
    _decisions: decisions,
    nextPermitId() {
      return `permit:runtime:${randomUUID()}`;
    },
    nextOfferId() {
      return `offer:runtime:${randomUUID()}`;
    },
    nextDecisionId(prefix) {
      return `${prefix}:runtime:${randomUUID()}`;
    },
    has(permitId) {
      return entries.has(permitId);
    },
    get(permitId) {
      return entries.get(permitId) || null;
    },
    insert(permit) {
      entries.set(permit.permit_id, {
        permit: clone(permit),
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
      return offer ? clone(offer) : null;
    },
    getDecision(decisionId) {
      const entry = decisions.get(decisionId);
      return entry
        ? {
            kind: entry.kind,
            offer_id: entry.offer_id,
            consumed: entry.consumed,
            record: clone(entry.record),
          }
        : null;
    },
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
      return { ok: true, offer_id, offer: clone(offer) };
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
  return { ok: true, [idField]: id, record: clone(record) };
}

function computeOperationIntentDigest({
  domain,
  operation,
  subject_id,
  arguments_digest,
  expected_revision,
}) {
  return sha256Fingerprint("operation-intent/v1", {
    domain: domain || "lifecycle",
    operation: operation || null,
    subject_id: subject_id || null,
    arguments_digest: arguments_digest || null,
    expected_revision: expected_revision || null,
  });
}

function computePermitDigest(permit) {
  const { permit_digest, ...rest } = permit;
  void permit_digest;
  return sha256Fingerprint("operation-permit/v1", rest);
}

function mintOperationPermit(input = {}) {
  const ledger = input.ledger;
  if (!ledger || typeof ledger !== "object") {
    const error = new Error("permit ledger required for runtime mint");
    error.code = "permit-ledger-required";
    throw error;
  }
  if (!isPermitAuthorityIssuer(ledger) || typeof ledger.insert !== "function") {
    const error = new Error("permit authority issuer capability required for runtime mint");
    error.code = "issuer-capability-required";
    throw error;
  }

  const subject_id = input.subject_id || "lifecycle:default";
  const permit = {
    schema_version: 1,
    kind: "operation-permit/v1",
    permit_id: input.permit_id || ledger.nextPermitId(),
    domain: input.domain || "lifecycle",
    operation: input.operation,
    subject_id,
    expected_revision: input.expected_revision,
    arguments_digest:
      input.arguments_digest || sha256Fingerprint("permit:arguments", input.arguments || {}),
    scope_digest: input.scope_digest || sha256Fingerprint("permit:scope", { subject_id }),
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

  permit.operation_intent_digest = computeOperationIntentDigest(permit);
  permit.permit_digest = computePermitDigest(permit);

  ledger.insert(permit);
  return clone(permit);
}

function issueOperationPermit(input = {}) {
  const {
    ledger,
    offer_id = null,
    decision_id = null,
    rule_id = null,
    expected_revision,
    subject_id = null,
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

  if (!ledger || typeof ledger !== "object") {
    return { ok: false, code: "permit-ledger-required" };
  }
  if (!isPermitAuthorityIssuer(ledger) || typeof ledger.insert !== "function") {
    return { ok: false, code: "issuer-capability-required" };
  }

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

module.exports = {
  PERMIT_AUTHORITY_ISSUER,
  isPermitAuthorityIssuer,
  createPermitAuthorityIssuer,
  mintOperationPermit,
  issueOperationPermit,
  computeOperationIntentDigest,
  computePermitDigest,
};

