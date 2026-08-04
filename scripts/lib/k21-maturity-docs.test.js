"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "..", "..");

test("K2.1 maturity docs tag Authority Store/permits/effects as implemented; later slices stay target", () => {
  const arch = fs.readFileSync(
    path.join(ROOT, "docs", "architecture", "harness-evolution.md"),
    "utf8"
  );
  const roadmap = fs.readFileSync(
    path.join(ROOT, "docs", "roadmaps", "harness-evolution.md"),
    "utf8"
  );

  assert.match(arch, /\{implemented\} K2\.1 Authority Store/);
  assert.match(arch, /\{target\} Headless Conformance Host \+ adapter real \+ CapabilityProof \(K2a\)/);
  assert.match(arch, /\{target\} Candidate freeze universal/);
  assert.match(arch, /\{target\} CandidateEvaluationAttestation/);
  assert.match(arch, /\{target\}.*DeliveryAuthorization/);

  assert.match(roadmap, /K2\.1.*\*\*done\*\*|Authority Store \(CAS\).*v2\.39\.0/i);
  assert.match(roadmap, /Next eligible:.*K2a/s);
  assert.doesNotMatch(arch, /\{target\} Authority Store con CAS, OperationPermit/);
});
