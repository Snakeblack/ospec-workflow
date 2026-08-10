"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  startVerifyLineage,
  recordRemediationAttempt,
  evaluateRecheck,
  getLineageNextAction,
  computeContractDigest,
  computeCandidateDigest,
  assertVerifyLineage,
  MAX_REMEDIATION_ATTEMPTS,
} = require("./verify-lineage.js");

const sampleContract = {
  proposal: "Fix auth token expiry bug",
  specs: ["specs/auth/spec.md"],
  design: "design.md",
  tasks: "tasks.md",
};

const sampleCandidate = {
  paths: ["internal/auth/auth.go", "internal/auth/auth_test.go"],
  diff_hash: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
};

const sampleFindings = [
  {
    id: "V001",
    severity: "BLOCKER",
    summary: "JWT token validation fails on expired signature",
    origin: "code-bug",
    allowed_paths: ["internal/auth/auth.go"],
    validation: { commands: ["go test ./internal/auth"], expected_exit: 0, test_files: ["internal/auth/auth_test.go"] },
  },
];

test("verify-lineage FSM: startVerifyLineage sets status to remediation-pending and freezes validation recipes", () => {
  const lineage = startVerifyLineage(
    { contract: sampleContract, candidate: sampleCandidate, findings: sampleFindings },
    { generation: 1 }
  );

  assert.equal(lineage.status, "remediation-pending");
  assert.equal(lineage.remediation_attempts, 0);
  assert.equal(lineage.max_remediation_attempts, MAX_REMEDIATION_ATTEMPTS);
  assert.equal(lineage.findings.length, 1);
  assert.equal(lineage.findings[0].id, "V001");
  assert.deepEqual(lineage.findings[0].validation.commands, ["go test ./internal/auth"]);

  const nextAction = getLineageNextAction(lineage, { contract: sampleContract, candidate: sampleCandidate });
  assert.equal(nextAction.action, "apply-remediation");
});

test("verify-lineage FSM: recordRemediationAttempt transitions status to recheck-pending", () => {
  const lineage = startVerifyLineage(
    { contract: sampleContract, candidate: sampleCandidate, findings: sampleFindings }
  );

  const attemptResult = recordRemediationAttempt(lineage, sampleCandidate);
  assert.equal(attemptResult.lineage.status, "recheck-pending");
  assert.equal(attemptResult.lineage.remediation_attempts, 1);
  assert.equal(attemptResult.action, "run-targeted-recheck");

  const nextAction = getLineageNextAction(attemptResult.lineage, { contract: sampleContract, candidate: sampleCandidate });
  assert.equal(nextAction.action, "run-targeted-recheck");
});

test("verify-lineage FSM: successful evaluateRecheck closes lineage and sets verified_candidate_id", () => {
  const lineage0 = startVerifyLineage(
    { contract: sampleContract, candidate: sampleCandidate, findings: sampleFindings }
  );
  const { lineage: lineage1 } = recordRemediationAttempt(lineage0, sampleCandidate);

  const recheckResult = evaluateRecheck(lineage1, {
    contract: sampleContract,
    candidate: sampleCandidate,
    recheck_results: { V001: true },
    new_findings: [],
  });

  assert.equal(recheckResult.action, "close");
  assert.equal(recheckResult.lineage.status, "closed");
  assert.equal(recheckResult.lineage.verified_candidate_id, computeCandidateDigest(sampleCandidate));

  const nextActionSameCandidate = getLineageNextAction(recheckResult.lineage, {
    contract: sampleContract,
    candidate: sampleCandidate,
  });
  assert.equal(nextActionSameCandidate.action, "return-cached-pass");
});

test("verify-lineage FSM: closed lineage with modified candidate code returns supersede-and-discovery", () => {
  const lineage0 = startVerifyLineage(
    { contract: sampleContract, candidate: sampleCandidate, findings: sampleFindings }
  );
  const { lineage: lineage1 } = recordRemediationAttempt(lineage0, sampleCandidate);

  const recheckResult = evaluateRecheck(lineage1, {
    contract: sampleContract,
    candidate: sampleCandidate,
    recheck_results: { V001: true },
  });

  const modifiedCandidate = {
    paths: ["internal/auth/auth.go", "internal/auth/new_feature.go"],
    diff_hash: "sha256:2222222222222222222222222222222222222222222222222222222222222222",
  };

  const nextActionModifiedCandidate = getLineageNextAction(recheckResult.lineage, {
    contract: sampleContract,
    candidate: modifiedCandidate,
  });

  assert.equal(nextActionModifiedCandidate.action, "supersede-and-discovery");
  assert.equal(nextActionModifiedCandidate.reason, "candidate-code-changed");
});

test("verify-lineage FSM: 2 failed remediation attempts exhaust the lineage", () => {
  const lineage0 = startVerifyLineage(
    { contract: sampleContract, candidate: sampleCandidate, findings: sampleFindings }
  );

  // Attempt 1
  const { lineage: lineage1 } = recordRemediationAttempt(lineage0, sampleCandidate);
  const recheck1 = evaluateRecheck(lineage1, {
    contract: sampleContract,
    candidate: sampleCandidate,
    recheck_results: { V001: false },
  });

  assert.equal(recheck1.action, "remediate-again");
  assert.equal(recheck1.lineage.status, "remediation-pending");
  assert.equal(recheck1.lineage.remediation_attempts, 1);

  // Attempt 2
  const { lineage: lineage2 } = recordRemediationAttempt(recheck1.lineage, sampleCandidate);
  assert.equal(lineage2.remediation_attempts, 2);

  const recheck2 = evaluateRecheck(lineage2, {
    contract: sampleContract,
    candidate: sampleCandidate,
    recheck_results: { V001: false },
  });

  assert.equal(recheck2.action, "exhaust");
  assert.equal(recheck2.lineage.status, "exhausted");

  const nextActionExhausted = getLineageNextAction(recheck2.lineage, {
    contract: sampleContract,
    candidate: sampleCandidate,
  });
  assert.equal(nextActionExhausted.action, "require-user-intervention");
});

test("verify-lineage FSM: hard limit tampering is rejected by assertVerifyLineage", () => {
  const lineage = startVerifyLineage(
    { contract: sampleContract, candidate: sampleCandidate, findings: sampleFindings }
  );
  lineage.max_remediation_attempts = 50;

  assert.throws(() => assertVerifyLineage(lineage), /max_remediation_attempts must equal immutable hard limit 2/);
});

test("verify-lineage FSM: contract drift sets status to superseded", () => {
  const lineage0 = startVerifyLineage(
    { contract: sampleContract, candidate: sampleCandidate, findings: sampleFindings }
  );
  const { lineage: lineage1 } = recordRemediationAttempt(lineage0, sampleCandidate);

  const modifiedContract = { ...sampleContract, design: "design_v2.md" };

  const recheckResult = evaluateRecheck(lineage1, {
    contract: modifiedContract,
    candidate: sampleCandidate,
    recheck_results: { V001: false },
  });

  assert.equal(recheckResult.action, "superseded");
  assert.equal(recheckResult.lineage.status, "superseded");
});
