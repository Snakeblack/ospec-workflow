# Execution Budgets Specification

## Purpose

Define uniform execution budget quotas for graph nodes and dedicated limits for authoritative effects. Enforce strict budget monotonicity across execution retries, recovery loops, and CAS conflict reconciliations, count zero-delta mutation attempts, and isolate transient telemetry outside semantic state.

## Requirements

### Requirement: Uniform Node Execution Budget Quotas {#REQ-execution-budgets-001}

The execution system MUST define and enforce uniform execution budget quotas for every graph node across six orthogonal dimensions: `turns` (integer > 0), `patches` (integer >= 0), `commands` (integer >= 0), `wall_time_minutes` (number > 0), `changed_lines` (integer > 0), and `allowed_paths` (array of string glob patterns). The unified budget evaluator `isBudgetExhausted()` MUST evaluate all declared node budget dimensions during preflight in the transition selector, permit issuance, and `runKernelOperation` prior to calling `effectExecutor`. If ANY single dimension quota reaches zero or is exceeded by consumption, the node MUST be evaluated as exhausted (`exhausted: true`). Execution MUST fail closed immediately with zero invocations to `effectExecutor`, and the node MUST be pruned from further normal execution transitions.
(Previously: Evaluator checked quotas without requiring preflight fail-closed rejection with zero effect executor calls across selector, permits, and runtime.)

#### Scenario: Node turn budget reached zero triggers exhaustion in isBudgetExhausted with zero effect invocations

- GIVEN a graph node with a `turns` quota of 5 and consumed `turns` equal to 5
- WHEN `runKernelOperation` or `isBudgetExhausted()` evaluates the node budget in preflight
- THEN it MUST return `exhausted: true` identifying dimension `turns`
- AND the runtime MUST halt execution with exactly zero calls to `effectExecutor`
- AND the selector MUST prune execution transitions for that node

#### Scenario: Patch changed lines exceeding budget is rejected

- GIVEN a graph node with a `changed_lines` limit of 400 lines
- WHEN a patch attempts to modify 450 lines (additions + deletions)
- THEN the runtime MUST reject the patch
- AND MUST halt the node with a `changed_lines` budget violation

#### Scenario: Command quota exhaustion halts worker execution in preflight

- GIVEN a node whose consumed `commands` reaches its declared limit of 25
- WHEN `isBudgetExhausted()` evaluates the node state during preflight
- THEN it MUST return `exhausted: true` for the `commands` dimension
- AND the selector MUST NOT offer `start` or `recover` for that node

---

### Requirement: Authority Effect Budgets {#REQ-execution-budgets-002}

The execution system MUST define and enforce authoritative effect quotas across four explicit dimensions: `effect_attempts` (integer > 0), `authority_mutations` (integer >= 0), `evidence_runs` (integer >= 0), and `review_sweeps` (integer >= 0). The unified budget evaluator `isBudgetExhausted()` MUST evaluate all four authority dimensions during preflight across the transition selector, permit minting, and `runKernelOperation` before invoking `effectExecutor`. If ANY single authority dimension reaches zero or exceeds quota, authority execution MUST be marked exhausted (`exhausted: true`), MUST fail closed with zero invocations to `effectExecutor`, MUST NOT be granted operation permits, and MUST deterministically prune execution transitions in the selector.
(Previously: Authority budget checking was evaluated separately without requiring zero effect executor calls during preflight in selector, permits, and runtime.)

#### Scenario: Authority mutations exceeding budget fail closed

- GIVEN an authority budget allowing at most 3 `authority_mutations`
- WHEN a fourth authoritative state mutation is requested within the same node scope
- THEN permit issuance MUST fail closed
- AND the Authority Store head MUST remain unmutated

#### Scenario: Review sweeps limit prevents unbounded review passes

- GIVEN a review budget with `review_sweeps: 1`
- WHEN a second review sweep is attempted for the same candidate lineage
- THEN the runtime MUST reject the review execution
- AND MUST transition to terminal review evaluation

#### Scenario: Effect attempts exhaustion evaluated by isBudgetExhausted in preflight

- GIVEN an authority budget where `effect_attempts` reaches 0
- WHEN `isBudgetExhausted()` evaluates the authority budget during preflight
- THEN it MUST return `exhausted: true` for dimension `effect_attempts`
- AND `runKernelOperation` MUST fail closed with exactly zero calls to `effectExecutor`
- AND the runtime MUST refuse permit minting and transition to terminal handling

---

### Requirement: Strict Budget Monotonicity Across Retries And CAS Conflicts {#REQ-execution-budgets-003}

All node and authority budgets MUST be strictly monotonically non-increasing across execution retries, recovery loops, and concurrent CAS conflict reconciliations. When an operation executes an authoritative effect and subsequently encounters a CAS conflict (such as losing a race against a concurrent writer in the Authority Store), the budget consumed by the executed effect MUST NOT be replenished, restored, or reset upon re-synchronization. The retrying writer MUST decrement from the prior consumed state against the new head revision.
(Previously: Budget monotonicity across CAS conflicts did not explicitly forbid restoring budgets consumed by effects executed prior to losing a multi-writer CAS race.)

