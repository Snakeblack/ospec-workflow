# Delta for adversarial-challenges

## MODIFIED Requirements

### Requirement: ChallengeBudget Monotonicity And Causal Exhaustion {#REQ-adversarial-challenges-003}

Every `ChallengePlan` MUST carry a strictly bounded `budget` (`ChallengeBudget`) specifying execution quotas: `max_challenges` (integer > 0), `mutation_budget` (integer >= 0), and `timeout_seconds` (number > 0).

During challenge execution, budget counters MUST be decremented monotonically. If the budget is exhausted before all selected challenges complete, the executor MUST immediately halt and transition to a typed causal failure (`causal-failure/v1`) with category `validation_gap` or `environment_tooling` and reason code `CHALLENGE_BUDGET_EXHAUSTED`. The system MUST NOT perform identical blind restarts when a challenge run exhausts its budget.

(Previously: requirement was truncated by an archive serialization error.)

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

The challenge runner MUST execute only the `selected` challenges specified in the `ChallengePlan` against isolated test instances in ephemeral sandboxes. `executeChallengePlan` MUST execute candidate tests strictly via the isolated sandboxed command runner (`executeSandboxedCommand`) and MUST NOT expose or respect any caller-controllable test runner seam (such as `context.runWorkspaceTests`) passed in the execution context. Caller-supplied mock runners MUST NOT bypass the isolated worker sandbox during plan execution.

When executing `focal-mutation` or `revert`:
1. The runner MUST introduce targeted mutations or patch reversals into the test copy of the candidate codebase in the isolated workspace.
2. The candidate test suite MUST be executed in the isolated sandbox against the mutated codebase.
3. If the candidate tests pass against a seeded defect or unpatched revert, the challenge runner MUST fail the challenge with reason code `COMPLACENT_TEST_DETECTED` and reject the candidate evidence.
4. If the candidate tests fail as expected against the seeded defect or revert, the challenge runner MUST mark the challenge as passed.

When executing `test-inspection`, the runner MUST evaluate test assertions and reject tautological assertions (e.g. constant equality, empty assertions, or unconditional passes) with reason code `TAUTOLOGICAL_TEST_DETECTED`.

All challenge execution outcomes MUST be recorded in a schema-valid `challenge-result/v1` record containing `result_id`, `plan_id`, `candidate_id`, `challenge_type`, `outcome` (`passed | failed | error`), `node_id`, `evidence_ids`, and `details`.

(Previously: executeChallengePlan allowed context.runWorkspaceTests seam which enabled callers to bypass the sandboxed runner, and the requirement was truncated by an archive formatting bug.)

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

#### Scenario: executeChallengePlan ignores caller context test runner seam

- GIVEN an execution context providing a mock `runWorkspaceTests` function that reports test failure
- WHEN `executeChallengePlan` executes a `focal-mutation` or `revert` challenge against a complacent candidate
- THEN the runner MUST ignore `context.runWorkspaceTests` and execute the tests in the real isolated sandbox
- AND the challenge outcome MUST NOT be influenced by the caller-provided mock runner
