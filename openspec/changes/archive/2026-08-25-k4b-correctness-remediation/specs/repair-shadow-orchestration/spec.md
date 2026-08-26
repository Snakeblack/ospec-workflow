# Delta for repair-shadow-orchestration

## ADDED Requirements

### Requirement: Material Dependency Propagation Via Derived Shadow Base {#REQ-repair-shadow-008}

When node N2 depends on node N1, the orchestrator MUST propagate N1's integrated `WorkResult` into N2's execution by deriving a deterministic shadow base from the authorized `SourceSnapshot` plus every completed predecessor's integrated tree. N2 MUST consume that derived base (N1's material output is visible to N2) and MUST execute exclusively through K6a. The orchestrator MUST allocate a fresh isolated workspace per node and MUST NOT share a mutable workspace across nodes. Final `freezeCandidate()` MUST still bind `candidate.base_tree` to the original `SourceSnapshot.base_tree_digest`; derived bases are materialization inputs only.

#### Scenario: Dependent node executes predecessor material output on a derived base

- GIVEN N1 completes with an integrated tree that adds `multiply()` and N2 depends on N1
- WHEN the orchestrator executes N2 through K6a in a fresh workspace
- THEN N2's materialized effective base MUST contain N1's integrated `multiply()`
- AND N2 MUST be able to import and execute `multiply()`
- AND N1 and N2 MUST use distinct workspaces that are disposed independently

#### Scenario: Identical predecessors yield a byte-identical derived-base digest

- GIVEN two independent orchestrations with identical SourceSnapshot and identical N1 WorkResult
- WHEN each derives the shadow base for N2
- THEN both derived-base tree digests MUST be byte-identical

#### Scenario: Shared mutable workspace is rejected fail-closed

- GIVEN a caller or runtime attempt to reuse N1's workspace for N2
- WHEN the orchestrator prepares N2
- THEN it MUST allocate a new workspace via `createWorkspace`
- AND MUST NOT execute N2 against N1's workspace descriptor

---

### Requirement: Auditable Repair Shadow Execution Record {#REQ-repair-shadow-009}

After a successful shadow orchestration, the system MUST persist a versioned record of kind `repair-shadow-execution/v1` through the existing `filesystem-store`. The record MUST bind `CandidateId`, the executed `ExecutionGraph`, and the bound `PolicySnapshot`. The record MUST be queryable for replay and audit. Missing or divergent bindings MUST fail closed without promoting the candidate. Partial or unarchived records MUST NOT be migrated or treated as completed K4b closure.

#### Scenario: Successful run persists a queryable v1 record with required bindings

- GIVEN a successful `orchestrateRepairShadow` that froze Candidate C1 from graph G1 and PolicySnapshot P1
- WHEN the orchestrator finalizes the execution record
- THEN a `repair-shadow-execution/v1` record MUST be stored via `filesystem-store`
- AND the record MUST bind C1, G1, and P1

#### Scenario: Stored record is retrievable for replay and audit

- GIVEN a persisted `repair-shadow-execution/v1` record for Candidate C1
- WHEN an audit query loads that record from the store
- THEN the loaded bindings for CandidateId, ExecutionGraph, and PolicySnapshot MUST equal the stored values

#### Scenario: Incomplete bindings fail closed without promotion

- GIVEN a completed graph whose CandidateId, ExecutionGraph, or PolicySnapshot binding is missing
- WHEN the orchestrator attempts to persist `repair-shadow-execution/v1`
- THEN persistence MUST fail closed
- AND the candidate MUST NOT be promoted

---

## MODIFIED Requirements

### Requirement: Repair Shadow Pipeline Orchestration And Topologically Sequenced Execution {#REQ-repair-shadow-001}

The shadow orchestrator MUST provide `orchestrateRepairShadow(executionGraph, options)` to execute the complete Repair execution lifecycle in a shadow environment. The orchestrator MUST validate the input `ExecutionGraph` against its bound `SourceSnapshot` using `validateExecutionGraphBinding(graph, { sourceSnapshot })` before executing any node. If binding validation fails or if the graph contains cycles, the orchestrator MUST fail closed immediately with an error and dispatch zero worker tasks.