#### Scenario: CAS conflict reconciliation preserves consumed budget after executed effect

- GIVEN an operation that executed an effect and consumed 1 attempt and 3 turns before encountering a CAS conflict
- WHEN the operation re-syncs and retries against the updated head revision
- THEN the remaining budget MUST preserve the consumed attempt and 3 turns
- AND MUST NOT reset or replenish the initial budget quota

#### Scenario: Concurrent multi-writer CAS conflict preserves consumed attempt on retry

- GIVEN two concurrent runtime writers W1 and W2 executing effects against revision R0
- WHEN W1 wins the CAS race advancing to R1 and W2 fails with a CAS conflict
- THEN W2 retrying against R1 MUST retain its decremented attempt count from the executed effect
- AND W2 MUST NOT restore its pre-execution budget quota

#### Scenario: Retry in repair loop decrements attempt budget monotonically

- GIVEN an execution node with 3 allocated `effect_attempts`
- WHEN attempt 1 fails and triggers an allowlisted `repair` transition
- THEN attempt 2 MUST execute with remaining budget equal to 2 attempts
- AND no implicit budget replenishment MAY occur

---

### Requirement: Zero-Delta Attempt Consumption And Monotonic Invariants {#REQ-execution-budgets-004}

Effect-bearing and mutation steps that produce zero semantic progress (zero modified files, identical output hash, or zero state advance) MUST consume an execution attempt and decrement BOTH node turn quotas (`node.turns`) AND authority `effect_attempts` simultaneously and monotonically. The lifecycle runtime MUST apply zero-delta accounting post-effect evaluation and record a durable `zero-delta-attempt` event in the journal before committing state via CAS. Non-mutating inspection and read-only diagnostic steps MUST NOT be penalized as zero-delta mutations. All budget decrements MUST remain strictly monotonic and non-replenishing across retries and reconciliations.
(Previously: Zero-delta accounting did not mandate simultaneous dual decrement of both turns and effect_attempts along with durable zero-delta-attempt journal event persistence.)

#### Scenario: Zero-delta code patch consumes dual turns and effect attempts with journal event before CAS commit

- GIVEN an active repair step with remaining effect attempts and node turns
- WHEN the worker submits a patch that modifies zero lines or leaves file contents identical
- THEN the runtime MUST detect a zero-delta mutation post-effect
- AND MUST consume one `effect_attempts` AND one node turn before CAS commit
- AND MUST record a durable `zero-delta-attempt` event in the journal

#### Scenario: Read-only inspection step does not consume zero-delta attempt

- GIVEN a worker performing read-only log analysis or test inspection
- WHEN the inspection completes without filesystem mutation
- THEN the action MUST NOT be counted as a zero-delta mutation attempt
- AND effect attempt quotas MUST NOT be decremented for read-only actions

#### Scenario: Zero-delta consumption persists monotonically across CAS race

- GIVEN an operation that suffered a zero-delta mutation and subsequent CAS conflict
- WHEN the operation re-syncs and retries against the head revision
- THEN the remaining attempts MUST reflect the decremented zero-delta consumption
- AND MUST NOT restore consumed budget units

---

### Requirement: Exhausted Budget Terminality And Re-Launch Prohibition {#REQ-execution-budgets-005}

When any execution or authority budget is exhausted (remaining = 0), the runtime MUST prohibit re-launching an identical worker with identical parameters. The runtime MUST deterministically transition the node to `escalate` or `stop`.

#### Scenario: Exhausted budget deterministically transitions to stop or escalate

- GIVEN a node whose `commands` or `effect_attempts` budget reaches 0
- WHEN the kernel evaluates the next valid transition
- THEN ordinary worker re-launch MUST NOT be advertised
- AND the kernel MUST advertise only `escalate`, `replan`, or `stop`

#### Scenario: Direct re-launch of exhausted worker is rejected fail-closed

- GIVEN a node marked with exhausted execution budget
- WHEN an external caller attempts to invoke `execute` on that node
- THEN the runtime MUST reject the request fail-closed
- AND MUST NOT mint an operation permit for the execution

---

### Requirement: Non-Semantic Telemetry Isolation {#REQ-execution-budgets-006}

Execution consumption counters, transient timers, and telemetry metrics MUST be stored outside canonical semantic lifecycle state. Telemetry updates MUST NOT alter canonical state digests, CAS revision hashing, or semantic transition equivalence.

#### Scenario: Telemetry counter update does not alter state digest

- GIVEN an authoritative lifecycle state S with computed semantic digest D
- WHEN execution telemetry records 15 elapsed seconds and 2 executed commands
- THEN the semantic state digest of S MUST remain exactly D
- AND state transition selection MUST NOT evaluate transient telemetry fields
