"use strict";

const path = require("node:path");
const { sha256Fingerprint } = require("../canonical-json.js");
const { createK7ReviewSelection, validateK7ReviewBinding } = require("../review-k7-binding.js");
const { validateK7LineageForProjection } = require("../review-lineage.js");
const { computePolicySnapshotDigest } = require("../execution-graph/policy-snapshot.js");
const assuranceGraph = require("../assurance-graph/index.js");
const { validateInstance, loadSchemaById } = require("../kernel-schema-validator.js");

const ROOT = path.resolve(__dirname, "../../..");
const ATTESTATION_SCHEMA_ID = "ospec://schemas/kernel/candidate-evaluation-attestation/v1";
const ATTESTATION_KIND = "candidate-evaluation-attestation";
const ATTESTATION_DIGEST_DOMAIN = "candidate-evaluation-attestation/v1";
const AUTHORITY_REVISION_DOMAIN = "candidate-evaluation-attestation-authority/v1";
const EXPECTED_REVISION_DOMAIN = "candidate-evaluation-attestation-subject/v1";
const EQUIVALENCE_MANIFEST_KIND = "equivalence-manifest/v1";
const NO_MODEL_REASON_CODE = "K7_NO_MODEL_DEFERRED";
const VERIFY_OUTCOME_PASS = "PASS";

// The lineage persists exactly these binding identity fields at genesis; a
// presented binding that disagrees with any of them is foreign to the review.
const LINEAGE_BINDING_IDENTITY_FIELDS = Object.freeze([
  "binding_id",
  "policy_snapshot_id",
  "policy_bundle_digest",
  "verification_id",
  "assurance_graph_id",
  "residual_digest",
]);

// Subject digests that make an attestation non-interchangeable: a
// self-consistent attestation whose subject diverges from the presented
// binding is a foreign attestation, not a tampered claim.
const SUBJECT_DIGEST_FIELDS = Object.freeze(["candidate_id", "contract_digest", "graph_digest", "policy_digest"]);
const CHAIN_DIGEST_FIELDS = Object.freeze([
  "evidence_root_digest",
  "findings_digest",
  "expected_revision",
  "authority_revision",
]);

let cachedAttestationSchema = null;
function getAttestationSchema() {
  if (!cachedAttestationSchema) {
    cachedAttestationSchema = loadSchemaById(ATTESTATION_SCHEMA_ID, { rootDir: ROOT });
  }
  return cachedAttestationSchema;
}

