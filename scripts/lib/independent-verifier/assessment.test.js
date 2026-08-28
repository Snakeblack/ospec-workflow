"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { computeAssessmentId, emitAssessment, validateAssessment, CANONICAL_ROLES } = require("./assessment.js");

const BASE_V2 = {
  schema_version: 2,
  kind: "assessment/v2",
  evidence_id: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  obligation_id: "req-repair-001",
  node_id: "repair-core",
  candidate_id: "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
  policy_snapshot_id: "sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
  evidence_requirements_satisfied: ["ev:test-pass"],
};

const BASE_V1 = {
  schema_version: 1,
  kind: "assessment/v1",
  evidence_id: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  obligation_id: "req-repair-001",
  node_id: "repair-core",
  candidate_id: "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
  policy_snapshot_id: "sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
};

test("REQ-independent-verification-006: computeAssessmentId includes role, obligation_id, and canonical coverage", () => {
  const a = computeAssessmentId({ ...BASE_V2, role: "acceptance" });
  const b = computeAssessmentId({ ...BASE_V2, role: "invariant" });
  assert.match(a, /^sha256:[a-f0-9]{64}$/);
  assert.notEqual(a, b);
  assert.equal(
    computeAssessmentId({ ...BASE_V2, role: "acceptance", evidence_requirements_satisfied: ["b", "a", "a"] }),
    computeAssessmentId({ ...BASE_V2, role: "acceptance", evidence_requirements_satisfied: ["a", "b"] })
  );
});

test("REQ-independent-verification-006: evidence_id and obligation_id independently change assessment identity", () => {
  const baseline = computeAssessmentId({ ...BASE_V2, role: "acceptance" });
  const differentEvidence = computeAssessmentId({
    ...BASE_V2,
    role: "acceptance",
    evidence_id: "sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
  });
  const differentObligation = computeAssessmentId({
    ...BASE_V2,
    role: "acceptance",
    obligation_id: "req-repair-002",
  });

  assert.notEqual(baseline, differentEvidence);
  assert.notEqual(baseline, differentObligation);
  assert.notEqual(differentEvidence, differentObligation);
});

test("REQ-independent-verification-006: emitAssessment emits assessment/v2 by default and rejects verdict", () => {
  const emitted = emitAssessment({ ...BASE_V2, role: "acceptance" });
  assert.equal(emitted.ok, true, emitted.error);
  assert.equal(emitted.assessment.kind, "assessment/v2");
  assert.equal(emitted.assessment.schema_version, 2);
  assert.equal(emitted.assessment.role, "acceptance");
  assert.equal(Object.prototype.hasOwnProperty.call(emitted.assessment, "verdict"), false);

  const withVerdict = emitAssessment({ ...BASE_V2, role: "acceptance", verdict: "PASS" });
  assert.equal(withVerdict.ok, false);
  assert.equal(withVerdict.reason_code, "MIXED_ASSESSMENT_VERDICT");
});

test("REQ-kernel-contract-schemas-027: assessment/v2 requires non-empty evidence_requirements_satisfied", () => {
  const emptyCov = emitAssessment({ ...BASE_V2, role: "acceptance", evidence_requirements_satisfied: [] });
  assert.equal(emptyCov.ok, false);
  assert.equal(emptyCov.reason_code, "INVALID_ASSESSMENT");

  const missingCov = emitAssessment({
    evidence_id: BASE_V2.evidence_id,
    role: "acceptance",
    obligation_id: BASE_V2.obligation_id,
    node_id: BASE_V2.node_id,
    candidate_id: BASE_V2.candidate_id,
    policy_snapshot_id: BASE_V2.policy_snapshot_id,
  });
  assert.equal(missingCov.ok, false);
  assert.equal(missingCov.reason_code, "INVALID_ASSESSMENT");
});

test("REQ-independent-verification-006: four roles share evidence_id and produce four distinct assessment_id values", () => {
  const roles = ["acceptance", "invariant", "integration", "negative"];
  const emitted = roles.map((role) => emitAssessment({ ...BASE_V2, role }));
  assert.equal(emitted.every((item) => item.ok), true);
  const evidenceIds = new Set(emitted.map((item) => item.assessment.evidence_id));
  const assessmentIds = new Set(emitted.map((item) => item.assessment.assessment_id));
  assert.equal(evidenceIds.size, 1);
  assert.equal(assessmentIds.size, 4);
});

test("REQ-kernel-contract-schemas-027: assessment/v1 backward compatibility is preserved", () => {
  const v1Emitted = emitAssessment({ ...BASE_V1, schema_version: 1, role: "acceptance" });
  assert.equal(v1Emitted.ok, true, v1Emitted.error);
  assert.equal(v1Emitted.assessment.kind, "assessment/v1");
  assert.equal(v1Emitted.assessment.schema_version, 1);

  const v1Valid = validateAssessment(v1Emitted.assessment);
  assert.equal(v1Valid.ok, true);
});
