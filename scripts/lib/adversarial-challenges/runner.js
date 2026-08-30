"use strict";

const { performance } = require("node:perf_hooks");
const { createChallengeBudgetTracker } = require("./budget.js");
const { generateFocalMutations, applyFocalMutation, revertSourcePatch, inspectTestAssertions } = require("./mutator.js");
const { computeTreeDigest, createWorkspace, disposeWorkspace, materializeSourceSnapshot } = require("../worker-workspace.js");
const { validateChallengePlan, validateChallengeResultSet, computeChallengeResultId } = require("./integrity.js");
const { deriveVerifiedDiffScope, rejectScopeWidening } = require("./diff-scope.js");

function emitChallengeResult({ planId, candidateId, nodeId, policySnapshotId, evidenceStrategy, challengeType, outcome, evidenceIds = [], details = {} }) {
  const body = { schema_version: 1, kind: "challenge-result/v1", plan_id: planId, candidate_id: candidateId, node_id: nodeId, policy_snapshot_id: policySnapshotId, evidence_strategy: evidenceStrategy, challenge_type: challengeType, outcome, evidence_ids: [...new Set(evidenceIds)].sort(), details: details && typeof details === "object" && !Array.isArray(details) ? details : {} };
  return { ...body, result_id: computeChallengeResultId(body) };
}

function failure(code, error) { return { ok: false, causalFailure: { code, category: "validation_gap", error: error || code } }; }

function requiredCapabilities(context, type) {
  const capabilities = context.executor && context.executor.capabilities;
  return Boolean(capabilities && capabilities.isolation === "enforced" && capabilities.cancellation === "enforced" && capabilities.challenge_types && capabilities.challenge_types[type] === "enforced");
}

function executorFor(context, type) {
  const executor = context.executor;
  if (executor && typeof executor.executeChallenge === "function") return (input) => executor.executeChallenge({ ...input, challengeType: type });
  const legacy = { "independent-acceptance": context.runAcceptance, "regression-acceptance": context.runRegression, "compatibility-acceptance": context.runCompatibility, "structural-validation": context.validateStructure, "behavior-equivalence": context.runEquivalence, rollback: context.runRollback }[type];
  return typeof legacy === "function" ? () => legacy() : null;
}

async function withDeadline(run, remainingMs, controller) {
  let timer;
  try {
    const timeout = new Promise((resolve) => { timer = setTimeout(() => { controller.abort(); resolve({ __timeout: true }); }, Math.max(1, remainingMs)); });
    return await Promise.race([Promise.resolve().then(run), timeout]);
  } finally { clearTimeout(timer); }
}

async function materializeChallengeWorkspace(context) {
  if (!context.sourceSnapshot || !context.workOrder || !context.repository || !context.repository.files) {
    throw new Error("sourceSnapshot, workOrder, and repository bytes are required for isolated challenge execution");
  }
  const workspace = await createWorkspace({ source_snapshot_id: context.sourceSnapshot.source_snapshot_id, baseDir: context.workspaceBaseDir });
  await materializeSourceSnapshot(workspace, context.workOrder, context.sourceSnapshot, { effectiveBase: { source_snapshot_id: context.sourceSnapshot.source_snapshot_id, files: context.repository.files, tree_digest: computeTreeDigest(context.repository.files) } });
  return workspace;
}

async function runLegacyMutation(type, context, scope) {
  if (type === "test-inspection") {
    const inspection = inspectTestAssertions(context.testSourceCode || "");
    return inspection.tautological ? { outcome: "failed", details: { reason: "TAUTOLOGICAL_TEST_DETECTED", violations: inspection.violations } } : { outcome: "passed", details: { inspected_clean: true } };
  }
  if (type === "revert") {
    const reverted = revertSourcePatch(context.sourceCode || "", context.patch || { original: "", modified: "" });
    const run = context.runTests ? await context.runTests(reverted) : { pass: false, exitCode: 1 };
    return run.pass === true || run.exitCode === 0 ? { outcome: "failed", details: { reason: "COMPLACENT_TEST_DETECTED" } } : { outcome: "passed", details: { revert_verified: true } };
  }
  if (type === "focal-mutation") {
    const mutations = context.mutations || generateFocalMutations(context.sourceCode || "", { targetLines: (scope && scope.line_ranges || []).flatMap((range) => range.lines) });
    let defects = 0;
    for (const mutation of mutations) {
      const run = context.runTests ? await context.runTests(applyFocalMutation(context.sourceCode || "", mutation)) : { pass: false, exitCode: 1 };
      if (run.pass === true || run.exitCode === 0) return { outcome: "failed", details: { reason: "COMPLACENT_TEST_DETECTED", mutations_tested: mutations.length, defects_detected: defects } };
      defects += 1;
    }
    return { outcome: "passed", details: { mutations_tested: mutations.length, defects_detected: defects, complacent_tests: 0 } };
  }
  return null;
}

