"use strict";

const path = require("node:path");
const { stableSerialize, sha256Fingerprint } = require("../canonical-json.js");
const { validateCandidateV2, computeCandidateId } = require("../execution-identities/index.js");
const { validateInstance, loadSchemaById } = require("../kernel-schema-validator.js");

const DIMENSIONS = Object.freeze(["modules", "interfaces", "dependencies", "configuration", "states", "compatibility", "duplication", "dead_code", "public_api"]);
const CLASSIFICATIONS = new Set(["no-op", "local", "extend-pattern", "new-abstraction"]);
const SHA256 = /^sha256:[a-f0-9]{64}$/;
const ROOT = path.resolve(__dirname, "../../..");

function failure(reason_code, error) { return { ok: false, reason_code, error: error instanceof Error ? error.message : String(error) }; }
function requireObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${label} must be an object`);
  return value;
}
function requireDigest(value, label) {
  if (typeof value !== "string" || !SHA256.test(value)) throw new TypeError(`${label} must be a sha256 digest`);
  return value;
}
function normalizeCandidate(candidate) {
  requireObject(candidate, "candidate");
  if (!validateCandidateV2(candidate)) throw new Error("candidate must be a valid Candidate v2");
  const candidateId = computeCandidateId(candidate);
  if (candidate.candidate_id !== candidateId) throw new Error("candidate_id does not match frozen Candidate v2 identity");
  return candidate;
}
function normalizeRecords(records, label) {
  if (!Array.isArray(records)) throw new TypeError(`${label} must be an array`);
  const ids = new Set();
  const normalized = records.map((record) => {
    requireObject(record, `${label} record`);
    if (typeof record.id !== "string" || !record.id) throw new TypeError(`${label} record id must be non-empty`);
    if (ids.has(record.id)) throw new Error(`${label} contains duplicate id ${record.id}`);
    ids.add(record.id);
    return { id: record.id, digest: requireDigest(record.digest, `${label} digest`) };
  });
  return normalized.sort((left, right) => compareCanonicalString(left.id, right.id));
}
function compareCanonicalString(left, right) {
  // Locale-independent UTF-16 code-unit order (not localeCompare / Collator).
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}
function normalizeObservations(observations) {
  requireObject(observations, "observations");
  const actual = Object.keys(observations).sort(compareCanonicalString);
  if (actual.length !== DIMENSIONS.length || actual.some((name, index) => name !== [...DIMENSIONS].sort(compareCanonicalString)[index])) throw new Error("observations must contain exactly the nine K6d dimensions");
  return Object.fromEntries(DIMENSIONS.map((dimension) => {
    const value = requireObject(observations[dimension], `observation ${dimension}`);
    if (value.status === "unavailable") {
      if (Object.keys(value).sort().join(",") !== "reason,status" || typeof value.reason !== "string" || !value.reason.trim()) throw new Error(`${dimension} unavailable observation requires only a non-empty reason`);
      return [dimension, { status: "unavailable", reason: value.reason }];
    }
    if (value.status !== "observed" || Object.keys(value).some((key) => !["status", "base", "candidate"].includes(key))) throw new Error(`${dimension} must be observed or unavailable`);
    return [dimension, { status: "observed", base: normalizeRecords(value.base, `${dimension}.base`), candidate: normalizeRecords(value.candidate, `${dimension}.candidate`) }];
  }));
}
function alternativeBody(alternative) {
  const body = { schema_version: 1, kind: "architecture-alternative/v1", candidate_id: alternative.candidate_id, classification: alternative.classification, summary: alternative.summary };
  if (alternative.rationale !== undefined) body.rationale = alternative.rationale;
  return body;
}
function normalizeRationale(value) {
  requireObject(value, "new-abstraction rationale");
  const keys = ["problem", "consumers", "variability", "boundary", "simpler_alternative", "retirement_path"];
  if (Object.keys(value).length !== keys.length || keys.some((key) => typeof value[key] !== "string" || !value[key].trim())) throw new Error("new-abstraction rationale must include complete problem, consumers, variability, boundary, simpler_alternative and retirement_path");
  return Object.fromEntries(keys.map((key) => [key, value[key]]));
}
function normalizeAlternatives(alternatives, candidateId) {
  if (!Array.isArray(alternatives)) throw new TypeError("alternatives must be an array");
  const ids = new Set();
  const normalized = alternatives.map((input) => {
    requireObject(input, "alternative");
    if (!CLASSIFICATIONS.has(input.classification) || typeof input.summary !== "string" || !input.summary.trim()) throw new Error("alternative requires a supported classification and non-empty summary");
    if (input.candidate_id !== undefined && input.candidate_id !== candidateId) throw new Error("alternative candidate_id diverges from report Candidate");
    const raw = { candidate_id: candidateId, classification: input.classification, summary: input.summary };
    if (input.classification === "new-abstraction") raw.rationale = normalizeRationale(input.rationale);
    else if (input.rationale !== undefined) throw new Error("rationale is only valid for new-abstraction alternatives");
    const body = alternativeBody(raw);
    const alternative_id = sha256Fingerprint("architecture-alternative:v1", body);
    if (input.alternative_id !== undefined && input.alternative_id !== alternative_id) throw new Error("alternative_id does not match canonical alternative body");
    if (ids.has(alternative_id)) throw new Error("alternatives contain duplicate canonical identities");
    ids.add(alternative_id);
    return { schema_version: 1, kind: "architecture-alternative/v1", alternative_id, ...raw };
  });
  return normalized.sort((left, right) => compareCanonicalString(left.alternative_id, right.alternative_id));
}
function canonicalInputId(candidate, observations, alternatives) {
  return sha256Fingerprint("complexity-architecture-input:v1", { candidate_id: candidate.candidate_id, observations, alternatives });
}
function reportBody(report) {
  const { report_id, ...body } = report;
  return body;
}
function reportId(report) { return sha256Fingerprint("complexity-architecture-delta:v1", reportBody(report)); }
function stableReportBytes(report) { return Buffer.from(stableSerialize(report), "utf8"); }
function schema(rootDir = ROOT) { return loadSchemaById("ospec://schemas/kernel/complexity-architecture-delta/v1", { rootDir }); }
function validateReportSchema(report, rootDir) {
  const result = validateInstance(schema(rootDir), report);
  if (!result.valid) throw new Error(`report schema validation failed: ${result.errors.map((entry) => entry.path).join(", ")}`);
}

module.exports = { DIMENSIONS, failure, normalizeCandidate, normalizeObservations, normalizeAlternatives, canonicalInputId, reportId, stableReportBytes, validateReportSchema, alternativeBody };
