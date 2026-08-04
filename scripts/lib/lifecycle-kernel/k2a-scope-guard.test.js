"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const {
  FORBIDDEN_SYMBOL_PATTERNS,
  scanSourceForScopeViolations,
  assertK2TreeInScope,
} = require("./scope-guard.js");

const ROOT = path.resolve(__dirname, "..", "..", "..");
const KERNEL_DIR = path.join(ROOT, "scripts", "lib", "lifecycle-kernel");

test("K2a scope-guard still rejects K3/K4a/K8/K10-delivery modules", () => {
  const samples = [
    { src: "function freeze(c) { return CandidateIdentity.freeze(c); }\n", label: "candidate-freeze.js" },
    { src: "const g = new ExecutionGraph();\n", label: "graph-authority.js" },
    { src: "exports.m = new ObligationManifest();\n", label: "obligation.js" },
    { src: "function check(t) { return verifyAttestation(t); }\n", label: "attestation.js" },
    { src: "const ok = deliveryAuthorization.approve();\n", label: "delivery-policy.js" },
  ];
  for (const sample of samples) {
    const result = scanSourceForScopeViolations(sample.src, sample.label);
    assert.equal(result.ok, false, sample.label);
  }
});

test("K2a scope-guard rejects concrete claude host imports; allows generic host-contract", () => {
  const concrete = scanSourceForScopeViolations(
    'const { createClaudeHostAdapter } = require("../host-adapters/claude.js");\n',
    "operations.js"
  );
  assert.equal(concrete.ok, false);

  const ask = scanSourceForScopeViolations("function map(){ return AskUserQuestion; }\n", "reducer.js");
  assert.equal(ask.ok, false);

  const generic = scanSourceForScopeViolations(
    'const { resolveCapabilityState } = require("../host-contract/index.js");\n',
    "host-boundary.js"
  );
  assert.equal(generic.ok, true);

  // HostCapabilities / createHostAdapter symbols are allowed as generic contract names.
  const joined = FORBIDDEN_SYMBOL_PATTERNS.map(String).join(" ");
  assert.doesNotMatch(joined, /HostCapabilities/);
  assert.doesNotMatch(joined, /createHostAdapter/);
});

test("K2a lifecycle-kernel production tree remains in scope", () => {
  const kernel = assertK2TreeInScope(KERNEL_DIR);
  assert.equal(kernel.ok, true);
  assert.ok(fs.existsSync(path.join(KERNEL_DIR, "host-boundary.js")));
});
