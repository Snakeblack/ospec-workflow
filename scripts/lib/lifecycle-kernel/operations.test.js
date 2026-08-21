"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  OPERATIONS,
  authorizeOperation,
  validateOperationTransition,
} = require("./operations.js");
const { digestLifecycleState } = require("./state-digest.js");
const { mintOperationPermit, createPermitAuthorityIssuer } = require("../test-support/permit-test-helpers.js");

function baseState(overrides = {}) {
  return {
    schema_version: 1,
    status: "ready",
    nodes: {
      n1: { id: "n1", phase: "pending", attempt: 0 },
    },
    ...overrides,
  };
}

test("OPERATIONS registry lists the K2 public verbs", () => {
  const names = OPERATIONS.map((op) => op.name).sort();
  assert.deepEqual(names, [
    "complete",
    "decide",
    "escalate",
    "fail",
    "invalidate-node",
    "recover",
    "repair",
    "replan",
    "start",
    "status",
    "stop",
  ]);
});

test("complete without start fails closed with stable code and no mutation", () => {
  const state = baseState();
  const before = digestLifecycleState(state);
  const result = validateOperationTransition(state, {
    operation: "complete",
    arguments: { node_id: "n1" },
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, "invalid-transition");
  assert.equal(result.state_digest, before);
  assert.ok(Array.isArray(result.allowed_operations));
  assert.ok(result.allowed_operations.includes("start"));
  assert.equal(digestLifecycleState(state), before);
});

test("start on already started node fails closed", () => {
  const state = baseState({
    nodes: { n1: { id: "n1", phase: "started", attempt: 1 } },
  });
  const before = digestLifecycleState(state);
  const result = validateOperationTransition(state, {
    operation: "start",
    arguments: { node_id: "n1" },
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, "invalid-transition");
  assert.equal(result.state_digest, before);
});

test("fail on pending node fails closed", () => {
  const state = baseState();
  const result = validateOperationTransition(state, {
    operation: "fail",
    arguments: { node_id: "n1" },
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, "invalid-transition");
});

test("invalidate-node on missing node fails closed", () => {
  const state = baseState();
  const result = validateOperationTransition(state, {
    operation: "invalidate-node",
    arguments: { node_id: "missing" },
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, "invalid-transition");
});

test("recover without recoverable interruption fails closed", () => {
  const state = baseState({ status: "ready" });
  const result = validateOperationTransition(state, {
    operation: "recover",
    arguments: { node_id: "n1" },
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, "invalid-transition");
});

test("authorizeOperation rejects token-only and missing permit for mutating ops", () => {
  const denied = authorizeOperation({
    operation: "start",
    arguments: { node_id: "n1" },
    authorityToken: null,
  });
  assert.equal(denied.ok, false);
  assert.equal(denied.code, "unauthorized");

  const allowed = authorizeOperation({
    operation: "status",
    arguments: {},
    authorityToken: null,
  });
  assert.equal(allowed.ok, true);

  const tokenOnly = authorizeOperation({
    operation: "start",
    arguments: { node_id: "n1" },
    authorityToken: "opaque:token-1",
  });
  assert.equal(tokenOnly.ok, false);
  assert.equal(tokenOnly.code, "unauthorized");

  const ledger = createPermitAuthorityIssuer();
  const head = "sha256:1111111111111111111111111111111111111111111111111111111111111111";
  const permit = mintOperationPermit({
    ledger,
    operation: "start",
    expected_revision: head,
  });
  const authed = authorizeOperation({
    operation: "start",
    arguments: { node_id: "n1" },
    operationPermit: permit,
    permitLedger: ledger,
    headRevision: head,
  });
  assert.equal(authed.ok, true);
});

test("valid start transition is accepted", () => {
  const state = baseState();
  const result = validateOperationTransition(state, {
    operation: "start",
    arguments: { node_id: "n1" },
  });
  assert.equal(result.ok, true);
  assert.equal(result.code, undefined);
});

test("Phase 3 RED: validateOperationTransition enforces causal recovery allowlist fail-closed [REQ-failure-recovery-002, REQ-failure-recovery-003, REQ-lifecycle-kernel-runtime-026]", () => {
  // 1. repair rejected for ambiguous_effect
  const stateAmbiguous = baseState({
    status: "blocked",
    nodes: {
      n1: {
        id: "n1",
        phase: "failed",
        attempt: 1,
        failure: { category: "ambiguous_effect", code: "AMB_1", priority: 3 },
      },
    },
  });
  const resAmbiguousRepair = validateOperationTransition(stateAmbiguous, {
    operation: "repair",
    arguments: { node_id: "n1" },
  });
  assert.equal(resAmbiguousRepair.ok, false);
  assert.equal(resAmbiguousRepair.code, "unallowlisted-recovery-transition");

  // 2. repair rejected for validation_gap
  const stateValGap = baseState({
    status: "blocked",
    nodes: {
      n1: {
        id: "n1",
        phase: "failed",
        attempt: 1,
        failure: { category: "validation_gap", code: "GAP_1", priority: 4 },
      },
    },
  });
  const resValGapRepair = validateOperationTransition(stateValGap, {
    operation: "repair",
    arguments: { node_id: "n1" },
  });
  assert.equal(resValGapRepair.ok, false);
  assert.equal(resValGapRepair.code, "unallowlisted-recovery-transition");

  // 3. repair rejected for environment_tooling
  const stateEnv = baseState({
    status: "blocked",
    nodes: {
      n1: {
        id: "n1",
        phase: "failed",
        attempt: 1,
        failure: { category: "environment_tooling", code: "TIMEOUT", priority: 1 },
      },
    },
  });
  const resEnvRepair = validateOperationTransition(stateEnv, {
    operation: "repair",
    arguments: { node_id: "n1" },
  });
  assert.equal(resEnvRepair.ok, false);
  assert.equal(resEnvRepair.code, "unallowlisted-recovery-transition");

  // 4. repair accepted for code_defect
  const stateCodeDefect = baseState({
    status: "blocked",
    authority_budget: { effect_attempts: 2 },
    nodes: {
      n1: {
        id: "n1",
        phase: "failed",
        attempt: 1,
        failure: { category: "code_defect", code: "ASSERTION_FAIL", priority: 5 },
      },
    },
  });
  const resCodeRepair = validateOperationTransition(stateCodeDefect, {
    operation: "repair",
    arguments: { node_id: "n1" },
  });
  assert.equal(resCodeRepair.ok, true);

  // 5. escalate and stop accepted for all failure categories
  const resAmbiguousEscalate = validateOperationTransition(stateAmbiguous, {
    operation: "escalate",
    arguments: { node_id: "n1" },
  });
  assert.equal(resAmbiguousEscalate.ok, true);

  const resAmbiguousStop = validateOperationTransition(stateAmbiguous, {
    operation: "stop",
    arguments: { node_id: "n1" },
  });
  assert.equal(resAmbiguousStop.ok, true);
});

