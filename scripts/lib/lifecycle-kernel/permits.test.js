"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createPermitLedger,
  authorizeMutation,
  authorizeOperationWithPermit,
  consumePermit,
  prepareOperationReceipt,
  findReplayReceipt,
  assertNotReceiptV1,
} = require("./permits.js");
const {
  createPermitAuthorityIssuer,
  isPermitAuthorityIssuer,
  mintOperationPermit,
  issueOperationPermit,
} = require("../test-support/permit-test-helpers.js");

test("Phase 1: internal minting functions are undefined on permits.js export", () => {
  const permits = require("./permits.js");
  assert.equal(permits._internalCreateIssuer, undefined);
  assert.equal(permits.mintOperationPermit, undefined);
  assert.equal(permits.issueOperationPermit, undefined);
  assert.equal(permits.isPermitAuthorityIssuer, undefined);
});


const { authorizeOperation } = require("./operations.js");
const { sha256Fingerprint } = require("../canonical-json.js");
const { validateInstance, loadSchemaById } = require("../kernel-schema-validator.js");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..", "..", "..");
const HEAD = "sha256:1111111111111111111111111111111111111111111111111111111111111111";
const OTHER = "sha256:2222222222222222222222222222222222222222222222222222222222222222";

/** Durable consume record as the Authority Store persists it. */
function storedPermitRecord(permit) {
  return {
    permit_id: permit.permit_id,
    status: "consumed",
    operation_intent_digest: permit.operation_intent_digest,
    permit_digest: permit.permit_digest,
    operation: permit.operation,
    subject_id: permit.subject_id,
    arguments_digest: permit.arguments_digest,
    scope_digest: permit.scope_digest,
    policy_digest: permit.policy_digest,
    issuer_decision_id: permit.issuer_decision_id || null,
    expected_revision: permit.expected_revision,
  };
}

test("CRITICAL: reader ledger carries no issuer capability and cannot register or mint", () => {
  const reader = createPermitLedger();
  assert.equal(isPermitAuthorityIssuer(reader), false);
  assert.equal(typeof reader.insert, "undefined");
  assert.equal(typeof reader.nextPermitId, "undefined");
  assert.equal(typeof reader.nextOfferId, "undefined");
  assert.equal(typeof reader.nextDecisionId, "undefined");

  assert.equal(reader.registerTransitionOffer(OFFER).code, "issuer-capability-required");
  assert.equal(
    reader.registerPolicyDecision({ offer_id: "offer:x", operation: "start" }).code,
    "issuer-capability-required"
  );
  assert.equal(
    reader.registerHumanDecision({ offer_id: "offer:x", operation: "start" }).code,
    "issuer-capability-required"
  );
  assert.equal(
    reader.registerKernelRule({ offer_id: "offer:x", operation: "start" }).code,
    "issuer-capability-required"
  );

  const issued = issueOperationPermit({
    ledger: reader,
    offer_id: "offer:x",
    rule_id: "rule:x",
    expected_revision: HEAD,
  });
  assert.equal(issued.ok, false);
  assert.equal(issued.code, "issuer-capability-required");

  assert.throws(
    () => mintOperationPermit({ ledger: reader, operation: "start", expected_revision: HEAD }),
    (error) => error.code === "issuer-capability-required"
  );
  assert.equal(reader._entries.size, 0);
});

test("issuer allocates non-recyclable ids; a fresh issuer never reuses them", () => {
  const first = createPermitAuthorityIssuer();
  const a = mintOperationPermit({ ledger: first, operation: "start", expected_revision: HEAD });
  const b = mintOperationPermit({ ledger: first, operation: "start", expected_revision: HEAD });
  assert.notEqual(a.permit_id, b.permit_id);
  assert.match(
    a.permit_id,
    /^permit:runtime:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
  );

  // Restart: a new issuer starts from an empty map but must not recycle ids.
  const restarted = createPermitAuthorityIssuer();
  const c = mintOperationPermit({ ledger: restarted, operation: "start", expected_revision: HEAD });
  assert.notEqual(c.permit_id, a.permit_id);
  assert.notEqual(c.permit_id, b.permit_id);
});

