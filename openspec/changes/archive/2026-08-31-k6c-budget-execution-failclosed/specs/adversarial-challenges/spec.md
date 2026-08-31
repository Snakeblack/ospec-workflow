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

### Requirement: ChallengeBudget Monotonicity And Causal Exhaustion {#REQ-adversarial-challenges-003}

Every `ChallengePlan` MUST carry a strictly bounded `budget` (`ChallengeBudget`) specifying execution quotas: `max_challenges` (integer > 0), `mutation_budget` (integer >= 0), and `timeout_seconds` (number > 0).

During challenge execution, budget counters MUST be decremented monotonically. Specifically, during `focal-mutation` execution, the runner MUST invoke `ChallengeBudgetTracker` to consume 1 mutation budget unit prior to evaluating each individual mutation. If `mutation_budget` is exhausted (or `consumeMutations(1)` returns `false`), the executor MUST immediately halt execution and transition to a typed causal failure (`causal-failure/v1`) with category `validation_gap`, reason code `CHALLENGE_BUDGET_EXHAUSTED`, and exhausted dimension `mutation_budget`. The system MUST NOT perform identical blind restarts when a challenge run exhausts its budget, MUST NOT evaluate further mutations without available budget, and MUST NOT emit a passed outcome upon budget exhaustion.

(Previously: mutation_budget was not strictly verified or consumed per individual mutation during focal-mutation runner execution.)

#### Scenario: Monotonic budget consumption during challenge execution

- GIVEN a `ChallengePlan` with `max_challenges: 3` and `mutation_budget: 10`
- WHEN each challenge and focal mutation executes
- THEN budget counters MUST decrement monotonically prior to each operation

#### Scenario: Mutation budget exhaustion halts focal mutation and emits causal failure

- GIVEN an executing `focal-mutation` challenge with bounded `mutation_budget`
- WHEN evaluating candidate mutations and `consumeMutations(1)` returns `false` due to exhausted budget
- THEN execution of the mutation loop MUST halt immediately
- AND MUST emit a typed causal failure with reason `CHALLENGE_BUDGET_EXHAUSTED` and dimension `mutation_budget`
- AND MUST NOT evaluate subsequent mutations nor retry blindly

#### Scenario: Budget exhaustion triggers causal failure transition without blind restart

- GIVEN an executing `ChallengePlan` whose budget counters (`max_challenges`, `mutation_budget`, or `timeout_seconds`) reach zero before all selected challenges pass
- WHEN the exhaustion occurs
- THEN challenge execution MUST halt immediately
- AND MUST emit a typed causal failure with reason `CHALLENGE_BUDGET_EXHAUSTED`
- AND MUST NOT retry the identical challenge execution loop

### Requirement: Seeded Defect Detection And Complacent Test Rejection {#REQ-adversarial-challenges-004}

The challenge runner MUST execute only the `selected` challenges specified in the canonical ChallengePlan against isolated test instances. It MUST first validate the plan identity, schema, Candidate, node, strategy, and PolicySnapshot bindings; malformed or contradictory input MUST fail closed and MUST NOT produce an approving result.

Each selected challenge MUST execute once in an ephemeral workspace created from the frozen Candidate. The runner MUST derive `focal-mutation` scope exclusively from the frozen candidate diff; caller-supplied paths MUST NOT expand that scope. It MUST record candidate digest before and after execution and reject any mismatch. Before execution, the runner MUST require an executor capability for the requested challenge and cancellation; an absent, false, or unverifiable capability MUST fail closed.

The runner MUST enforce `timeout_seconds` using elapsed wall-clock time, propagate cancellation to the running work, and emit `outcome: "error"` with `CHALLENGE_TIMEOUT` if the deadline elapses. A non-cooperative child that survives cancellation MUST remain a failure and MUST NOT yield a pass.

When executing `focal-mutation` or `revert`:
1. The runner MUST introduce targeted mutations or patch reversals into the test copy of the candidate codebase.
2. The candidate test suite MUST execute against the mutated codebase in the confined sandbox environment.
3. The runner MUST strictly distinguish between test assertion failures and infrastructure/spawn/tooling errors:
   - If candidate tests fail due to test assertion failure (`exit_code !== 0` with no infrastructure error, spawn error, sandbox rejection, cancellation, or timeout), the seeded defect or revert is confirmed detected and `defects_detected` is incremented.
   - If candidate tests pass against a seeded defect or unpatched revert (`exit_code === 0`), the runner MUST mark the challenge with `outcome: "failed"` and reason `COMPLACENT_TEST_DETECTED`.
   - If command execution encounters an infrastructure error, spawn failure (`failure_class: "spawn_error"` or child process error), sandbox rejection (`failure_class: "sandbox_rejection"`), cancellation (`failure_class: "cancel"`), or runtime execution error, the runner MUST emit `outcome: "error"` with reason `CHALLENGE_EXECUTION_ERROR`. Infrastructure and tooling errors MUST NOT increment `defects_detected` and MUST NOT produce `outcome: "passed"` or `outcome: "failed"`.
   - If command execution elapses past the deadline or returns `failure_class: "timeout"`, the runner MUST emit `outcome: "error"` with reason `CHALLENGE_TIMEOUT` without incrementing `defects_detected`.
