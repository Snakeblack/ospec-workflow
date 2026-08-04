"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createPermitLedger,
  mintOperationPermit,
  authorizeMutation,
  authorizeOperationWithPermit,
  consumePermit,
  assertNotReceiptV1,
} = require("./permits.js");
const { authorizeOperation } = require("./operations.js");
const { sha256Fingerprint } = require("../canonical-json.js");
const { validateInstance, loadSchemaById } = require("../kernel-schema-validator.js");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..", "..", "..");
const HEAD = "sha256:1111111111111111111111111111111111111111111111111111111111111111";
const OTHER = "sha256:2222222222222222222222222222222222222222222222222222222222222222";

test("runtime-minted permit validates against schema; single_use true; expected_revision = head", () => {
  const ledger = createPermitLedger();
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
  const ledger = createPermitLedger();
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
  const ledger = createPermitLedger();
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
  const ledger = createPermitLedger();
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
  const ledger = createPermitLedger();
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
  const ledger = createPermitLedger();
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
  const ledger = createPermitLedger();
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
  const ledger = createPermitLedger();
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
  const ledger = createPermitLedger();
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
