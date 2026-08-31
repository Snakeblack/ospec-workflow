"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { performance } = require("node:perf_hooks");
const { createChallengeBudgetTracker } = require("./budget.js");
const { generateFocalMutations, applyFocalMutation, revertSourcePatch, inspectTestAssertions } = require("./mutator.js");
const { computeTreeDigest, createWorkspace, disposeWorkspace, materializeSourceSnapshot } = require("../worker-workspace.js");
const { executeSandboxedCommand } = require("../worker-sandbox.js");
const { computeCandidateId } = require("../execution-identities/index.js");
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

function listWorkspaceFiles(root, relative = "") {
  const dir = path.join(root, relative);
  if (!fs.existsSync(dir)) return [];
  const entries = [];
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = relative ? `${relative}/${item.name}` : item.name;
    if (item.isDirectory()) entries.push(...listWorkspaceFiles(root, rel.replace(/\\/g, "/")));
    else if (item.isFile()) entries.push(rel.replace(/\\/g, "/"));
  }
  return entries.sort();
}

function isTestFile(rel) {
  return /\.(test|spec)\.js$/.test(rel);
}

function readWorkspaceFile(workspace, rel) {
  return fs.readFileSync(path.join(workspace.root_path, rel), "utf8");
}

function writeWorkspaceFile(workspace, rel, content) {
  const dest = path.join(workspace.root_path, rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, content);
}

function derivePatchFromDiff(diffText) {
  if (typeof diffText !== "string") return { original: "", modified: "" };
  const removed = [];
  const added = [];
  for (const line of diffText.split(/\r?\n/)) {
    if (line.startsWith("---") || line.startsWith("+++") || line.startsWith("diff ") || line.startsWith("index ") || line.startsWith("@@") || line.startsWith("\\")) continue;
    if (line.startsWith("-")) removed.push(line.slice(1));
    else if (line.startsWith("+")) added.push(line.slice(1));
  }
  return { original: removed.join("\n"), modified: added.join("\n") };
}

function mutationsFor(context, rel, source, targetLines) {
  if (Array.isArray(context.mutations)) return context.mutations;
  if (context.mutations && typeof context.mutations === "object" && Array.isArray(context.mutations[rel])) {
    return context.mutations[rel];
  }
  return generateFocalMutations(source, { targetLines });
}

async function runWorkspaceTests(workspace, context, signal, timeoutMs) {
  const files = listWorkspaceFiles(workspace.root_path).filter(isTestFile);
  if (files.length === 0) {
    return { pass: false, exitCode: 1, failure_class: "missing_tests", error: "no test files in workspace" };
  }
  const allowed = [...new Set([
    ...(Array.isArray(context.workOrder && context.workOrder.allowed_paths) ? context.workOrder.allowed_paths : []),
    ...listWorkspaceFiles(workspace.root_path),
    "**",
  ])];
  let stdout = "";
  let stderr = "";
  let failure_class;
  let error;
  for (const file of files) {
    const result = await executeSandboxedCommand({
      command: process.execPath,
      args: [file],
      cwd: workspace.root_path,
      workspaceRoot: workspace.root_path,
      allowedPaths: allowed,
      signal,
      timeoutMs,
      env: { NODE_TEST_CONTEXT: "" },
    });
    stdout += result.stdout || "";
    stderr += result.stderr || "";
    if (result.failure_class) failure_class = result.failure_class;
    if (result.error) error = result.error;
    if (!(result.ok === true && result.exit_code === 0)) {
      return { pass: false, exitCode: result.exit_code, failure_class, error, stdout, stderr };
    }
  }
  return { pass: true, exitCode: 0, failure_class, error, stdout, stderr };
}

function sourceFilesForMutation(workspace, scope) {
  const scoped = scope && Array.isArray(scope.paths) && scope.paths.length ? new Set(scope.paths) : null;
  return listWorkspaceFiles(workspace.root_path).filter((rel) => !isTestFile(rel) && (!scoped || scoped.has(rel)));
}

