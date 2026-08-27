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
  assert.match(arch, /\{implemented\} HostCapabilities/);
  assert.match(arch, /\{implemented\} Headless Conformance Host \(K2a\)/);
  assert.match(arch, /\{implemented\} K3 cuatro identidades \+ Candidate freeze básico/);
  assert.match(arch, /\{target\} Candidate freeze gobierna apply/);
  assert.match(arch, /\{target\} CandidateEvaluationAttestation/);
  assert.match(arch, /\{target\}.*DeliveryAuthorization/);

  assert.match(roadmap, /K2\.1.*\*\*done\*\*|Authority Store \(CAS\).*v2\.39\.0/i);
  assert.doesNotMatch(arch, /\{target\} Authority Store con CAS, OperationPermit/);
});
