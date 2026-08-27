"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { computeAssessmentId, emitAssessment } = require("./assessment.js");

const BASE = {
  schema_version: 1,
  kind: "assessment/v1",
  evidence_id: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  obligation_id: "req-repair-001",
  node_id: "repair-core",
  candidate_id: "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
  policy_snapshot_id: "sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
};

test("REQ-independent-verification-006: computeAssessmentId includes role and obligation_id", () => {
  const a = computeAssessmentId({ ...BASE, role: "acceptance" });
  const b = computeAssessmentId({ ...BASE, role: "invariants" });
  assert.match(a, /^sha256:[a-f0-9]{64}$/);
  assert.notEqual(a, b);
});

test("REQ-independent-verification-006: emitAssessment validates and rejects verdict", () => {
  const emitted = emitAssessment({ ...BASE, role: "acceptance" });
  assert.equal(emitted.ok, true, emitted.error);
  assert.equal(emitted.assessment.kind, "assessment/v1");
  assert.equal(emitted.assessment.role, "acceptance");
  assert.equal(Object.prototype.hasOwnProperty.call(emitted.assessment, "verdict"), false);

  const withVerdict = emitAssessment({ ...BASE, role: "acceptance", verdict: "PASS" });
  assert.equal(withVerdict.ok, false);
  assert.equal(withVerdict.reason_code, "MIXED_ASSESSMENT_VERDICT");
});

test("REQ-independent-verification-006: four roles share evidence_id and produce four assessment_id values", () => {
  const roles = ["acceptance", "invariants", "contract", "negative"];
  const emitted = roles.map((role) => emitAssessment({ ...BASE, role }));
  assert.equal(emitted.every((item) => item.ok), true);
  const evidenceIds = new Set(emitted.map((item) => item.assessment.evidence_id));
  const assessmentIds = new Set(emitted.map((item) => item.assessment.assessment_id));
  assert.equal(evidenceIds.size, 1);
  assert.equal(assessmentIds.size, 4);
});
