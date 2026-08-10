"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

test("Phase 9: verify-lineage.js contains zero forbidden K4a/K4b primitives", () => {
  const file = path.resolve(__dirname, "verify-lineage.js");
  const source = fs.readFileSync(file, "utf8");

  // 9.1 Execution Graph runtime
  assert.equal(source.includes("ExecutionGraph"), false, "Must not introduce ExecutionGraph in verify-lineage");
  assert.equal(source.includes("graph-node"), false, "Must not introduce graph-node in verify-lineage");

  // 9.2 WorkOrder remediation runtime
  assert.equal(source.includes("WorkOrder"), false, "Must not introduce WorkOrder in verify-lineage");

  // 9.3 WorkResult evidence runtime
  assert.equal(source.includes("WorkResult"), false, "Must not introduce WorkResult in verify-lineage");

  // 9.4 Worker isolation
  assert.equal(source.includes("workerIsolation"), false, "Must not introduce workerIsolation in verify-lineage");
  assert.equal(source.includes("workOrderCapsule"), false, "Must not introduce workOrderCapsule in verify-lineage");

  // 9.5 Assurance Graph
  assert.equal(source.includes("AssuranceGraph"), false, "Must not introduce AssuranceGraph in verify-lineage");

  // 9.6 Attestation/authorization
  assert.equal(source.includes("EvaluationAttestation"), false, "Must not introduce EvaluationAttestation in verify-lineage");
  assert.equal(source.includes("DeliveryAuthorization"), false, "Must not introduce DeliveryAuthorization in verify-lineage");
  assert.equal(source.includes("AuthorityStore"), false, "Must not introduce AuthorityStore in verify-lineage");

  // 9.7 Candidate remains K3 primitive reused
  assert.equal(source.includes("resolveCanonicalCandidateId"), true, "Must reuse Candidate/v2 identity helper");
});
