"use strict";

const { computeDeltas } = require("./analyzer.js");
const { generateAdvisorySignals } = require("./advisory.js");
const { failure, normalizeCandidate, normalizeObservations, normalizeAlternatives, canonicalInputId, reportId, stableReportBytes, validateReportSchema } = require("./integrity.js");

function createDeltaReport(input) {
  try {
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new TypeError("K6d input must be an object");
    if (Object.keys(input).some((key) => !["candidate", "observations", "alternatives"].includes(key))) throw new Error("K6d accepts only candidate, observations and alternatives; telemetry is not an input");
    const candidate = normalizeCandidate(input.candidate);
    const observations = normalizeObservations(input.observations);
    const alternatives = normalizeAlternatives(input.alternatives, candidate.candidate_id);
    const report = {
      schema_version: 1,
      kind: "complexity-architecture-delta/v1",
      candidate_id: candidate.candidate_id,
      canonical_input_id: canonicalInputId(candidate, observations, alternatives),
      authority: "advisory",
      dimensions: computeDeltas(observations),
      alternatives,
      signals: generateAdvisorySignals(alternatives),
    };
    report.report_id = reportId(report);
    validateReportSchema(report);
    return { ok: true, report, bytes: stableReportBytes(report) };
  } catch (error) { return failure("K6D_INPUT_INVALID", error); }
}

function validateDeltaReport(report, options = {}) {
  try {
    validateReportSchema(report, options.rootDir);
    const candidate = normalizeCandidate(options.candidate);
    if (report.candidate_id !== candidate.candidate_id) throw new Error("report candidate_id diverges from frozen Candidate");
    if (report.report_id !== reportId(report)) throw new Error("report_id does not match canonical report body");
    for (const alternative of report.alternatives) {
      const { alternative_id, ...body } = alternative;
      const { sha256Fingerprint } = require("../canonical-json.js");
      if (alternative.candidate_id !== candidate.candidate_id || alternative_id !== sha256Fingerprint("architecture-alternative:v1", body)) throw new Error("alternative binding or identity is invalid");
    }
    if (options.canonicalInput) {
      const observations = normalizeObservations(options.canonicalInput.observations);
      const alternatives = normalizeAlternatives(options.canonicalInput.alternatives, candidate.candidate_id);
      if (report.canonical_input_id !== canonicalInputId(candidate, observations, alternatives)) throw new Error("canonical_input_id mismatch");
    }
    return { ok: true };
  } catch (error) { return failure("K6D_REPORT_INVALID", error); }
}

function rejectAuthorityMisuse(input) {
  if (input && (input.from_k6d_alone === true || ["deliver", "approve", "promote", "transition", "authorize"].includes(input.operation))) return { ok: false, reason_code: "K6D_AUTHORITY_MISUSE" };
  return { ok: true };
}

module.exports = { createDeltaReport, validateDeltaReport, rejectAuthorityMisuse };
