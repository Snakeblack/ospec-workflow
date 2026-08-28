"use strict";

const { sha256Fingerprint } = require("../canonical-json.js");
const { createChallengeBudgetTracker } = require("./budget.js");
const {
  generateFocalMutations,
  applyFocalMutation,
  revertSourcePatch,
  inspectTestAssertions,
} = require("./mutator.js");

/**
 * Emits a schema-valid ChallengeResultV1 record.
 * @param {Object} params
 * @param {string} params.planId
 * @param {string} params.candidateId
 * @param {string} params.challengeType
 * @param {"passed"|"failed"|"error"} params.outcome
 * @param {string} [params.nodeId]
 * @param {Array<string>} [params.evidenceIds]
 * @param {Object} [params.details]
 * @returns {Object} ChallengeResultV1 payload
 */
function emitChallengeResult({
  planId,
  candidateId,
  challengeType,
  outcome,
  nodeId = "default",
  evidenceIds = [],
  details = {},
}) {
  const canonicalBody = {
    schema_version: 1,
    kind: "challenge-result/v1",
    plan_id: planId,
    candidate_id: candidateId,
    challenge_type: challengeType,
    outcome,
    node_id: String(nodeId || "default"),
    evidence_ids: Array.isArray(evidenceIds) ? [...evidenceIds] : [],
    details: details && typeof details === "object" ? { ...details } : {},
  };

  const result_id = sha256Fingerprint("challenge-result:v1", canonicalBody);

  return {
    ...canonicalBody,
    result_id,
  };
}

/**
 * Executes a ChallengePlan within an isolated context.
 * @param {Object} plan - ChallengePlanV1
 * @param {Object} [context] - Execution context
 * @returns {Promise<{ ok: boolean, results?: Array<Object>, causalFailure?: Object }>}
 */
