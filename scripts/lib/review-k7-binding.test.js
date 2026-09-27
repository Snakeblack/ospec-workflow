"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { freezeCandidate, computeSourceSnapshotId } = require("./execution-identities/index.js");
const { compileExecutionGraph, createPolicySnapshot } = require("./execution-graph/index.js");
const { computeTreeDigest } = require("./worker-workspace.js");
const { verifyCandidate } = require("./independent-verifier/index.js");
const { createTestRunnerReceiptChannel } = require("./test-support/k6b-runner-receipt.js");
const {
  createK7ReviewSelection,
  parseK7ReviewRules,
} = require("./review-k7-binding.js");

const NODE = {
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
};
const OBLIGATION = {
  id: "req-repair-001",
  criticality: "must",
  implemented_by: ["repair-core"],
  required_evidence: ["ev:test-pass"],
};
const CONTRACT = {
  schema_version: 1,
  contract_id: "contract:k7-binding",
  family: "repair",
  version: 1,
  contract_digest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  source_snapshot_id: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  obligations: [OBLIGATION],
};

function makeK6bResult(effectiveRules, { obligations = [OBLIGATION] } = {}) {
  const files = { "src/index.js": "module.exports = 1;\n" };
  const tree = computeTreeDigest(files);
  const candidate = freezeCandidate({
    repository_id: "k7-review-binding",
    projection: "workspace",
    base_tree: tree,
    candidate_tree: tree,
    diff_hash: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
    paths: Object.keys(files),
  });
  const sourceSnapshot = {
    schema_version: 1,
    repository_id: candidate.repository_id,
    base_tree_digest: candidate.base_tree,
    projection: candidate.projection,
    dependency_digests: [],
  };
  sourceSnapshot.source_snapshot_id = computeSourceSnapshotId(sourceSnapshot);
  const contract = { ...CONTRACT, source_snapshot_id: sourceSnapshot.source_snapshot_id, obligations };
  const policySnapshot = createPolicySnapshot({ effectiveRules });
  const executionGraph = compileExecutionGraph({
    contract,
    policySnapshot,
    sourceSnapshot,
    nodes: [NODE],
    obligations,
  });
  const rawEvidence = [
    ["acceptance", "acceptance: ok"],
    ["invariants", "invariants: ok"],
    ["contract", "contract: ok"],
    ["negative", "negative: rejects forged input"],
  ].map(([role, bytes]) => ({
    bytes,
    provenance: "runtime-observed",
    origin: `role:${role}`,
    node_id: NODE.node_id,
  }));
  const receiptSpecs = ["acceptance", "invariants", "contract", "negative"].map((role) => ({
    role,
    node_id: NODE.node_id,
    evidence_requirements_satisfied: ["ev:test-pass"],
  }));
  const runnerReceiptChannel = createTestRunnerReceiptChannel({
    candidate,
    executionGraph,
    rawEvidence,
    receiptSpecs,
    collector: { id: "node-test", transport: "tool-execution-transport" },
  });
  const verified = verifyCandidate({
    candidate,
    executionGraph,
    policySnapshot,
    contract,
    sourceSnapshot,
    repository: { files },
    collector: { id: "node-test", transport: "tool-execution-transport" },
    declaredStrategy: "feature",
    rawEvidence,
    runnerReceiptChannel,
  });
  assert.equal(verified.ok, true, verified.error || verified.reason_code);
  return {
    candidate,
    sourceSnapshot,
    contract,
    policySnapshot,
    executionGraph,
    k6b: {
      verification: verified.verification,
      assurance_graph: verified.assurance_graph,
      evidence: verified.evidence,
      assessments: verified.assessments,
      replay_evidence: verified.replay_evidence,
      runner_receipt_channel: runnerReceiptChannel,
    },
  };
}

function selectionInput(effectiveRules, residual, options) {
  return { ...makeK6bResult(effectiveRules, options), residual };
}

function selfAssertedNoModelDischarge(input) {
  // This has the former K7-1 shape, but its caller-controlled reference cannot
  // establish an independent coverage denominator.
  return {
    kind: "k7-independent-discharge/v1",
    discharge_id: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    candidate_id: input.candidate.candidate_id,
    residual_digest: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    independent_reference: "audit:independent-coverage:fixture-001",
    reference_digest: "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
    policy_audit: {
      kind: "k7-policy-audit/v1",
      audit_id: "sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
      policy_snapshot_id: input.policySnapshot.snapshot_id,
      policy_bundle_digest: input.policySnapshot.policy_bundle_digest,
      rule: "k7/v1:no-model=allow",
    },
  };
}

test("K7-1 selects different required domains for the same contract-covered material obligation under different policies", () => {
  const residual = { obligations: [{ id: OBLIGATION.id, material: true }], signals: [] };
  const runtime = createK7ReviewSelection(selectionInput([
    "generic-k4a-rule",
    `k7/v1:obligation:${OBLIGATION.id}=runtime`,
    "k7/v1:no-model=deny",
  ], residual));
  const trust = createK7ReviewSelection(selectionInput([
    "generic-k4a-rule",
    `k7/v1:obligation:${OBLIGATION.id}=trust`,
    "k7/v1:no-model=deny",
  ], residual));

  assert.equal(runtime.ok, true, runtime.error);
  assert.equal(trust.ok, true, trust.error);
  assert.deepEqual(runtime.selection.selected_domains, ["runtime"]);
  assert.deepEqual(trust.selection.selected_domains, ["trust"]);
  assert.notEqual(runtime.binding_id, trust.binding_id);
  assert.equal(Object.isFrozen(runtime.binding), true);
  assert.throws(() => { runtime.binding.selection.selected_domains.push("trust"); }, TypeError);
});

