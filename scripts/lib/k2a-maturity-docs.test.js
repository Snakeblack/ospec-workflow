"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "..", "..");

test("K2a maturity docs tag host surfaces implemented; Candidate/attestation/delivery stay target", () => {
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
  assert.match(arch, /\{implemented\} CapabilityProof/);
  assert.match(arch, /\{implemented\} Headless Conformance Host/);
  assert.match(arch, /\{implemented\} Claude Code reference adapter|\{implemented\}.*claude.*reference adapter/i);
  assert.match(arch, /\{target\} Candidate freeze universal/);
  assert.match(arch, /\{target\} CandidateEvaluationAttestation/);
  assert.match(arch, /\{target\}.*DeliveryAuthorization/);
  assert.doesNotMatch(arch, /\{target\} Headless Conformance Host \+ adapter real \+ CapabilityProof \(K2a\)/);

  assert.match(roadmap, /K2a.*\*\*done\*\*|Headless Conformance Host.*implemented/i);
  assert.match(roadmap, /\|\s*`done`\s*\|\s*\*\*K3\*\*/);
  assert.match(roadmap, /\|\s*`done`\s*\|\s*\*\*K4b\*\*/);
  assert.match(roadmap, /\|\s*`next-eligible`\s*\|\s*\*\*K6b\*\*/);
  assert.doesNotMatch(roadmap, /\|\s*`in-progress`\s*\|\s*\*\*K4b\*\*/);
  assert.doesNotMatch(roadmap, /\|\s*`blocked`\s*\|\s*K6b\b/);
});