async function runIsolatedMutation(type, workspace, context, scope, signal, timeoutMs) {
  if (type === "test-inspection") {
    const testFiles = listWorkspaceFiles(workspace.root_path).filter(isTestFile);
    const violations = [];
    for (const rel of testFiles) {
      const inspection = inspectTestAssertions(readWorkspaceFile(workspace, rel));
      if (inspection.tautological) violations.push(...(inspection.violations || []));
    }
    return violations.length
      ? { outcome: "failed", details: { reason: "TAUTOLOGICAL_TEST_DETECTED", violations } }
      : { outcome: "passed", details: { inspected_clean: true } };
  }

  if (type === "revert") {
    const files = sourceFilesForMutation(workspace, scope);
    const originals = new Map();
    const patch = context.patch && context.patch.original && context.patch.modified
      ? context.patch
      : derivePatchFromDiff(context.candidateDiff);
    let bytesChanged = false;
    for (const rel of files) {
      const current = readWorkspaceFile(workspace, rel);
      originals.set(rel, current);
      const reverted = revertSourcePatch(current, patch);
      if (reverted !== current) bytesChanged = true;
      writeWorkspaceFile(workspace, rel, reverted);
    }
    try {
      if (!bytesChanged) {
        return { outcome: "error", details: { reason: "CHALLENGE_NOOP" } };
      }
      const run = await runWorkspaceTests(workspace, context, signal, timeoutMs);
      if (run.failure_class === "missing_tests") {
        return { outcome: "error", details: { reason: "MISSING_TESTS" } };
      }
      if (run.failure_class) {
        return { outcome: "error", details: { reason: "CHALLENGE_EXECUTION_ERROR", error: run.error || run.failure_class } };
      }
      return run.pass === true || run.exitCode === 0
        ? { outcome: "failed", details: { reason: "COMPLACENT_TEST_DETECTED" } }
        : { outcome: "passed", details: { revert_verified: true } };
    } finally {
      for (const [rel, content] of originals) writeWorkspaceFile(workspace, rel, content);
    }
  }

  if (type === "focal-mutation") {
    const targetLinesByPath = new Map((scope && scope.line_ranges || []).map((range) => [range.path, range.lines]));
    const files = sourceFilesForMutation(workspace, scope);
    let defects = 0;
    let mutationsTested = 0;
    for (const rel of files) {
      const original = readWorkspaceFile(workspace, rel);
      const mutationList = mutationsFor(context, rel, original, targetLinesByPath.get(rel) || null);
      for (const mutation of mutationList) {
        const mutated = applyFocalMutation(original, mutation);
        if (mutated === original) {
          return { outcome: "error", details: { reason: "CHALLENGE_NOOP", mutations_tested: mutationsTested, defects_detected: defects } };
        }
        mutationsTested += 1;
        writeWorkspaceFile(workspace, rel, mutated);
        try {
          const run = await runWorkspaceTests(workspace, context, signal, timeoutMs);
          if (run.failure_class === "missing_tests") {
            return { outcome: "error", details: { reason: "MISSING_TESTS", mutations_tested: mutationsTested, defects_detected: defects } };
          }
          if (run.failure_class === "sandbox_rejection" || run.failure_class === "cancel") {
            return { outcome: "error", details: { reason: "CHALLENGE_EXECUTION_ERROR", error: run.error || run.failure_class } };
          }
          if (run.pass === true || run.exitCode === 0) {
            return { outcome: "failed", details: { reason: "COMPLACENT_TEST_DETECTED", mutations_tested: mutationsTested, defects_detected: defects } };
          }
          defects += 1;
        } finally {
          writeWorkspaceFile(workspace, rel, original);
        }
      }
    }
    if (mutationsTested === 0) {
      return { outcome: "error", details: { reason: "NO_MUTATION_APPLIED", mutations_tested: 0, defects_detected: defects } };
    }
    return { outcome: "passed", details: { mutations_tested: mutationsTested, defects_detected: defects, complacent_tests: 0 } };
  }
  return null;
}

async function materializeChallengeWorkspace(context) {
  if (!context.sourceSnapshot || !context.workOrder || !context.repository || !context.repository.files) {
    throw new Error("sourceSnapshot, workOrder, and repository bytes are required for isolated challenge execution");
  }
  const repoPaths = Object.keys(context.repository.files);
  const workOrder = {
    ...context.workOrder,
    capsule_inputs: [...new Set([...(context.workOrder.capsule_inputs || []), ...repoPaths])],
    allowed_paths: [...new Set([...(context.workOrder.allowed_paths || []), ...repoPaths])],
  };
  const workspace = await createWorkspace({ source_snapshot_id: context.sourceSnapshot.source_snapshot_id, baseDir: context.workspaceBaseDir });
  await materializeSourceSnapshot(workspace, workOrder, context.sourceSnapshot, { effectiveBase: { source_snapshot_id: context.sourceSnapshot.source_snapshot_id, files: context.repository.files, tree_digest: computeTreeDigest(context.repository.files) } });
  return workspace;
}

