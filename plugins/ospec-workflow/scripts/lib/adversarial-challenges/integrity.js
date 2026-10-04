"use strict";

const path = require("node:path");
const { sha256Fingerprint } = require("../canonical-json.js");
const { loadSchemaById, validateInstance } = require("../kernel-schema-validator.js");
const { CHALLENGE_TYPES } = require("./catalog.js");
const { validatePolicySnapshotBinding } = require("../execution-graph/policy-snapshot.js");

const ROOT = path.resolve(__dirname, "../../..");
const PLAN_SCHEMA_ID = "ospec://schemas/kernel/challenge-plan/v1";
const RESULT_SCHEMA_ID = "ospec://schemas/kernel/challenge-result/v1";
const SHA256 = /^sha256:[a-f0-9]{64}$/;
let planSchema;
let resultSchema;

function fail(reason_code, error) {
  return { ok: false, reason_code, error: error || reason_code };
}

function schemaFor(kind) {
  if (kind === "plan") {
    planSchema ||= loadSchemaById(PLAN_SCHEMA_ID, { rootDir: ROOT });
    return planSchema;
  }
  resultSchema ||= loadSchemaById(RESULT_SCHEMA_ID, { rootDir: ROOT });
  return resultSchema;
}

function canonicalPlanBody(plan) {
  return {
    schema_version: 1,
    kind: "challenge-plan/v1",
    candidate_id: plan.candidate_id,
    node_id: plan.node_id,
    policy_snapshot_id: plan.policy_snapshot_id,
    evidence_strategy: plan.evidence_strategy,
    selected: [...plan.selected],
    skipped: plan.skipped.map((item) => ({ challenge_type: item.challenge_type, reason: item.reason })),
    reasons: [...plan.reasons],
    budget: {
      max_challenges: plan.budget.max_challenges,
      mutation_budget: plan.budget.mutation_budget,
      timeout_seconds: plan.budget.timeout_seconds,
    },
  };
}

function canonicalResultBody(result) {
  return {
    schema_version: 1,
    kind: "challenge-result/v1",
    plan_id: result.plan_id,
    candidate_id: result.candidate_id,
    node_id: result.node_id,
    policy_snapshot_id: result.policy_snapshot_id,
    evidence_strategy: result.evidence_strategy,
    challenge_type: result.challenge_type,
    outcome: result.outcome,
    evidence_ids: [...result.evidence_ids].sort(),
    details: result.details,
  };
}

function computeChallengePlanId(plan) {
  return sha256Fingerprint("challenge-plan:v1", canonicalPlanBody(plan));
}

function computeChallengeResultId(result) {
  return sha256Fingerprint("challenge-result:v1", canonicalResultBody(result));
}

function graphHasNode(executionGraph, nodeId) {
  return Boolean(executionGraph && Array.isArray(executionGraph.nodes) && executionGraph.nodes.some((node) => node && node.node_id === nodeId));
}

const EVALUATION_BINDING_KEYS = Object.freeze(["candidate", "nodeId", "evidenceStrategy", "policySnapshot", "executionGraph"]);

function hasEvaluationBindings(bindings) {
  if (!bindings || typeof bindings !== "object") return false;
  return EVALUATION_BINDING_KEYS.some((key) => Object.prototype.hasOwnProperty.call(bindings, key));
}

function assertEvidenceStrategyBinding(bindings, plan) {
  const selected = bindings && bindings.evidenceStrategy;
  if (typeof selected !== "string" || selected.length === 0 || selected !== plan.evidence_strategy) {
    return fail("CHALLENGE_INTEGRITY_INVALID", "plan evidence strategy binding differs");
  }
  return { ok: true };
}

function validatePlanPartition(plan) {
  const selected = plan.selected || [];
  const skipped = plan.skipped || [];
  const skippedTypes = skipped.map((item) => item && item.challenge_type);
  if (selected.some((type) => !CHALLENGE_TYPES.includes(type)) || skippedTypes.some((type) => !CHALLENGE_TYPES.includes(type))) {
    return fail("CHALLENGE_INTEGRITY_INVALID", "plan contains a challenge outside the closed catalog");
  }
  if (new Set(selected).size !== selected.length || new Set(skippedTypes).size !== skippedTypes.length) {
    return fail("CHALLENGE_INTEGRITY_INVALID", "challenge plan selection must be unique");
  }
  if (selected.some((type) => skippedTypes.includes(type)) || selected.length + skippedTypes.length !== CHALLENGE_TYPES.length) {
    return fail("CHALLENGE_INTEGRITY_INVALID", "selected and skipped must be a disjoint complete catalog partition");
  }
  if (CHALLENGE_TYPES.some((type) => !selected.includes(type) && !skippedTypes.includes(type))) {
    return fail("CHALLENGE_INTEGRITY_INVALID", "challenge plan omits a catalog member");
  }
  if (skipped.some((item) => !item || typeof item.reason !== "string" || item.reason.trim() === "")) {
    return fail("CHALLENGE_INTEGRITY_INVALID", "every skipped challenge requires a reason");
  }
  return { ok: true };
}

