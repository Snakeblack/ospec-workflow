"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { createChallengePlan } = require("./planner.js");
const { emitChallengeResult } = require("./runner.js");
const { validateChallengePlan, validateChallengeResultSet } = require("./integrity.js");

const candidateId = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const policySnapshotId = "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

function plan() { return createChallengePlan({ candidateId, nodeId: "repair-core", policySnapshotId, evidenceStrategy: "feature" }); }
function results(value = plan()) { return value.selected.map((challengeType) => emitChallengeResult({ planId: value.plan_id, candidateId, nodeId: value.node_id, policySnapshotId, evidenceStrategy: value.evidence_strategy, challengeType, outcome: "passed" })); }

test("REQ-adversarial-challenges-002: canonical plan rejects forged binding identity and incomplete partition", () => {
  const original = plan();
  assert.equal(validateChallengePlan(original).ok, true);
  assert.equal(validateChallengePlan({ ...original, node_id: "other" }).ok, false);
  const partial = { ...original, skipped: original.skipped.slice(1) };
  partial.plan_id = require("./integrity.js").computeChallengePlanId(partial);
  assert.equal(validateChallengePlan(partial).ok, false);
});

test("REQ-independent-verification-010: result set rejects duplicate, foreign, and missing selected records", () => {
  const selectedStrategy = "feature";
  const original = plan();
  const valid = results(original);
  const evaluationBindings = { evidenceStrategy: selectedStrategy };
  assert.equal(validateChallengeResultSet(original, valid, evaluationBindings).ok, true);
  assert.equal(validateChallengeResultSet(original, [valid[0], valid[0]], evaluationBindings).ok, false);
  assert.equal(validateChallengeResultSet(original, valid.slice(0, 1), evaluationBindings).ok, false);
  const foreign = { ...valid[0], candidate_id: "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc" };
  foreign.result_id = require("./integrity.js").computeChallengeResultId(foreign);
  assert.equal(validateChallengeResultSet(original, [foreign, valid[1]], evaluationBindings).ok, false);
});

test("REQ-independent-verification-010: evaluation requires selected evidenceStrategy binding", () => {
  const selectedStrategy = "feature";
  const original = createChallengePlan({ candidateId, nodeId: "repair-core", policySnapshotId, evidenceStrategy: selectedStrategy });
  const valid = results(original);
  const omitted = validateChallengeResultSet(original, valid);
  assert.equal(omitted.ok, false);
  assert.equal(omitted.reason_code, "CHALLENGE_INTEGRITY_INVALID");
  assert.equal(validateChallengePlan(original).ok, true);
  const mismatched = validateChallengeResultSet(original, valid, { evidenceStrategy: "bug" });
  assert.equal(mismatched.ok, false);
  assert.equal(mismatched.reason_code, "CHALLENGE_INTEGRITY_INVALID");
  const matching = validateChallengeResultSet(original, valid, { evidenceStrategy: selectedStrategy });
  assert.equal(matching.ok, true);
});
