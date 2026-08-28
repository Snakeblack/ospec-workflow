"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { walkMustObligations } = require("./obligation-coverage.js");

const CANDIDATE = { candidate_id: "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc" };
const POLICY = "sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd";
const EVIDENCE = {
  evidence_id: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  provenance: "runtime-observed",
  node_id: "repair-core",
  evidence_requirements_satisfied: ["ev:test-pass"],
};

function graph(obligations) {
  return { obligations };
}

test("REQ-independent-verification-005: MUST without evidence fails UNFULFILLED_MUST", () => {
  const result = walkMustObligations({
    classified: [],
    executionGraph: graph([
      {
        id: "req-repair-001",
        criticality: "must",
        implemented_by: ["repair-core"],
        required_evidence: ["ev:test-pass"],
      },
    ]),
    candidate: CANDIDATE,
    policySnapshotId: POLICY,
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason_code, "UNFULFILLED_MUST");
  assert.match(result.error, /req-repair-001/);
});

test("REQ-independent-verification-005: unknown obligation_id fails closed", () => {
  const result = walkMustObligations({
    classified: [
      { role: "acceptance", evidence: EVIDENCE, obligation_ids: ["alien"] },
    ],
    executionGraph: graph([
      {
        id: "req-repair-001",
        criticality: "must",
        implemented_by: ["repair-core"],
        required_evidence: ["ev:test-pass"],
      },
    ]),
    candidate: CANDIDATE,
    policySnapshotId: POLICY,
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason_code, "UNKNOWN_OBLIGATION_ID");
});

test("REQ-independent-verification-005: wrong implementing node fails closed", () => {
  const result = walkMustObligations({
    classified: [
      {
        role: "acceptance",
        evidence: { ...EVIDENCE, node_id: "other-node" },
        obligation_ids: ["req-repair-001"],
      },
    ],
    executionGraph: graph([
      {
        id: "req-repair-001",
        criticality: "must",
        implemented_by: ["repair-core"],
        required_evidence: ["ev:test-pass"],
      },
    ]),
    candidate: CANDIDATE,
    policySnapshotId: POLICY,
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason_code, "WRONG_IMPLEMENTING_NODE");
});

test("REQ-independent-verification-005: approved deferral skips MUST", () => {
  const result = walkMustObligations({
    classified: [],
    executionGraph: graph([
      {
        id: "req-repair-001",
        criticality: "must",
        implemented_by: ["repair-core"],
        required_evidence: ["ev:test-pass"],
        deferred: { reason: "later", approved_by: "maintainer" },
      },
    ]),
    candidate: CANDIDATE,
    policySnapshotId: POLICY,
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.assessments, []);
});

test("REQ-independent-verification-005: empty required_evidence on non-deferred MUST fails", () => {
  const result = walkMustObligations({
    classified: [
      { role: "acceptance", evidence: EVIDENCE, obligation_ids: ["req-repair-001"] },
    ],
    executionGraph: graph([
      {
        id: "req-repair-001",
        criticality: "must",
        implemented_by: ["repair-core"],
        required_evidence: [],
      },
    ]),
    candidate: CANDIDATE,
    policySnapshotId: POLICY,
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason_code, "UNFULFILLED_MUST");
});

test("REQ-independent-verification-005: strategy-shaped bindings still emit persistable assessments", () => {
  const result = walkMustObligations({
    classified: [
      { role: "acceptance", evidence: EVIDENCE, obligation_ids: ["req-repair-001"] },
    ],
    executionGraph: graph([
      {
        id: "req-repair-001",
        criticality: "must",
        implemented_by: ["repair-core"],
        required_evidence: ["ev:test-pass"],
      },
    ]),
    candidate: CANDIDATE,
    policySnapshotId: POLICY,
  });
  assert.equal(result.ok, true, result.error);
  assert.equal(result.assessments.length, 1);
  assert.equal(result.assessments[0].obligation_id, "req-repair-001");
  assert.equal(result.assessments[0].role, "acceptance");
});

test("REQ-independent-verification-005: token subset coverage rejects partial bindings and persists the complete union", () => {
  const base = {
    id: "req-repair-001",
    criticality: "must",
    implemented_by: ["repair-core"],
    required_evidence: ["ev:a", "ev:b"],
  };
  const partial = walkMustObligations({
    classified: [{ role: "acceptance", evidence: EVIDENCE, obligation_ids: [base.id], evidence_requirements_satisfied: ["ev:a"] }],
    executionGraph: graph([base]), candidate: CANDIDATE, policySnapshotId: POLICY,
  });
  assert.equal(partial.ok, false);
  assert.equal(partial.reason_code, "UNFULFILLED_MUST");

  const complete = walkMustObligations({
    classified: [
      { role: "acceptance", evidence: EVIDENCE, obligation_ids: [base.id], evidence_requirements_satisfied: ["ev:b"] },
      { role: "invariants", evidence: { ...EVIDENCE, evidence_id: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }, obligation_ids: [base.id], evidence_requirements_satisfied: ["ev:a"] },
    ],
    executionGraph: graph([base]), candidate: CANDIDATE, policySnapshotId: POLICY,
  });
  assert.equal(complete.ok, true, complete.error);
  assert.deepEqual(complete.assessments.map((assessment) => assessment.evidence_requirements_satisfied), [["ev:b"], ["ev:a"]]);
});

test("REQ-independent-verification-005: weak provenance on MUST is INSUFFICIENT_PROVENANCE", () => {
  const runtimeUnbound = {
    ...EVIDENCE,
    evidence_id: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  };
  const weakBound = { ...EVIDENCE, provenance: "model-reported" };
  const result = walkMustObligations({
    classified: [
      { role: "characterization-before", evidence: runtimeUnbound, obligation_ids: ["req-char-001"] },
      { role: "acceptance", evidence: weakBound, obligation_ids: ["req-repair-001"] },
    ],
    executionGraph: graph([
      {
        id: "req-repair-001",
        criticality: "must",
        implemented_by: ["repair-core"],
        required_evidence: ["ev:test-pass"],
      },
      {
        id: "req-char-001",
        criticality: "should",
        implemented_by: ["repair-core"],
        required_evidence: ["ev:char"],
      },
    ]),
    candidate: CANDIDATE,
    policySnapshotId: POLICY,
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason_code, "INSUFFICIENT_PROVENANCE");
  assert.match(result.error, /req-repair-001/);
  assert.equal(result.assessments, undefined);
});

test("REQ-independent-verification-005: second unfulfilled MUST is identified", () => {
  const result = walkMustObligations({
    classified: [
      { role: "acceptance", evidence: EVIDENCE, obligation_ids: ["req-repair-001"] },
    ],
    executionGraph: graph([
      {
        id: "req-repair-001",
        criticality: "must",
        implemented_by: ["repair-core"],
        required_evidence: ["ev:test-pass"],
      },
      {
        id: "req-repair-002",
        criticality: "must",
        implemented_by: ["repair-core"],
        required_evidence: ["ev:second"],
      },
    ]),
    candidate: CANDIDATE,
    policySnapshotId: POLICY,
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason_code, "UNFULFILLED_MUST");
  assert.match(result.error, /req-repair-002/);
  assert.equal(result.assessments, undefined);
});

test("REQ-independent-verification-005: incomplete deferral still requires MUST coverage", () => {
  const base = {
    id: "req-repair-001",
    criticality: "must",
    implemented_by: ["repair-core"],
    required_evidence: ["ev:test-pass"],
  };
  const incomplete = [
    { reason: "later" },
    { approved_by: "maintainer" },
    { reason: "later", approved_by: "   " },
    { reason: "   ", approved_by: "maintainer" },
  ];
  for (const deferred of incomplete) {
    const result = walkMustObligations({
      classified: [],
      executionGraph: graph([{ ...base, deferred }]),
      candidate: CANDIDATE,
      policySnapshotId: POLICY,
    });
    assert.equal(result.ok, false, JSON.stringify(deferred));
    assert.equal(result.reason_code, "UNFULFILLED_MUST");
    assert.match(result.error, /req-repair-001/);
    assert.match(result.error, /evidence/);
    assert.doesNotMatch(result.error, /assessment/i);
  }
});

test("REQ-independent-verification-005: missing executionGraph fails closed", () => {
  const missing = walkMustObligations({
    classified: [],
    candidate: CANDIDATE,
    policySnapshotId: POLICY,
  });
  assert.equal(missing.ok, false);
  assert.equal(missing.reason_code, "BINDING_MISMATCH");

  const nonArray = walkMustObligations({
    classified: [],
    executionGraph: { obligations: { id: "req-repair-001" } },
    candidate: CANDIDATE,
    policySnapshotId: POLICY,
  });
  assert.equal(nonArray.ok, false);
  assert.equal(nonArray.reason_code, "BINDING_MISMATCH");
});

test("REQ-independent-verification-005: emitAssessment failure is INVALID_ASSESSMENT", () => {
  const result = walkMustObligations({
    classified: [
      { role: "", evidence: EVIDENCE, obligation_ids: ["req-repair-001"] },
    ],
    executionGraph: graph([
      {
        id: "req-repair-001",
        criticality: "must",
        implemented_by: ["repair-core"],
        required_evidence: ["ev:test-pass"],
      },
    ]),
    candidate: CANDIDATE,
    policySnapshotId: POLICY,
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason_code, "INVALID_ASSESSMENT");
  assert.equal(result.assessments, undefined);
});

test("REQ-independent-verification-005: empty evidence_requirements_satisfied cannot claim satisfaction", () => {
  const emptyCovItem = {
    role: "acceptance",
    evidence: { ...EVIDENCE, evidence_requirements_satisfied: [] },
    obligation_ids: ["req-repair-001"],
    evidence_requirements_satisfied: [],
  };
  const result = walkMustObligations({
    classified: [emptyCovItem],
    executionGraph: graph([
      {
        id: "req-repair-001",
        criticality: "must",
        implemented_by: ["repair-core"],
        required_evidence: ["ev:test-pass"],
      },
    ]),
    candidate: CANDIDATE,
    policySnapshotId: POLICY,
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason_code, "UNFULFILLED_MUST");
});

test("REQ-kernel-contract-schemas-027: emitted assessments are assessment/v2 with non-empty coverage", () => {
  const result = walkMustObligations({
    classified: [
      { role: "acceptance", evidence: EVIDENCE, obligation_ids: ["req-repair-001"], evidence_requirements_satisfied: ["ev:test-pass"] },
    ],
    executionGraph: graph([
      {
        id: "req-repair-001",
        criticality: "must",
        implemented_by: ["repair-core"],
        required_evidence: ["ev:test-pass"],
      },
    ]),
    candidate: CANDIDATE,
    policySnapshotId: POLICY,
  });
  assert.equal(result.ok, true, result.error);
  assert.equal(result.assessments.length, 1);
  assert.equal(result.assessments[0].kind, "assessment/v2");
  assert.equal(result.assessments[0].schema_version, 2);
  assert.ok(result.assessments[0].evidence_requirements_satisfied.length >= 1);
});
