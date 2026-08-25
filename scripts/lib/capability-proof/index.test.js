"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createEvidenceDigest,
  createProbeDigest,
  verifyCapabilityProof,
  evaluateEnforcementEligibility,
  REASON,
  PROBE_DOMAIN,
} = require("./index.js");

const ADAPTER_ID = "claude";
const ADAPTER_VERSION = "1.0.0";
const HOST_VERSION = "k2a-host/1";

function makeLiveMaterial(capabilityId, evidence, probe = { surface: "live", ok: true }) {
  const fixture = `fixtures/${capabilityId}.json`;
  const evidence_digest = createEvidenceDigest({
    capability_id: capabilityId,
    adapter_version: ADAPTER_VERSION,
    host_version: HOST_VERSION,
    fixture,
    evidence,
  });
  const probe_digest = createProbeDigest({
    capability_id: capabilityId,
    adapter_id: ADAPTER_ID,
    adapter_version: ADAPTER_VERSION,
    host_version: HOST_VERSION,
    probe,
  });
  assert.notEqual(probe_digest, evidence_digest);
  const proof = {
    schema_version: 1,
    kind: "capability-proof/v1",
    adapter_id: ADAPTER_ID,
    adapter_version: ADAPTER_VERSION,
    host_version: HOST_VERSION,
    fixture,
    evidence_digest,
    probe_digest,
  };
  return {
    proof,
    evidence,
    expected: {
      capabilityId,
      expectedAdapterId: ADAPTER_ID,
      expectedAdapterVersion: ADAPTER_VERSION,
      expectedHostRuntimeVersion: HOST_VERSION,
      expectedProbeDigest: probe_digest,
      proof,
      evidence,
    },
  };
}

test("declared enforced without proof fails; valid live-bound proof enables enforcement", () => {
  const refused = evaluateEnforcementEligibility({
    capability_id: "ExecutionTransport",
    declared_state: "enforced",
  });
  assert.equal(refused.ok, false);
  assert.equal(refused.enforced, false);
  assert.ok(
    refused.reason_code === REASON.PROOF_MISSING ||
      refused.reason_code === REASON.EXPECTED_FIELD_MISSING
  );

  const { expected, proof } = makeLiveMaterial("ExecutionTransport", { surface: "execution", headless: true });
  const ok = evaluateEnforcementEligibility({
    capability_id: "ExecutionTransport",
    declared_state: "enforced",
    proof: expected.proof,
    semantic_evidence: expected.evidence,
    expectedAdapterId: expected.expectedAdapterId,
    expectedAdapterVersion: expected.expectedAdapterVersion,
    expectedHostRuntimeVersion: expected.expectedHostRuntimeVersion,
    expectedProbeDigest: expected.expectedProbeDigest,
  });
  assert.equal(ok.ok, true);
  assert.equal(ok.enforced, true);
  assert.equal(ok.evidence_digest, proof.evidence_digest);
  assert.equal(ok.probe_digest, proof.probe_digest);
});

test("object verify rejects missing expected live identity fields", () => {
  const { proof, evidence, expected } = makeLiveMaterial("QuestionTransport", { a: 1 });
  for (const field of [
    "expectedAdapterId",
    "expectedAdapterVersion",
    "expectedHostRuntimeVersion",
    "expectedProbeDigest",
  ]) {
    const opts = { ...expected, [field]: undefined };
    const result = verifyCapabilityProof(opts);
    assert.equal(result.ok, false, field);
    assert.equal(result.reason_code, REASON.EXPECTED_FIELD_MISSING, field);
    assert.equal(result.path, `/${field}`, field);
  }
  void proof;
  void evidence;
});

test("foreign adapter / version / host fail closed with stable reasons", () => {
  const { expected } = makeLiveMaterial("WorkerTransport", { fixture_bytes: "abc" });

  const foreignAdapter = verifyCapabilityProof({
    ...expected,
    expectedAdapterId: "codex",
  });
  assert.equal(foreignAdapter.ok, false);
  assert.equal(foreignAdapter.reason_code, REASON.FOREIGN_ADAPTER);

  const foreignVersion = verifyCapabilityProof({
    ...expected,
    expectedAdapterVersion: "9.9.9",
  });
  assert.equal(foreignVersion.ok, false);
  assert.equal(foreignVersion.reason_code, REASON.FOREIGN_ADAPTER_VERSION);

  const foreignHost = verifyCapabilityProof({
    ...expected,
    expectedHostRuntimeVersion: "other-host/2",
  });
  assert.equal(foreignHost.ok, false);
  assert.equal(foreignHost.reason_code, REASON.FOREIGN_HOST);
});

