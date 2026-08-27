"use strict";

const crypto = require("node:crypto");
const path = require("node:path");
const { sha256Fingerprint } = require("../canonical-json.js");
const { validateInstance, loadSchemaById } = require("../kernel-schema-validator.js");
const { resolveEvidenceProvenance } = require("./collector-provenance.js");

const EVIDENCE_V2_ID = "ospec://schemas/kernel/evidence/v2";
const DEFAULT_SCHEMA_ROOT = path.resolve(__dirname, "../../..");
const SHA256 = /^sha256:[a-f0-9]{64}$/;

let cachedEvidenceSchema = null;

function fail(reason_code, error) {
  return { ok: false, reason_code, error: error || reason_code };
}

function getEvidenceSchema() {
  if (!cachedEvidenceSchema) {
    cachedEvidenceSchema = loadSchemaById(EVIDENCE_V2_ID, { rootDir: DEFAULT_SCHEMA_ROOT });
  }
  return cachedEvidenceSchema;
}

function toBuffer(bytes) {
  if (Buffer.isBuffer(bytes)) return bytes;
  if (bytes === undefined || bytes === null) return Buffer.from("", "utf8");
  return Buffer.from(String(bytes), "utf8");
}

function digestRawBytes(bytes) {
  const buf = toBuffer(bytes);
  return `sha256:${crypto.createHash("sha256").update(buf).digest("hex")}`;
}

function computeEvidenceId(fields, rawBytes) {
  return sha256Fingerprint("evidence/v2", {
    schema_version: fields.schema_version,
    kind: fields.kind,
    candidate_id: fields.candidate_id,
    provenance: fields.provenance,
    origin: fields.origin,
    digest: fields.digest,
    node_id: fields.node_id,
    raw_bytes: toBuffer(rawBytes).toString("base64"),
  });
}

/**
 * Normalize raw evidence into evidence/v2. Fail closed on mixed verdict,
 * digest mismatch, foreign subject, or schema violation.
 *
 * @param {object} raw
 * @param {object} candidate
 * @param {object} [executionGraph]
 * @returns {{ ok: true, evidence: object, role?: string, obligation_ids: string[] } | { ok: false, reason_code: string }}
 */
function normalizeEvidence(raw, candidate, executionGraph, harnessCollector) {
  if (!raw || typeof raw !== "object") {
    return fail("FABRICATED_EVIDENCE", "raw evidence must be an object");
  }
  if (Object.prototype.hasOwnProperty.call(raw, "verdict")) {
    return fail("MIXED_EVIDENCE_VERDICT", "evidence must not carry verdict");
  }

  const candidateId = candidate && candidate.candidate_id;
  if (raw.candidate_id && raw.candidate_id !== candidateId) {
    return fail("FOREIGN_SUBJECT", "evidence candidate_id does not match frozen subject");
  }

  const bytes = raw.bytes !== undefined ? raw.bytes : raw.rawBytes;
  const digest = digestRawBytes(bytes);
  if (raw.digest && raw.digest !== digest) {
    return fail("FABRICATED_EVIDENCE", "evidence digest does not match raw bytes");
  }

  const nodeId = raw.node_id;
  if (typeof nodeId !== "string" || nodeId.length < 1) {
    return fail("BINDING_MISMATCH", "evidence node_id is required");
  }
  if (executionGraph && Array.isArray(executionGraph.nodes)) {
    const known = new Set(executionGraph.nodes.map((node) => node && node.node_id));
    if (!known.has(nodeId)) {
      return fail("BINDING_MISMATCH", `evidence node_id ${nodeId} is not in the Execution Graph`);
    }
  }

  const resolvedProvenance = resolveEvidenceProvenance(raw, harnessCollector);
  if (!resolvedProvenance.ok) return resolvedProvenance;

  const record = {
    schema_version: 2,
    kind: "evidence/v2",
    candidate_id: candidateId,
    provenance: resolvedProvenance.provenance,
    origin: raw.origin,
    digest,
    node_id: nodeId,
  };
  record.evidence_id = computeEvidenceId(record, bytes);
  if (raw.evidence_id && raw.evidence_id !== record.evidence_id) {
    return fail("FABRICATED_EVIDENCE", "declared evidence_id does not match canonical digest");
  }
  if (!SHA256.test(record.evidence_id) || !SHA256.test(record.digest)) {
    return fail("FABRICATED_EVIDENCE", "evidence digests must be sha256");
  }

  const validation = validateInstance(getEvidenceSchema(), record);
  if (!validation.valid) {
    return fail("FABRICATED_EVIDENCE", validation.errors.map((e) => e.message).join("; "));
  }

  const obligationIds = Array.isArray(raw.obligation_ids)
    ? raw.obligation_ids.filter((id) => typeof id === "string")
    : raw.obligation_id
      ? [raw.obligation_id]
      : [];
  const evidenceRequirementsSatisfied = Array.isArray(raw.evidence_requirements_satisfied)
    ? [...new Set(raw.evidence_requirements_satisfied.filter((token) => typeof token === "string" && token.length > 0))].sort()
    : [];

  return {
    ok: true,
    evidence: record,
    role: raw.role,
    obligation_ids: obligationIds,
    evidence_requirements_satisfied: evidenceRequirementsSatisfied,
  };
}

function isRuntimeClass(provenance) {
  return provenance === "runtime-observed" || provenance === "host-attested" || provenance === "tool-produced";
}

/**
 * Model-reported claims cannot satisfy runtime/tool obligations.
 *
 * @param {object} evidence
 * @param {{ requireRuntime?: boolean }} [options]
 * @returns {{ ok: true } | { ok: false, reason_code: string }}
 */
function evaluateProvenanceSufficiency(evidence, options = {}) {
  if (!evidence || typeof evidence !== "object") {
    return fail("INSUFFICIENT_PROVENANCE");
  }
  const requireRuntime = options.requireRuntime !== false;
  if (requireRuntime && !isRuntimeClass(evidence.provenance)) {
    return fail("INSUFFICIENT_PROVENANCE", "model-reported cannot satisfy runtime/tool obligations");
  }
  return { ok: true };
}

module.exports = {
  digestRawBytes,
  computeEvidenceId,
  normalizeEvidence,
  evaluateProvenanceSufficiency,
};
