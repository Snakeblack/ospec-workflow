# Delta for Execution Budgets

## MODIFIED Requirements

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
