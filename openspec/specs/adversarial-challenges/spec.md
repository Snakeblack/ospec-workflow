# Adversarial Challenges Specification

## Purpose

Define the closed adversarial challenge catalog that challenge plans and results are validated against (`scripts/lib/adversarial-challenges/catalog.js` and `integrity.js`, read by the independent verifier and the Assurance Graph). Plan generation, budgets and challenge execution (K6c planner, runner, mutator and budget tracker) were retired in E1.5 (v2.95.0); no runtime produces challenge evidence any more.

## Requirements

### Requirement: Challenge Catalog And Supported Types {#REQ-adversarial-challenges-001}

The system MUST maintain a closed catalog of supported `ChallengeType` identifiers:
`revert | focal-mutation | independent-acceptance | regression-acceptance | compatibility-acceptance | test-inspection | structural-validation | behavior-equivalence | rollback`.

Each challenge type MUST declare a defined adversarial verification objective:

| ChallengeType | Objective |
| --- | --- |
| `revert` | Revert candidate patch to verify that original tests fail on unpatched codebase. |
| `focal-mutation` | Apply AST or code mutations to changed files to verify tests fail on seeded defects. |
| `independent-acceptance` | Execute independently generated acceptance assertions against candidate outputs. |
| `regression-acceptance` | Execute baseline regression test suites against candidate modifications. |
| `compatibility-acceptance` | Validate backward and forward compatibility against historical fixtures. |
| `test-inspection` | Inspect test assertions to detect tautological, empty, or complacent checks. |
| `structural-validation` | Validate schema, syntax, and structural integrity of non-code or config assets. |
| `behavior-equivalence` | Validate identical observable behavior across refactored components. |
| `rollback` | Execute dry-run and reverse migration operations to ensure safe rollback. |

Any unsupported challenge type MUST fail validation fail-closed.

#### Scenario: Known challenge types validate successfully

- GIVEN a challenge descriptor declaring `challenge_type: "focal-mutation"`
- WHEN the challenge type is validated against the catalog
- THEN validation MUST succeed

#### Scenario: Unsupported challenge type fails closed

- GIVEN a challenge descriptor declaring `challenge_type: "fuzz-chaos-injection"`
- WHEN the challenge type is validated against the catalog
- THEN validation MUST fail closed identifying the unknown type
