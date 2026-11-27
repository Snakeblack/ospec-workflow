"use strict";

const CHALLENGE_TYPES = Object.freeze([
  "revert",
  "focal-mutation",
  "independent-acceptance",
  "regression-acceptance",
  "compatibility-acceptance",
  "test-inspection",
  "structural-validation",
  "behavior-equivalence",
  "rollback",
]);

const CHALLENGE_OBJECTIVES = Object.freeze({
  "revert": "Revert candidate patch to verify that original tests fail on unpatched codebase.",
  "focal-mutation": "Apply AST or code mutations to changed files to verify tests fail on seeded defects.",
  "independent-acceptance": "Execute independently generated acceptance assertions against candidate outputs.",
  "regression-acceptance": "Execute baseline regression test suites against candidate modifications.",
  "compatibility-acceptance": "Validate backward and forward compatibility against historical fixtures.",
  "test-inspection": "Inspect test assertions to detect tautological, empty, or complacent checks.",
  "structural-validation": "Validate schema, syntax, and structural integrity of non-code or config assets.",
  "behavior-equivalence": "Validate identical observable behavior across refactored components.",
  "rollback": "Execute dry-run and reverse migration operations to ensure safe rollback.",
});

function isValidChallengeType(type) {
  return typeof type === "string" && CHALLENGE_TYPES.includes(type);
}

function validateChallengeType(type) {
  if (!isValidChallengeType(type)) {
    return {
      ok: false,
      reason_code: "UNSUPPORTED_CHALLENGE_TYPE",
      error: `Unsupported challenge type: ${type}`,
    };
  }
  return {
    ok: true,
    type,
    objective: CHALLENGE_OBJECTIVES[type],
  };
}

module.exports = {
  CHALLENGE_TYPES,
  CHALLENGE_OBJECTIVES,
  isValidChallengeType,
  validateChallengeType,
};
