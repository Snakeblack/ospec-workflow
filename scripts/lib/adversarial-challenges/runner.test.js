"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const { freezeCandidate, computeSourceSnapshotId, computeWorkOrderId } = require("../execution-identities/index.js");
const { compileExecutionGraph, createPolicySnapshot } = require("../execution-graph/index.js");
const { computeTreeDigest } = require("../worker-workspace.js");
const { createChallengePlan } = require("./planner.js");
const { executeChallengePlan, emitChallengeResult } = require("./runner.js");

const DIFF = "diff --git a/src/index.js b/src/index.js\n--- a/src/index.js\n+++ b/src/index.js\n@@ -1 +1 @@\n-return a - b;\n+return a + b;\n";
const FILES = { "src/index.js": "function add(a, b) {\n  return a + b;\n}" };

function harness(strategy = "feature") {
  const tree = computeTreeDigest(FILES);
  const candidate = freezeCandidate({ repository_id: "k6c-runner", projection: "workspace", base_tree: tree, candidate_tree: tree, diffText: DIFF, paths: Object.keys(FILES) });
  const policySnapshot = createPolicySnapshot({ effectiveRules: ["fail-closed"] });
  const contract = { schema_version: 1, contract_id: "contract:k6c-runner", family: "repair", version: 1, contract_digest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", source_snapshot_id: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", obligations: [] };
  const executionGraph = compileExecutionGraph({ contract, policySnapshot, nodes: [{ node_id: "repair-focal", kind: "repair-action/v1", operation: "apply", objective: "repair", dependencies: [], ownership: { owner: "agent:test", mode: "exclusive" }, allowed_paths: ["src/index.js"], invariants: [], required_evidence: ["ev:test"], budget_ref: "budget:default" }], obligations: [] });
  const sourceSnapshot = { schema_version: 1, kind: "source-snapshot/v1", repository_id: "k6c-runner", base_tree_digest: tree, projection: "workspace", dependency_digests: [] };
  sourceSnapshot.source_snapshot_id = computeSourceSnapshotId(sourceSnapshot);
  const workOrder = { schema_version: 2, kind: "work-order/v2", source_snapshot_id: sourceSnapshot.source_snapshot_id, node_id: "repair-focal", role: "test", status: "pending", operation: "apply", objective: "execute challenge", dependencies: [], ownership: { owner: "agent:test", mode: "exclusive" }, allowed_paths: ["src/index.js"], capsule_inputs: ["src/index.js"], invariants: ["invariant"], required_evidence: ["ev:test"], budget: { model_turns: 0, patches: 0, commands: 1, wall_time_minutes: 1, changed_lines: 1 } };
  workOrder.work_order_id = computeWorkOrderId(workOrder);
  const plan = createChallengePlan({ candidateId: candidate.candidate_id, nodeId: "repair-focal", policySnapshotId: policySnapshot.snapshot_id, evidenceStrategy: strategy, budgetOverrides: { timeout_seconds: 0.02 } });
  const executor = { capabilities: { isolation: "enforced", cancellation: "enforced", challenge_types: Object.fromEntries(plan.selected.map((type) => [type, "enforced"])) }, executeChallenge: async () => ({ pass: true }) };
  return { candidate, policySnapshot, executionGraph, plan, repository: { files: FILES }, candidateDiff: DIFF, sourceSnapshot, workOrder, nodeId: "repair-focal", evidenceStrategy: strategy, executor };
}

test("REQ-adversarial-challenges-004: canonical result includes every binding and a deterministic ID", () => {
  const h = harness();
  const result = emitChallengeResult({ planId: h.plan.plan_id, candidateId: h.candidate.candidate_id, nodeId: h.plan.node_id, policySnapshotId: h.plan.policy_snapshot_id, evidenceStrategy: h.plan.evidence_strategy, challengeType: "focal-mutation", outcome: "passed" });
  assert.match(result.result_id, /^sha256:[a-f0-9]{64}$/);
  assert.equal(result.policy_snapshot_id, h.plan.policy_snapshot_id);
});

test("REQ-adversarial-challenges-004: missing capability fails before challenge effects", async () => {
  const h = harness();
  h.executor.capabilities.challenge_types["focal-mutation"] = "partial";
  const result = await executeChallengePlan(h.plan, h);
  assert.equal(result.ok, false);
  assert.equal(result.causalFailure.code, "CHALLENGE_CAPABILITY_UNAVAILABLE");
});

test("REQ-adversarial-challenges-004: focal mutation uses verified diff scope and detects complacent tests", async () => {
  const h = harness();
  h.runAcceptance = async () => ({ pass: true });
  h.runTests = async () => ({ pass: true, exitCode: 0 });
  h.mutations = [{ line: 2, col: 11, original: "+", replacement: "-" }];
  const result = await executeChallengePlan(h.plan, h);
  assert.equal(result.ok, true);
  assert.equal(result.results.find((item) => item.challenge_type === "focal-mutation").details.reason, "COMPLACENT_TEST_DETECTED");
});

test("REQ-adversarial-challenges-004: non-cooperative executor times out and cannot emit pass", async () => {
  const h = harness("migration");
  let workspaceRoot;
  h.executor.executeChallenge = async ({ workspace }) => {
    workspaceRoot = workspace.root_path;
    return new Promise(() => {});
  };
  const result = await executeChallengePlan(h.plan, h);
  assert.equal(result.ok, false);
  assert.equal(result.causalFailure.code, "CHALLENGE_TIMEOUT");
  assert.equal(result.results[0].outcome, "error");
  assert.equal(result.results[0].details.reason, "CHALLENGE_TIMEOUT");
  assert.equal(fs.existsSync(workspaceRoot), false, "workspace is disposed after timeout");
});

test("REQ-adversarial-challenges-004: Candidate tree mutation after a run invalidates the plan", async () => {
  const h = harness("migration");
  h.executor.executeChallenge = async () => {
    h.repository.files["src/index.js"] = "tampered";
    return { pass: true };
  };
  const result = await executeChallengePlan(h.plan, h);
  assert.equal(result.ok, false);
  assert.equal(result.causalFailure.code, "CHALLENGE_INTEGRITY_INVALID");
});
