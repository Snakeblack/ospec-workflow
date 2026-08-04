"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const {
  FORBIDDEN_SYMBOL_PATTERNS,
  FORBIDDEN_MODULE_PATTERNS,
  scanSourceForScopeViolations,
  assertK2SourceInScope,
  listK2ProductionSources,
  assertK2TreeInScope,
} = require("./scope-guard.js");

const ROOT = path.resolve(__dirname, "..", "..", "..");
const KERNEL_DIR = path.join(ROOT, "scripts", "lib", "lifecycle-kernel");

test("scope-guard exports forbidden host/Candidate/budget/attestation/delivery patterns", () => {
  assert.ok(Array.isArray(FORBIDDEN_SYMBOL_PATTERNS));
  assert.ok(FORBIDDEN_SYMBOL_PATTERNS.length >= 5);
  const joined = FORBIDDEN_SYMBOL_PATTERNS.map(String).join(" ");
  assert.match(joined, /HostCapabilities/);
  assert.match(joined, /ExecutionGraph|execution_graph|execution-graph/i);
  assert.match(joined, /productiveBudget|productive_budget|productive-budget/i);
  assert.match(joined, /attestation/i);
  assert.match(joined, /deliveryAuthorization|delivery_authorization|delivery-auth/i);
  assert.match(joined, /CandidateIdentity|candidate_identity|createCandidate\b/i);

  assert.ok(Array.isArray(FORBIDDEN_MODULE_PATTERNS));
  assert.ok(FORBIDDEN_MODULE_PATTERNS.length >= 3);
});

test("scanSourceForScopeViolations rejects HostCapabilities and Candidate APIs", () => {
  const hostViolation = scanSourceForScopeViolations(
    'function boot(host) { return host.HostCapabilities.open(); }\n',
    "synthetic-host.js"
  );
  assert.equal(hostViolation.ok, false);
  assert.ok(hostViolation.violations.some((v) => /HostCapabilities/.test(v.pattern)));

  const candidateViolation = scanSourceForScopeViolations(
    "const id = createCandidate({ subject: 'x' });\n",
    "synthetic-candidate.js"
  );
  assert.equal(candidateViolation.ok, false);
  assert.ok(candidateViolation.violations.length >= 1);

  const clean = scanSourceForScopeViolations(
    "function reduceLifecycle(state, action) { return { state, effects: [], events: [], outcome: 'advanced' }; }\n",
    "reducer.js"
  );
  assert.equal(clean.ok, true);
  assert.deepEqual(clean.violations, []);
});

test("scanSourceForScopeViolations rejects productive budget, attestation and delivery modules", () => {
  const budget = scanSourceForScopeViolations(
    "exports.enforce = function enforce(productiveBudget) { return productiveBudget.remaining; };\n",
    "budget.js"
  );
  assert.equal(budget.ok, false);

  const attestation = scanSourceForScopeViolations(
    "function verifyAttestation(token) { return token.ok; }\n",
    "attestation.js"
  );
  assert.equal(attestation.ok, false);

  const delivery = scanSourceForScopeViolations(
    "module.exports = { deliveryAuthorization: true };\n",
    "delivery.js"
  );
  assert.equal(delivery.ok, false);

  const executionGraph = scanSourceForScopeViolations(
    "const g = new ExecutionGraph();\n",
    "graph.js"
  );
  assert.equal(executionGraph.ok, false);
});

test("assertK2SourceInScope throws with stable code on violation", () => {
  assert.throws(
    () => assertK2SourceInScope("const HostCapabilities = {};\n", "bad.js"),
    (error) => {
      assert.equal(error.code, "k2-scope-violation");
      assert.match(String(error.message), /HostCapabilities/);
      return true;
    }
  );
  assert.doesNotThrow(() =>
    assertK2SourceInScope("const KERNEL_VERSION = 1;\n", "ok.js")
  );
});

test("assertK2TreeInScope scans production modules under lifecycle-kernel", () => {
  assert.ok(fs.existsSync(KERNEL_DIR), "lifecycle-kernel directory must exist");
  const sources = listK2ProductionSources(KERNEL_DIR);
  assert.ok(Array.isArray(sources));
  assert.ok(
    sources.some((p) => p.replace(/\\/g, "/").endsWith("scope-guard.js")),
    "scope-guard.js must be among production sources"
  );
  const result = assertK2TreeInScope(KERNEL_DIR);
  assert.equal(result.ok, true);
  assert.ok(result.scanned >= 1);
});
