"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  digestRawBytes,
  computeEvidenceId,
  normalizeEvidence,
  evaluateProvenanceSufficiency,
} = require("./evidence.js");

const CANDIDATE = {
  candidate_id: "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
};

const EXECUTION_GRAPH = {
  nodes: [
    { node_id: "repair-core" },
    { node_id: "test-runner" },
  ],
};

const COLLECTOR = {
  id: "node-test",
  transport: "tool-execution-transport",
};

function validRaw(overrides = {}) {
  return {
    bytes: "test output bytes",
    origin: "node:test",
    node_id: "repair-core",
    ...overrides,
  };
}

test("REQ-independent-verification-003: normalizeEvidence rejects caller-injected role with UNTRUSTED_CALLER_METADATA", () => {
  const result = normalizeEvidence(
    validRaw({ role: "acceptance" }),
    CANDIDATE,
    EXECUTION_GRAPH,
    COLLECTOR
  );
  assert.equal(result.ok, false);
  assert.equal(result.reason_code, "UNTRUSTED_CALLER_METADATA");
  assert.match(result.error, /caller semantic metadata/i);
});

test("REQ-independent-verification-003: normalizeEvidence rejects caller-injected obligation_id with UNTRUSTED_CALLER_METADATA", () => {
  const result = normalizeEvidence(
    validRaw({ obligation_id: "req-repair-001" }),
    CANDIDATE,
    EXECUTION_GRAPH,
    COLLECTOR
  );
  assert.equal(result.ok, false);
  assert.equal(result.reason_code, "UNTRUSTED_CALLER_METADATA");
  assert.match(result.error, /caller semantic metadata/i);
});

test("REQ-independent-verification-003: normalizeEvidence rejects caller-injected obligation_ids with UNTRUSTED_CALLER_METADATA", () => {
  const result = normalizeEvidence(
    validRaw({ obligation_ids: ["req-repair-001"] }),
    CANDIDATE,
    EXECUTION_GRAPH,
    COLLECTOR
  );
  assert.equal(result.ok, false);
  assert.equal(result.reason_code, "UNTRUSTED_CALLER_METADATA");
  assert.match(result.error, /caller semantic metadata/i);
});

test("REQ-independent-verification-003: normalizeEvidence rejects caller-injected evidence_requirements_satisfied with UNTRUSTED_CALLER_METADATA", () => {
  const result = normalizeEvidence(
    validRaw({ evidence_requirements_satisfied: ["ev:test-pass"] }),
    CANDIDATE,
    EXECUTION_GRAPH,
    COLLECTOR
  );
  assert.equal(result.ok, false);
  assert.equal(result.reason_code, "UNTRUSTED_CALLER_METADATA");
  assert.match(result.error, /caller semantic metadata/i);
});

test("REQ-independent-verification-003: normalizeEvidence rejects combination of semantic caller properties", () => {
  const result = normalizeEvidence(
    validRaw({
      role: "acceptance",
      obligation_id: "req-repair-001",
      obligation_ids: ["req-repair-001"],
      evidence_requirements_satisfied: ["ev:test-pass"],
    }),
    CANDIDATE,
    EXECUTION_GRAPH,
    COLLECTOR
  );
  assert.equal(result.ok, false);
  assert.equal(result.reason_code, "UNTRUSTED_CALLER_METADATA");
});

test("REQ-independent-verification-003: valid physical observation returns normalized record without semantic metadata", () => {
  const rawObs = validRaw({
    execution_sequence: {
      run_id: "run-101",
      ordinal: 1,
      previous_evidence_id: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
    },
  });
  const result = normalizeEvidence(rawObs, CANDIDATE, EXECUTION_GRAPH, COLLECTOR);
  assert.equal(result.ok, true);
  assert.ok(result.evidence);
  assert.equal(result.evidence.kind, "evidence/v2");
  assert.equal(result.evidence.schema_version, 2);
  assert.equal(result.evidence.candidate_id, CANDIDATE.candidate_id);
  assert.equal(result.evidence.node_id, "repair-core");
  assert.equal(result.evidence.provenance, "runtime-observed");
  assert.match(result.evidence.digest, /^sha256:[a-f0-9]{64}$/);
  assert.match(result.evidence.evidence_id, /^sha256:[a-f0-9]{64}$/);

  // Must not have semantic caller properties on the normalized envelope
  assert.equal(result.role, undefined);
  assert.equal(result.obligation_ids, undefined);
  assert.equal(result.obligation_id, undefined);
  assert.equal(result.evidence_requirements_satisfied, undefined);

  // Must preserve execution_sequence and raw
  assert.deepEqual(result.execution_sequence, {
    run_id: "run-101",
    ordinal: 1,
    previous_evidence_id: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
  });
  assert.equal(result.raw, rawObs);
});

test("REQ-independent-verification-003: evaluateProvenanceSufficiency requires runtime provenance by default", () => {
  assert.equal(evaluateProvenanceSufficiency({ provenance: "runtime-observed" }).ok, true);
  assert.equal(evaluateProvenanceSufficiency({ provenance: "host-attested" }).ok, true);
  assert.equal(evaluateProvenanceSufficiency({ provenance: "tool-produced" }).ok, true);
  assert.equal(evaluateProvenanceSufficiency({ provenance: "model-reported" }).ok, false);
  assert.equal(evaluateProvenanceSufficiency({ provenance: "human-decision" }).ok, false);
  assert.equal(evaluateProvenanceSufficiency({ provenance: "external-unverified" }).ok, false);
});
