"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const {
  aggregateContextMeasurements,
  compareCx0Hypotheses,
  loadCx0Hypotheses,
  normalizeContextMeasurement,
} = require("./context-measurement.js");

const REGISTRY = path.resolve(__dirname, "../../schemas/telemetry/context-measurement/hypotheses.v1.json");

function record({ duplicated = 0, unavailable = false } = {}) {
  const item = normalizeContextMeasurement({
    observed_at: "2026-09-01T00:00:00.000Z",
    dimensions: { phase: "apply", classification: "normal", profile: "default", host: "codex" },
    observations: { input_tokens: 20, cached_input_tokens: 0, uncached_input_tokens: 20, output_tokens: 1, artifact_reads: 0, artifact_writes: 0, tool_output_tokens: 0, unique_context: unavailable ? 0 : 10, duplicated_context: duplicated },
  });
  return item;
}

test("[REQ-context-measurement-004] CX0 hypothesis registry binds stable IDs, formula versions and advisory metadata", () => {
  const hypotheses = loadCx0Hypotheses(REGISTRY);
  assert.deepEqual(hypotheses.map((item) => item.id), ["cx0-amplification-below-two", "cx0-duplication-share-below-half", "cx0-fallback-rate-below-quarter"]);
  for (const item of hypotheses) {
    assert.match(item.formula_version, /\/v1$/);
    assert.equal(item.metadata.aggregation_version, "cx0-cohort-report/v1");
    assert.equal(typeof item.metadata.coverage_requirement, "string");
  }
});

test("[REQ-context-measurement-004] CX0 compares the canonical duplication and fallback formulas without creating policy output", () => {
  const report = aggregateContextMeasurements([record({ duplicated: 10 }), record({ duplicated: 0, unavailable: true })]);
  const hypotheses = loadCx0Hypotheses(REGISTRY);
  const results = compareCx0Hypotheses(report, hypotheses);
  const duplication = results.find((item) => item.id === "cx0-duplication-share-below-half");
  const fallback = results.find((item) => item.id === "cx0-fallback-rate-below-quarter");
  assert.equal(duplication.value, 0.5);
  assert.equal(duplication.outcome, "contradicted");
  assert.equal(fallback.value, 0.5);
  assert.equal(fallback.outcome, "contradicted");
  assert.equal(results.some((item) => "gate" in item || "authority" in item || "route" in item), false);
});

test("[REQ-context-measurement-004] CX0 classifies supported and insufficient-evidence outcomes correctly", () => {
  const report = aggregateContextMeasurements([record({ duplicated: 2 })]);
  const supportedHypothesis = { id: "test-supported", metric: "duplication_share", operator: "lte", target: 0.5, formula_version: "duplication-share/v1", selector: {}, metadata: {} };
  const insufficientHypothesis = { id: "test-insufficient", metric: "unknown_metric", operator: "lte", target: 0.5, formula_version: "test/v1", selector: { phase: "nonexistent" }, metadata: {} };
  const results = compareCx0Hypotheses(report, [supportedHypothesis, insufficientHypothesis]);
  assert.equal(results[0].outcome, "supported");
  assert.equal(results[1].outcome, "insufficient-evidence");
  assert.equal(results[1].coverage.cohorts, 0);
});

test("[REQ-context-measurement-004] loadCx0Hypotheses rejects missing files and malformed descriptor structures", () => {
  assert.throws(() => loadCx0Hypotheses("non-existent-path.json"), /Failed to load CX0 hypothesis registry/);
});