test("minted permit carries operation intent and permit digests", () => {
  const issuer = createPermitAuthorityIssuer();
  const permit = mintOperationPermit({
    ledger: issuer,
    operation: "start",
    expected_revision: HEAD,
    subject_id: "lifecycle:default",
    arguments: { node_id: "n1" },
  });
  assert.match(permit.operation_intent_digest, /^sha256:[a-f0-9]{64}$/);
  assert.match(permit.permit_digest, /^sha256:[a-f0-9]{64}$/);

  const other = mintOperationPermit({
    ledger: issuer,
    operation: "start",
    expected_revision: HEAD,
    subject_id: "lifecycle:default",
    arguments: { node_id: "n2" },
  });
  assert.notEqual(other.operation_intent_digest, permit.operation_intent_digest);
});

test("runtime-minted permit validates against schema; single_use true; expected_revision = head", () => {
  const ledger = createPermitAuthorityIssuer();
  const permit = mintOperationPermit({
    ledger,
    operation: "start",
    expected_revision: HEAD,
    subject_id: "lifecycle:default",
  });
  assert.equal(permit.single_use, true);
  assert.equal(permit.expected_revision, HEAD);
  const schema = loadSchemaById("ospec://schemas/kernel/operation-permit/v1", { rootDir: ROOT });
  assert.equal(validateInstance(schema, permit).valid, true);
  assert.ok(ledger.has(permit.permit_id));
});

test("stale permit rejected at authorize; head unchanged conceptually", () => {
  const ledger = createPermitAuthorityIssuer();
  const permit = mintOperationPermit({
    ledger,
    operation: "start",
    expected_revision: HEAD,
  });
  const auth = authorizeMutation({ permit, headRevision: OTHER, ledger });
  assert.equal(auth.ok, false);
  assert.equal(auth.code, "stale-permit");
});

test("consumed permit reuse rejected", () => {
  const ledger = createPermitAuthorityIssuer();
  const permit = mintOperationPermit({
    ledger,
    operation: "start",
    expected_revision: HEAD,
  });
  const first = consumePermit({
    permit_id: permit.permit_id,
    ledger,
    subject_id: "lifecycle:default",
    operation: "start",
    revision: OTHER,
    outcome: "advanced",
  });
  assert.equal(first.ok, true);
  const reuse = authorizeMutation({ permit, headRevision: HEAD, ledger });
  assert.equal(reuse.ok, false);
  assert.equal(reuse.code, "permit-reuse");
});

test("TransitionOffer alone cannot authorize mutation", () => {
  const auth = authorizeOperation({
    operation: "start",
    transitionOffer: { kind: "execute", operation: "start" },
  });
  assert.equal(auth.ok, false);
  assert.equal(auth.code, "unauthorized");
});

test("model-fabricated permit rejected; non-empty token without permit fails", () => {
  const ledger = createPermitAuthorityIssuer();
  const fabricated = {
    schema_version: 1,
    kind: "operation-permit/v1",
    permit_id: "permit:forged:9999",
    domain: "lifecycle",
    operation: "start",
    subject_id: "lifecycle:default",
    expected_revision: HEAD,
    arguments_digest: "sha256:aa",
    scope_digest: "sha256:bb",
    policy_digest: "sha256:cc",
    budget_ref: "budget:none",
    single_use: true,
  };
  const forged = authorizeMutation({ permit: fabricated, headRevision: HEAD, ledger });
  assert.equal(forged.ok, false);
  assert.equal(forged.code, "permit-not-runtime-issued");

  const tokenOnly = authorizeOperation({
    operation: "start",
    authorityToken: "opaque:non-empty",
  });
  assert.equal(tokenOnly.ok, false);
  assert.equal(tokenOnly.code, "unauthorized");
});

