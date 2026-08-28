"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");

const { freezeCandidate } = require("../../scripts/lib/execution-identities/index.js");
const { compileExecutionGraph, createPolicySnapshot } = require("../../scripts/lib/execution-graph/index.js");
const { computeTreeDigest } = require("../../scripts/lib/worker-workspace.js");
const { verifyCandidate } = require("../../scripts/lib/independent-verifier/index.js");
const {
  reconcileAssuranceGraph,
  replayAssuranceGraph,
  projectAssuranceGraph,
} = require("../../scripts/lib/assurance-graph/index.js");

const SAMPLE_NODES = [
  {
    node_id: "repair-core",
    kind: "repair-action/v1",
    operation: "apply_repair_patch",
    objective: "Apply repair changes",
    dependencies: [],
    ownership: { owner: "agent:repair", mode: "exclusive" },
    allowed_paths: ["src/index.js"],
    invariants: ["inv-fail-closed"],
    required_evidence: ["ev:test-pass"],
    budget_ref: "budget:default",
  },
];

const SAMPLE_OBLIGATIONS = [
  {
    id: "req-repair-001",
    criticality: "must",
    implemented_by: ["repair-core"],
    required_evidence: ["ev:test-pass"],
  },
];

function buildHarness(files = { "src/index.js": "module.exports = 1;\n" }) {
  const tree = computeTreeDigest(files);
  const candidate = freezeCandidate({
    repository_id: "k6b-e2e-repo",
    projection: "workspace",
    base_tree: tree,
    candidate_tree: tree,
    diff_hash: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
    paths: Object.keys(files),
  });
  const policySnapshot = createPolicySnapshot({ effectiveRules: ["rule-fail-closed"] });
  const contract = {
    schema_version: 1,
    contract_id: "contract:k6b-e2e",
    family: "repair",
    version: 1,
    contract_digest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    source_snapshot_id: "sha256:4444444444444444444444444444444444444444444444444444444444444444",
    obligations: SAMPLE_OBLIGATIONS,
  };
  const executionGraph = compileExecutionGraph({
    contract,
    policySnapshot,
    nodes: SAMPLE_NODES,
    obligations: SAMPLE_OBLIGATIONS,
  });
  return {
    candidate,
    executionGraph,
    policySnapshot,
    contract,
    repository: { files },
    collector: { id: "node-test", transport: "tool-execution-transport" },
  };
}

test("E2E: complete lifecycle - verification, projection, reconciliation, and cryptographic replay", () => {
  const harness = buildHarness();

  // Physical observations (pure observations without caller metadata)
  const rawEvidence = [
    { bytes: "red-test-output: assertion failed", provenance: "runtime-observed", origin: "node:test:red", node_id: "repair-core", execution_sequence: { run_id: "run-100", ordinal: 1 } },
    { bytes: "green-test-output: all tests passed", provenance: "runtime-observed", origin: "node:test:green", node_id: "repair-core", execution_sequence: { run_id: "run-100", ordinal: 2 } },
  ];

  // Runner receipts (trusted attestations)
  const runnerReceipts = [
    { role: "red", node_id: "repair-core" },
    { role: "green", node_id: "repair-core", evidence_requirements_satisfied: ["ev:test-pass"] },
  ];

  // 1. Verification
  const verificationResult = verifyCandidate({
    ...harness,
    declaredStrategy: "strict-tdd",
    rawEvidence,
    runner_receipts: runnerReceipts,
  });

  assert.equal(verificationResult.ok, true, verificationResult.error || verificationResult.reason_code);
  assert.equal(verificationResult.verification.verdict, "PASS");
  assert.equal(verificationResult.verification.candidate_id, harness.candidate.candidate_id);
  assert.equal(verificationResult.evidence.length, 2);

  // Link previous_evidence_id in second item and test chaining
  const redEvidenceId = verificationResult.evidence[0].evidence_id;
  const greenEvidenceId = verificationResult.evidence[1].evidence_id;

  // 2. Graph Projection & Reconciliation
  const projectedGraph = verificationResult.assurance_graph;
  assert.ok(projectedGraph);
  assert.equal(projectedGraph.kind, "assurance-graph/v1");

  const reconciliation = reconcileAssuranceGraph(projectedGraph, {
    candidate: harness.candidate,
    executionGraph: harness.executionGraph,
    contract: harness.contract,
    policySnapshot: harness.policySnapshot,
    evidence: verificationResult.evidence,
    assessments: verificationResult.assessments,
    verification: verificationResult.verification,
  });
  assert.equal(reconciliation.ok, true);

  // 3. Cryptographic Replay from persistable outputs
  const replayResult = replayAssuranceGraph({
    candidate: harness.candidate,
    executionGraph: harness.executionGraph,
    contract: harness.contract,
    policySnapshot: harness.policySnapshot,
    evidence: [
      { evidence: verificationResult.evidence[0], bytes: rawEvidence[0].bytes },
      { evidence: verificationResult.evidence[1], bytes: rawEvidence[1].bytes },
    ],
    assessments: verificationResult.assessments,
    verification: verificationResult.verification,
    canonical_inputs: projectedGraph.canonical_inputs,
  });
  assert.equal(replayResult.ok, true, replayResult.error || replayResult.reason_code);
  assert.equal(replayResult.graph.graph_id, projectedGraph.graph_id);
});