function candidateIdentityIntact(context, originalCandidateId, sourceDigest) {
  if (computeTreeDigest(context.repository.files) !== sourceDigest || computeTreeDigest(context.repository.files) !== context.candidate.candidate_tree) {
    return failure("CHALLENGE_INTEGRITY_INVALID", "candidate bytes changed during challenge execution");
  }
  let recomputed;
  try {
    recomputed = computeCandidateId(context.candidate);
  } catch (error) {
    return failure("CHALLENGE_INTEGRITY_INVALID", error.message);
  }
  if (recomputed !== originalCandidateId || recomputed !== context.candidate.candidate_id) {
    return failure("CHALLENGE_INTEGRITY_INVALID", "candidate identity changed during challenge execution");
  }
  return { ok: true };
}

/** Execute an exact canonical plan. Any unverified input or capability fails before effects. */
async function executeChallengePlan(plan, context = {}) {
  const bindings = { candidate: context.candidate, executionGraph: context.executionGraph, policySnapshot: context.policySnapshot, nodeId: context.nodeId, evidenceStrategy: context.evidenceStrategy };
  const planGate = validateChallengePlan(plan, bindings);
  if (!planGate.ok) return failure(planGate.reason_code, planGate.error);
  if (!context.candidate || !context.repository || !context.repository.files) return failure("CHALLENGE_INTEGRITY_INVALID", "candidate and repository bytes are required");
  if (computeTreeDigest(context.repository.files) !== context.candidate.candidate_tree) return failure("CHALLENGE_INTEGRITY_INVALID", "repository tree differs from frozen candidate");
  let originalCandidateId;
  try {
    originalCandidateId = computeCandidateId(context.candidate);
  } catch (error) {
    return failure("CHALLENGE_INTEGRITY_INVALID", error.message);
  }
  if (originalCandidateId !== context.candidate.candidate_id) return failure("CHALLENGE_INTEGRITY_INVALID", "candidate identity does not match frozen candidate");
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
        const isolated = await runIsolatedMutation(type, workspace, context, scope, controller.signal, remaining);
        if (isolated) return isolated;
        if (execute) return execute({ workspace, scope, signal: controller.signal, timeoutMs: remaining });
        return failure("CHALLENGE_CAPABILITY_UNAVAILABLE", `executor cannot execute ${type}`);
      }, executionRemaining, controller);
      const timedOut = execution && execution.__timeout;
      if (!timedOut && execution && execution.causalFailure) return execution;
      const outcome = timedOut ? "error" : (execution.outcome || (execution.pass === false || execution.ok === false ? "failed" : "passed"));
      results.push(emitChallengeResult({ planId: plan.plan_id, candidateId: plan.candidate_id, nodeId: plan.node_id, policySnapshotId: plan.policy_snapshot_id, evidenceStrategy: plan.evidence_strategy, challengeType: type, outcome, evidenceIds: context.evidenceIds, details: timedOut ? { reason: "CHALLENGE_TIMEOUT" } : (execution.details || {}) }));
      if (timedOut) return { ok: false, results, causalFailure: { code: "CHALLENGE_TIMEOUT", category: "validation_gap" } };
    } catch (error) {
      results.push(emitChallengeResult({ planId: plan.plan_id, candidateId: plan.candidate_id, nodeId: plan.node_id, policySnapshotId: plan.policy_snapshot_id, evidenceStrategy: plan.evidence_strategy, challengeType: type, outcome: "error", evidenceIds: context.evidenceIds, details: { reason: "CHALLENGE_EXECUTION_ERROR", error: error.message } }));
      return { ok: false, results, causalFailure: { code: "CHALLENGE_EXECUTION_ERROR", category: "validation_gap", error: error.message } };
    } finally { if (workspace) await disposeWorkspace(workspace); }
    const intact = candidateIdentityIntact(context, originalCandidateId, sourceDigest);
    if (!intact.ok) return intact;
  }
  const setGate = validateChallengeResultSet(plan, results, bindings);
  if (!setGate.ok) return failure(setGate.reason_code, setGate.error);
  return { ok: true, results };
}

module.exports = { emitChallengeResult, executeChallengePlan };
