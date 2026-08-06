"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

test("lifecycle-kernel production export surface does not leak permit minting or un-scoped runKernelOperation", () => {
  const kernel = require("./index.js");

  assert.equal(kernel._internalCreateIssuer, undefined);
  assert.equal(kernel.mintOperationPermit, undefined);
  assert.equal(kernel.issueOperationPermit, undefined);
  assert.equal(kernel.isPermitAuthorityIssuer, undefined);
  assert.equal(kernel.runKernelOperation, undefined);

  assert.equal(typeof kernel.createKernelRuntime, "function");
  assert.equal(typeof kernel.digestLifecycleState, "function");
  assert.equal(typeof kernel.selectTransitions, "function");
  assert.equal(typeof kernel.nextTransition, "function");
});

test("permits.js production export surface does not leak direct minting or issuer creation", () => {
  const permits = require("./permits.js");

  assert.equal(permits._internalCreateIssuer, undefined);
  assert.equal(permits.mintOperationPermit, undefined);
  assert.equal(permits.issueOperationPermit, undefined);
  assert.equal(permits.isPermitAuthorityIssuer, undefined);
  assert.equal(permits.PERMIT_AUTHORITY_ISSUER, undefined);
  assert.equal(permits.createPermitAuthorityIssuer, undefined);

  assert.equal(typeof permits.createPermitLedger, "function");
  assert.equal(typeof permits.authorizeOperationWithPermit, "function");
  assert.equal(typeof permits.consumePermit, "function");
});
