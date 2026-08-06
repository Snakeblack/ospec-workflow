"use strict";

const {
  createPermitAuthorityIssuer,
  mintOperationPermit,
  issueOperationPermit,
  isPermitAuthorityIssuer,
} = require("../lifecycle-kernel/internal/permit-authority.js");

const { createPermitLedger } = require("../lifecycle-kernel/permits.js");

const DEFAULT_HEAD =
  "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

const DEFAULT_KERNEL_RULE = Object.freeze({
  kind: "kernel-rule/v1",
});

function createTestPermitIssuer() {
  return createPermitAuthorityIssuer();
}

function mintTestPermit(options) {
  return mintOperationPermit(options);
}

function issueTestPermit(options) {
  return issueOperationPermit(options);
}

function issueFixturePermit(options = {}) {
  const ledger =
    options.ledger ||
    createPermitAuthorityIssuer();

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

function withRuntimePermit(action = {}, options = {}) {
  const ledger =
    options.ledger ||
    createPermitAuthorityIssuer();
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

function createTestKernelRuntime(options = {}) {
  const permitIssuer = options.permitIssuer || createPermitAuthorityIssuer();
  const store = options.store || createAuthorityStore(options);
  const { createKernelRuntime } = require("../lifecycle-kernel/index.js");
  const { runKernelOperation } = require("../lifecycle-kernel/internal/permit-authority.js");

  const base = createKernelRuntime({ store, subjectId: options.subjectId });

  return {
    ...base,
    permitIssuer,
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

      const subject_id = input.subject_id || options.subjectId || "lifecycle:default";
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
  };
}

module.exports = {
  createTestKernelRuntime,
  createTestPermitIssuer,
  mintTestPermit,
  issueTestPermit,
  createPermitAuthorityIssuer,
  mintOperationPermit,
  issueOperationPermit,
  isPermitAuthorityIssuer,
  issueFixturePermit,
  withRuntimePermit,
  createPermitLedger,
  DEFAULT_HEAD,
  DEFAULT_KERNEL_RULE,
};

