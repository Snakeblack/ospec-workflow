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

All node and authority budgets MUST be strictly monotonically non-increasing across execution retries, recovery loops, and concurrent CAS conflict reconciliations. Deltas of consumed execution budget (`ExecutionUsage`) MUST be runtime-owned and extracted exclusively from `result.usage` or `result.execution_usage` emitted by `effectExecutor` upon effect completion. The runtime MUST NOT accept or treat caller-supplied `input.consumed` as authoritative delta accounting. When an operation executes an authoritative effect or incurs consumption and subsequently encounters a CAS conflict, the runtime MUST retain an exhaustive pending carry-over of consumed deltas partitioned strictly by `${subjectId}:${nodeId}` across all declared node dimensions (`turns`, `commands`, `patches`, `changed_lines`, `wall_time_minutes`, `allowed_paths`) and authority dimensions (`effect_attempts`, `authority_mutations`, `evidence_runs`, `review_sweeps`). The runtime MUST manage carry-over accumulation and replay automatically across retry cycles against the winning revision, preventing budget replenishment, quota resets, cross-node budget leakage under the same subject, and effect duplication on retrying losers.
(Previously: Carry-over tracking was multi-dimensional but did not strictly enforce usage extraction exclusively from effectExecutor result, ban input.consumed authority, or partition pendingCarryOver by subjectId and nodeId.)

#### Scenario: CAS conflict reconciliation preserves consumed budget via runtime-owned carry-over after executed effect

- GIVEN an operation on node `N1` of subject `S1` that executed an effect and consumed 1 attempt and 3 turns reported by `effectExecutor`
- WHEN the operation encounters a CAS conflict and retries against the updated head revision
- THEN the remaining budget for `S1:N1` MUST preserve the consumed attempt and 3 turns via runtime-owned carry-over
- AND MUST NOT reset or replenish the initial budget quota or require caller-fabricated arguments

#### Scenario: Concurrent multi-writer CAS conflict preserves consumed attempt on retry

- GIVEN two concurrent runtime writers W1 and W2 executing effects against revision R0
- WHEN W1 wins the CAS race advancing to R1 and W2 fails with a CAS conflict
- THEN W2 retrying against R1 MUST retain its decremented attempt count from the executed effect through runtime carry-over
- AND W2 MUST NOT restore its pre-execution budget quota

#### Scenario: Exhaustive multidimensional carry-over retained across concurrent writer CAS loss

- GIVEN two concurrent writers executing effects with consumption across `turns`, `commands`, `patches`, `changed_lines`, and `effect_attempts`
- WHEN writer W1 commits successfully and writer W2 receives a `cas-conflict`
- THEN writer W2's runtime accumulator MUST retain all consumed deltas for `turns`, `commands`, `patches`, `changed_lines`, and `effect_attempts`
- AND upon re-dispatching against the winning revision, the new execution MUST deduct all retained carry-over deltas
- AND W2 MUST NOT re-execute already completed non-idempotent side effects

#### Scenario: Retry in repair loop decrements attempt budget monotonically

- GIVEN an execution node with 3 allocated `effect_attempts`
- WHEN attempt 1 fails and triggers an allowlisted `repair` transition
- THEN attempt 2 MUST execute with remaining budget equal to 2 attempts
- AND no implicit budget replenishment MAY occur

#### Scenario: Caller-supplied input.consumed is rejected as usage authority

- GIVEN a caller invoking `runKernelOperation` with fabricated `input.consumed`
- WHEN `effectExecutor` completes and emits `result.usage` with distinct consumed values
- THEN the runtime MUST compute consumed deltas strictly from `result.usage` or `result.execution_usage`
- AND MUST ignore `input.consumed` as authority for budget accounting

#### Scenario: Partitioned carry-over prevents budget contamination between concurrent nodes

- GIVEN two concurrent nodes `N1` and `N2` executing under the same subject `S1`
- WHEN node `N1` incurs execution consumption and suffers a CAS conflict
- THEN pending carry-over MUST be stored under key `S1:N1`
- AND node `N2` evaluating its budget MUST NOT have its quota reduced by `N1`'s carry-over

---

### Requirement: Zero-Delta Attempt Consumption And Monotonic Invariants {#REQ-execution-budgets-004}

Zero-delta accounting MUST be strictly bounded to operations where an effect-bearing code or file mutation occurs but fails to advance code or file state (`effectProgress === false` and zero modified lines or files). Such zero-delta code mutation steps MUST consume an execution attempt and decrement BOTH node turn quotas (`node.turns`) AND authority `effect_attempts` simultaneously and monotonically, recording a durable `zero-delta-attempt` event in the journal before committing state via CAS. Operations that represent legitimate lifecycle state progression (such as `repair` returning `outcome: "advanced"` or non-code lifecycle transitions), non-mutating inspections, read-only diagnostic steps, and terminal control transitions (`escalate`, `stop`) MUST NOT be classified as zero-delta mutations even if zero filesystem modifications occur. All budget decrements MUST remain strictly monotonic and non-replenishing across retries and CAS reconciliations.
(Previously: Zero-delta evaluation did not explicitly delimit zero-delta to effect-bearing code mutations with effectProgress === false while recognizing that repair advances at the lifecycle level with outcome "advanced".)

#### Scenario: Zero-delta code patch consumes dual turns and effect attempts with journal event before CAS commit

- GIVEN an active repair step with remaining effect attempts and node turns
- WHEN the worker executes an effect-bearing code mutation that produces zero file modifications and `effectProgress === false`
- THEN the runtime MUST detect a zero-delta mutation post-effect
- AND MUST consume one `effect_attempts` AND one node turn before CAS commit
- AND MUST record a durable `zero-delta-attempt` event in the journal

#### Scenario: Lifecycle progress without file modification does not consume zero-delta attempt

- GIVEN an authorized operation that advances semantic lifecycle state (`reduced.outcome === "advanced"`) without modifying filesystem files
- WHEN post-effect zero-delta evaluation runs
- THEN the operation MUST NOT be classified as a zero-delta mutation
- AND `effect_attempts` MUST NOT be dual-decremented

#### Scenario: Read-only inspection step does not consume zero-delta attempt

- GIVEN a worker performing read-only log analysis or test inspection
- WHEN the inspection completes without filesystem mutation
- THEN the action MUST NOT be counted as a zero-delta mutation attempt
- AND effect attempt quotas MUST NOT be decremented for read-only actions

#### Scenario: Zero-delta consumption persists monotonically across CAS race

- GIVEN an operation that suffered a zero-delta mutation and subsequent CAS conflict
- WHEN the operation re-syncs and retries against the head revision
- THEN the remaining attempts MUST reflect the decremented zero-delta consumption via runtime carry-over
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