function validateChallengePlan(plan, bindings = {}) {
  if (!plan || typeof plan !== "object" || Array.isArray(plan)) return fail("CHALLENGE_INTEGRITY_INVALID", "challenge plan must be an object");
  const schema = validateInstance(schemaFor("plan"), plan);
  if (!schema.valid) return fail("CHALLENGE_INTEGRITY_INVALID", schema.errors.map((item) => item.message).join("; "));
  if (plan.plan_id !== computeChallengePlanId(plan)) return fail("CHALLENGE_INTEGRITY_INVALID", "plan_id does not match canonical plan content");
  const partition = validatePlanPartition(plan);
  if (!partition.ok) return partition;
  if (hasEvaluationBindings(bindings)) {
    const strategyGate = assertEvidenceStrategyBinding(bindings, plan);
    if (!strategyGate.ok) return strategyGate;
  }
  if (bindings.candidate && bindings.candidate.candidate_id !== plan.candidate_id) return fail("CHALLENGE_INTEGRITY_INVALID", "plan candidate binding differs from frozen candidate");
  if (bindings.nodeId && bindings.nodeId !== plan.node_id) return fail("CHALLENGE_INTEGRITY_INVALID", "plan node binding differs from requested node");
  if (bindings.policySnapshot) {
    const policy = validatePolicySnapshotBinding(bindings.policySnapshot);
    if (!policy.ok || bindings.policySnapshot.snapshot_id !== plan.policy_snapshot_id) return fail("CHALLENGE_INTEGRITY_INVALID", "plan policy snapshot binding is invalid");
  }
  if (bindings.executionGraph && (!graphHasNode(bindings.executionGraph, plan.node_id) || bindings.executionGraph.policy_snapshot_id !== plan.policy_snapshot_id)) {
    return fail("CHALLENGE_INTEGRITY_INVALID", "plan node or policy does not bind to execution graph");
  }
  return { ok: true, plan };
}

function validateChallengeResult(result, plan, bindings = {}) {
  if (!result || typeof result !== "object" || Array.isArray(result)) return fail("CHALLENGE_INTEGRITY_INVALID", "challenge result must be an object");
  const schema = validateInstance(schemaFor("result"), result);
  if (!schema.valid) return fail("CHALLENGE_INTEGRITY_INVALID", schema.errors.map((item) => item.message).join("; "));
  if (!Array.isArray(result.evidence_ids) || new Set(result.evidence_ids).size !== result.evidence_ids.length || result.evidence_ids.some((id) => !SHA256.test(id))) {
    return fail("CHALLENGE_INTEGRITY_INVALID", "result evidence IDs must be unique sha256 identifiers");
  }
  if (JSON.stringify(result.evidence_ids) !== JSON.stringify([...result.evidence_ids].sort())) return fail("CHALLENGE_INTEGRITY_INVALID", "result evidence IDs must be canonical sorted order");
  if (result.result_id !== computeChallengeResultId(result)) return fail("CHALLENGE_INTEGRITY_INVALID", "result_id does not match canonical result content");
  const validatedPlan = validateChallengePlan(plan, bindings);
  if (!validatedPlan.ok) return validatedPlan;
  for (const key of ["plan_id", "candidate_id", "node_id", "policy_snapshot_id", "evidence_strategy"]) {
    if (result[key] !== plan[key]) return fail("CHALLENGE_INTEGRITY_INVALID", `result ${key} does not bind to plan`);
  }
  if (!plan.selected.includes(result.challenge_type)) return fail("CHALLENGE_INTEGRITY_INVALID", "result challenge type is not selected by plan");
  return { ok: true, result };
}

function validateChallengeResultSet(plan, results, bindings = {}) {
  const planGate = validateChallengePlan(plan, bindings);
  if (!planGate.ok) return planGate;
  const strategyGate = assertEvidenceStrategyBinding(bindings, plan);
  if (!strategyGate.ok) return strategyGate;
  if (!Array.isArray(results)) return fail("CHALLENGE_INTEGRITY_INVALID", "challenge results must be an array");
  if (results.length !== plan.selected.length) return fail("CHALLENGE_INTEGRITY_INVALID", "results must contain exactly one entry for every selected challenge");
  const seen = new Set();
  for (const result of results) {
    const resultGate = validateChallengeResult(result, plan, bindings);
    if (!resultGate.ok) return resultGate;
    if (seen.has(result.challenge_type)) return fail("CHALLENGE_INTEGRITY_INVALID", "duplicate challenge result type");
    seen.add(result.challenge_type);
  }
  if (plan.selected.some((type) => !seen.has(type))) return fail("CHALLENGE_INTEGRITY_INVALID", "missing result for selected challenge");
  return { ok: true, plan, results };
}

module.exports = {
  canonicalPlanBody,
  canonicalResultBody,
  computeChallengePlanId,
  computeChallengeResultId,
  assertEvidenceStrategyBinding,
  validateChallengePlan,
  validateChallengeResult,
  validateChallengeResultSet,
};
