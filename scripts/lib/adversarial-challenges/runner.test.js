"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const { freezeCandidate, computeSourceSnapshotId, computeWorkOrderId } = require("../execution-identities/index.js");
const { compileExecutionGraph, createPolicySnapshot } = require("../execution-graph/index.js");
const { computeTreeDigest, createWorkspace, disposeWorkspace, materializeSourceSnapshot } = require("../worker-workspace.js");
const { createChallengeBudgetTracker } = require("./budget.js");
const { createChallengePlan } = require("./planner.js");
const { executeChallengePlan, emitChallengeResult, runIsolatedMutation, runWorkspaceTests } = require("./runner.js");


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

const ADD_SOURCE = "function add(a, b) {\n  return a + b;\n}\nmodule.exports = { add };\n";
const ADD_DIFF = "diff --git a/src/add.js b/src/add.js\n--- a/src/add.js\n+++ b/src/add.js\n@@ -1,4 +1,4 @@\n function add(a, b) {\n-  return a - b;\n+  return a + b;\n }\n module.exports = { add };\n";
const DETECTING_TEST = "const assert = require(\"node:assert/strict\");\nconst test = require(\"node:test\");\nconst { add } = require(\"./add.js\");\ntest(\"adds\", () => {\n  assert.equal(add(2, 3), 5);\n});\n";
const COMPLACENT_TEST = "const assert = require(\"node:assert/strict\");\nconst test = require(\"node:test\");\ntest(\"adds\", () => {\n  assert.ok(true);\n});\n";
const TAUTOLOGICAL_TEST = "const assert = require(\"node:assert/strict\");\nconst test = require(\"node:test\");\ntest(\"tautology\", () => {\n  assert.equal(true, true);\n});\n";

function workspaceHarness(strategy, files, diffText) {
  const tree = computeTreeDigest(files);
  const candidate = freezeCandidate({
    repository_id: "k6c-runner-workspace",
    projection: "workspace",
    base_tree: tree,
    candidate_tree: tree,
    diffText,
    paths: Object.keys(files),
  });
  const policySnapshot = createPolicySnapshot({ effectiveRules: ["fail-closed"] });
  const contract = {
    schema_version: 1,
    contract_id: "contract:k6c-runner-ws",
    family: "repair",
    version: 1,
    contract_digest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    source_snapshot_id: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    obligations: [],
  };
  const paths = Object.keys(files);
  const executionGraph = compileExecutionGraph({
    contract,
    policySnapshot,
    nodes: [{
      node_id: "repair-focal",
      kind: "repair-action/v1",
      operation: "apply",
      objective: "repair",
      dependencies: [],
      ownership: { owner: "agent:test", mode: "exclusive" },
      allowed_paths: paths,
      invariants: [],
      required_evidence: ["ev:test"],
      budget_ref: "budget:default",
    }],
    obligations: [],
  });
  const sourceSnapshot = {
    schema_version: 1,
    kind: "source-snapshot/v1",
    repository_id: "k6c-runner-workspace",
    base_tree_digest: tree,
    projection: "workspace",
    dependency_digests: [],
  };
  sourceSnapshot.source_snapshot_id = computeSourceSnapshotId(sourceSnapshot);
  const workOrder = {
    schema_version: 2,
    kind: "work-order/v2",
    source_snapshot_id: sourceSnapshot.source_snapshot_id,
    node_id: "repair-focal",
    role: "test",
    status: "pending",
    operation: "apply",
    objective: "execute challenge",
    dependencies: [],
    ownership: { owner: "agent:test", mode: "exclusive" },
    allowed_paths: paths,
    capsule_inputs: paths,
    invariants: ["invariant"],
    required_evidence: ["ev:test"],
    budget: { model_turns: 0, patches: 0, commands: 4, wall_time_minutes: 2, changed_lines: 8 },
  };
  workOrder.work_order_id = computeWorkOrderId(workOrder);
  const plan = createChallengePlan({
    candidateId: candidate.candidate_id,
    nodeId: "repair-focal",
    policySnapshotId: policySnapshot.snapshot_id,
    evidenceStrategy: strategy,
    budgetOverrides: { timeout_seconds: 30 },
  });
  const executor = {
    capabilities: {
      isolation: "enforced",
      cancellation: "enforced",
      challenge_types: Object.fromEntries(plan.selected.map((type) => [type, "enforced"])),
    },
    executeChallenge: async () => ({ pass: true }),
  };
  return {
    candidate,
    policySnapshot,
    executionGraph,
    plan,
    repository: { files },
    candidateDiff: diffText,
    sourceSnapshot,
    workOrder,
    nodeId: "repair-focal",
    evidenceStrategy: strategy,
    executor,
    sourceCode: "caller source must not be mutated",
    testSourceCode: "caller tests must not be inspected",
    runTests: async () => {
      throw new Error("caller runTests callback must not execute");
    },
  };
}

