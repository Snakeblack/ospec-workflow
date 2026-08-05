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
 * Issue a permit via the controlled issuer for test fixtures (K2.1b).
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

  const decisionFields = {};
  if (options.policyDecision) decisionFields.policyDecision = options.policyDecision;
  else if (options.humanDecision) decisionFields.humanDecision = options.humanDecision;
  else if (options.kernelRule) decisionFields.kernelRule = options.kernelRule;
  else decisionFields.kernelRule = { ...DEFAULT_KERNEL_RULE, operation, subject_id };

  const issued = issueOperationPermit({
    ledger,
    transitionOffer,
    expected_revision: headRevision,
    subject_id,
    arguments: options.arguments || {},
    ...decisionFields,
  });
  if (!issued.ok) {
    const error = new Error(`fixture issuer failed: ${issued.code}`);
    error.code = issued.code;
    throw error;
  }
  return { permit: issued.permit, ledger, headRevision };
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
