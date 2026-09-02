"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const {
  aggregateContextMeasurements,
  canonicalCx0Json,
  compareCx0Hypotheses,
  deriveContextKpis,
  normalizeContextMeasurement,
  validateContextMeasurement,
} = require("./context-measurement.js");

function full(overrides = {}) {
  return normalizeContextMeasurement({
    observed_at: "2026-09-01T00:00:00.000Z",
    dimensions: { phase: "apply", classification: "normal", profile: "default", host: "codex" },
    observations: { input_tokens: 100, cached_input_tokens: 10, uncached_input_tokens: 90, output_tokens: 20, artifact_reads: 1, artifact_writes: 1, tool_output_tokens: 5, unique_context: 80, duplicated_context: 20 },
    ...overrides,
  });
}

test("[REQ-context-measurement-001] normalizes fully observed bounded counters without payloads", () => {
  const record = full({ observations: { input_tokens: 100, cached_input_tokens: 10, uncached_input_tokens: 90, output_tokens: 20, artifact_reads: 1, artifact_writes: 1, tool_output_tokens: 5, unique_context: 80, duplicated_context: 20, prompt: "secret" } });
  assert.equal(validateContextMeasurement(record).valid, true);
  assert.equal(record.metrics.input_tokens.value, 100);
  assert.equal(record.metrics.amplification.value, 1.25);
  assert.equal(record.metrics.amplification.formula_version, "amplification/v1");
  assert.doesNotMatch(canonicalCx0Json(record), /secret/);
});

test("[REQ-context-measurement-002] amplification stays unavailable for missing, partial, incompatible and zero inputs", () => {
  for (const input of [
    { unique_context: 0, duplicated_context: 2 },
    { unique_context: 10 },
  ]) {
    const metric = full({ observations: { input_tokens: 1, cached_input_tokens: 0, uncached_input_tokens: 1, output_tokens: 0, artifact_reads: 0, artifact_writes: 0, tool_output_tokens: 0, ...input } }).metrics.amplification;
    assert.equal(metric.status, "unavailable");
    assert.equal(metric.value, undefined);
  }
  const metrics = full().metrics;
  metrics.duplicated_context.coverage.state = "partial";
  assert.equal(deriveContextKpis(metrics).amplification.reason_code, "partial-coverage");
});

test("[REQ-context-measurement-001] rejects missing metric reasons, unknown sources and malformed metric sets", () => {
  const record = full();
  record.metrics.input_tokens.source = "invented";
  record.metrics.output_tokens = { status: "unavailable", source: "host-observed", coverage: { state: "unavailable", observed: 0, expected: 0, ratio: 0 } };
  const validation = validateContextMeasurement(record);
  assert.equal(validation.valid, false);
  assert.ok(validation.errors.some((error) => /input_tokens/.test(error)));
  assert.ok(validation.errors.some((error) => /output_tokens/.test(error)));
});

test("[REQ-context-measurement-003] aggregates cohorts canonically with nearest-rank percentiles and unavailable counts", () => {
  const first = full({ observations: { input_tokens: 1, cached_input_tokens: 0, uncached_input_tokens: 1, output_tokens: 0, artifact_reads: 0, artifact_writes: 0, tool_output_tokens: 0, unique_context: 10, duplicated_context: 0 } });
  const second = full({ observations: { input_tokens: 1, cached_input_tokens: 0, uncached_input_tokens: 1, output_tokens: 0, artifact_reads: 0, artifact_writes: 0, tool_output_tokens: 0, unique_context: 10, duplicated_context: 20 } });
  second.metrics.tool_output_tokens = { status: "unavailable", source: "host-observed", coverage: { state: "unavailable", observed: 0, expected: 0, ratio: 0 }, reason_code: "host-field-unavailable" };
  const a = aggregateContextMeasurements([second, first]);
  const b = aggregateContextMeasurements([first, second]);
  assert.equal(canonicalCx0Json(a), canonicalCx0Json(b));
  assert.equal(a.cohorts[0].metrics.amplification.p50, 1);
  assert.equal(a.cohorts[0].metrics.amplification.p90, 3);
  assert.equal(a.cohorts[0].metrics.tool_output_tokens.eligible_count, 1);
  assert.equal(a.cohorts[0].metrics.tool_output_tokens.unavailable_count, 1);
});

test("[REQ-context-measurement-004] hypothesis comparisons remain advisory and classify contradiction", () => {
  const report = aggregateContextMeasurements([full({ observations: { input_tokens: 1, cached_input_tokens: 0, uncached_input_tokens: 1, output_tokens: 0, artifact_reads: 0, artifact_writes: 0, tool_output_tokens: 0, unique_context: 10, duplicated_context: 30 } })]);
  const [result] = compareCx0Hypotheses(report, [{ id: "h", metric: "amplification", operator: "lte", target: 2, selector: {} }]);
  assert.equal(result.outcome, "contradicted");
  assert.equal(result.gate, undefined);
});

test("[REQ-context-measurement-001] committed full fixture satisfies the semantic validator", () => {
  const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, "../../schemas/telemetry/context-measurement/fixtures/valid/full.json"), "utf8"));
  assert.equal(validateContextMeasurement(fixture).valid, true);
});

test("[REQ-context-measurement-002] deriveContextKpis safely degrades without throwing on missing coverage objects", () => {
  const metrics = full().metrics;
  delete metrics.unique_context.coverage;
  const result = deriveContextKpis(metrics);
  assert.equal(result.amplification.status, "unavailable");
  assert.equal(result.amplification.reason_code, "partial-coverage");
});

test("[REQ-context-measurement-003] cohort handles 100% unavailable metric samples without emitting p50/p90", () => {
  const record = full({ observations: { tool_output_tokens: undefined } });
  record.metrics.tool_output_tokens = { status: "unavailable", source: "host-observed", coverage: { state: "unavailable", observed: 0, expected: 0, ratio: 0 }, reason_code: "host-field-unavailable" };
  const report = aggregateContextMeasurements([record]);
  const metric = report.cohorts[0].metrics.tool_output_tokens;
  assert.equal(metric.status, "unavailable");
  assert.equal(metric.eligible_count, 0);
  assert.equal(metric.unavailable_count, 1);
  assert.equal(metric.p50, undefined);
  assert.equal(metric.p90, undefined);
});

test("[REQ-context-measurement-003] cohort sorting is lexicographical and independent of system locale", () => {
  const c1 = full({ dimensions: { phase: "apply", classification: "normal", profile: "a-profile", host: "codex" } });
  const c2 = full({ dimensions: { phase: "apply", classification: "normal", profile: "z-profile", host: "codex" } });
  const reportA = aggregateContextMeasurements([c2, c1]);
  const reportB = aggregateContextMeasurements([c1, c2]);
  assert.equal(reportA.cohorts[0].dimensions.profile, "a-profile");
  assert.equal(reportA.cohorts[1].dimensions.profile, "z-profile");
  assert.equal(canonicalCx0Json(reportA), canonicalCx0Json(reportB));
});