test("consume emits OperationReceipt distinct from receipt/v1", () => {
  const ledger = createPermitAuthorityIssuer();
  const permit = mintOperationPermit({
    ledger,
    operation: "start",
    expected_revision: HEAD,
  });
  const consumed = consumePermit({
    permit_id: permit.permit_id,
    ledger,
    subject_id: "lifecycle:default",
    operation: "start",
    revision: OTHER,
    outcome: "advanced",
  });
  assert.equal(consumed.ok, true);
  assert.equal(consumed.receipt.kind, "operation-receipt/v1");
  assert.equal(consumed.receipt.permit_id, permit.permit_id);
  assert.equal(assertNotReceiptV1(consumed.receipt).ok, true);

  const receiptSchema = loadSchemaById("ospec://schemas/kernel/operation-receipt/v1", {
    rootDir: ROOT,
  });
  assert.equal(validateInstance(receiptSchema, consumed.receipt).valid, true);

  const receiptV1 = {
    schema_version: 1,
    receipt_id: "r1",
    candidate_id: "c1",
    kind: "evaluation",
    digest: "sha256:dead",
  };
  assert.equal(validateInstance(receiptSchema, receiptV1).valid, false);
  assert.equal(assertNotReceiptV1(receiptV1).ok, false);
});

test("authorizeMutation binds presented permit to ledger operation/subject/args", () => {
  const ledger = createPermitAuthorityIssuer();
  const args = { node_id: "n1" };
  const permit = mintOperationPermit({
    ledger,
    operation: "start",
    expected_revision: HEAD,
    subject_id: "lifecycle:default",
    arguments: args,
  });

  const happy = authorizeMutation({
    permit,
    headRevision: HEAD,
    ledger,
    operation: "start",
    subject_id: "lifecycle:default",
    arguments: args,
  });
  assert.equal(happy.ok, true);

  const opRebind = { ...permit, operation: "complete" };
  assert.equal(
    authorizeMutation({ permit: opRebind, headRevision: HEAD, ledger }).code,
    "unauthorized"
  );

  const subjectRebind = { ...permit, subject_id: "lifecycle:other" };
  assert.equal(
    authorizeMutation({ permit: subjectRebind, headRevision: HEAD, ledger }).code,
    "unauthorized"
  );

  const argsRebind = { ...permit, arguments_digest: "sha256:deadbeef" };
  assert.equal(
    authorizeMutation({ permit: argsRebind, headRevision: HEAD, ledger }).code,
    "unauthorized"
  );
});

test("authorizeMutation rejects requested operation/subject/args rebinding", () => {
  const ledger = createPermitAuthorityIssuer();
  const args = { node_id: "n1" };
  const permit = mintOperationPermit({
    ledger,
    operation: "start",
    expected_revision: HEAD,
    subject_id: "lifecycle:default",
    arguments: args,
  });

  assert.equal(
    authorizeMutation({
      permit,
      headRevision: HEAD,
      ledger,
      operation: "complete",
    }).code,
    "unauthorized"
  );
  assert.equal(
    authorizeMutation({
      permit,
      headRevision: HEAD,
      ledger,
      subject_id: "lifecycle:other",
    }).code,
    "unauthorized"
  );
  assert.equal(
    authorizeMutation({
      permit,
      headRevision: HEAD,
      ledger,
      arguments: { node_id: "n2" },
    }).code,
    "unauthorized"
  );
  assert.equal(
    authorizeMutation({
      permit,
      headRevision: HEAD,
      ledger,
      arguments_digest: sha256Fingerprint("permit:arguments", { node_id: "n2" }),
    }).code,
    "unauthorized"
  );
});

test("authorizeOperationWithPermit forwards binding fields to authorizeMutation", () => {
  const ledger = createPermitAuthorityIssuer();
  const args = { node_id: "n1" };
  const permit = mintOperationPermit({
    ledger,
    operation: "start",
    expected_revision: HEAD,
    arguments: args,
  });

  assert.equal(
    authorizeOperationWithPermit({
      operation: "complete",
      operationPermit: permit,
      permitLedger: ledger,
      headRevision: HEAD,
      arguments: args,
    }).code,
    "unauthorized"
  );
});

