"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const { freezeCandidate } = require("../execution-identities/index.js");
const { createDeltaReport, validateDeltaReport, rejectAuthorityMisuse } = require("./index.js");

const DIGEST = (letter) => `sha256:${letter.repeat(64)}`;
const DIMENSIONS = ["modules", "interfaces", "dependencies", "configuration", "states", "compatibility", "duplication", "dead_code", "public_api"];

function candidate() {
  return freezeCandidate({
    repository_id: "k6d-test-repository",
    projection: "workspace",
    base_tree: DIGEST("a"),
    candidate_tree: DIGEST("b"),
    diff_hash: DIGEST("c"),
    changed_paths_modes_digest: DIGEST("d"),
    paths: ["src/k6d.js"],
  });
}

function observations() {
  return Object.fromEntries(DIMENSIONS.map((dimension) => [
    dimension,
    { status: "observed", base: [{ id: `${dimension}-a`, digest: DIGEST("e") }], candidate: [{ id: `${dimension}-b`, digest: DIGEST("f") }] },
  ]));
}

test("K6d produces byte-identical Candidate-bound reports for reordered equivalent inputs", () => {
  const frozen = candidate();
  const input = {
    candidate: frozen,
    observations: observations(),
    alternatives: [{ classification: "local", summary: "Keep the local implementation." }],
  };
  const first = createDeltaReport(input);
  const reordered = createDeltaReport({
    ...input,
    observations: Object.fromEntries(Object.entries(input.observations).reverse()),
    alternatives: [...input.alternatives].reverse(),
  });
  assert.equal(first.ok, true);
  assert.equal(reordered.ok, true);
  assert.equal(first.report.report_id, reordered.report.report_id);
  assert.deepEqual(first.bytes, reordered.bytes);
  assert.equal(first.report.dimensions.modules.added[0].id, "modules-b");
  assert.equal(first.report.dimensions.modules.removed[0].id, "modules-a");
});

test("K6d fails closed for divergent Candidate, duplicate IDs, malformed digests and missing dimensions", () => {
  const frozen = candidate();
  for (const input of [
    { candidate: { ...frozen, candidate_id: DIGEST("0") }, observations: observations(), alternatives: [] },
    { candidate: frozen, observations: { ...observations(), modules: { status: "observed", base: [{ id: "x", digest: DIGEST("a") }, { id: "x", digest: DIGEST("b") }], candidate: [] } }, alternatives: [] },
    { candidate: frozen, observations: { ...observations(), modules: { status: "observed", base: [], candidate: [{ id: "x", digest: "bad" }] } }, alternatives: [] },
    { candidate: frozen, observations: Object.fromEntries(Object.entries(observations()).slice(1)), alternatives: [] },
  ]) {
    const result = createDeltaReport(input);
    assert.equal(result.ok, false);
    assert.equal(typeof result.reason_code, "string");
  }
});

test("K6d retains unavailable observations and emits only advisory signals", () => {
  const frozen = candidate();
  const input = {
    candidate: frozen,
    observations: { ...observations(), duplication: { status: "unavailable", reason: "collector unavailable" } },
    alternatives: [{
      classification: "new-abstraction",
      summary: "Introduce a shared adapter.",
      rationale: {
        problem: "Duplicated adaptation", consumers: "two callers", variability: "host formats",
        boundary: "adapter input", simpler_alternative: "keep duplication", retirement_path: "remove old adapters",
      },
    }],
  };
  const result = createDeltaReport(input);
  assert.equal(result.ok, true);
  assert.deepEqual(result.report.dimensions.duplication, { status: "unavailable", reason: "collector unavailable" });
  assert.equal(result.report.authority, "advisory");
  assert.equal(result.report.signals[0].authority, "advisory");
  assert.equal(Object.hasOwn(result.report.signals[0], "verdict"), false);
  assert.equal(validateDeltaReport(result.report, { candidate: frozen, rootDir: path.resolve(__dirname, "../../..") }).ok, true);
});

test("K6d rejects incomplete abstraction rationale and authority misuse without CX0 input", () => {
  const frozen = candidate();
  const invalid = createDeltaReport({
    candidate: frozen,
    observations: observations(),
    alternatives: [{ classification: "new-abstraction", summary: "Missing rationale", rationale: { problem: "p" } }],
  });
  assert.equal(invalid.ok, false);
  assert.equal(rejectAuthorityMisuse({ operation: "deliver", from_k6d_alone: true }).reason_code, "K6D_AUTHORITY_MISUSE");
});

test("K6d signal ordering is locale-independent for new-abstraction alternatives", () => {
  const frozen = freezeCandidate({
    repository_id: "locale-proof-signals",
    projection: "workspace",
    base_tree: DIGEST("a"),
    candidate_tree: DIGEST("b"),
    diff_hash: DIGEST("c"),
    changed_paths_modes_digest: DIGEST("d"),
    paths: ["src/x"],
  });
  const rationale = { problem: "p", consumers: "c", variability: "v", boundary: "b", simpler_alternative: "s", retirement_path: "r" };
  const alternativesForSignals = [
    { classification: "new-abstraction", summary: "Shared adapter variant 1", rationale },
    { classification: "new-abstraction", summary: "Shared adapter variant 132", rationale },
  ];
  const orig = String.prototype.localeCompare;
  const run = (locale) => {
    const cmp = new Intl.Collator(locale).compare;
    String.prototype.localeCompare = function localeCompareOverride(other) {
      return cmp(this, String(other));
    };
    return createDeltaReport({ candidate: frozen, observations: observations(), alternatives: alternativesForSignals });
  };
  try {
    const english = run("en");
    const danish = run("da");
    assert.equal(english.ok, true);
    assert.equal(danish.ok, true);
    assert.equal(english.report.signals.length, 2);
    assert.equal(english.report.report_id, danish.report.report_id);
    assert.deepEqual(english.bytes, danish.bytes);
  } finally {
    String.prototype.localeCompare = orig;
  }
});

test("K6d report identity is stable across localeCompare / Collator orderings", () => {
  const frozen = freezeCandidate({
    repository_id: "locale-proof",
    projection: "workspace",
    base_tree: DIGEST("a"),
    candidate_tree: DIGEST("b"),
    diff_hash: DIGEST("c"),
    changed_paths_modes_digest: DIGEST("d"),
    paths: ["src/x"],
  });
  const observationsForLocale = Object.fromEntries(DIMENSIONS.map((dimension) => [
    dimension,
    { status: "observed", base: [], candidate: [{ id: "z", digest: DIGEST("e") }, { id: "ä", digest: DIGEST("f") }] },
  ]));
  const orig = String.prototype.localeCompare;
  const run = (locale) => {
    const cmp = new Intl.Collator(locale).compare;
    String.prototype.localeCompare = function localeCompareOverride(other) {
      return cmp(this, String(other));
    };
    return createDeltaReport({ candidate: frozen, observations: observationsForLocale, alternatives: [] });
  };
  try {
    const english = run("en");
    const swedish = run("sv");
    assert.equal(english.ok, true);
    assert.equal(swedish.ok, true);
    assert.equal(english.report.report_id, swedish.report.report_id);
    assert.deepEqual(english.bytes, swedish.bytes);
    assert.deepEqual(
      english.report.dimensions.modules.added.map((record) => record.id),
      ["z", "ä"],
    );
  } finally {
    String.prototype.localeCompare = orig;
  }
});