4. If tests fail as expected against a mutation or revert that actually changed candidate-copy bytes, candidate tests were present, and no infrastructure/tooling error occurred, the runner MUST mark the challenge as passed.

Absence of candidate tests (`missing_tests`), a `focal-mutation` execution with `mutations_tested === 0`, or a `revert` or `focal-mutation` that does not modify the isolated candidate-copy bytes MUST fail closed. The runner MUST NOT emit `outcome: "passed"` for those conditions. `missing_tests` MUST NOT be treated as expected adversarial detection that proves tests found a seeded defect.

When executing `test-inspection`, the runner MUST reject tautological assertions with `TAUTOLOGICAL_TEST_DETECTED`. Every outcome MUST be schema-valid and canonically bound to its plan, Candidate, node, strategy, and PolicySnapshot.

(Previously: test assertion failures and infrastructure/tooling/spawn errors were not strictly distinguished, allowing execution errors to potentially count as detected defects or produce invalid pass outcomes.)

#### Scenario: Focal mutation detects seeded defect and challenge passes

- GIVEN a canonical plan with an active focal-mutation challenge
- WHEN a mutation inside the frozen diff makes candidate tests fail due to test assertion failure
- THEN `defects_detected` MUST be incremented
- AND the outcome MUST be `passed`
- AND a bound valid challenge-result MUST be emitted

#### Scenario: Complacent test suite passes on seeded defect and challenge fails

- GIVEN a complacent candidate test suite
- WHEN a focal-mutation or revert challenge leaves its tests passing (`exit_code === 0`)
- THEN the outcome MUST be `failed` with `COMPLACENT_TEST_DETECTED`

#### Scenario: Test inspection detects tautological assertion

- GIVEN a test suite containing tautological assertions or unconditional passes
- WHEN test-inspection evaluates the assertions
- THEN the outcome MUST be `failed` with `TAUTOLOGICAL_TEST_DETECTED`

#### Scenario: Missing capability or deadline expiry fails closed

- GIVEN a selected challenge without a verified executor capability, or a non-cooperative run exceeding its wall-clock deadline
- WHEN execution is attempted
- THEN no passed result MUST be emitted
- AND the run MUST fail closed or emit `CHALLENGE_TIMEOUT` with `outcome: "error"`

#### Scenario: Foreign scope or candidate mutation is rejected

- GIVEN a focal-mutation request outside the frozen diff, or a post-run candidate digest differing from its pre-run digest
- WHEN integrity validation runs
- THEN the challenge MUST fail closed
- AND its result MUST NOT satisfy verification

#### Scenario: Missing tests fail closed without a passed outcome

- GIVEN a selected `revert` or `focal-mutation` challenge and an isolated candidate copy with no test files
- WHEN the challenge executes
- THEN the runner MUST fail closed with `outcome: "error"` and reason `MISSING_TESTS`
- AND MUST NOT emit `outcome: "passed"`

#### Scenario: Zero mutations or no-op revert/mutation fail closed

- GIVEN a selected `focal-mutation` that applies no mutation (`mutations_tested === 0`), or a `revert`/`focal-mutation` that leaves candidate-copy bytes unchanged
- WHEN the challenge executes
- THEN the runner MUST fail closed with `outcome: "error"` and reason `NO_MUTATION_APPLIED` or `CHALLENGE_NOOP`
- AND MUST NOT emit `outcome: "passed"`

#### Scenario: Spawn error or infrastructure failure emits error and never increments defects

- GIVEN a `focal-mutation` or `revert` challenge where sandboxed test execution encounters a spawn failure (`failure_class: "spawn_error"` or process execution error)
- WHEN the test command fails with an infrastructure error
- THEN the runner MUST emit `outcome: "error"` with reason `CHALLENGE_EXECUTION_ERROR`
- AND `defects_detected` MUST NOT be incremented
- AND the challenge MUST NOT pass

#### Scenario: Timeout or sandbox rejection emits error outcome without passed result

- GIVEN a `focal-mutation` or `revert` challenge where sandboxed execution times out or violates sandbox path policy
- WHEN the command returns `failure_class: "timeout"` or `failure_class: "sandbox_rejection"`
- THEN the runner MUST emit `outcome: "error"` with `CHALLENGE_TIMEOUT` or `CHALLENGE_EXECUTION_ERROR`
- AND MUST NOT increment `defects_detected` nor mark the challenge as passed