test("requested operation mismatch against ledger-backed permit fails closed", () => {
  const ledger = createPermitAuthorityIssuer();
  const permit = mintOperationPermit({
    ledger,
    operation: "start",
    expected_revision: HEAD,
    arguments: { node_id: "n1" },
  });

  // Presented permit matches ledger, but the solicited operation does not.
  const mismatch = authorizeOperationWithPermit({
    operation: "fail",
    operationPermit: permit,
    permitLedger: ledger,
    headRevision: HEAD,
    subject_id: "lifecycle:default",
    arguments: { node_id: "n1" },
  });
  assert.equal(mismatch.ok, false);
  assert.equal(mismatch.code, "unauthorized");

  // Happy path still binds solicited operation to ledger permit.operation.
  const ok = authorizeOperationWithPermit({
    operation: "start",
    operationPermit: permit,
    permitLedger: ledger,
    headRevision: HEAD,
    subject_id: "lifecycle:default",
    arguments: { node_id: "n1" },
  });
  assert.equal(ok.ok, true);
});

const OFFER = Object.freeze({
  kind: "transition-offer/v1",
  operation: "start",
  subject_id: "lifecycle:default",
});

test("issueOperationPermit produces permit from registered offer plus policy decision", () => {
  const ledger = createPermitAuthorityIssuer();
  const offerReg = ledger.registerTransitionOffer(OFFER);
  assert.equal(offerReg.ok, true);
  const decisionReg = ledger.registerPolicyDecision({
    kind: "policy-decision/v1",
    decision_id: "pol:1",
    offer_id: offerReg.offer_id,
    operation: "start",
    subject_id: "lifecycle:default",
  });
  assert.equal(decisionReg.ok, true);
  const issued = issueOperationPermit({
    ledger,
    offer_id: offerReg.offer_id,
    decision_id: decisionReg.decision_id,
    expected_revision: HEAD,
    subject_id: "lifecycle:default",
  });
  assert.equal(issued.ok, true);
  assert.equal(issued.permit.kind, "operation-permit/v1");
  assert.equal(issued.permit.expected_revision, HEAD);
  assert.equal(issued.permit.operation, "start");
  assert.equal(issued.permit.single_use, true);
  assert.equal(issued.permit.offer_id, offerReg.offer_id);
  assert.equal(issued.permit.issuer_decision_id, "pol:1");
  assert.ok(ledger.has(issued.permit.permit_id));
});

