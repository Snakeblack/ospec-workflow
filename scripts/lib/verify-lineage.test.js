"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  startVerifyLineage,
  evaluateRecheck,
  getLineageNextAction,
  computeContractDigest,
  computeCandidateDigest,
} = require("./verify-lineage.js");

const sampleContract = {
  proposal: "Fix null pointer in auth module",
  specs: ["spec-auth-001"],
  design: "Add null check",
  tasks: "1. Fix auth null pointer",
};

const sampleCandidate = {
  paths: ["scripts/lib/auth.js"],
  diff_hash: "sha256:abc123diff",
};

test("verify-lineage: starts lineage only with BLOCKER/CRITICAL findings", () => {
  assert.throws(() => {
    startVerifyLineage({
      contract: sampleContract,
      candidate: sampleCandidate,
      findings: [{ id: "V001", severity: "WARNING", summary: "Low branch coverage" }],
    });
  }, /Cannot open remediation lineage without at least one BLOCKER\/CRITICAL finding/);

  const lineage = startVerifyLineage({
    contract: sampleContract,
    candidate: sampleCandidate,
    findings: [{ id: "V001", severity: "BLOCKER", summary: "Null pointer exception" }],
  });

  assert.equal(lineage.status, "recheck-pending");
  assert.equal(lineage.remediation_attempts, 0);
  assert.equal(lineage.max_remediation_attempts, 2);
  assert.equal(lineage.findings.length, 1);
  assert.equal(lineage.findings[0].id, "V001");
  assert.equal(lineage.findings[0].status, "unresolved");
});

test("verify-lineage: successful recheck closes lineage", () => {
  const lineage = startVerifyLineage({
    contract: sampleContract,
    candidate: sampleCandidate,
    findings: [{ id: "V001", severity: "BLOCKER", summary: "Null pointer exception" }],
  });

  const result = evaluateRecheck(lineage, {
    contract: sampleContract,
    candidate: sampleCandidate,
    recheck_results: { V001: true },
  });

  assert.equal(result.action, "close");
  assert.equal(result.lineage.status, "closed");
  assert.equal(result.lineage.findings[0].status, "resolved");

  const nextAction = getLineageNextAction(result.lineage, { contract: sampleContract });
  assert.equal(nextAction.action, "return-cached-pass");
});

test("verify-lineage: failed recheck increments attempt count and exhausts at limit (2)", () => {
  const lineage = startVerifyLineage({
    contract: sampleContract,
    candidate: sampleCandidate,
    findings: [{ id: "V001", severity: "BLOCKER", summary: "Null pointer exception" }],
  });

  // Attempt 1: Failed
  const res1 = evaluateRecheck(lineage, {
    contract: sampleContract,
    candidate: sampleCandidate,
    recheck_results: { V001: false },
  });
  assert.equal(res1.action, "remediate-again");
  assert.equal(res1.lineage.remediation_attempts, 1);
  assert.equal(res1.lineage.status, "recheck-pending");

  // Attempt 2: Failed -> Exhausted
  const res2 = evaluateRecheck(res1.lineage, {
    contract: sampleContract,
    candidate: sampleCandidate,
    recheck_results: { V001: false },
  });
  assert.equal(res2.action, "exhaust");
  assert.equal(res2.lineage.remediation_attempts, 2);
  assert.equal(res2.lineage.status, "exhausted");
  assert.equal(res2.lineage.terminal_reason, "max-attempts-exceeded");

  const nextAction = getLineageNextAction(res2.lineage, { contract: sampleContract });
  assert.equal(nextAction.action, "require-user-intervention");
});

test("verify-lineage: causal regression in modified path becomes BLOCKER, while unrelated becomes late observation", () => {
  const lineage = startVerifyLineage({
    contract: sampleContract,
    candidate: sampleCandidate,
    findings: [{ id: "V001", severity: "BLOCKER", summary: "Null pointer exception" }],
  });

  const result = evaluateRecheck(lineage, {
    contract: sampleContract,
    candidate: sampleCandidate,
    recheck_results: { V001: true }, // V001 fixed
    new_findings: [
      { id: "V002", severity: "BLOCKER", summary: "Broken auth validation", paths: ["scripts/lib/auth.js"] }, // Causal regression
      { id: "V003", severity: "WARNING", summary: "Unrelated styling issue", paths: ["scripts/lib/style.css"] }, // Unrelated late observation
    ],
  });

  assert.equal(result.action, "remediate-again");
  assert.equal(result.lineage.status, "recheck-pending");
  assert.equal(result.lineage.findings.length, 2);
  assert.equal(result.lineage.findings[1].id, "V002");
  assert.equal(result.lineage.late_observations.length, 1);
  assert.equal(result.lineage.late_observations[0].id, "V003");
  assert.equal(result.lineage.late_observations[0].blocking, false);
});

test("verify-lineage: contract drift supersedes lineage", () => {
  const lineage = startVerifyLineage({
    contract: sampleContract,
    candidate: sampleCandidate,
    findings: [{ id: "V001", severity: "BLOCKER", summary: "Null pointer exception" }],
  });

  const updatedContract = { ...sampleContract, design: "Updated design architecture" };

  const result = evaluateRecheck(lineage, {
    contract: updatedContract,
    candidate: sampleCandidate,
    recheck_results: { V001: true },
  });

  assert.equal(result.action, "superseded");
  assert.equal(result.lineage.status, "superseded");
  assert.equal(result.lineage.terminal_reason, "contract-drift");

  const nextAction = getLineageNextAction(lineage, { contract: updatedContract });
  assert.equal(nextAction.action, "supersede-and-discovery");
});
