"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createEvidenceDigest,
  verifyCapabilityProof,
  evaluateEnforcementEligibility,
  REASON,
} = require("./index.js");

function makeProof(capabilityId, evidence) {
  const adapter_version = "1.0.0";
  const host_version = "k2a-host/1";
  const fixture = `fixtures/${capabilityId}.json`;
  const evidence_digest = createEvidenceDigest({
    capability_id: capabilityId,
    adapter_version,
    host_version,
    fixture,
    evidence,
  });
  return {
    schema_version: 1,
    kind: "capability-proof/v1",
    adapter_version,
    host_version,
    fixture,
    evidence_digest,
  };
}

test("declared enforced without proof fails; valid proof enables enforcement", () => {
  const refused = evaluateEnforcementEligibility({
    capability_id: "ExecutionTransport",
    declared_state: "enforced",
  });
  assert.equal(refused.ok, false);
  assert.equal(refused.enforced, false);
  assert.equal(refused.reason_code, REASON.PROOF_MISSING);

  const evidence = { surface: "execution", headless: true };
  const proof = makeProof("ExecutionTransport", evidence);
  const ok = evaluateEnforcementEligibility({
    capability_id: "ExecutionTransport",
    declared_state: "enforced",
    proof,
    semantic_evidence: evidence,
  });
  assert.equal(ok.ok, true);
  assert.equal(ok.enforced, true);
  assert.equal(ok.evidence_digest, proof.evidence_digest);
});

test("missing adapter_version/host_version/fixture/evidence_digest fails verification", () => {
  const evidence = { a: 1 };
  const base = makeProof("QuestionTransport", evidence);
  for (const field of ["adapter_version", "host_version", "fixture", "evidence_digest"]) {
    const broken = { ...base, [field]: "" };
    const result = verifyCapabilityProof("QuestionTransport", broken, evidence);
    assert.equal(result.ok, false, field);
    assert.equal(result.reason_code, REASON.PROOF_FIELD_MISSING, field);
    assert.equal(result.path, `/${field}`, field);
  }
});

test("digest mismatch fails; repeated verification is byte-equivalent; no timestamps", () => {
  const evidence = { fixture_bytes: "abc" };
  const proof = makeProof("WorkerTransport", evidence);
  const mismatch = verifyCapabilityProof("WorkerTransport", { ...proof, evidence_digest: "sha256:dead" }, evidence);
  assert.equal(mismatch.ok, false);
  assert.equal(mismatch.reason_code, REASON.DIGEST_MISMATCH);

  const a = verifyCapabilityProof("WorkerTransport", proof, evidence);
  const b = verifyCapabilityProof("WorkerTransport", proof, evidence);
  assert.equal(a.ok, true);
  assert.equal(b.ok, true);
  assert.equal(a.evidence_digest, b.evidence_digest);

  assert.throws(
    () =>
      createEvidenceDigest({
        capability_id: "WorkerTransport",
        adapter_version: "1.0.0",
        host_version: "k2a-host/1",
        fixture: "f.json",
        evidence: { timestamp: "2026-01-01T00:00:00Z" },
      }),
    (err) => err.code === REASON.PROOF_VERIFICATION_FAILED
  );
});

test("failed/absent proof does not promote partial/unavailable/instructional to enforced", () => {
  for (const declared of ["partial", "unavailable", "instructional"]) {
    const result = evaluateEnforcementEligibility({
      capability_id: "DeliveryGateTransport",
      declared_state: declared,
      request_enforced: true,
      proof: { adapter_version: "1", host_version: "1", fixture: "f", evidence_digest: "sha256:bad" },
      semantic_evidence: {},
    });
    assert.equal(result.enforced, false, declared);
    assert.equal(result.effective_state, declared, declared);
    assert.ok(
      result.reason_code === REASON.SILENT_PROMOTION_REFUSED ||
        result.reason_code === REASON.DIGEST_MISMATCH,
      declared
    );
  }
});