test("issueOperationPermit rejects fabricated DTOs (issuer-fabricated-decision)", () => {
  const ledger = createPermitAuthorityIssuer();
  const result = issueOperationPermit({
    ledger,
    transitionOffer: OFFER,
    expected_revision: HEAD,
    subject_id: "lifecycle:default",
    policyDecision: {
      kind: "policy-decision/v1",
      decision_id: "fabricated",
      operation: "start",
    },
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, "issuer-fabricated-decision");
  assert.equal(ledger._entries.size, 0);
});

test("issueOperationPermit rejects offer-only without decision (issuer-decision-required)", () => {
  const ledger = createPermitAuthorityIssuer();
  const offerReg = ledger.registerTransitionOffer(OFFER);
  const result = issueOperationPermit({
    ledger,
    offer_id: offerReg.offer_id,
    expected_revision: HEAD,
    subject_id: "lifecycle:default",
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, "issuer-decision-required");
  assert.equal(ledger._entries.size, 0);
});

test("issueOperationPermit rejects ambiguous decision_id + rule_id", () => {
  const ledger = createPermitAuthorityIssuer();
  const offerReg = ledger.registerTransitionOffer(OFFER);
  const pol = ledger.registerPolicyDecision({
    offer_id: offerReg.offer_id,
    decision_id: "pol:1",
    operation: "start",
  });
  const rule = ledger.registerKernelRule({
    offer_id: offerReg.offer_id,
    rule_id: "rule:1",
    operation: "start",
  });
  const result = issueOperationPermit({
    ledger,
    offer_id: offerReg.offer_id,
    decision_id: pol.decision_id,
    rule_id: rule.rule_id,
    expected_revision: HEAD,
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, "issuer-decision-ambiguous");
  assert.equal(ledger._entries.size, 0);
});

test("issueOperationPermit accepts registered humanDecision or kernelRule", () => {
  const ledger = createPermitAuthorityIssuer();
  const offerReg = ledger.registerTransitionOffer(OFFER);
  const humanReg = ledger.registerHumanDecision({
    offer_id: offerReg.offer_id,
    decision_id: "hum:2",
    operation: "start",
  });
  const human = issueOperationPermit({
    ledger,
    offer_id: offerReg.offer_id,
    decision_id: humanReg.decision_id,
    expected_revision: HEAD,
    subject_id: "lifecycle:default",
  });
  assert.equal(human.ok, true);
  assert.ok(ledger.has(human.permit.permit_id));

  const ledger2 = createPermitAuthorityIssuer();
  const offer2 = ledger2.registerTransitionOffer(OFFER);
  const ruleReg = ledger2.registerKernelRule({
    offer_id: offer2.offer_id,
    rule_id: "rule:fixture-start",
    operation: "start",
  });
  const rule = issueOperationPermit({
    ledger: ledger2,
    offer_id: offer2.offer_id,
    rule_id: ruleReg.rule_id,
    expected_revision: HEAD,
    subject_id: "lifecycle:default",
  });
  assert.equal(rule.ok, true);
  assert.ok(ledger2.has(rule.permit.permit_id));
});

test("issueOperationPermit rejects unregistered decision_id", () => {
  const ledger = createPermitAuthorityIssuer();
  const offerReg = ledger.registerTransitionOffer(OFFER);
  const result = issueOperationPermit({
    ledger,
    offer_id: offerReg.offer_id,
    decision_id: "pol:never-registered",
    expected_revision: HEAD,
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, "issuer-decision-not-registered");
});

test("CRITICAL: fabricated PolicyDecision DTO alone cannot issue a permit", () => {
  const ledger = createPermitAuthorityIssuer();
  const forged = issueOperationPermit({
    ledger,
    transitionOffer: { kind: "transition-offer/v1", operation: "start" },
    expected_revision: HEAD,
    policyDecision: { kind: "policy-decision/v1", decision_id: "fabricated" },
  });
  assert.equal(forged.ok, false);
  assert.equal(forged.code, "issuer-fabricated-decision");
});

test("findReplayReceipt binds arguments_digest; non-identical args are not replay", () => {
  const ledger = createPermitAuthorityIssuer();
  const argsA = { node_id: "n1" };
  const argsB = { node_id: "n2" };
  const digestA = sha256Fingerprint("permit:arguments", argsA);
  const digestB = sha256Fingerprint("permit:arguments", argsB);
  const permit = mintOperationPermit({
    ledger,
    operation: "start",
    expected_revision: HEAD,
    subject_id: "lifecycle:default",
    arguments: argsA,
  });
  const receipt = prepareOperationReceipt({
    permit_id: permit.permit_id,
    subject_id: "lifecycle:default",
    operation: "start",
    expected_revision: HEAD,
    outcome: "advanced",
  });
  const authority = {
    permits: { [permit.permit_id]: storedPermitRecord(permit) },
    receipts: { [permit.permit_id]: receipt },
  };

  const exact = findReplayReceipt(authority, permit, "start", "lifecycle:default", digestA);
  assert.ok(exact);
  assert.equal(exact.receipt_id, receipt.receipt_id);

  const mismatched = findReplayReceipt(authority, permit, "start", "lifecycle:default", digestB);
  assert.equal(mismatched, null);
});

test("CRITICAL: forged permit reusing a consumed id with other args is not a replay", () => {
  const issuer = createPermitAuthorityIssuer();
  const argsA = { node_id: "n1" };
  const argsB = { node_id: "n2" };
  const digestB = sha256Fingerprint("permit:arguments", argsB);
  const permit = mintOperationPermit({
    ledger: issuer,
    operation: "start",
    expected_revision: HEAD,
    subject_id: "lifecycle:default",
    arguments: argsA,
  });
  const receipt = prepareOperationReceipt({
    permit_id: permit.permit_id,
    subject_id: "lifecycle:default",
    operation: "start",
    expected_revision: HEAD,
    outcome: "advanced",
    operation_intent_digest: permit.operation_intent_digest,
    arguments_digest: permit.arguments_digest,
  });
  const authority = {
    permits: { [permit.permit_id]: storedPermitRecord(permit) },
    receipts: { [permit.permit_id]: receipt },
  };

  // Same permit_id, caller-presented digests rewritten to the forged arguments.
  const forged = {
    ...permit,
    arguments_digest: digestB,
    operation_intent_digest: "sha256:forged-intent",
  };
  assert.equal(findReplayReceipt(authority, forged, "start", "lifecycle:default", digestB), null);
});

test("replay against a bag record without stored intent fails closed", () => {
  const issuer = createPermitAuthorityIssuer();
  const args = { node_id: "n1" };
  const digest = sha256Fingerprint("permit:arguments", args);
  const permit = mintOperationPermit({
    ledger: issuer,
    operation: "start",
    expected_revision: HEAD,
    subject_id: "lifecycle:default",
    arguments: args,
  });
  const authority = {
    permits: { [permit.permit_id]: { permit_id: permit.permit_id, status: "consumed" } },
    receipts: {
      [permit.permit_id]: {
        schema_version: 1,
        kind: "operation-receipt/v1",
        receipt_id: "sha256:legacy",
        permit_id: permit.permit_id,
        subject_id: "lifecycle:default",
        operation: "start",
        revision: HEAD,
        outcome: "advanced",
      },
    },
  };
  assert.equal(findReplayReceipt(authority, permit, "start", "lifecycle:default", digest), null);
});

test("authorizeMutation fails closed with permit-reuse when bag shows consumed", () => {
  const ledger = createPermitAuthorityIssuer();
  const permit = mintOperationPermit({
    ledger,
    operation: "start",
    expected_revision: HEAD,
    subject_id: "lifecycle:default",
    arguments: { node_id: "n1" },
  });
  // Simulate restart: empty process Map, bag already consumed without matching replay receipt path.
  const emptyLedger = createPermitAuthorityIssuer();
  const authority = {
    permits: { [permit.permit_id]: { permit_id: permit.permit_id, status: "consumed" } },
    receipts: {},
  };

  const reuse = authorizeMutation({
    permit,
    headRevision: HEAD,
    ledger: emptyLedger,
    authority,
    operation: "start",
    subject_id: "lifecycle:default",
    arguments: { node_id: "n1" },
  });
  assert.equal(reuse.ok, false);
  assert.equal(reuse.code, "permit-reuse");
});

test("Task 1.1 & 3.1: PERMIT_AUTHORITY_ISSUER and createPermitAuthorityIssuer are not exported publicly", () => {
  const permitsModule = require("./permits.js");
  assert.equal(permitsModule.PERMIT_AUTHORITY_ISSUER, undefined);
  assert.equal(permitsModule.createPermitAuthorityIssuer, undefined);
});

test("Task 3.1: Forged Symbol.for is rejected by isPermitAuthorityIssuer", () => {
  const forgedSymbol = Symbol.for("ospec.permitAuthorityIssuer");
  const forgedObj = { [forgedSymbol]: true };
  assert.equal(isPermitAuthorityIssuer(forgedObj), false);
});