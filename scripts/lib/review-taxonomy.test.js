"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  QUALITY_DOMAINS,
  LEGACY_DIMENSIONS,
  ACTIVE_V2_REVIEWERS,
  LEGACY_V1_REVIEWERS,
  ACTIVE_GATES,
  LEGACY_GATES,
  LEXICAL_GATES,
  detectMixedTaxonomy,
  detectMixedGateKeys,
  admitGate,
  admitRouteGates,
  reviewerForDomain,
} = require("./review-taxonomy.js");

test("frozen constants expose quality and legacy rosters", () => {
  assert.deepEqual(QUALITY_DOMAINS, ["trust", "runtime", "evolution", "efficiency"]);
  assert.deepEqual(LEGACY_DIMENSIONS, ["risk", "reliability", "resilience", "readability"]);
  assert.equal(ACTIVE_V2_REVIEWERS.trust, "review-trust");
  assert.equal(LEGACY_V1_REVIEWERS.risk, "review-risk");
});

test("gate sets split lexical recognition from semantic admission", () => {
  assert.ok(ACTIVE_GATES.includes("quality-review-gate"));
  assert.equal(ACTIVE_GATES.includes("4r-review-gate"), false);
  assert.ok(LEGACY_GATES.includes("4r-review-gate"));
  assert.equal(LEGACY_GATES.includes("quality-review-gate"), false);
  assert.ok(LEXICAL_GATES.includes("quality-review-gate"));
  assert.ok(LEXICAL_GATES.includes("4r-review-gate"));
});

test("detectMixedTaxonomy fails closed on mixed domain or reviewer sets", () => {
  assert.deepEqual(detectMixedTaxonomy({ domains: ["trust", "risk"] }), { mixed: true, reason: "mixed-domain-ids" });
  assert.deepEqual(detectMixedTaxonomy({ reviewers: ["review-trust", "review-risk"] }), { mixed: true, reason: "mixed-reviewer-ids" });
  assert.deepEqual(detectMixedTaxonomy({ domains: ["trust"], lineageSchemaVersion: 1 }), { mixed: true, reason: "v1-lineage-with-quality-ids" });
  assert.deepEqual(detectMixedTaxonomy({ domains: ["runtime"], lineageSchemaVersion: 2 }), { mixed: false, reason: null });
});

test("detectMixedGateKeys fails closed when both review gates exist", () => {
  assert.deepEqual(detectMixedGateKeys({ "4r-review-gate": {}, "quality-review-gate": {} }), { mixed: true, reason: "both-review-gate-keys" });
  assert.deepEqual(detectMixedGateKeys({ "quality-review-gate": {} }), { mixed: false, reason: null });
});

test("live v2 admission rejects legacy 4r gate", () => {
  assert.deepEqual(admitGate("quality-review-gate", "live-v2"), { admitted: true, reason: null });
  assert.deepEqual(admitGate("4r-review-gate", "live-v2"), { admitted: false, reason: "legacy-gate-rejected-on-live-v2" });
  assert.deepEqual(admitRouteGates(["clarify", "quality-review-gate"], "live-v2"), { valid: true, reason: null, results: [
    { gate: "clarify", admitted: true, reason: null },
    { gate: "quality-review-gate", admitted: true, reason: null },
  ] });
  assert.equal(admitRouteGates(["4r-review-gate"], "live-v2").valid, false);
});

test("schema-v1 admission rejects quality gate on persisted state", () => {
  assert.deepEqual(admitGate("4r-review-gate", "schema-v1"), { admitted: true, reason: null });
  assert.deepEqual(admitGate("quality-review-gate", "schema-v1"), { admitted: false, reason: "v2-gate-rejected-on-schema-v1" });
});

test("reviewerForDomain maps by schema version", () => {
  assert.equal(reviewerForDomain("trust", 2), "review-trust");
  assert.equal(reviewerForDomain("risk", 1), "review-risk");
});
