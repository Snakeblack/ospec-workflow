"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { contextMetricObservations } = require("./subagent-stop.js");
const { normalizeContextMeasurement, validateContextMeasurement } = require("../lib/context-measurement.js");

test("[REQ-hooks-017] CX0 marks uncached input as runtime-derived and never promotes O1 estimates", () => {
  const observations = contextMetricObservations({}, { input_tokens: 100, cached_input_tokens: 25, output_tokens: 10 }, { prompt: 999 });
  assert.equal(observations.uncached_input_tokens.source, "runtime-derived");
  assert.equal(observations.uncached_input_tokens.value, 75);
  const record = normalizeContextMeasurement({
    observed_at: "2026-09-01T00:00:00.000Z",
    dimensions: { phase: "apply", classification: "normal", profile: "default", host: "codex" },
    observations,
  });
  assert.equal(record.metrics.input_tokens.source, "host-observed");
  assert.equal(record.metrics.uncached_input_tokens.source, "runtime-derived");
  assert.equal(validateContextMeasurement(record).valid, true);
});

test("[REQ-hooks-017] CX0 fallback keeps the most specific reason and closed metric envelopes", () => {
  const record = normalizeContextMeasurement({
    observed_at: "2026-09-01T00:00:00.000Z",
    dimensions: { phase: "apply", classification: "normal", profile: "default", host: "codex" },
    observations: { unique_context: 0, duplicated_context: 1 },
  });
  assert.equal(record.metrics.amplification.reason_code, "zero-denominator");
  assert.equal(record.fallback.reason_code, "zero-denominator");
  assert.equal(validateContextMeasurement(record).valid, true);
});
