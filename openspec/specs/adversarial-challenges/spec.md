# Adversarial Challenges Specification

## Purpose

Define the adversarial challenge catalog, deterministic policy-selected `ChallengePlan` generation, `ChallengeBudget` monotonicity with causal failure transitions, and execution of adversarial challenges against frozen candidates to detect seeded defects and reject complacent test suites.

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

Any unsupported challenge type MUST fail validation fail-closed. Challenge execution MUST NOT mutate the frozen candidate repository bytes or approved candidate state.

#### Scenario: Known challenge types validate successfully

- GIVEN a challenge descriptor declaring `challenge_type: "focal-mutation"`
- WHEN the challenge type is validated against the catalog
- THEN validation MUST succeed

#### Scenario: Unsupported challenge type fails closed

- GIVEN a challenge descriptor declaring `challenge_type: "fuzz-chaos-injection"`
- WHEN the challenge type is validated against the catalog
- THEN validation MUST fail closed identifying the unknown type

#### Scenario: Challenge execution does not mutate frozen candidate

- GIVEN a frozen candidate and an executing `revert` or `focal-mutation` challenge
- WHEN the challenge executes in its isolated workspace
- THEN the frozen candidate repository state MUST remain byte-identical and unmodified

### Requirement: Deterministic ChallengePlan Selection {#REQ-adversarial-challenges-002}

The system MUST generate a deterministic `ChallengePlan` derived from the frozen `CandidateId`, the evidence strategy (`bug | feature | refactor | migration | config-docs | strict-tdd`), target graph node, and `PolicySnapshot` (`policy_bundle_digest`). The system MUST NOT assign a universal fixed quartet of challenges by default to every candidate.

Selection MUST be proportional to the evidence strategy:

| Strategy | Selected Types (Typical) | Discarded Types (Typical) |
| --- | --- | --- |
| `bug` | `revert`, `regression-acceptance` | `focal-mutation` (out-of-scope), `rollback` |
| `refactor` | `behavior-equivalence`, `focal-mutation` | `revert` (irrelevant for refactoring) |
| `migration` | `rollback`, `compatibility-acceptance` | `behavior-equivalence` |
| `config-docs` | `structural-validation`, `test-inspection` | `focal-mutation`, `revert` |
| `feature` / `strict-tdd` | `independent-acceptance`, `focal-mutation` | `rollback` |

The emitted `ChallengePlan` MUST contain: `plan_id` (`^sha256:[a-f0-9]{64}$`), `candidate_id`, `policy_snapshot_id`, `evidence_strategy`, `selected` (array of `ChallengeType`), `skipped` (array of `{challenge_type, reason}`), `reasons` (array of string reason codes), and `budget` (`ChallengeBudget`).

For every omitted challenge type from the catalog, `skipped` MUST record an explicit, non-empty reason code. Identical input bindings MUST produce byte-for-byte identical `ChallengePlan` outputs.

#### Scenario: Proportional plan generated for bugfix strategy

- GIVEN a frozen candidate with evidence strategy `bug` and a valid PolicySnapshot
- WHEN `ChallengePlan` generation executes
- THEN the plan MUST include `revert` and `regression-acceptance` in `selected`
- AND MUST NOT include generic full-catalog mutations in `selected`
- AND `skipped` MUST contain explicit reason codes for omitted types

#### Scenario: Proportional plan generated for refactor strategy

- GIVEN a frozen candidate with evidence strategy `refactor`
- WHEN `ChallengePlan` generation executes
- THEN the plan MUST include `behavior-equivalence` and `focal-mutation` in `selected`
- AND MUST omit `revert` with an explicit reason code in `skipped`

#### Scenario: Proportional plan generated for migration strategy

- GIVEN a frozen candidate with evidence strategy `migration`
- WHEN `ChallengePlan` generation executes
- THEN the plan MUST include `rollback` and `compatibility-acceptance` in `selected`
- AND MUST omit non-migration challenges with explicit reasons in `skipped`

