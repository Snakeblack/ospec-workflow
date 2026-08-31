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

Selection MUST remain proportional to the evidence strategy:

| Strategy | Selected Types (Typical) | Discarded Types (Typical) |
| --- | --- | --- |
| `bug` | `revert`, `regression-acceptance` | `focal-mutation` (out-of-scope), `rollback` |
| `refactor` | `behavior-equivalence`, `focal-mutation` | `revert` (irrelevant for refactoring) |
| `migration` | `rollback`, `compatibility-acceptance` | `behavior-equivalence` |
| `config-docs` | `structural-validation`, `test-inspection` | `focal-mutation`, `revert` |
| `feature` / `strict-tdd` | `independent-acceptance`, `focal-mutation` | `rollback` |

The emitted `ChallengePlan` MUST contain: content-addressed `plan_id`, `candidate_id`, non-empty `node_id`, `policy_snapshot_id`, `evidence_strategy`, `selected`, `skipped`, `reasons`, and `budget`. Its identity MUST be recomputed from its canonical bindings and content. For every omitted catalog type, `skipped` MUST record a non-empty reason. Identical bindings MUST produce byte-identical plans; a changed binding MUST NOT reuse the plan identity.

ChallengePlan generation MUST reject an `evidenceStrategy` that is omitted, empty, or not a member of that closed enum. It MUST NOT emit a ChallengePlan and MUST NOT coerce the value to `strict-tdd`. This planner rejection is distinct from independent-verification REQ-002, which still applies Strict TDD fallback when the verifier has no declared strategy; the planner MUST receive an already-selected closed-enum value and MUST NOT perform that fallback.

(Previously: unknown, omitted, or empty planner evidenceStrategy was coerced to strict-tdd and still emitted a ChallengePlan.)

#### Scenario: Proportional plan generated for bugfix strategy

- GIVEN a frozen candidate with evidence strategy `bug` and a valid PolicySnapshot
- WHEN ChallengePlan generation executes
- THEN the plan MUST include `revert` and `regression-acceptance` in `selected`
- AND MUST record explicit reasons for omitted types

#### Scenario: Proportional plan generated for refactor strategy

- GIVEN a frozen candidate with evidence strategy `refactor`
- WHEN ChallengePlan generation executes
- THEN the plan MUST include `behavior-equivalence` and `focal-mutation`
- AND MUST omit `revert` with an explicit reason

#### Scenario: Proportional plan generated for migration strategy

- GIVEN a frozen candidate with evidence strategy `migration`
- WHEN ChallengePlan generation executes
- THEN the plan MUST include `rollback` and `compatibility-acceptance`
- AND MUST omit non-migration challenges with explicit reasons

#### Scenario: Identical inputs yield deterministic ChallengePlan

- GIVEN two executions with identical CandidateId, node, strategy, and PolicySnapshot
- WHEN ChallengePlan is generated for both
- THEN the computed `plan_id` and all plan fields MUST be byte-identical

#### Scenario: Changed canonical binding cannot reuse a plan

- GIVEN two otherwise identical plan requests with different node_id or policy_snapshot_id
- WHEN their plan identities are recomputed
- THEN each request MUST yield a distinct plan_id

#### Scenario: Unknown or omitted planner strategy is rejected

- GIVEN ChallengePlan generation is requested with `evidenceStrategy` omitted, empty, or a string outside the closed enum
- WHEN plan generation executes
- THEN no ChallengePlan MUST be emitted
- AND the strategy MUST NOT be coerced to `strict-tdd`

undefined