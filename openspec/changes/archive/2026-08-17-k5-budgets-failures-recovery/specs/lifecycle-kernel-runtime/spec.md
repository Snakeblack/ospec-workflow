# Delta for lifecycle-kernel-runtime

## ADDED Requirements

### Requirement: Budget Monotonicity Enforcement In Lifecycle Reducers {#REQ-lifecycle-kernel-runtime-025}

Lifecycle reducers and mutation processors MUST enforce strict budget monotonicity. Across retries, recovery loops, and CAS conflict reconciliations, remaining node quotas (`turns`, `patches`, `commands`, `wall_time_minutes`, `changed_lines`, `allowed_paths`) and authority/effect limits (`effect_attempts`, `authority_mutations`, `evidence_runs`, `review_sweeps`) MUST be strictly monotonically non-increasing. Reducers MUST NOT reset, restore, or silently replenish consumed budgets during state transitions or retry attempts.

#### Scenario: Reducer decrements budget monotonically across retry attempts

- GIVEN a state with remaining `effect_attempts: 2`
- WHEN an allowlisted retry action is reduced
- THEN the new state MUST record remaining `effect_attempts: 1`
- AND the reducer MUST NOT restore the initial quota of attempts

#### Scenario: CAS reconciliation preserves consumed budget in next state

- GIVEN an operation that reconciled after a CAS conflict with 4 turns consumed
- WHEN the reducer computes the next state transition
- THEN the state MUST reflect the 4 consumed turns
- AND MUST NOT reset the turn counter to 0

---

### Requirement: Causal Failure Priority And Transition Routing {#REQ-lifecycle-kernel-runtime-026}

The lifecycle kernel runtime MUST resolve mixed failure sets according to deterministic causal priority precedence (`environment_tooling > cas_conflict > ambiguous_effect > validation_gap > code_defect`). The runtime MUST select next transitions strictly from the allowlisted transition matrix for the resolved primary failure code.

#### Scenario: Environment fault takes precedence over code assertions in transition selection

- GIVEN a node reporting both a host tool execution timeout and an assertion failure
- WHEN the runtime derives the next transition offer
- THEN the primary failure MUST resolve to `environment_tooling`
- AND the offered transition MUST be `replan` (host re-dispatch) or `escalate`, NOT code `repair`

#### Scenario: Transition selection rejects unallowlisted recovery operations

- GIVEN a resolved failure of category `ambiguous_effect`
- WHEN `next_transition` is computed
- THEN the kernel MUST NOT offer `repair`
- AND MUST offer only allowlisted transitions (`escalate` or `stop`)

---

### Requirement: Zero-Delta Consumption And Honest Terminality {#REQ-lifecycle-kernel-runtime-027}

The lifecycle kernel runtime MUST record zero-delta attempt consumption on effect-bearing actions that produce zero semantic state advancement. When any execution or authority budget reaches zero, the runtime MUST refuse normal execution transitions and transition deterministically to `escalate` or `stop`.

#### Scenario: Zero-delta effect consumption decrements attempt counter

- GIVEN an authorized mutation step that executes but results in identical state and zero modified files
- WHEN the reducer processes the outcome
- THEN the attempt counter MUST decrement monotonically
- AND a zero-delta execution event MUST be journaled

#### Scenario: Budget exhaustion deterministically blocks execution transitions

- GIVEN a lifecycle state where remaining `turns` or `effect_attempts` equals 0
- WHEN `next_transition` is derived
- THEN the runtime MUST NOT offer normal `execute` transitions
- AND MUST offer only `escalate` or `stop`

---

## MODIFIED Requirements

### Requirement: Recovery Advances Or Terminates {#REQ-lifecycle-kernel-runtime-005}

A recovery transition MAY be advertised only when executing its named operation from the allowlisted transition matrix can either advance lifecycle state (advancing the blocking fingerprint to a distinct value) or produce an explicit terminal outcome (`stop` or `escalate`). A recovery MUST NOT return the same blocking fingerprint state with a refreshed attempt counter or equivalent implicit loop.
(Previously: Recovery requirement stated advance or terminate without explicit blocking fingerprint or causal transition allowlist binding.)

#### Scenario: Named recovery advances

- GIVEN a recoverable interrupted operation
- WHEN the advertised recovery is executed
- THEN the state MUST advance to a different digest
- OR reach an explicit terminal state

#### Scenario: Non-advancing recovery is rejected

- GIVEN a proposed recovery that recreates the same blocking state
- WHEN transition selection validates it
- THEN the kernel MUST reject or replace it with `decide` or `stop`

#### Scenario: Recovery advances blocking fingerprint

- GIVEN a failed state with an active blocking fingerprint
- WHEN an allowlisted recovery transition executes
- THEN the resulting state MUST advance the blocking fingerprint to a distinct value
- OR transition deterministically to an explicit terminal state