#### Scenario: Identical inputs yield deterministic ChallengePlan

- GIVEN two executions with identical `CandidateId`, strategy, and `PolicySnapshot`
- WHEN `ChallengePlan` is generated for both
- THEN the computed `plan_id` and all plan fields MUST be identical byte-for-byte

### Requirement: ChallengeBudget Monotonicity And Causal Exhaustion {#REQ-adversarial-challenges-003}

Every `ChallengePlan` MUST carry a strictly bounded `budget` (`ChallengeBudget`) specifying execution quotas: `max_challenges` (integer > 0), `mutation_budget` (integer >= 0), and `timeout_seconds` (number > 0).

During challenge execution, budget counters MUST be decremented monotonically. If the budget is exhausted before all selected challenges complete, the executor MUST immediately halt and transition to a typed causal failure (`causal-failure/v1`) with category `validation_gap` or `environment_tooling` and reason code `CHALLENGE_BUDGET_EXHAUSTED`. The system MUST NOT perform identical blind restarts when a challenge run exhausts its budget.

#### Scenario: Monotonic budget consumption during challenge execution

- GIVEN a `ChallengePlan` with `max_challenges: 3` and `mutation_budget: 10`
- WHEN each challenge and mutation executes
- THEN budget counters MUST decrement monotonically after each operation

#### Scenario: Budget exhaustion triggers causal failure transition without blind restart

- GIVEN an executing `ChallengePlan` whose `mutation_budget` reaches zero before all selected challenges pass
- WHEN the exhaustion occurs
- THEN challenge execution MUST halt immediately
- AND MUST emit a typed causal failure with reason `CHALLENGE_BUDGET_EXHAUSTED`
- AND MUST NOT retry the identical challenge execution loop

### Requirement: Seeded Defect Detection And Complacent Test Rejection {#REQ-adversarial-challenges-004}

The challenge runner MUST execute only the `selected` challenges specified in the `ChallengePlan` against isolated test instances.

When executing `focal-mutation` or `revert`:
1. The runner MUST introduce targeted mutations or patch reversals into the test copy of the candidate codebase.
2. The candidate test suite MUST be executed against the mutated codebase.
3. If the candidate tests pass against a seeded defect or unpatched revert, the challenge runner MUST fail the challenge with reason code `COMPLACENT_TEST_DETECTED` and reject the candidate evidence.
4. If the candidate tests fail as expected against the seeded defect or revert, the challenge runner MUST mark the challenge as passed.

When executing `test-inspection`, the runner MUST evaluate test assertions and reject tautological assertions (e.g. constant equality, empty assertions, or unconditional passes) with reason code `TAUTOLOGICAL_TEST_DETECTED`.

All challenge execution outcomes MUST be recorded in a schema-valid `challenge-result/v1` record containing `result_id`, `plan_id`, `candidate_id`, `challenge_type`, `outcome` (`passed | failed | error`), `node_id`, `evidence_ids`, and `details`.

#### Scenario: Focal mutation detects seeded defect and challenge passes

- GIVEN a candidate test suite and an active `focal-mutation` challenge
- WHEN a seeded mutation is introduced into the changed code and tests fail
- THEN the challenge outcome MUST be `passed`
- AND a valid `challenge-result/v1` record MUST be emitted

#### Scenario: Complacent test suite passes on seeded defect and challenge fails

- GIVEN a complacent test suite that does not assert over the modified behavior
- WHEN a `focal-mutation` or `revert` is introduced and the candidate tests still pass
- THEN the challenge outcome MUST be `failed` with reason `COMPLACENT_TEST_DETECTED`

#### Scenario: Test inspection detects tautological assertion

- GIVEN a test suite containing tautological assertions or unconditional pass statements
- WHEN `test-inspection` challenge evaluates the assertions
- THEN the challenge outcome MUST be `failed` with reason `TAUTOLOGICAL_TEST_DETECTED`