test("fixture-only digest rejected when expectedProbeDigest is distinct live probe", () => {
  const evidence = { fixture_bytes: "abc" };
  const fixture = "fixtures/WorkerTransport.json";
  const evidence_digest = createEvidenceDigest({
    capability_id: "WorkerTransport",
    adapter_version: ADAPTER_VERSION,
    host_version: HOST_VERSION,
    fixture,
    evidence,
  });
  const liveProbe = createProbeDigest({
    capability_id: "WorkerTransport",
    adapter_id: ADAPTER_ID,
    adapter_version: ADAPTER_VERSION,
    host_version: HOST_VERSION,
    probe: { live: true, tick: 1 },
  });
  assert.notEqual(liveProbe, evidence_digest);

  // Caller supplies fixture digest as expectedProbeDigest → fail closed.
  const asFixture = verifyCapabilityProof({
    capabilityId: "WorkerTransport",
    expectedAdapterId: ADAPTER_ID,
    expectedAdapterVersion: ADAPTER_VERSION,
    expectedHostRuntimeVersion: HOST_VERSION,
    expectedProbeDigest: evidence_digest,
    proof: {
      schema_version: 1,
      kind: "capability-proof/v1",
      adapter_id: ADAPTER_ID,
      adapter_version: ADAPTER_VERSION,
      host_version: HOST_VERSION,
      fixture,
      evidence_digest,
      probe_digest: liveProbe,
    },
    evidence,
  });
  assert.equal(asFixture.ok, false);
  assert.equal(asFixture.reason_code, REASON.FIXTURE_DIGEST_NOT_LIVE_PROBE);

  // Matching live probe succeeds.
  const ok = verifyCapabilityProof({
    capabilityId: "WorkerTransport",
    expectedAdapterId: ADAPTER_ID,
    expectedAdapterVersion: ADAPTER_VERSION,
    expectedHostRuntimeVersion: HOST_VERSION,
    expectedProbeDigest: liveProbe,
    proof: {
      schema_version: 1,
      kind: "capability-proof/v1",
      adapter_id: ADAPTER_ID,
      adapter_version: ADAPTER_VERSION,
      host_version: HOST_VERSION,
      fixture,
      evidence_digest,
      probe_digest: liveProbe,
    },
    evidence,
  });
  assert.equal(ok.ok, true);
  assert.equal(ok.probe_digest, liveProbe);
});

test("missing adapter_version/host_version/fixture/evidence_digest/probe_digest fails verification", () => {
  const { expected } = makeLiveMaterial("QuestionTransport", { a: 1 });
  for (const field of [
    "adapter_id",
    "adapter_version",
    "host_version",
    "fixture",
    "evidence_digest",
    "probe_digest",
  ]) {
    const broken = { ...expected.proof, [field]: "" };
    const result = verifyCapabilityProof({ ...expected, proof: broken });
    assert.equal(result.ok, false, field);
    assert.equal(result.reason_code, REASON.PROOF_FIELD_MISSING, field);
    assert.equal(result.path, `/${field}`, field);
  }
});

test("digest mismatch fails; repeated verification is byte-equivalent; probe domain distinct", () => {
  const { expected, proof } = makeLiveMaterial("WorkerTransport", { fixture_bytes: "abc" });
  const mismatch = verifyCapabilityProof({
    ...expected,
    proof: { ...proof, evidence_digest: "sha256:dead" },
  });
  assert.equal(mismatch.ok, false);
  assert.equal(mismatch.reason_code, REASON.DIGEST_MISMATCH);

  const probeMismatch = verifyCapabilityProof({
    ...expected,
    expectedProbeDigest: "sha256:other-probe",
  });
  assert.equal(probeMismatch.ok, false);
  assert.equal(probeMismatch.reason_code, REASON.PROBE_DIGEST_MISMATCH);

  const a = verifyCapabilityProof(expected);
  const b = verifyCapabilityProof(expected);
  assert.equal(a.ok, true);
  assert.equal(b.ok, true);
  assert.equal(a.evidence_digest, b.evidence_digest);
  assert.equal(a.probe_digest, b.probe_digest);

  assert.equal(PROBE_DOMAIN, "capability-probe/v1");
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
      proof: {
        adapter_id: ADAPTER_ID,
        adapter_version: "1",
        host_version: "1",
        fixture: "f",
        evidence_digest: "sha256:bad",
        probe_digest: "sha256:probe",
      },
      semantic_evidence: {},
      expectedAdapterId: ADAPTER_ID,
      expectedAdapterVersion: "1",
      expectedHostRuntimeVersion: "1",
      expectedProbeDigest: "sha256:probe",
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

test("WorkerIsolation live-identity: match, mismatch, and missing expected fields", () => {
  const transportF = { port_id: "claude-worker", fingerprint: "sha256:ffff" };
  const { expected, proof } = makeLiveMaterial("WorkerIsolation", {
    surface: "worker-isolation",
    host_observed: true,
    containment: {
      allowed_write: "PASS",
      undeclared_workspace_write: "BLOCKED",
      external_root_write: "BLOCKED",
    },
    transport: transportF,
  });

  const match = verifyCapabilityProof({
    ...expected,
    expectedPortId: transportF.port_id,
    expectedFingerprint: transportF.fingerprint,
  });
  assert.equal(match.ok, true);
  assert.equal(proof.kind, "capability-proof/v1");
  assert.equal(proof.port_id, undefined);
  assert.equal(proof.fingerprint, undefined);

  const mismatch = verifyCapabilityProof({
    ...expected,
    expectedPortId: "other-worker",
    expectedFingerprint: "sha256:gggg",
  });
  assert.equal(mismatch.ok, false);
  assert.equal(mismatch.reason_code, REASON.TRANSPORT_IDENTITY_MISMATCH);

  const missingPort = verifyCapabilityProof({
    ...expected,
    expectedFingerprint: transportF.fingerprint,
  });
  assert.equal(missingPort.ok, false);
  assert.equal(missingPort.reason_code, REASON.EXPECTED_FIELD_MISSING);
  assert.equal(missingPort.path, "/expectedPortId");

  const missingFp = verifyCapabilityProof({
    ...expected,
    expectedPortId: transportF.port_id,
  });
  assert.equal(missingFp.ok, false);
  assert.equal(missingFp.reason_code, REASON.EXPECTED_FIELD_MISSING);
  assert.equal(missingFp.path, "/expectedFingerprint");
});
