"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { validateObligationManifest } = require("./obligation-manifest.js");

const validNodes = [
  { node_id: "node-repair-1", operation: "apply_repair_patch" },
  { node_id: "node-verify-1", operation: "verify_repair_conformance" },
];

test("ObligationManifest: valid manifest with all MUST obligations mapped passes", () => {
  const obligations = [
    {
      id: "req-001",
      criticality: "must",
      implemented_by: ["node-repair-1"],
      required_evidence: ["ev:unit-test"],
    },
    {
      id: "req-002",
      criticality: "must",
      implemented_by: ["node-verify-1"],
      required_evidence: ["ev:verify-report"],
    },
    {
      id: "req-003",
      criticality: "should",
      implemented_by: [],
      required_evidence: [],
    },
  ];

  const result = validateObligationManifest(obligations, validNodes);
  assert.equal(result.valid, true);
  assert.deepEqual(result.unmapped, []);
  assert.deepEqual(result.missingEvidence, []);
  assert.deepEqual(result.errors, []);
});

test("ObligationManifest: orphan MUST obligation with empty implemented_by fails closed", () => {
  const obligations = [
    {
      id: "req-orphan",
      criticality: "must",
      implemented_by: [],
      required_evidence: ["ev:test"],
    },
  ];

  const result = validateObligationManifest(obligations, validNodes);
  assert.equal(result.valid, false);
  assert.ok(result.unmapped.includes("req-orphan"));
  assert.ok(result.errors.length > 0);
});

test("ObligationManifest: MUST obligation missing required_evidence fails closed", () => {
  const obligations = [
    {
      id: "req-no-ev",
      criticality: "must",
      implemented_by: ["node-repair-1"],
      required_evidence: [],
    },
  ];

  const result = validateObligationManifest(obligations, validNodes);
  assert.equal(result.valid, false);
  assert.ok(result.missingEvidence.includes("req-no-ev"));
  assert.ok(result.errors.length > 0);
});

test("ObligationManifest: MUST obligation with valid approved deferral passes", () => {
  const obligations = [
    {
      id: "req-deferred-must",
      criticality: "must",
      implemented_by: [],
      required_evidence: [],
      deferred: {
        reason: "Hardening deferred with maintainer approval",
        approved_by: "maintainer-lead",
      },
    },
  ];

  const result = validateObligationManifest(obligations, validNodes);
  assert.equal(result.valid, true);
  assert.deepEqual(result.unmapped, []);
  assert.deepEqual(result.missingEvidence, []);
});

test("ObligationManifest: referenced node_id not present in graph nodes fails closed", () => {
  const obligations = [
    {
      id: "req-unknown-node",
      criticality: "must",
      implemented_by: ["non-existent-node-id"],
      required_evidence: ["ev:test"],
    },
  ];

  const result = validateObligationManifest(obligations, validNodes);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes("non-existent-node-id")));
});
