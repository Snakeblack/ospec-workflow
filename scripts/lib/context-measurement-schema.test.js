"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { validateContextMeasurement } = require("./context-measurement.js");

const ROOT = path.resolve(__dirname, "../../schemas/telemetry/context-measurement");
const read = (relative) => JSON.parse(fs.readFileSync(path.join(ROOT, relative), "utf8"));

test("[REQ-context-measurement-001] CX0 v1 schema closes dimensions, metric unions, sources and fallback codes", () => {
  const schema = read("v1.schema.json");
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.$defs.metrics.additionalProperties, false);
  assert.deepEqual(schema.$defs.availableMetric.properties.source.enum, ["host-observed", "runtime-derived", "estimated"]);
  assert.ok(schema.$defs.unavailableMetric.required.includes("reason_code"));
  assert.ok(schema.$defs.metrics.required.includes("amplification"));
});

test("[REQ-context-measurement-001] CX0 committed full and degraded fixtures are valid while named invalid fixtures are rejected", () => {
  for (const fixture of ["fixtures/valid/full.json", "fixtures/valid/degraded.json"]) {
    assert.equal(validateContextMeasurement(read(fixture)).valid, true, fixture);
  }
  for (const fixture of ["fixtures/invalid/unknown-source.json", "fixtures/invalid/missing-reason.json", "fixtures/invalid/partial-kpi.json", "fixtures/invalid/payload-rejection.json"]) {
    assert.equal(validateContextMeasurement(read(fixture)).valid, false, fixture);
  }
});
