"use strict";

const {
  createPermitLedger,
  mintOperationPermit,
  issueOperationPermit,
} = require("./permits.js");

const DEFAULT_HEAD =
  "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

const DEFAULT_KERNEL_RULE = Object.freeze({
  kind: "kernel-rule/v1",
  rule_id: "rule:fixture-issuer",
});

/**
 * Register offer + decision/rule on the runtime ledger, then issue a permit.
 * Prefer this over mintOperationPermit / mintPermit:true on the public path.
 */
function issueFixturePermit(options = {}) {
  const ledger = options.ledger || createPermitLedger();
  const headRevision = options.headRevision || options.expected_revision || DEFAULT_HEAD;
  const operation = options.operation || "start";
  const subject_id = options.subject_id || "lifecycle:default";
  const transitionOffer =
    options.transitionOffer || {
      kind: "transition-offer/v1",
      operation,
      subject_id,
    };

  const offerReg = ledger.registerTransitionOffer({
    ...transitionOffer,
    operation: transitionOffer.operation || operation,
    subject_id: transitionOffer.subject_id || subject_id,
  });
  if (!offerReg.ok) {
    const error = new Error(`fixture offer registration failed: ${offerReg.code}`);
    error.code = offerReg.code;
    throw error;
  }

  let decision_id = null;
  let rule_id = null;

  if (options.policyDecision) {
    const reg = ledger.registerPolicyDecision({
      ...options.policyDecision,
      offer_id: offerReg.offer_id,
      operation,
      subject_id,
    });
    if (!reg.ok) {
      const error = new Error(`fixture policy registration failed: ${reg.code}`);
      error.code = reg.code;
      throw error;
    }
    decision_id = reg.decision_id;
  } else if (options.humanDecision) {
    const reg = ledger.registerHumanDecision({
      ...options.humanDecision,
      offer_id: offerReg.offer_id,
      operation,
      subject_id,
    });
    if (!reg.ok) {
      const error = new Error(`fixture human registration failed: ${reg.code}`);
      error.code = reg.code;
      throw error;
    }
    decision_id = reg.decision_id;
  } else {
    const kernelRule = options.kernelRule || {
      ...DEFAULT_KERNEL_RULE,
      operation,
      subject_id,
    };
    const reg = ledger.registerKernelRule({
      ...kernelRule,
      offer_id: offerReg.offer_id,
      operation,
      subject_id,
    });
    if (!reg.ok) {
      const error = new Error(`fixture rule registration failed: ${reg.code}`);
      error.code = reg.code;
      throw error;
    }
    rule_id = reg.rule_id;
  }

  const issued = issueOperationPermit({
    ledger,
    offer_id: offerReg.offer_id,
    decision_id,
    rule_id,
    expected_revision: headRevision,
    subject_id,
    arguments: options.arguments || {},
  });
  if (!issued.ok) {
    const error = new Error(`fixture issuer failed: ${issued.code}`);
    error.code = issued.code;
    throw error;
  }
  return { permit: issued.permit, ledger, headRevision, offer_id: offerReg.offer_id };
}

/**
 * Attach an issuer-produced permit to a reducer/authorize action for tests.
 */
function withRuntimePermit(action = {}, options = {}) {
  const ledger = options.ledger || createPermitLedger();
  const headRevision = options.headRevision || action.headRevision || DEFAULT_HEAD;
  let permit = action.operationPermit;
  if (!permit) {
    const issued = issueFixturePermit({
      ledger,
      operation: action.operation,
      headRevision,
      arguments: action.arguments || {},
      subject_id: options.subject_id || "lifecycle:default",
      policyDecision: options.policyDecision,
      humanDecision: options.humanDecision,
      kernelRule: options.kernelRule,
    });
    permit = issued.permit;
  }
  return {
    ...action,
    operationPermit: permit,
    permitLedger: ledger,
    headRevision,
  };
}

module.exports = {
  DEFAULT_HEAD,
  DEFAULT_KERNEL_RULE,
  withRuntimePermit,
  issueFixturePermit,
  createPermitLedger,
  mintOperationPermit,
  issueOperationPermit,
};