test("REQ-adversarial-challenges-004: migration plan without isolated executor fails closed", async () => {
  const h = workspaceHarness("migration", { "src/add.js": ADD_SOURCE, "src/add.test.js": DETECTING_TEST }, ADD_DIFF);
  delete h.executor.executeChallenge;
  const result = await executeChallengePlan(h.plan, h);
  assert.equal(result.ok, false);
  assert.equal(result.causalFailure.code, "CHALLENGE_CAPABILITY_UNAVAILABLE");
  assert.ok(!(result.results || []).some((item) => item.outcome === "passed"));
});

test("REQ-adversarial-challenges-004: focal mutation seeds a defect in workspace bytes and passes", async () => {
  const h = workspaceHarness("feature", {
    "src/add.js": ADD_SOURCE,
    "src/add.test.js": DETECTING_TEST,
  }, ADD_DIFF);
  const result = await executeChallengePlan(h.plan, h);
  assert.equal(result.ok, true, result.causalFailure && result.causalFailure.error);
  const focal = result.results.find((item) => item.challenge_type === "focal-mutation");
  assert.equal(focal.outcome, "passed");
  assert.equal(focal.candidate_id, h.candidate.candidate_id);
  assert.equal(focal.plan_id, h.plan.plan_id);
  assert.ok(focal.details.defects_detected >= 1);
});

test("REQ-adversarial-challenges-004: complacent suite on seeded workspace defect fails the challenge", async () => {
  const h = workspaceHarness("feature", {
    "src/add.js": ADD_SOURCE,
    "src/add.test.js": COMPLACENT_TEST,
  }, ADD_DIFF);
  const result = await executeChallengePlan(h.plan, h);
  assert.equal(result.ok, true, result.causalFailure && result.causalFailure.error);
  const focal = result.results.find((item) => item.challenge_type === "focal-mutation");
  assert.equal(focal.outcome, "failed");
  assert.equal(focal.details.reason, "COMPLACENT_TEST_DETECTED");
});

test("REQ-adversarial-challenges-004: test-inspection via isolated runner rejects tautological workspace tests", async () => {
  const h = workspaceHarness("config-docs", {
    "src/add.js": ADD_SOURCE,
    "src/add.test.js": TAUTOLOGICAL_TEST,
  }, ADD_DIFF);
  const result = await executeChallengePlan(h.plan, h);
  assert.equal(result.ok, true, result.causalFailure && result.causalFailure.error);
  const inspection = result.results.find((item) => item.challenge_type === "test-inspection");
  assert.equal(inspection.outcome, "failed");
  assert.equal(inspection.details.reason, "TAUTOLOGICAL_TEST_DETECTED");
});

