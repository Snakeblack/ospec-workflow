# Execution Budgets Specification

## Purpose

Define uniform execution budget quotas for graph nodes and dedicated limits for authoritative effects. Enforce strict budget monotonicity across execution retries, recovery loops, and CAS conflict reconciliations, count zero-delta mutation attempts, and isolate transient telemetry outside semantic state.

## Requirements

### Requirement: Uniform Node Execution Budgets {#REQ-execution-budgets-001}

The execution system MUST define and enforce uniform execution budget quotas for every graph node across six orthogonal dimensions: `turns` (integer > 0), `patches` (integer >= 0), `commands` (integer >= 0), `wall_time_minutes` (number > 0), `changed_lines` (integer > 0), and `allowed_paths` (array of string glob patterns). A node execution that exceeds any declared quota MUST be stopped immediately and marked budget-exhausted.

#### Scenario: Node turn budget exceeded triggers execution halt

- GIVEN a graph node configured with a maximum turn budget of 5 turns
- WHEN the worker executes turn 6 without finishing
- THEN the execution runtime MUST halt the worker
- AND MUST report a budget-exhausted failure for the `turns` dimension

#### Scenario: Patch changed lines exceeding budget is rejected

- GIVEN a graph node with a `changed_lines` limit of 400 lines
- WHEN a patch attempts to modify 450 lines (additions + deletions)
- THEN the runtime MUST reject the patch
- AND MUST halt the node with a `changed_lines` budget violation

---

### Requirement: Authority And Effect Execution Budgets {#REQ-execution-budgets-002}

The execution system MUST define and enforce authoritative effect quotas across four explicit dimensions: `effect_attempts` (integer > 0), `authority_mutations` (integer >= 0), `evidence_runs` (integer >= 0), and `review_sweeps` (integer >= 0). Authoritative actions that exceed their dedicated budget MUST fail closed and MUST NOT be granted operation permits.

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

---

### Requirement: Strict Budget Monotonicity Across Retries And CAS Conflicts {#REQ-execution-budgets-003}

All node and authority budgets MUST be strictly monotonically non-increasing across execution retries, recovery loops, and CAS race reconciliations. When an operation is retried or reconciles after a CAS conflict, the remaining budget MUST decrement from the prior consumed state and MUST NOT reset to initial baseline values.

#### Scenario: CAS conflict reconciliation preserves consumed budget

- GIVEN an operation that consumed 3 turns before encountering a CAS conflict
- WHEN the operation re-syncs and retries against the updated head revision
- THEN the remaining turn budget MUST reflect the 3 previously consumed turns
- AND MUST NOT reset to the initial budget quota

#### Scenario: Retry in repair loop decrements attempt budget monotonically

- GIVEN an execution node with 3 allocated `effect_attempts`
- WHEN attempt 1 fails and triggers an allowlisted `repair` transition
- THEN attempt 2 MUST execute with remaining budget equal to 2 attempts
- AND no implicit budget replenishment MAY occur

---

### Requirement: Zero-Delta Attempt Consumption {#REQ-execution-budgets-004}

Effect-bearing and mutation steps that produce zero semantic progress (zero modified files, identical output hash, or zero state advance) MUST consume an execution attempt. Non-mutating inspection and read-only diagnostic steps MUST NOT be penalized as zero-delta mutations.

#### Scenario: Zero-delta code patch consumes an effect attempt

- GIVEN an active repair step with remaining effect attempts
- WHEN the worker submits a patch that modifies zero lines or leaves file contents identical
- THEN the runtime MUST consume one `effect_attempts` budget unit
- AND MUST record a zero-delta attempt event

#### Scenario: Read-only inspection step does not consume zero-delta attempt

- GIVEN a worker performing read-only log analysis or test inspection
- WHEN the inspection completes without filesystem mutation
- THEN the action MUST NOT be counted as a zero-delta mutation attempt
- AND effect attempt quotas MUST NOT be decremented for read-only actions

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
