"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { deriveQualityReviewKpis, KPI_NAMES, FORMULA_VERSION } = require("./quality-review-kpis.js");

test("deriveQualityReviewKpis returns seven spec KPI envelopes", () => {
  const result = deriveQualityReviewKpis({
    gateAudit: { records: [
      { schema_version: 2, status: "done", selected_domains: [], classification_status: "sufficient" },
      { schema_version: 2, status: "ready", selected_domains: ["runtime"], classification_status: "sufficient", review_change_invoked: true, router: { classification_status: "sufficient", added_domains: ["trust"] } },
      { schema_version: 2, status: "done", selected_domains: ["trust", "runtime", "evolution", "efficiency"], dispatched_domains: ["trust", "runtime", "evolution", "efficiency"], blocking_findings: 2 },
    ] },
    phaseCosts: [
      { phase: "review-runtime", tokens: 100 },
      { phase: "review-change", tokens: 40, router_delta: true },
    ],
    cx0Records: [{ id: "cx0-1" }],
  });
  assert.equal(result.formula_version, FORMULA_VERSION);
  assert.equal(result.kpis.length, 7);
  assert.deepEqual(result.kpis.map((k) => k.name), KPI_NAMES);
  assert.equal(result.kpis[0].source, "runtime-derived");
  assert.equal(result.kpis[0].value, 1 / 3);
  assert.equal(result.kpis[6].name, "router_delta_rate");
  assert.equal(result.kpis[6].value, 1);
});

test("missing phase-cost token data yields unavailable envelopes with CX0 sources", () => {
  const result = deriveQualityReviewKpis({ gateAudit: { status: "done", schema_version: 2, selected_domains: [] } });
  const tokens = result.kpis.find((k) => k.name === "tokens_per_quality_gate");
  assert.equal(tokens.available, false);
  assert.equal(tokens.source, "estimated");
  assert.equal(tokens.reason_code, "host-field-unavailable");
  for (const kpi of result.kpis) {
    assert.ok(["host-observed", "runtime-derived", "estimated"].includes(kpi.source));
  }
});

test("module does not import gate or lineage authority", () => {
  const source = require("node:fs").readFileSync(require("node:path").join(__dirname, "quality-review-kpis.js"), "utf8");
  assert.doesNotMatch(source, /review-gate-state|review-lineage/);
});