/** Execute an exact canonical plan. Any unverified input or capability fails before effects. */
async function executeChallengePlan(plan, context = {}) {
  const bindings = { candidate: context.candidate, executionGraph: context.executionGraph, policySnapshot: context.policySnapshot, nodeId: context.nodeId, evidenceStrategy: context.evidenceStrategy };
  const planGate = validateChallengePlan(plan, bindings);
  if (!planGate.ok) return failure(planGate.reason_code, planGate.error);
  if (!context.candidate || !context.repository || !context.repository.files) return failure("CHALLENGE_INTEGRITY_INVALID", "candidate and repository bytes are required");
  if (computeTreeDigest(context.repository.files) !== context.candidate.candidate_tree) return failure("CHALLENGE_INTEGRITY_INVALID", "repository tree differs from frozen candidate");
  const sourceDigest = computeTreeDigest(context.repository.files);
  let scope = null;
  if (plan.selected.includes("focal-mutation")) {
    const scopeGate = deriveVerifiedDiffScope(context.candidate, context.candidateDiff);
    if (!scopeGate.ok) return failure(scopeGate.reason_code, scopeGate.error);
    const noWidening = rejectScopeWidening(scopeGate.scope, context.scope || context.targetScope);
    if (!noWidening.ok) return failure(noWidening.reason_code, noWidening.error);
    scope = scopeGate.scope;
  }
  for (const type of plan.selected) if (!requiredCapabilities(context, type)) return failure("CHALLENGE_CAPABILITY_UNAVAILABLE", `executor cannot enforce ${type}, isolation, and cancellation`);

  const tracker = createChallengeBudgetTracker(plan.budget);
  const results = [];
  const deadline = performance.now() + Number(plan.budget.timeout_seconds) * 1000;
  for (const type of plan.selected) {
    if (!tracker.consumeChallenge()) return failure("CHALLENGE_BUDGET_EXHAUSTED", "challenge budget exhausted");
    const remaining = deadline - performance.now();
    if (remaining <= 0) {
      results.push(emitChallengeResult({ planId: plan.plan_id, candidateId: plan.candidate_id, nodeId: plan.node_id, policySnapshotId: plan.policy_snapshot_id, evidenceStrategy: plan.evidence_strategy, challengeType: type, outcome: "error", evidenceIds: context.evidenceIds, details: { reason: "CHALLENGE_TIMEOUT" } }));
      return { ok: false, results, causalFailure: { code: "CHALLENGE_TIMEOUT", category: "validation_gap" } };
    }
    let workspace;
    const controller = new AbortController();
    try {
      workspace = await materializeChallengeWorkspace(context);
      const execute = executorFor(context, type);
      const executionRemaining = deadline - performance.now();
      if (executionRemaining <= 0) {
        results.push(emitChallengeResult({ planId: plan.plan_id, candidateId: plan.candidate_id, nodeId: plan.node_id, policySnapshotId: plan.policy_snapshot_id, evidenceStrategy: plan.evidence_strategy, challengeType: type, outcome: "error", evidenceIds: context.evidenceIds, details: { reason: "CHALLENGE_TIMEOUT" } }));
        return { ok: false, results, causalFailure: { code: "CHALLENGE_TIMEOUT", category: "validation_gap" } };
      }
      const execution = await withDeadline(async () => {
        const legacy = await runLegacyMutation(type, context, scope);
        return legacy || (execute ? execute({ workspace, scope, signal: controller.signal, timeoutMs: remaining }) : { pass: true });
      }, executionRemaining, controller);
      const timedOut = execution && execution.__timeout;
      const outcome = timedOut ? "error" : (execution.outcome || (execution.pass === false || execution.ok === false ? "failed" : "passed"));
      results.push(emitChallengeResult({ planId: plan.plan_id, candidateId: plan.candidate_id, nodeId: plan.node_id, policySnapshotId: plan.policy_snapshot_id, evidenceStrategy: plan.evidence_strategy, challengeType: type, outcome, evidenceIds: context.evidenceIds, details: timedOut ? { reason: "CHALLENGE_TIMEOUT" } : (execution.details || {}) }));
      if (timedOut) return { ok: false, results, causalFailure: { code: "CHALLENGE_TIMEOUT", category: "validation_gap" } };
    } catch (error) {
      results.push(emitChallengeResult({ planId: plan.plan_id, candidateId: plan.candidate_id, nodeId: plan.node_id, policySnapshotId: plan.policy_snapshot_id, evidenceStrategy: plan.evidence_strategy, challengeType: type, outcome: "error", evidenceIds: context.evidenceIds, details: { reason: "CHALLENGE_EXECUTION_ERROR", error: error.message } }));
      return { ok: false, results, causalFailure: { code: "CHALLENGE_EXECUTION_ERROR", category: "validation_gap", error: error.message } };
    } finally { if (workspace) await disposeWorkspace(workspace); }
    if (computeTreeDigest(context.repository.files) !== sourceDigest || computeTreeDigest(context.repository.files) !== context.candidate.candidate_tree) return failure("CHALLENGE_INTEGRITY_INVALID", "candidate bytes changed during challenge execution");
  }
  const setGate = validateChallengeResultSet(plan, results, bindings);
  if (!setGate.ok) return failure(setGate.reason_code, setGate.error);
  return { ok: true, results };
}

module.exports = { emitChallengeResult, executeChallengePlan };