async function executeChallengePlan(plan, context = {}) {
  const tracker = createChallengeBudgetTracker(plan.budget || {});
  const results = [];

  for (const challengeType of plan.selected || []) {
    if (!tracker.consumeChallenge()) {
      return {
        ok: false,
        causalFailure: tracker.buildExhaustionFailure({
          candidateId: plan.candidate_id,
          planId: plan.plan_id,
          dimension: "max_challenges",
        }),
      };
    }

    switch (challengeType) {
      case "focal-mutation": {
        const mutations =
          context.mutations ||
          generateFocalMutations(context.sourceCode || "", {
            targetLines: context.targetLines,
          });

        let defectsDetected = 0;
        let complacentCount = 0;

        if (mutations.length > 0) {
          for (const mut of mutations) {
            if (!tracker.consumeMutations(1)) {
              return {
                ok: false,
                causalFailure: tracker.buildExhaustionFailure({
                  candidateId: plan.candidate_id,
                  planId: plan.plan_id,
                  dimension: "mutation_budget",
                }),
              };
            }

            const mutated = applyFocalMutation(context.sourceCode || "", mut);
            const runRes = context.runTests
              ? await context.runTests(mutated)
              : { pass: false, exitCode: 1 };

            // In adversarial testing, tests MUST fail on mutated code.
            // If tests pass on mutated code -> complacent test detected!
            if (runRes.pass === true || runRes.exitCode === 0) {
              complacentCount += 1;
            } else {
              defectsDetected += 1;
            }
          }
        }

        if (complacentCount > 0) {
          results.push(
            emitChallengeResult({
              planId: plan.plan_id,
              candidateId: plan.candidate_id,
              challengeType,
              outcome: "failed",
              nodeId: context.nodeId || "default",
              evidenceIds: context.evidenceIds || [],
              details: {
                reason: "COMPLACENT_TEST_DETECTED",
                mutations_tested: mutations.length,
                defects_detected: defectsDetected,
                complacent_tests: complacentCount,
              },
            })
          );
        } else {
          results.push(
            emitChallengeResult({
              planId: plan.plan_id,
              candidateId: plan.candidate_id,
              challengeType,
              outcome: "passed",
              nodeId: context.nodeId || "default",
              evidenceIds: context.evidenceIds || [],
              details: {
                mutations_tested: mutations.length,
                defects_detected: defectsDetected,
                complacent_tests: 0,
              },
            })
          );
        }
        break;
      }

      case "revert": {
        const unpatched = revertSourcePatch(
          context.sourceCode || "",
          context.patch || { original: "", modified: "" }
        );
        const runRes = context.runTests
          ? await context.runTests(unpatched)
          : { pass: false, exitCode: 1 };

        if (runRes.pass === true || runRes.exitCode === 0) {
          results.push(
            emitChallengeResult({
              planId: plan.plan_id,
              candidateId: plan.candidate_id,
              challengeType,
              outcome: "failed",
              nodeId: context.nodeId || "default",
              evidenceIds: context.evidenceIds || [],
              details: { reason: "COMPLACENT_TEST_DETECTED" },
            })
          );
        } else {
          results.push(
            emitChallengeResult({
              planId: plan.plan_id,
              candidateId: plan.candidate_id,
              challengeType,
              outcome: "passed",
              nodeId: context.nodeId || "default",
              evidenceIds: context.evidenceIds || [],
              details: { revert_verified: true },
            })
          );
        }
        break;
      }

      case "test-inspection": {
        const inspection = inspectTestAssertions(context.testSourceCode || "");
        if (inspection.tautological) {
          results.push(
            emitChallengeResult({
              planId: plan.plan_id,
              candidateId: plan.candidate_id,
              challengeType,
              outcome: "failed",
              nodeId: context.nodeId || "default",
              evidenceIds: context.evidenceIds || [],
              details: {
                reason: "TAUTOLOGICAL_TEST_DETECTED",
                violations: inspection.violations,
              },
            })
          );
        } else {
          results.push(
            emitChallengeResult({
              planId: plan.plan_id,
              candidateId: plan.candidate_id,
              challengeType,
              outcome: "passed",
              nodeId: context.nodeId || "default",
              evidenceIds: context.evidenceIds || [],
              details: { inspected_clean: true },
            })
          );
        }
        break;
      }

      case "independent-acceptance": {
        const accRes = context.runAcceptance
          ? await context.runAcceptance()
          : { pass: true };
        const outcome =
          accRes.outcome || (accRes.pass === false ? "failed" : "passed");
        results.push(
          emitChallengeResult({
            planId: plan.plan_id,
            candidateId: plan.candidate_id,
            challengeType,
            outcome,
            nodeId: context.nodeId || "default",
            evidenceIds: context.evidenceIds || [],
            details: accRes.details || {},
          })
        );
        break;
      }

      case "regression-acceptance": {
        const regRes = context.runRegression
          ? await context.runRegression()
          : { pass: true };
        const outcome =
          regRes.outcome || (regRes.pass === false ? "failed" : "passed");
        results.push(
          emitChallengeResult({
            planId: plan.plan_id,
            candidateId: plan.candidate_id,
            challengeType,
            outcome,
            nodeId: context.nodeId || "default",
            evidenceIds: context.evidenceIds || [],
            details: regRes.details || {},
          })
        );
        break;
      }

      case "compatibility-acceptance": {
        const compRes = context.runCompatibility
          ? await context.runCompatibility()
          : { pass: true };
        const outcome =
          compRes.outcome || (compRes.pass === false ? "failed" : "passed");
        results.push(
          emitChallengeResult({
            planId: plan.plan_id,
            candidateId: plan.candidate_id,
            challengeType,
            outcome,
            nodeId: context.nodeId || "default",
            evidenceIds: context.evidenceIds || [],
            details: compRes.details || {},
          })
        );
        break;
      }

      case "structural-validation": {
        const structRes = context.validateStructure
          ? await context.validateStructure()
          : { pass: true };
        const outcome =
          structRes.outcome || (structRes.pass === false ? "failed" : "passed");
        results.push(
          emitChallengeResult({
            planId: plan.plan_id,
            candidateId: plan.candidate_id,
            challengeType,
            outcome,
            nodeId: context.nodeId || "default",
            evidenceIds: context.evidenceIds || [],
            details: structRes.details || {},
          })
        );
        break;
      }

      case "behavior-equivalence": {
        const eqRes = context.runEquivalence
          ? await context.runEquivalence()
          : { pass: true };
        const outcome =
          eqRes.outcome || (eqRes.pass === false ? "failed" : "passed");
        results.push(
          emitChallengeResult({
            planId: plan.plan_id,
            candidateId: plan.candidate_id,
            challengeType,
            outcome,
            nodeId: context.nodeId || "default",
            evidenceIds: context.evidenceIds || [],
            details: eqRes.details || {},
          })
        );
        break;
      }

      case "rollback": {
        const rbRes = context.runRollback
          ? await context.runRollback()
          : { pass: true };
        const outcome =
          rbRes.outcome || (rbRes.pass === false ? "failed" : "passed");
        results.push(
          emitChallengeResult({
            planId: plan.plan_id,
            candidateId: plan.candidate_id,
            challengeType,
            outcome,
            nodeId: context.nodeId || "default",
            evidenceIds: context.evidenceIds || [],
            details: rbRes.details || {},
          })
        );
        break;
      }

      default: {
        results.push(
          emitChallengeResult({
            planId: plan.plan_id,
            candidateId: plan.candidate_id,
            challengeType,
            outcome: "passed",
            nodeId: context.nodeId || "default",
            evidenceIds: context.evidenceIds || [],
          })
        );
        break;
      }
    }
  }

  return { ok: true, results };
}

module.exports = {
  emitChallengeResult,
  executeChallengePlan,
};