test("K7-1 rejects unknown, duplicate, and conflicting K7 rule grammar", () => {
  for (const rules of [
    ["k7/v1:signal:network-flow=runtime", "k7/v1:unknown=value"],
    ["k7/v1:signal:network-flow=runtime", "k7/v1:signal:network-flow=runtime"],
    ["k7/v1:signal:network-flow=runtime", "k7/v1:signal:network-flow=trust"],
    ["k7/v2:signal:network-flow=runtime"],
  ]) {
    const parsed = parseK7ReviewRules(rules);
    assert.equal(parsed.ok, false, rules.join(","));
    assert.equal(parsed.reason_code, "K7_POLICY_RULE_INVALID");
  }
});

test("K7-1 fails closed for forged Candidate, PolicySnapshot, K6b evidence, and graph", () => {
  const residual = { obligations: [{ id: OBLIGATION.id, material: true }], signals: [] };
  const base = selectionInput([`k7/v1:obligation:${OBLIGATION.id}=runtime`], residual);
  const forgedCandidate = createK7ReviewSelection({
    ...base,
    candidate: { ...base.candidate, candidate_id: "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff" },
  });
  assert.equal(forgedCandidate.ok, false);
  assert.equal(forgedCandidate.reason_code, "K7_CANDIDATE_INVALID");

  const forgedPolicy = createK7ReviewSelection({
    ...base,
    policySnapshot: { ...base.policySnapshot, snapshot_id: "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff" },
  });
  assert.equal(forgedPolicy.ok, false);
  assert.equal(forgedPolicy.reason_code, "K7_POLICY_INVALID");

  const forgedEvidence = createK7ReviewSelection({
    ...base,
    k6b: {
      ...base.k6b,
      replay_evidence: [{ ...base.k6b.replay_evidence[0], bytes: "forged evidence bytes" }, ...base.k6b.replay_evidence.slice(1)],
    },
  });
  assert.equal(forgedEvidence.ok, false);
  assert.equal(forgedEvidence.reason_code, "K7_K6B_INVALID");

  const forgedGraph = createK7ReviewSelection({
    ...base,
    k6b: { ...base.k6b, assurance_graph: { ...base.k6b.assurance_graph, graph_id: "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff" } },
  });
  assert.equal(forgedGraph.ok, false);
  assert.equal(forgedGraph.reason_code, "K7_GRAPH_INVALID");
});

test("K7-1 rejects omitted contract obligations and unproven caller signals", () => {
  const rules = [
    `k7/v1:obligation:${OBLIGATION.id}=runtime`,
    "k7/v1:signal:network-flow=trust",
  ];
  const omitted = createK7ReviewSelection(selectionInput(rules, { obligations: [], signals: [] }));
  assert.equal(omitted.ok, false);
  assert.equal(omitted.reason_code, "K7_RESIDUAL_INCOMPLETE");

  const callerSignal = createK7ReviewSelection(selectionInput(rules, {
    obligations: [{ id: OBLIGATION.id, material: true }],
    signals: [{ id: "network-flow", material: true }],
  }));
  assert.equal(callerSignal.ok, false);
  assert.equal(callerSignal.reason_code, "K7_SIGNAL_DENOMINATOR_UNAVAILABLE");
});

test("K7-1 requires one recomputed SourceSnapshot for Candidate and ExecutionGraph", () => {
  const base = selectionInput([`k7/v1:obligation:${OBLIGATION.id}=runtime`], {
    obligations: [{ id: OBLIGATION.id, material: true }],
    signals: [],
  });
  const foreignSource = { ...base.sourceSnapshot, repository_id: "different-repository" };
  foreignSource.source_snapshot_id = computeSourceSnapshotId(foreignSource);
  const mismatch = createK7ReviewSelection({ ...base, sourceSnapshot: foreignSource });
  assert.equal(mismatch.ok, false);
  assert.equal(mismatch.reason_code, "K7_SOURCE_SNAPSHOT_INVALID");
});

test("K7-1 rejects K6b evidence cross-substitution after replay validation", () => {
  const base = selectionInput([`k7/v1:obligation:${OBLIGATION.id}=runtime`], {
    obligations: [{ id: OBLIGATION.id, material: true }],
    signals: [],
  });
  const substituted = createK7ReviewSelection({
    ...base,
    k6b: {
      ...base.k6b,
      evidence: [{ ...base.k6b.evidence[0], origin: "cross-substituted" }, ...base.k6b.evidence.slice(1)],
    },
  });
  assert.equal(substituted.ok, false);
  assert.equal(substituted.reason_code, "K7_K6B_EVIDENCE_DIVERGENCE");
});

test("K7-1 defers no-model admission because K6b and contract APIs cannot prove an independent residual denominator", () => {
  const input = selectionInput(["k7/v1:no-model=allow"], { obligations: [], signals: [] }, { obligations: [] });
  const missing = createK7ReviewSelection(input);
  assert.equal(missing.ok, false);
  assert.equal(missing.reason_code, "K7_NO_MODEL_DEFERRED");

  // A fully shaped, policy-bound caller assertion remains insufficient. K7-2
  // must introduce an independently validated coverage source before admission.
  const asserted = createK7ReviewSelection({ ...input, no_model_discharge: selfAssertedNoModelDischarge(input) });
  assert.equal(asserted.ok, false);
  assert.equal(asserted.reason_code, "K7_NO_MODEL_DEFERRED");
});