The orchestrator MUST compile declarative `WorkOrder` v2 objects via `compileWorkOrdersV2(executionGraph)` and execute nodes in a deterministic topological order respecting DAG dependencies. The orchestrator MUST NOT accept, honor, or invoke any caller-supplied executor substitute, including `executorFn`. For each executable node in topological order, the orchestrator MUST:
1. Allocate a fresh, isolated workspace via K6a `createWorkspace({ source_snapshot_id })`.
2. Materialize the node's effective shadow base via K6a `materializeSourceSnapshot` — the authorized `SourceSnapshot` for independent nodes, or the derived integrated predecessor base for dependents (see REQ-repair-shadow-008).
3. Dispatch execution exclusively through K6a `executeWorkOrder({ workOrder, workspace, ...allowlistedOptions })`. Allowlisted options MUST NOT overwrite WorkOrder identity, workspace authority, `WorkerTransport`, or isolation capability.
4. Capture raw execution evidence via K6a `captureWorkResult(...)`.
5. Idempotently dispose of the allocated workspace via K6a `disposeWorkspace(workspace)`.

If any node execution fails, the orchestrator MUST stop downstream dependent nodes from executing, mark dependent nodes as unfulfilled/blocked, and finalize workspace cleanup fail-closed.

(Previously: dispatched `executeWorkOrder` with positional arguments; honored `executorFn` and option spreading that could override authority; always materialized the original SourceSnapshot for every node.)

#### Scenario: Full acyclic graph executes in topological order through K6a lifecycle primitives

- GIVEN a valid ExecutionGraph with dependent nodes N1 (independent) and N2 (depends on N1) bound to SourceSnapshot S1
- WHEN `orchestrateRepairShadow(executionGraph, { sourceSnapshot: S1, workerTransport })` is invoked
- THEN node N1 MUST be executed and completed before node N2 starts
- AND each node MUST be allocated a distinct isolated workspace via `createWorkspace` and disposed via `disposeWorkspace`
- AND all command executions MUST be dispatched exclusively via `executeWorkOrder({ workOrder, workspace, ... })`

#### Scenario: Invalid graph binding halts orchestration before workspace allocation

- GIVEN an ExecutionGraph whose `graph_id` does not match its recomputed digest or whose `source_snapshot_id` differs from the provided `SourceSnapshot`
- WHEN `orchestrateRepairShadow` is invoked
- THEN orchestration MUST fail closed immediately with a binding mismatch error
- AND zero workspaces MUST be allocated and zero worker commands executed

#### Scenario: Node failure halts downstream dependent execution and cleans up workspaces

- GIVEN an ExecutionGraph where node N1 fails during `executeWorkOrder`
- WHEN `orchestrateRepairShadow` processes the graph
- THEN dependent node N2 MUST NOT be executed
- AND node N1's workspace MUST be disposed via `disposeWorkspace`
- AND the orchestration outcome MUST report failure with the failed node ID

#### Scenario: Caller-supplied executorFn is ignored and K6a remains exclusive

- GIVEN `orchestrateRepairShadow` options include `executorFn`
- WHEN any node is dispatched
- THEN the orchestrator MUST NOT invoke `executorFn`
- AND MUST call `executeWorkOrder` with the object signature for every node

#### Scenario: Allowlisted options cannot override dispatch authority

- GIVEN caller options that attempt to replace `workOrder`, workspace, `WorkerTransport`, or isolation capability
- WHEN the orchestrator invokes `executeWorkOrder`
- THEN the compiled WorkOrder and orchestrator-owned workspace, transport, and isolation authority MUST be used
- AND overwritten authority MUST be rejected fail-closed

---

### Requirement: Deterministic Patch Integration And Candidate Freeze via K3 {#REQ-repair-shadow-003}

Upon successful completion of each graph node, the shadow orchestrator MUST integrate that node's captured `WorkResult` unified diffs deterministically over the node's effective base (authorized `SourceSnapshot` for roots; derived predecessor tree for dependents). The orchestrator MUST apply diff hunks strictly within that node's `WorkOrder.allowed_paths` without escaping the target tree.

For every `WorkResult` the integrator MUST fail closed when any of the following is invalid: hunk context lines, hunk deletion lines, unified-diff file modes, or a patched path outside that WorkOrder's `allowed_paths`. File modes present on integrated diffs MUST be forwarded to K3 `freezeCandidate()` so they affect Candidate v2 (`changed_paths_modes_digest` / `CandidateId`). After applying integrated patches to produce the candidate tree, the orchestrator MUST invoke K3 `freezeCandidate()` to generate an immutable, canonical `Candidate` v2 record (`kind: "candidate/v2"`, `schema_version: 2`) with a deterministic `CandidateId`. The orchestrator MUST guarantee that `WorkResult` remains raw unapproved worker evidence and is never treated as a `Candidate`. K6a MUST NOT emit `CandidateId`, and the emission of `CandidateId` MUST be the sole responsibility of K3 `freezeCandidate()`.

