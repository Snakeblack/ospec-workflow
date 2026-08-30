# Delta for Adversarial Challenges

## MODIFIED Requirements

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

(Previously: the plan described deterministic strategy selection but did not require a canonical node binding or identity recomputation.)

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

### Requirement: Seeded Defect Detection And Complacent Test Rejection {#REQ-adversarial-challenges-004}

The challenge runner MUST execute only the `selected` challenges specified in the canonical ChallengePlan against isolated test instances. It MUST first validate the plan identity, schema, Candidate, node, strategy, and PolicySnapshot bindings; malformed or contradictory input MUST fail closed and MUST NOT produce an approving result.

Each selected challenge MUST execute once in an ephemeral workspace created from the frozen Candidate. The runner MUST derive `focal-mutation` scope exclusively from the frozen candidate diff; caller-supplied paths MUST NOT expand that scope. It MUST record candidate digest before and after execution and reject any mismatch. Before execution, the runner MUST require an executor capability for the requested challenge and cancellation; an absent, false, or unverifiable capability MUST fail closed.

The runner MUST enforce `timeout_seconds` using elapsed wall-clock time, propagate cancellation to the running work, and emit `outcome: "error"` with `CHALLENGE_TIMEOUT` if the deadline elapses. A non-cooperative child that survives cancellation MUST remain a failure and MUST NOT yield a pass.

When executing `focal-mutation` or `revert`:
1. The runner MUST introduce targeted mutations or patch reversals into the test copy of the candidate codebase.
2. The candidate test suite MUST execute against the mutated codebase.
3. If tests pass against a seeded defect or unpatched revert, the runner MUST fail with `COMPLACENT_TEST_DETECTED` and reject candidate evidence.
4. If tests fail as expected, the runner MUST mark the challenge as passed.

When executing `test-inspection`, the runner MUST reject tautological assertions with `TAUTOLOGICAL_TEST_DETECTED`. Every outcome MUST be schema-valid and canonically bound to its plan, Candidate, node, strategy, and PolicySnapshot.

(Previously: execution used selected challenges and isolated instances but did not mandate verified bindings, capability gating, frozen-diff scope, wall-clock cancellation, or digest integrity.)

#### Scenario: Focal mutation detects seeded defect and challenge passes

- GIVEN a canonical plan with an active focal-mutation challenge
- WHEN a mutation inside the frozen diff makes candidate tests fail
- THEN the outcome MUST be `passed`
- AND a bound valid challenge-result MUST be emitted

#### Scenario: Complacent test suite passes on seeded defect and challenge fails

- GIVEN a complacent candidate test suite
- WHEN a focal-mutation or revert challenge leaves its tests passing
- THEN the outcome MUST be `failed` with `COMPLACENT_TEST_DETECTED`

#### Scenario: Test inspection detects tautological assertion

- GIVEN a test suite containing tautological assertions or unconditional passes
- WHEN test-inspection evaluates the assertions
- THEN the outcome MUST be `failed` with `TAUTOLOGICAL_TEST_DETECTED`

#### Scenario: Missing capability or deadline expiry fails closed

- GIVEN a selected challenge without a verified executor capability, or a non-cooperative run exceeding its wall-clock deadline
- WHEN execution is attempted
- THEN no passed result MUST be emitted
- AND the run MUST fail closed or emit `CHALLENGE_TIMEOUT`

#### Scenario: Foreign scope or candidate mutation is rejected

- GIVEN a focal-mutation request outside the frozen diff, or a post-run candidate digest differing from its pre-run digest
- WHEN integrity validation runs
- THEN the challenge MUST fail closed
- AND its result MUST NOT satisfy verification