test("E2E Adversarial: caller metadata injection in raw evidence is rejected before evaluation", () => {
  const harness = buildHarness();

  const injectedEvidence = [
    {
      bytes: "injected-role",
      provenance: "runtime-observed",
      origin: "attacker",
      node_id: "repair-core",
      role: "green", // Caller injection attack
      evidence_requirements_satisfied: ["ev:test-pass"], // Caller injection attack
    },
  ];

  const result = verifyCandidate({
    ...harness,
    declaredStrategy: "strict-tdd",
    rawEvidence: injectedEvidence,
    runner_receipts: [{ role: "green", node_id: "repair-core" }],
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason_code, "UNTRUSTED_CALLER_METADATA");
  assert.equal(result.verification, undefined);
});

test("E2E Adversarial: causality tampering (inverted ordinals) fails closed", () => {
  const harness = buildHarness();

  const invertedEvidence = [
    { bytes: "green-output", provenance: "runtime-observed", origin: "node:test", node_id: "repair-core", execution_sequence: { run_id: "r1", ordinal: 1 } },
    { bytes: "red-output", provenance: "runtime-observed", origin: "node:test", node_id: "repair-core", execution_sequence: { run_id: "r1", ordinal: 2 } },
  ];

  const result = verifyCandidate({
    ...harness,
    declaredStrategy: "strict-tdd",
    rawEvidence: invertedEvidence,
    runner_receipts: [
      { role: "green", node_id: "repair-core" },
      { role: "red", node_id: "repair-core" },
    ],
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason_code, "STRATEGY_SEQUENCE_VIOLATION");
});

test("E2E Adversarial: missing runner receipt leaves MUST unfulfilled", () => {
  const harness = buildHarness();

  const rawEvidence = [
    { bytes: "red", provenance: "runtime-observed", origin: "node:test", node_id: "repair-core", execution_sequence: { run_id: "r1", ordinal: 1 } },
    { bytes: "green", provenance: "runtime-observed", origin: "node:test", node_id: "repair-core", execution_sequence: { run_id: "r1", ordinal: 2 } },
  ];

  // Runner receipt does not confirm satisfied evidence requirements
  const ungroundedReceipts = [
    { role: "red", node_id: "repair-core" },
    { role: "green", node_id: "repair-core" }, // Missing evidence_requirements_satisfied
  ];

  const result = verifyCandidate({
    ...harness,
    declaredStrategy: "strict-tdd",
    rawEvidence,
    runner_receipts: ungroundedReceipts,
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason_code, "UNFULFILLED_MUST");
});

test("E2E Adversarial: replayed evidence tampering (modified bytes) fails replay", () => {
  const harness = buildHarness();

  const rawEvidence = [
    { bytes: "red-test-output", provenance: "runtime-observed", origin: "node:test:red", node_id: "repair-core", execution_sequence: { run_id: "run-1", ordinal: 1 } },
    { bytes: "green-test-output", provenance: "runtime-observed", origin: "node:test:green", node_id: "repair-core", execution_sequence: { run_id: "run-1", ordinal: 2 } },
  ];
  const runnerReceipts = [
    { role: "red", node_id: "repair-core" },
    { role: "green", node_id: "repair-core", evidence_requirements_satisfied: ["ev:test-pass"] },
  ];

  const verificationResult = verifyCandidate({
    ...harness,
    declaredStrategy: "strict-tdd",
    rawEvidence,
    runner_receipts: runnerReceipts,
  });
  assert.equal(verificationResult.ok, true);

  // Tamper with bytes during replay
  const replayResult = replayAssuranceGraph({
    candidate: harness.candidate,
    executionGraph: harness.executionGraph,
    contract: harness.contract,
    policySnapshot: harness.policySnapshot,
    evidence: [
      { evidence: verificationResult.evidence[0], bytes: "tampered-red-bytes" },
      { evidence: verificationResult.evidence[1], bytes: rawEvidence[1].bytes },
    ],
    assessments: verificationResult.assessments,
    verification: verificationResult.verification,
    canonical_inputs: verificationResult.assurance_graph.canonical_inputs,
  });

  assert.equal(replayResult.ok, false);
  assert.equal(replayResult.reason_code, "GRAPH_DIVERGENCE");
});