function fail(reason_code, error) {
  return { ok: false, reason_code, error: error || reason_code };
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value, keys) {
  if (!isRecord(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function attestationBodyWithoutId(attestation) {
  const body = { ...attestation };
  delete body.attestation_id;
  return body;
}

/**
 * A no-model binding never exists as a valid record: createK7ReviewSelection
 * fails with K7_NO_MODEL_DEFERRED. Probe the issuance directly so the deferred
 * mode surfaces as its own fail-closed code with zero approbatory emission.
 */
function probeNoModelDeferral(binding) {
  if (!isRecord(binding) || !isRecord(binding.issuance)) return false;
  const replay = createK7ReviewSelection(binding.issuance);
  return !replay.ok && replay.reason_code === NO_MODEL_REASON_CODE;
}

function authenticateK7Binding(binding) {
  const validated = validateK7ReviewBinding(binding);
  if (validated.ok) return { ok: true, binding: validated.binding };
  if (probeNoModelDeferral(binding)) {
    return fail(
      "EVALUATION_K7_NO_MODEL_DEFERRED",
      "K7_NO_MODEL_DEFERRED binding cannot produce an evaluation attestation without an independent residual oracle"
    );
  }
  return fail("EVALUATION_K7_BINDING_INVALID", validated.error || validated.reason_code);
}

function authenticateLineage(lineage, issuance, binding) {
  let projected;
  try {
    projected = validateK7LineageForProjection(lineage, issuance);
  } catch (error) {
    return fail("EVALUATION_LINEAGE_INVALID", error.message);
  }
  const foreignField = LINEAGE_BINDING_IDENTITY_FIELDS.find((field) => projected[field] !== binding[field]);
  if (foreignField) {
    return fail(
      "EVALUATION_LINEAGE_FOREIGN",
      `review lineage ${foreignField} does not match the presented K7 binding`
    );
  }
  if (projected.status !== "approved" || projected.findings_digest === null || typeof projected.terminal_reason !== "string" || projected.terminal_reason.length === 0) {
    return fail(
      "EVALUATION_LINEAGE_NOT_APPROVED",
      "evaluation attestation requires an approved schema v3 lineage with frozen findings"
    );
  }
  if (projected.current_candidate_id !== binding.candidate_id) {
    return fail(
      "EVALUATION_CANDIDATE_DRIFT",
      "lineage current candidate is a corrected successor; issue a fresh K7 binding before attesting"
    );
  }
  return { ok: true, lineage: projected };
}

function authenticatePhaseClosure(phase, binding) {
  if (!isRecord(phase) || !exactKeys(phase, ["status", "verify_outcome"])) {
    return fail("EVALUATION_INPUT_INVALID", "phase must contain exactly status and verify_outcome");
  }
  if (phase.status !== "success") {
    return fail("EVALUATION_PHASE_NOT_SUCCESS", "evaluation attestation requires a successful phase closure");
  }
  if (phase.verify_outcome !== VERIFY_OUTCOME_PASS) {
    return fail(
      "EVALUATION_VERIFY_OUTCOME_FAIL",
      "phase success cannot outrank a FAIL verify_outcome: no evaluation attestation"
    );
  }
  const verdict = binding.issuance.k6b.verification.verdict;
  if (phase.verify_outcome !== verdict) {
    return fail(
      "EVALUATION_VERIFY_OUTCOME_FAIL",
      "phase verify_outcome disagrees with the replayed K6b verification verdict"
    );
  }
  return { ok: true };
}

/**
 * Recomputes every authority-derived digest from the replay-validated binding
 * and lineage. No digest claimed by a caller or an attestation is trusted.
 */
function recomputeAttestationDigests(binding, lineage) {
  const policyDigest = computePolicySnapshotDigest(binding.issuance.policySnapshot);
  if (policyDigest !== binding.policy_snapshot_id) {
    return fail("EVALUATION_DIGEST_MISMATCH", "recomputed policy digest differs from the K7 binding policy identity");
  }

  const manifest = assuranceGraph.emitEquivalenceManifest(binding.issuance.k6b.assurance_graph);
  if (!isRecord(manifest) || manifest.ok === false || manifest.kind !== EQUIVALENCE_MANIFEST_KIND) {
    return fail(
      "EVALUATION_EVIDENCE_ROOT_INVALID",
      (manifest && manifest.error) || "equivalence manifest emission failed"
    );
  }
  if (manifest.candidate_id !== binding.candidate_id || manifest.graph_id !== binding.assurance_graph_id) {
    return fail("EVALUATION_EVIDENCE_ROOT_INVALID", "equivalence manifest is foreign to the K7 binding");
  }

  return {
    ok: true,
    digests: {
      candidate_id: binding.candidate_id,
      contract_digest: binding.contract_digest,
      graph_digest: binding.execution_graph_id,
      policy_digest: policyDigest,
      evidence_root_digest: sha256Fingerprint(EQUIVALENCE_MANIFEST_KIND, {
        graph_id: manifest.graph_id,
        candidate_id: manifest.candidate_id,
      }),
      findings_digest: lineage.findings_digest,
      expected_revision: sha256Fingerprint(EXPECTED_REVISION_DOMAIN, {
        candidate_id: binding.candidate_id,
        policy_digest: policyDigest,
      }),
      authority_revision: sha256Fingerprint(AUTHORITY_REVISION_DOMAIN, {
        binding_id: binding.binding_id,
        lineage_id: lineage.lineage_id,
        lineage_revision: lineage.revision,
        generation: lineage.generation,
        status: lineage.status,
        terminal_reason: lineage.terminal_reason,
        findings_digest: lineage.findings_digest,
        current_candidate_id: lineage.current_candidate_id,
      }),
    },
  };
}

/**
 * Pure constructor for candidate-evaluation-attestation/v1. It binds a frozen
 * Candidate to its contract, execution graph, equivalence-manifest evidence
 * root, frozen review findings, and effective PolicySnapshot digest through a
 * replay-validated K7 binding and an approved schema v3 lineage. It declares
 * evaluation approval only and never authorizes delivery. No CAS, permits,
 * stores, or reviewers are invoked here.
 *
 * @returns {{ ok: true, attestation: object } | { ok: false, reason_code: string, error: string }}
 */
function createCandidateEvaluationAttestation(input) {
  const requiredKeys = ["binding", "lineage", "issuance", "phase", "issuer_version", "runtime_version", "issued_at"];
  if (!isRecord(input) || !exactKeys(input, requiredKeys)) {
    return fail("EVALUATION_INPUT_INVALID", "input must contain exactly binding, lineage, issuance, phase, issuer_version, runtime_version, and issued_at");
  }
  for (const field of ["issuer_version", "runtime_version", "issued_at"]) {
    if (typeof input[field] !== "string" || input[field].trim().length === 0) {
      return fail("EVALUATION_METADATA_INVALID", `${field} must be a non-empty string`);
    }
  }

  const authenticated = authenticateK7Binding(input.binding);
  if (!authenticated.ok) return authenticated;
  const binding = authenticated.binding;

  const phase = authenticatePhaseClosure(input.phase, binding);
  if (!phase.ok) return phase;

  const lineageState = authenticateLineage(input.lineage, input.issuance, binding);
  if (!lineageState.ok) return lineageState;

  const recomputed = recomputeAttestationDigests(binding, lineageState.lineage);
  if (!recomputed.ok) return recomputed;

  const body = {
    schema_version: 1,
    kind: ATTESTATION_KIND,
    ...recomputed.digests,
    issuer_version: input.issuer_version,
    runtime_version: input.runtime_version,
    outcome: "approved-for-evaluation",
    valid_for: "evaluation",
    issued_at: input.issued_at,
  };
  const attestation = {
    ...body,
    attestation_id: sha256Fingerprint(ATTESTATION_DIGEST_DOMAIN, body),
  };

  const schemaValidation = validateInstance(getAttestationSchema(), attestation);
  if (!schemaValidation.valid) {
    return fail(
      "EVALUATION_ATTESTATION_SCHEMA_INVALID",
      schemaValidation.errors.map((error) => error.message).join("; ")
    );
  }
  return { ok: true, attestation: deepFreeze(attestation) };
}

/**
 * Fail-closed validator. It replays the presented binding and lineage, then
 * recomputes every digest from the replay-validated authority chain and
 * compares it against the attestation's claims; no claimed digest is trusted.
 * `expects` must be "evaluation": approved-for-evaluation is never a delivery
 * pass, so a delivery (or any non-evaluation) context is rejected.
 *
 * @returns {{ ok: true } | { ok: false, reason_code: string, error: string }}
 */
function validateCandidateEvaluationAttestation(attestation, input) {
  const requiredKeys = ["binding", "lineage", "issuance", "expects"];
  if (!isRecord(input) || !exactKeys(input, requiredKeys)) {
    return fail("EVALUATION_INPUT_INVALID", "input must contain exactly binding, lineage, issuance, and expects");
  }
  if (input.expects !== "evaluation") {
    return fail(
      "EVALUATION_CONTEXT_MISMATCH",
      `approved-for-evaluation attestation cannot be consumed in a ${JSON.stringify(input.expects)} context; it is never a delivery pass`
    );
  }

  const schemaValidation = validateInstance(getAttestationSchema(), attestation);
  if (!schemaValidation.valid) {
    return fail(
      "EVALUATION_ATTESTATION_SCHEMA_INVALID",
      schemaValidation.errors.map((error) => error.message).join("; ")
    );
  }

  const authenticated = authenticateK7Binding(input.binding);
  if (!authenticated.ok) return authenticated;
  const binding = authenticated.binding;

  const lineageState = authenticateLineage(input.lineage, input.issuance, binding);
  if (!lineageState.ok) return lineageState;

  const recomputed = recomputeAttestationDigests(binding, lineageState.lineage);
  if (!recomputed.ok) return recomputed;

  const selfConsistent = attestation.attestation_id === sha256Fingerprint(
    ATTESTATION_DIGEST_DOMAIN,
    attestationBodyWithoutId(attestation)
  );
  for (const field of SUBJECT_DIGEST_FIELDS) {
    if (attestation[field] !== recomputed.digests[field]) {
      if (selfConsistent) {
        return fail(
          "EVALUATION_FOREIGN_ATTESTATION",
          `attestation ${field} binds a different candidate, contract, graph, or policy than the presented authority chain`
        );
      }
      return fail("EVALUATION_DIGEST_MISMATCH", `attestation ${field} does not match the recomputed digest`);
    }
  }
  for (const field of CHAIN_DIGEST_FIELDS) {
    if (attestation[field] !== recomputed.digests[field]) {
      return fail("EVALUATION_DIGEST_MISMATCH", `attestation ${field} does not match the recomputed digest`);
    }
  }
  if (!selfConsistent) {
    return fail("EVALUATION_IDENTITY_MISMATCH", "attestation_id does not replay over the attestation body");
  }
  if (attestation.valid_for !== input.expects) {
    return fail("EVALUATION_CONTEXT_MISMATCH", "attestation valid_for does not match the declared evaluation context");
  }
  return { ok: true };
}

module.exports = {
  createCandidateEvaluationAttestation,
  validateCandidateEvaluationAttestation,
};