(Previously: applied diffs without validating hunk context/deletion lines or file modes; containment used orchestrator-level `allowed_paths` rather than each WorkOrder's `allowed_paths`; modes did not affect Candidate v2.)

#### Scenario: Raw WorkResult diffs integrate over SourceSnapshot and freeze via K3

- GIVEN completed WorkResults containing valid unified diffs for nodes modifying `src/app.js`
- AND an authorized SourceSnapshot with base tree digest B1
- WHEN the orchestrator integrates the patches and calls `freezeCandidate()`
- THEN a valid Candidate v2 record MUST be emitted with deterministic `CandidateId`
- AND `candidate.base_tree` MUST equal B1
- AND `candidate.diff_hash` MUST match the SHA-256 fingerprint of the canonical integrated diff

#### Scenario: Patch applying outside allowed paths fails closed before freeze

- GIVEN a WorkResult whose patch attempts to modify a path outside that node's `WorkOrder.allowed_paths`
- WHEN the orchestrator attempts integration
- THEN patch integration MUST fail closed with a path containment error
- AND `freezeCandidate` MUST NOT be invoked

#### Scenario: Identical source and patches produce identical CandidateId

- GIVEN two independent shadow orchestrations with identical SourceSnapshots and identical WorkResult patches
- WHEN both orchestrations freeze their final candidate
- THEN both emitted Candidate records MUST have byte-identical `CandidateId` digests

#### Scenario: Mismatched hunk context or deletion lines fail closed

- GIVEN a WorkResult hunk whose context or deletion line does not match the effective base
- WHEN the orchestrator integrates that WorkResult
- THEN integration MUST fail closed
- AND `freezeCandidate` MUST NOT be invoked

#### Scenario: File modes on integrated diffs change Candidate v2

- GIVEN two otherwise identical WorkResults that differ only by file mode (e.g. `100644` vs `100755`)
- WHEN each is integrated and frozen via `freezeCandidate()`
- THEN the two Candidate v2 records MUST differ in `changed_paths_modes_digest`
- AND MUST have distinct `CandidateId` values

---

### Requirement: Non-Mutating Shadow Comparison Against Fixed Baseline {#REQ-repair-shadow-006}

The shadow orchestrator MUST execute side-by-side comparison between the shadow execution outcome and the fixed reference baseline via `compareShadowExecution(shadowResult, baselineResult)`. The comparison MUST evaluate all seven required dimensions with zero omissions:

| Dimension | MUST evaluate |
|---|---|
| steps | Yes |
| dependencies | Yes |
| diffs | Yes |
| inventory | Yes |
| obligations | Yes |
| invariants | Yes |
| execution metrics | Yes |

The comparator MUST NOT skip a required dimension because extracted values are empty; an empty value is still an evaluation. The shadow comparator MUST operate as a strict read-only observer:
1. Shadow orchestration MUST NOT mutate active production workflow state, git branches, or persistent defaults.
2. Shadow candidate results MUST NOT be automatically promoted to active production defaults or bypass the K9 promotion gate.
3. Discrepancies between shadow and baseline MUST be recorded in telemetry (`telemetryDiff`, `discrepancy_classification`) without halting the active production pipeline.

(Previously: evaluated at most five dimensions and skipped empty ones; omitted dependencies and execution metrics.)

#### Scenario: Shadow comparison records multi-dimensional match against fixed baseline

- GIVEN a shadow orchestration candidate and a baseline repair execution run under identical inputs
- WHEN `compareShadowExecution` evaluates both results
- THEN comparison MUST evaluate steps, dependencies, diffs, inventory, obligations, invariants, and execution metrics
- AND `skipped_dimensions` MUST be empty for those seven dimensions
- AND if all dimensions align, it MUST record `match: true` in comparison telemetry

#### Scenario: Discrepancy detected in shadow diff emits telemetry without halting production

- GIVEN a shadow repair run producing an alternative patch compared to baseline
- WHEN `compareShadowExecution` evaluates the outcomes
- THEN `match` MUST be `false`
- AND `discrepancy_classification` MUST detail the divergence
- AND active production workflow state MUST remain completely unaffected

#### Scenario: Strict non-mutation invariant prevents production state changes

- GIVEN active production journal, repository branch, and default configuration
- WHEN `orchestrateRepairShadow` runs to completion
- THEN production repository HEAD, branches, and configuration defaults MUST remain byte-identical to pre-execution state

#### Scenario: Empty extracted values still count as evaluated dimensions

- GIVEN shadow and baseline results whose obligations and execution metrics arrays are empty
- WHEN `compareShadowExecution` runs
- THEN obligations and execution metrics MUST appear in `evaluated_dimensions`
- AND MUST NOT appear in `skipped_dimensions`