test("REQ-adversarial-challenges-004: complacent suite on reverted workspace fails the challenge", async () => {
  const h = workspaceHarness("bug", {
    "src/add.js": ADD_SOURCE,
    "src/add.test.js": COMPLACENT_TEST,
  }, ADD_DIFF);
  assert.ok(h.plan.selected.includes("revert"));
  const result = await executeChallengePlan(h.plan, h);
  assert.equal(result.ok, true, result.causalFailure && result.causalFailure.error);
  const revert = result.results.find((item) => item.challenge_type === "revert");
  assert.equal(revert.outcome, "failed");
  assert.equal(revert.details.reason, "COMPLACENT_TEST_DETECTED");
});

test("REQ-adversarial-challenges-004: detecting suite on reverted workspace verifies the revert", async () => {
  const h = workspaceHarness("bug", {
    "src/add.js": ADD_SOURCE,
    "src/add.test.js": DETECTING_TEST,
  }, ADD_DIFF);
  const result = await executeChallengePlan(h.plan, h);
  assert.equal(result.ok, true, result.causalFailure && result.causalFailure.error);
  const revert = result.results.find((item) => item.challenge_type === "revert");
  assert.equal(revert.outcome, "passed");
  assert.equal(revert.details.revert_verified, true);
});

test("REQ-adversarial-challenges-004: missing tests, zero mutations, and no-op apply fail closed as errors", async () => {
  const missingFocalHarness = workspaceHarness("feature", { "src/add.js": ADD_SOURCE }, ADD_DIFF);
  const missingFocalRun = await executeChallengePlan(missingFocalHarness.plan, missingFocalHarness);
  const missingFocal = (missingFocalRun.results || []).find((item) => item.challenge_type === "focal-mutation");
  assert.ok(missingFocal);
  assert.equal(missingFocal.outcome, "error");
  assert.equal(missingFocal.details.reason, "MISSING_TESTS");
  assert.notEqual(missingFocal.details.reason, "COMPLACENT_TEST_DETECTED");

  const missingRevertHarness = workspaceHarness("bug", { "src/add.js": ADD_SOURCE }, ADD_DIFF);
  const missingRevertRun = await executeChallengePlan(missingRevertHarness.plan, missingRevertHarness);
  const missingRevert = (missingRevertRun.results || []).find((item) => item.challenge_type === "revert");
  assert.ok(missingRevert);
  assert.equal(missingRevert.outcome, "error");
  assert.equal(missingRevert.details.reason, "MISSING_TESTS");
  assert.notEqual(missingRevert.outcome, "passed");

  const emptyMutations = workspaceHarness("feature", { "src/add.js": ADD_SOURCE, "src/add.test.js": DETECTING_TEST }, ADD_DIFF);
  emptyMutations.mutations = [];
  const emptyRun = await executeChallengePlan(emptyMutations.plan, emptyMutations);
  const emptyFocal = (emptyRun.results || []).find((item) => item.challenge_type === "focal-mutation");
  assert.ok(emptyFocal);
  assert.equal(emptyFocal.outcome, "error");
  assert.equal(emptyFocal.details.reason, "NO_MUTATION_APPLIED");
  assert.notEqual(emptyFocal.details.reason, "COMPLACENT_TEST_DETECTED");

  const noopFocalHarness = workspaceHarness("feature", { "src/add.js": ADD_SOURCE, "src/add.test.js": DETECTING_TEST }, ADD_DIFF);
  noopFocalHarness.mutations = [{ line: 1, col: 0, original: "function", replacement: "function" }];
  const noopFocalRun = await executeChallengePlan(noopFocalHarness.plan, noopFocalHarness);
  const noopFocal = (noopFocalRun.results || []).find((item) => item.challenge_type === "focal-mutation");
  assert.ok(noopFocal);
  assert.equal(noopFocal.outcome, "error");
  assert.equal(noopFocal.details.reason, "CHALLENGE_NOOP");
  assert.notEqual(noopFocal.details.reason, "COMPLACENT_TEST_DETECTED");

  const noopRevertHarness = workspaceHarness("bug", { "src/add.js": ADD_SOURCE, "src/add.test.js": DETECTING_TEST }, ADD_DIFF);
  noopRevertHarness.patch = { original: "not-in-file", modified: "also-not-in-file" };
  const noopRevertRun = await executeChallengePlan(noopRevertHarness.plan, noopRevertHarness);
  const noopRevert = (noopRevertRun.results || []).find((item) => item.challenge_type === "revert");
  assert.ok(noopRevert);
  assert.equal(noopRevert.outcome, "error");
  assert.equal(noopRevert.details.reason, "CHALLENGE_NOOP");
  assert.notEqual(noopRevert.outcome, "passed");
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

test("REQ-adversarial-challenges-004: Candidate identity mutation after a run fails closed with unchanged repo bytes", async () => {
  const h = harness("migration");
  h.executor.executeChallenge = async () => {
    h.candidate.candidate_id = "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
    return { pass: true };
  };
  const result = await executeChallengePlan(h.plan, h);
  assert.equal(result.ok, false);
  assert.equal(result.causalFailure.code, "CHALLENGE_INTEGRITY_INVALID");
  assert.equal(h.repository.files["src/index.js"], FILES["src/index.js"]);
});

test("REQ-adversarial-challenges-003: focal-mutation with exhausted mutation_budget halts immediately with causal failure", async () => {
  const h = workspaceHarness("feature", {
    "src/add.js": ADD_SOURCE,
    "src/add.test.js": DETECTING_TEST,
  }, ADD_DIFF);
  h.plan = createChallengePlan({
    candidateId: h.candidate.candidate_id,
    nodeId: "repair-focal",
    policySnapshotId: h.policySnapshot.snapshot_id,
    evidenceStrategy: "feature",
    budgetOverrides: { timeout_seconds: 30, mutation_budget: 0 },
  });

  const result = await executeChallengePlan(h.plan, h);
  assert.equal(result.ok, false);
  assert.ok(result.causalFailure);
  assert.equal(result.causalFailure.code, "CHALLENGE_BUDGET_EXHAUSTED");
  assert.equal(result.causalFailure.category, "validation_gap");
  assert.equal(result.causalFailure.details.exhausted_dimension, "mutation_budget");
  assert.equal(result.causalFailure.details.plan_id, h.plan.plan_id);
  assert.equal(result.causalFailure.details.candidate_id, h.candidate.candidate_id);
});

test("REQ-adversarial-challenges-003: focal-mutation with multiple mutations consumes budget monotonically and halts upon exhaustion", async () => {
  const h = workspaceHarness("feature", {
    "src/add.js": ADD_SOURCE,
    "src/add.test.js": DETECTING_TEST,
  }, ADD_DIFF);
  h.mutations = [
    { line: 2, col: 2, original: "return a + b;", replacement: "return a - b;" },
    { line: 2, col: 2, original: "return a + b;", replacement: "return a * b;" },
  ];
  h.plan = createChallengePlan({
    candidateId: h.candidate.candidate_id,
    nodeId: "repair-focal",
    policySnapshotId: h.policySnapshot.snapshot_id,
    evidenceStrategy: "feature",
    budgetOverrides: { timeout_seconds: 30, mutation_budget: 1 },
  });

  const result = await executeChallengePlan(h.plan, h);
  assert.equal(result.ok, false);
  assert.ok(result.causalFailure);
  assert.equal(result.causalFailure.code, "CHALLENGE_BUDGET_EXHAUSTED");
  assert.equal(result.causalFailure.details.exhausted_dimension, "mutation_budget");
});

test("REQ-adversarial-challenges-004: focal-mutation with command timeout emits CHALLENGE_TIMEOUT and never increments defects", async () => {
  const TIMEOUT_TEST = "const test = require('node:test');\ntest('hangs', async () => {\n  await new Promise((r) => setTimeout(r, 20000));\n});\n";
  const h = workspaceHarness("feature", {
    "src/add.js": ADD_SOURCE,
    "src/add.test.js": TIMEOUT_TEST,
  }, ADD_DIFF);
  h.plan = createChallengePlan({
    candidateId: h.candidate.candidate_id,
    nodeId: "repair-focal",
    policySnapshotId: h.policySnapshot.snapshot_id,
    evidenceStrategy: "feature",
    budgetOverrides: { timeout_seconds: 0.1 },
  });

  const result = await executeChallengePlan(h.plan, h);
  const focal = (result.results || []).find((item) => item.challenge_type === "focal-mutation");
  assert.ok(focal);
  assert.equal(focal.outcome, "error");
  assert.equal(focal.details.reason, "CHALLENGE_TIMEOUT");
  assert.equal(focal.details.defects_detected || 0, 0);
  assert.notEqual(focal.outcome, "passed");
});

test("REQ-adversarial-challenges-004: revert with command timeout emits CHALLENGE_TIMEOUT and fails closed", async () => {
  const TIMEOUT_TEST = "const test = require('node:test');\ntest('hangs', async () => {\n  await new Promise((r) => setTimeout(r, 20000));\n});\n";
  const h = workspaceHarness("bug", {
    "src/add.js": ADD_SOURCE,
    "src/add.test.js": TIMEOUT_TEST,
  }, ADD_DIFF);
  h.plan = createChallengePlan({
    candidateId: h.candidate.candidate_id,
    nodeId: "repair-focal",
    policySnapshotId: h.policySnapshot.snapshot_id,
    evidenceStrategy: "bug",
    budgetOverrides: { timeout_seconds: 0.1 },
  });

  const result = await executeChallengePlan(h.plan, h);
  const revert = (result.results || []).find((item) => item.challenge_type === "revert");
  assert.ok(revert);
  assert.equal(revert.outcome, "error");
  assert.equal(revert.details.reason, "CHALLENGE_TIMEOUT");
  assert.notEqual(revert.outcome, "passed");
});

async function withWorkspace(h, fn) {
  const workspace = await createWorkspace({ source_snapshot_id: h.sourceSnapshot.source_snapshot_id });
  await materializeSourceSnapshot(workspace, h.workOrder, h.sourceSnapshot, {
    effectiveBase: {
      source_snapshot_id: h.sourceSnapshot.source_snapshot_id,
      files: h.repository.files,
      tree_digest: computeTreeDigest(h.repository.files),
    },
  });
  try {
    return await fn(workspace);
  } finally {
    await disposeWorkspace(workspace);
  }
}

test("REQ-adversarial-challenges-004: spawn_error during focal-mutation emits CHALLENGE_EXECUTION_ERROR and never increments defects", async () => {
  const h = workspaceHarness("feature", {
    "src/add.js": ADD_SOURCE,
    "src/add.test.js": DETECTING_TEST,
  }, ADD_DIFF);
  const mockRunner = async () => ({
    pass: false,
    exitCode: 1,
    failure_class: "spawn_error",
    error: "spawn ENOENT",
  });

  await withWorkspace(h, async (workspace) => {
    const tracker = createChallengeBudgetTracker(h.plan.budget);
    const result = await runIsolatedMutation(
      "focal-mutation",
      workspace,
      h,
      null,
      undefined,
      30000,
      tracker,
      h.plan,
      mockRunner,
    );
    assert.ok(result);
    assert.equal(result.outcome, "error");
    assert.equal(result.details.reason, "CHALLENGE_EXECUTION_ERROR");
    assert.equal(result.details.defects_detected || 0, 0);
    assert.notEqual(result.outcome, "passed");
  });
});

test("REQ-adversarial-challenges-004: test-level timeout during focal-mutation emits CHALLENGE_TIMEOUT and never increments defects", async () => {
  const h = workspaceHarness("feature", {
    "src/add.js": ADD_SOURCE,
    "src/add.test.js": DETECTING_TEST,
  }, ADD_DIFF);
  const mockRunner = async () => ({
    pass: false,
    exitCode: 1,
    failure_class: "timeout",
    error: "ETIMEDOUT",
  });

  await withWorkspace(h, async (workspace) => {
    const tracker = createChallengeBudgetTracker(h.plan.budget);
    const result = await runIsolatedMutation(
      "focal-mutation",
      workspace,
      h,
      null,
      undefined,
      30000,
      tracker,
      h.plan,
      mockRunner,
    );
    assert.ok(result);
    assert.equal(result.outcome, "error");
    assert.equal(result.details.reason, "CHALLENGE_TIMEOUT");
    assert.equal(result.details.defects_detected || 0, 0);
    assert.notEqual(result.outcome, "passed");
  });
});

test("REQ-adversarial-challenges-004: spawn_error during revert emits CHALLENGE_EXECUTION_ERROR and fails closed", async () => {
  const h = workspaceHarness("bug", {
    "src/add.js": ADD_SOURCE,
    "src/add.test.js": DETECTING_TEST,
  }, ADD_DIFF);
  const mockRunner = async () => ({
    pass: false,
    exitCode: 1,
    failure_class: "spawn_error",
    error: "spawn ENOENT",
  });

  await withWorkspace(h, async (workspace) => {
    const tracker = createChallengeBudgetTracker(h.plan.budget);
    const result = await runIsolatedMutation(
      "revert",
      workspace,
      h,
      null,
      undefined,
      30000,
      tracker,
      h.plan,
      mockRunner,
    );
    assert.ok(result);
    assert.equal(result.outcome, "error");
    assert.equal(result.details.reason, "CHALLENGE_EXECUTION_ERROR");
    assert.notEqual(result.outcome, "passed");
  });
});

test("REQ-adversarial-challenges-004: test-level timeout during revert emits CHALLENGE_TIMEOUT and fails closed", async () => {
  const h = workspaceHarness("bug", {
    "src/add.js": ADD_SOURCE,
    "src/add.test.js": DETECTING_TEST,
  }, ADD_DIFF);
  const mockRunner = async () => ({
    pass: false,
    exitCode: 1,
    failure_class: "timeout",
    error: "ETIMEDOUT",
  });

  await withWorkspace(h, async (workspace) => {
    const tracker = createChallengeBudgetTracker(h.plan.budget);
    const result = await runIsolatedMutation(
      "revert",
      workspace,
      h,
      null,
      undefined,
      30000,
      tracker,
      h.plan,
      mockRunner,
    );
    assert.ok(result);
    assert.equal(result.outcome, "error");
    assert.equal(result.details.reason, "CHALLENGE_TIMEOUT");
    assert.notEqual(result.outcome, "passed");
  });
});

test("REQ-adversarial-challenges-004: executeChallengePlan ignores caller context runWorkspaceTests seam and detects complacent candidate", async () => {
  // Candidate has complacent tests (COMPLACENT_TEST).
  // An adversarial caller supplies context.runWorkspaceTests mock that pretends tests failed (pass: false),
  // trying to trick executeChallengePlan into thinking the defect was detected and passing the challenge.
  const h = workspaceHarness("feature", {
    "src/add.js": ADD_SOURCE,
    "src/add.test.js": COMPLACENT_TEST,
  }, ADD_DIFF);
  h.runWorkspaceTests = async () => ({
    pass: false,
    exitCode: 1,
    stdout: "mock test failure - defect detected",
  });

  const result = await executeChallengePlan(h.plan, h);
  assert.equal(result.ok, true);
  const focal = (result.results || []).find((item) => item.challenge_type === "focal-mutation");
  assert.ok(focal);
  // Real sandbox runs COMPLACENT_TEST which passes on the mutated code, so outcome MUST be failed / COMPLACENT_TEST_DETECTED
  assert.equal(focal.outcome, "failed");
  assert.equal(focal.details.reason, "COMPLACENT_TEST_DETECTED");
});

