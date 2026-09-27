"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { freezeCandidate, computeSourceSnapshotId } = require("./execution-identities/index.js");
const { startK7ReviewLineage, beginLens, recordLensResult, freezeFindings, beginCorrection, recordCorrection, applyTargetedValidation, createSuccessor } = require("./review-lineage.js");
const { planLineageGate } = require("./review-gate-state.js");
const { compileExecutionGraph, createPolicySnapshot } = require("./execution-graph/index.js");
const { computeTreeDigest } = require("./worker-workspace.js");
const { verifyCandidate } = require("./independent-verifier/index.js");
const { createTestRunnerReceiptChannel } = require("./test-support/k6b-runner-receipt.js");
const {
  createK7ReviewSelection,
  parseK7ReviewRules,
  countCanonicalCandidateDiff,
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

function makeK6bResult(effectiveRules, { obligations = [OBLIGATION], diffText = undefined } = {}) {
  const files = { "src/index.js": "module.exports = 1;\n" };
  const tree = computeTreeDigest(files);
  const candidate = freezeCandidate({
    repository_id: "k7-review-binding",
    projection: "workspace",
    base_tree: tree,
    candidate_tree: tree,
    ...(diffText === undefined
      ? { diff_hash: "sha256:1111111111111111111111111111111111111111111111111111111111111111" }
      : { diffText }),
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

function issueK7Binding(effectiveRules, residual, options) {
  const input = selectionInput(effectiveRules, residual, options);
  const issued = createK7ReviewSelection(input);
  assert.equal(issued.ok, true, issued.error || issued.reason_code);
  return { input, binding: issued.binding };
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

test("K7 canonical diff counter deterministically rejects malformed or truncated line claims", () => {
  const diff = [
    "diff --git a/src/index.js b/src/index.js",
    "--- a/src/index.js",
    "+++ b/src/index.js",
    "@@ -1 +1 @@",
    "-module.exports = 0;",
    "+module.exports = 1;",
  ].join("\n");
  assert.deepEqual(countCanonicalCandidateDiff(diff), {
    added_lines: 1, removed_lines: 1, changed_lines: 2, paths: ["src/index.js"],
  });
  assert.throws(() => countCanonicalCandidateDiff(diff.replace("@@ -1 +1 @@", "@@ -2 +1,2 @@")), /count mismatch/i);
  assert.throws(() => countCanonicalCandidateDiff(diff.replace("+++ b/src/index.js", "+++ b/../escape.js")), /marker|path/i);
});

const K7_DIFF = [
  "diff --git a/src/index.js b/src/index.js",
  "--- a/src/index.js",
  "+++ b/src/index.js",
  "@@ -1 +1 @@",
  "-module.exports = 0;",
  "+module.exports = 1;",
].join("\n");

function correctedK7Candidate(predecessor) {
  return freezeCandidate({
    repository_id: predecessor.repository_id,
    projection: predecessor.projection,
    base_tree: predecessor.base_tree,
    candidate_tree: `sha256:${"f".repeat(64)}`,
    diffText: K7_DIFF,
    paths: predecessor.paths,
    predecessorCandidate: predecessor,
  });
}

test("K7 lineage revalidates issuance, records corrections, and blocks policy drift", () => {
  const { binding, input } = issueK7Binding([`k7/v1:obligation:${OBLIGATION.id}=runtime`], {
    obligations: [{ id: OBLIGATION.id, material: true }], signals: [],
  }, { diffText: K7_DIFF });
  const forgedBody = { ...binding, selection: { ...binding.selection, selected_domains: ["trust"] } };
  delete forgedBody.binding_id;
  forgedBody.binding_id = require("./canonical-json.js").sha256Fingerprint("k7-review-binding/v1", forgedBody);
  assert.throws(() => startK7ReviewLineage(forgedBody, { candidate_diff: K7_DIFF }), /issuance|integrity/i);

  let lineage = startK7ReviewLineage(binding, { candidate_diff: K7_DIFF });
  lineage = beginLens(lineage, { dimension: "runtime", expected_revision: lineage.revision, request_id: "runtime-start" });
  lineage = recordLensResult(lineage, {
    dimension: "runtime", expected_revision: lineage.revision, request_id: "runtime-result",
    result: { findings: [{ severity: "CRITICAL", summary: "repair boundary", acceptance_criteria: "preserve K7 binding" }] },
  });
  lineage = freezeFindings(lineage, { expected_revision: lineage.revision, request_id: "freeze", issuance: input });
  const finding = lineage.findings[0].id;
  lineage = beginCorrection(lineage, {
    expected_revision: lineage.revision, request_id: "correct", finding_ids: [finding], paths: ["src/index.js"],
    base_candidate_id: lineage.current_candidate_id, forecast_lines: 1,
  });
  const corrected = correctedK7Candidate(lineage.current_candidate);
  lineage = recordCorrection(lineage, {
    expected_revision: lineage.revision, request_id: "record", base_candidate_id: lineage.pending_correction.base_candidate_id,
    paths: ["src/index.js"], actual_changed_lines: 1, corrected_candidate: corrected,
  });
  lineage = applyTargetedValidation(lineage, {
    expected_revision: lineage.revision, request_id: "validate", outcomes: [{ id: finding, status: "resolved" }],
    regression: { detected: false, evidence: ["focused test passed"] }, follow_ups: [],
  });
  assert.equal(lineage.status, "approved");
  assert.equal(lineage.correction_budget.used_lines, 1);
  const admitted = planLineageGate({
    lineage, observed_candidate_id: lineage.current_candidate_id,
    observed_binding_id: binding.binding_id, observed_policy_snapshot_id: binding.policy_snapshot_id, issuance: input, downstream_gate: "archive",
  });
  assert.equal(admitted.archive_allowed, true);
  const drifted = planLineageGate({
    lineage, observed_candidate_id: lineage.current_candidate_id,
    observed_binding_id: binding.binding_id, observed_policy_snapshot_id: `sha256:${"e".repeat(64)}`, downstream_gate: "archive",
  });
  assert.equal(drifted.status, "policy-drift");
  assert.equal(drifted.archive_allowed, false);
});

test("K7 authority transitions require issuance replay and successors replay new issuance", () => {
  const { binding, input } = issueK7Binding([`k7/v1:obligation:${OBLIGATION.id}=runtime`], {
    obligations: [{ id: OBLIGATION.id, material: true }], signals: [],
  }, { diffText: K7_DIFF });
  let lineage = startK7ReviewLineage(binding, { candidate_diff: K7_DIFF });
  lineage = beginLens(lineage, { dimension: "runtime", expected_revision: lineage.revision, request_id: "empty-start" });
  lineage = recordLensResult(lineage, { dimension: "runtime", expected_revision: lineage.revision, request_id: "empty-result", result: { findings: [] } });
  assert.throws(() => freezeFindings(lineage, { expected_revision: lineage.revision, request_id: "missing-issuance" }), /K7_ISSUANCE_REPLAY_REQUIRED/);

  const mutated = structuredClone(lineage);
  mutated.genesis.k7_binding.policy_snapshot_id = `sha256:${"d".repeat(64)}`;
  const { binding_id: _ignored, ...mutatedBody } = mutated.genesis.k7_binding;
  mutated.genesis.k7_binding.binding_id = require("./canonical-json.js").sha256Fingerprint("k7-review-binding/v1", mutatedBody);
  mutated.binding_id = mutated.genesis.k7_binding.binding_id;
  mutated.policy_snapshot_id = mutated.genesis.k7_binding.policy_snapshot_id;
  mutated.lineage_id = require("./canonical-json.js").sha256Fingerprint("review-lineage-v3", {
    binding_id: mutated.binding_id, candidate_id: mutated.genesis.candidate_id, paths: mutated.genesis.paths,
    added_lines: mutated.genesis.authored_lines, removed_lines: mutated.genesis.removed_lines,
    selected_domains: mutated.genesis.selected_domains, generation: mutated.generation,
    predecessor_lineage_id: mutated.predecessor_lineage_id,
  });
  assert.throws(() => freezeFindings(mutated, { expected_revision: mutated.revision, request_id: "forged-issuance", issuance: input }), /K7_ISSUANCE_REPLAY_REQUIRED/);

  lineage = freezeFindings(lineage, { expected_revision: lineage.revision, request_id: "approved", issuance: input });
  const successorIssue = issueK7Binding([`k7/v1:obligation:${OBLIGATION.id}=trust`], {
    obligations: [{ id: OBLIGATION.id, material: true }], signals: [],
  }, { diffText: K7_DIFF });
  const approvals = [{ id: "architecture-bounded-review-001", applies_to: ["sdd-verify"] }];
  const successorBase = {
    reason: "policy selection changed", authority_kind: "new-scope",
    approval_reference: "architecture-bounded-review-001", approvals,
    reducerContext: { candidate_diff: K7_DIFF },
  };
  assert.throws(() => createSuccessor(lineage, successorBase), /K7_ISSUANCE_REPLAY_REQUIRED/);
  const successor = createSuccessor(lineage, { ...successorBase, issuance: successorIssue.input, binding: successorIssue.binding });
  assert.equal(successor.schema_version, 3);
  assert.equal(successor.generation, 2);
  assert.equal(successor.genesis.k7_binding.binding_id, successorIssue.binding.binding_id);
});

test("K7 remediation slices share one global correction budget", () => {
  const secondObligation = { ...OBLIGATION, id: "req-repair-002" };
  const diff = [
    "diff --git a/src/index.js b/src/index.js",
    "--- a/src/index.js",
    "+++ b/src/index.js",
    "@@ -1,2 +1,2 @@",
    "-module.exports = 0;",
    "-module.exports = 1;",
    "+module.exports = 2;",
    "+module.exports = 3;",
  ].join("\n");
  const { binding, input } = issueK7Binding([
    `k7/v1:obligation:${OBLIGATION.id}=runtime`,
    `k7/v1:obligation:${secondObligation.id}=trust`,
  ], {
    obligations: [
      { id: OBLIGATION.id, material: true },
      { id: secondObligation.id, material: true },
    ],
    signals: [],
  }, { obligations: [OBLIGATION, secondObligation], diffText: diff });
  let lineage = startK7ReviewLineage(binding, { candidate_diff: diff });
  for (const domain of ["trust", "runtime"]) {
    lineage = beginLens(lineage, { dimension: domain, expected_revision: lineage.revision, request_id: `${domain}-start` });
    lineage = recordLensResult(lineage, {
      dimension: domain, expected_revision: lineage.revision, request_id: `${domain}-result`,
      result: { findings: [{ severity: "CRITICAL", summary: `repair ${domain}`, acceptance_criteria: `preserve ${domain}` }] },
    });
  }
  lineage = freezeFindings(lineage, { expected_revision: lineage.revision, request_id: "freeze", remediation_v2: true, issuance: input });
  const firstSlice = lineage.slice_order[0];
  const firstFindingIds = lineage.correction_slices[firstSlice].finding_ids;
  lineage = beginCorrection(lineage, {
    expected_revision: lineage.revision, request_id: "slice-one", slice_id: firstSlice,
    finding_ids: firstFindingIds, paths: ["src/index.js"], base_candidate_id: lineage.current_candidate_id, forecast_lines: 2,
  });
  const corrected = freezeCandidate({
    repository_id: lineage.current_candidate.repository_id, projection: lineage.current_candidate.projection,
    base_tree: lineage.current_candidate.base_tree, candidate_tree: `sha256:${"e".repeat(64)}`,
    diffText: diff, paths: lineage.current_candidate.paths, predecessorCandidate: lineage.current_candidate,
  });
  lineage = recordCorrection(lineage, {
    expected_revision: lineage.revision, request_id: "slice-one-record", base_candidate_id: lineage.pending_correction.base_candidate_id,
    paths: ["src/index.js"], actual_changed_lines: 2, corrected_candidate: corrected,
  });
  lineage = applyTargetedValidation(lineage, {
    expected_revision: lineage.revision, request_id: "slice-one-validate",
    outcomes: firstFindingIds.map((id) => ({ id, status: "resolved" })),
    regression: { detected: false, evidence: ["slice validation passed"] }, follow_ups: [],
  });
  assert.equal(lineage.correction_budget.used_lines, 2);
  const resetBudget = { ...lineage, correction_budget: { ...lineage.correction_budget, used_lines: 0 } };
  assert.throws(() => beginCorrection(resetBudget, {
    expected_revision: resetBudget.revision, request_id: "persisted-reset", slice_id: lineage.slice_order[1],
    finding_ids: lineage.correction_slices[lineage.slice_order[1]].finding_ids, paths: ["src/index.js"],
    base_candidate_id: lineage.current_candidate_id, forecast_lines: 1,
  }), /global remediation budget integrity/i);
  const resetSlice = structuredClone(lineage);
  resetSlice.correction_slices[firstSlice].used_lines = 0;
  assert.throws(() => beginCorrection(resetSlice, {
    expected_revision: resetSlice.revision, request_id: "slice-reset", slice_id: resetSlice.slice_order[1],
    finding_ids: resetSlice.correction_slices[resetSlice.slice_order[1]].finding_ids, paths: ["src/index.js"],
    base_candidate_id: resetSlice.current_candidate_id, forecast_lines: 1,
  }), /global remediation budget integrity/i);
  const secondSlice = lineage.slice_order.find((id) => id !== firstSlice);
  assert.throws(() => beginCorrection(lineage, {
    expected_revision: lineage.revision, request_id: "slice-two", slice_id: secondSlice,
    finding_ids: lineage.correction_slices[secondSlice].finding_ids, paths: ["src/index.js"],
    base_candidate_id: lineage.current_candidate_id, forecast_lines: 1,
  }), /global correction forecast/i);
});

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
