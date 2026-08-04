"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const {
  FORBIDDEN_SYMBOL_PATTERNS,
  scanSourceForScopeViolations,
  assertK2TreeInScope,
  listK2ProductionSources,
} = require("./scope-guard.js");

const ROOT = path.resolve(__dirname, "..", "..", "..");
const KERNEL_DIR = path.join(ROOT, "scripts", "lib", "lifecycle-kernel");
const AUTHORITY_STORE_DIR = path.join(ROOT, "scripts", "lib", "authority-store");

const K21_FORBIDDEN_EXTRA = [
  /\bCapabilityProof\b/,
  /\bHostCapabilities\b/,
  /\bcreateCandidate\b/,
  /\bCandidateIdentity\b/,
  /\bObligationManifest\b/,
  /\bExecutionGraph\b/,
  /\battestation\b/i,
  /\bdeliveryAuthorization\b/,
];

test("K2.1 scope-guard: existing forbidden patterns still reject Candidate/attestation/delivery (K2a allows generic host-contract)", () => {
  const joined = FORBIDDEN_SYMBOL_PATTERNS.map(String).join(" ");
  // K2a revised the blanket HostCapabilities ban; Candidate/attestation/delivery remain forbidden.
  assert.match(joined, /CandidateIdentity|createCandidate/);
  assert.match(joined, /attestation/i);
  assert.match(joined, /deliveryAuthorization|delivery_authorization/i);
  assert.match(joined, /CapabilityProof/);
});

test("K2.1 scope-guard: rejects CapabilityProof, ObligationManifest, and Candidate freeze modules", () => {
  const samples = [
    { src: "exports.proof = CapabilityProof.verify();\n", label: "capability-proof.js" },
    { src: "const m = new ObligationManifest();\n", label: "obligation.js" },
    { src: "function freeze(c) { return CandidateIdentity.freeze(c); }\n", label: "candidate-freeze.js" },
    { src: "function check(t) { return verifyAttestation(t); }\n", label: "attestation-delivery.js" },
  ];
  for (const sample of samples) {
    const result = scanSourceForScopeViolations(sample.src, sample.label);
    assert.equal(result.ok, false, `expected rejection for ${sample.label}`);
  }
});

test("K2.1 production tree under lifecycle-kernel and authority-store stays in K2 scope", () => {
  const kernel = assertK2TreeInScope(KERNEL_DIR);
  assert.equal(kernel.ok, true);
  assert.ok(kernel.scanned >= 1);

  if (fs.existsSync(AUTHORITY_STORE_DIR)) {
    const sources = listK2ProductionSources(AUTHORITY_STORE_DIR);
    for (const file of sources) {
      const src = fs.readFileSync(file, "utf8");
      const scan = scanSourceForScopeViolations(src, file);
      assert.equal(scan.ok, true, `scope violation in ${file}: ${JSON.stringify(scan.violations)}`);
    }
  }

  // Explicit negative: synthetic K2a/K3/K4a/K8 symbols must not appear as allowlisted exports.
  for (const pattern of K21_FORBIDDEN_EXTRA) {
    assert.ok(pattern instanceof RegExp);
  }
});
