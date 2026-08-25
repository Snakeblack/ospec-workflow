# repair-shadow-orchestration Specification

## Purpose

Define the normative requirements and scenarios for the Repair Shadow Orchestration capability (`orchestrateRepairShadow`). The orchestrator executes compiled Repair execution graphs within an isolated shadow runtime without mutating production defaults or promoting unverified candidates. It validates graph provenance against authorized SourceSnapshots, sequences declarative WorkOrders v2 in deterministic topological order, delegates execution exclusively to K6a isolation primitives under enforced host transport isolation, integrates raw worker diffs onto the authorized snapshot base, freezes candidates via K3 (`freezeCandidate`), tracks graph node state transitions, verifies the complete 4-identity cryptographic chain (`SourceSnapshotId` → `WorkOrderId` → `WorkResultId` → `CandidateId`), compares shadow outcomes against fixed baseline routes, and maintains a strict unidirectional dependency boundary (K4b → K6a).

## Requirements

### Requirement: Repair Shadow Pipeline Orchestration And Topologically Sequenced Execution {#REQ-repair-shadow-001}

The shadow orchestrator MUST provide `orchestrateRepairShadow(executionGraph, options)` to execute the complete Repair execution lifecycle in a shadow environment. The orchestrator MUST validate the input `ExecutionGraph` against its bound `SourceSnapshot` using `validateExecutionGraphBinding(graph, { sourceSnapshot })` before executing any node. If binding validation fails or if the graph contains cycles, the orchestrator MUST fail closed immediately with an error and dispatch zero worker tasks.

The orchestrator MUST compile declarative `WorkOrder` v2 objects via `compileWorkOrdersV2(executionGraph)` and execute nodes in a deterministic topological order respecting DAG dependencies. For each executable node in topological order, the orchestrator MUST:
1. Allocate a fresh, isolated workspace via K6a `createWorkspace({ source_snapshot_id })`.
2. Materialize the minimal input capsule via K6a `materializeSourceSnapshot(workspace, workOrder, sourceSnapshot, options)`.
3. Dispatch execution exclusively through K6a `executeWorkOrder(workOrder, workspace, options)`.
4. Capture raw execution evidence via K6a `captureWorkResult(...)`.
5. Idempotently dispose of the allocated workspace via K6a `disposeWorkspace(workspace)`.

If any node execution fails, the orchestrator MUST stop downstream dependent nodes from executing, mark dependent nodes as unfulfilled/blocked, and finalize workspace cleanup fail-closed.

#### Scenario: Full acyclic graph executes in topological order through K6a lifecycle primitives

- GIVEN a valid ExecutionGraph with dependent nodes N1 (independent) and N2 (depends on N1) bound to SourceSnapshot S1
- WHEN `orchestrateRepairShadow(executionGraph, { sourceSnapshot: S1, workerTransport })` is invoked
- THEN node N1 MUST be executed and completed before node N2 starts
- AND each node MUST be allocated a distinct isolated workspace via `createWorkspace` and disposed via `disposeWorkspace`
- AND all command executions MUST be dispatched exclusively via `executeWorkOrder`

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

---

### Requirement: Enforced Isolation Transport Gate {#REQ-repair-shadow-002}

The shadow orchestrator MUST require that all command execution within `executeWorkOrder` is performed under verified worker isolation where `isolationReported === "enforced"`. The orchestrator MUST provide an active `WorkerTransport` verified by host capability proof to K6a.

If the host adapter or transport reports isolation state as `partial`, `instructional`, or `unavailable`, or if `executeWorkOrder` returns `isolationReported !== "enforced"`, the orchestrator MUST fail closed immediately, reject the node execution outcome, and refuse to accept un-isolated or unconfined worker results. The orchestrator MUST NOT attempt or permit unconfined local subprocess fallback when executing shadow repair workloads.

#### Scenario: Orchestration succeeds with verified enforced transport isolation

- GIVEN an active WorkerTransport with verified WorkerIsolation capability reporting `enforced`
- WHEN `orchestrateRepairShadow` executes a WorkOrder with commands
- THEN `executeWorkOrder` MUST report `isolationReported: "enforced"`
- AND the orchestrator MUST accept the resulting `WorkResult`

#### Scenario: Non-enforced isolation capability fails closed immediately

- GIVEN a WorkerTransport or host environment where isolation is `partial` or `unavailable`
- WHEN `orchestrateRepairShadow` attempts node execution
- THEN orchestration MUST fail closed with an isolation capability error
- AND no commands MUST be executed without confinement

---

### Requirement: Deterministic Patch Integration And Candidate Freeze via K3 {#REQ-repair-shadow-003}

Upon successful completion of graph nodes, the shadow orchestrator MUST integrate all captured `WorkResult` unified diffs/patches deterministically over the authorized base tree provided by `SourceSnapshot`. The orchestrator MUST apply diff hunks strictly within declared `allowed_paths` without escaping the target tree.

After applying the integrated patches to produce the candidate tree, the orchestrator MUST invoke K3 `freezeCandidate()` to generate an immutable, canonical `Candidate` v2 record (`kind: "candidate/v2"`, `schema_version: 2`) with a deterministic `CandidateId`. The orchestrator MUST guarantee that `WorkResult` remains raw unapproved worker evidence and is never treated as a `Candidate`. K6a MUST NOT emit `CandidateId`, and the emission of `CandidateId` MUST be the sole responsibility of K3 `freezeCandidate()`.

#### Scenario: Raw WorkResult diffs integrate over SourceSnapshot and freeze via K3

- GIVEN completed WorkResults containing valid unified diffs for nodes modifying `src/app.js`
- AND an authorized SourceSnapshot with base tree digest B1
- WHEN the orchestrator integrates the patches and calls `freezeCandidate()`
- THEN a valid Candidate v2 record MUST be emitted with deterministic `CandidateId`
- AND `candidate.base_tree` MUST equal B1
- AND `candidate.diff_hash` MUST match the SHA-256 fingerprint of the canonical integrated diff

#### Scenario: Patch applying outside allowed paths fails closed before freeze

- GIVEN a WorkResult whose patch attempts to modify a path outside the node's declared `allowed_paths`
- WHEN the orchestrator attempts integration
- THEN patch integration MUST fail closed with a path containment error
- AND `freezeCandidate` MUST NOT be invoked

#### Scenario: Identical source and patches produce identical CandidateId

- GIVEN two independent shadow orchestrations with identical SourceSnapshots and identical WorkResult patches
- WHEN both orchestrations freeze their final candidate
- THEN both emitted Candidate records MUST have byte-identical `CandidateId` digests

---

### Requirement: End-to-End Four Identity Cryptographic Lineage Chain {#REQ-repair-shadow-004}

The shadow orchestrator MUST enforce and verify the integrity of the complete 4-identity cryptographic lineage chain for every executed Repair route:
`SourceSnapshotId` → `WorkOrderId` → `WorkResultId` → `CandidateId`.

Before producing the final orchestration result, the orchestrator MUST verify:
1. `validateWorkOrderBinding(sourceSnapshot, workOrder)` passes for every node's `WorkOrder`.
2. `validateWorkResultBinding(workOrder, workResult)` passes for every node's `WorkResult`.
3. The frozen `Candidate`'s `base_tree` cryptographically matches `sourceSnapshot.base_tree_digest`.
4. Recomputed `computeSourceSnapshotId`, `computeWorkOrderId`, `computeWorkResultId`, and `computeCandidateId` equal their declared identifiers byte-for-byte.

If ANY link in the identity chain is missing, malformed, or fails cryptographic recomputation, the orchestrator MUST fail closed with an identity lineage error (`LINEAGE_VERIFICATION_FAILED`).

#### Scenario: Complete four identity chain validates with zero tampering

- GIVEN a valid SourceSnapshot S1, compiled WorkOrder W1, captured WorkResult R1, and frozen Candidate C1
- WHEN lineage chain verification is executed
- THEN all four identity bindings MUST validate successfully (`{ ok: true }`)
- AND the lineage record MUST link `S1 -> W1 -> R1 -> C1`

#### Scenario: Tampered WorkResultId fails lineage verification fail-closed

- GIVEN a WorkResult whose payload was altered after execution, causing `computeWorkResultId` to differ from `work_result_id`
- WHEN lineage chain verification runs
- THEN verification MUST fail closed with `WORK_RESULT_MISMATCH`
- AND candidate freeze or evaluation MUST be halted

#### Scenario: Snapshot mismatch between WorkOrder and Candidate fails lineage check

- GIVEN a WorkOrder executed against SourceSnapshot S1 but integrated against SourceSnapshot S2
- WHEN lineage chain verification runs
- THEN verification MUST detect the provenance divergence and fail closed

---

### Requirement: Graph Node State Transition Tracking And Execution Telemetry {#REQ-repair-shadow-005}

The shadow orchestrator MUST maintain a strict state machine for every node in the `ExecutionGraph`. Node states MUST transition strictly according to:
`pending` → `in_flight` → `completed` | `failed` | `blocked`.

The orchestrator MUST record real-time execution telemetry for each node, including:
- Initial status, started timestamp, finished timestamp, and duration in milliseconds.
- Command execution outcomes: command strings, exit codes, and durations.
- Preserved standard output and standard error logs.
- Resource usage metrics: wall time and memory usage.
- Captured `work_order_id` and `work_result_id` references.

The complete graph transition log MUST be preserved in the shadow execution record and MUST be queryable for replay and auditability.

#### Scenario: Node progresses through valid state machine transitions

- GIVEN an ExecutionGraph with node N1 in initial state `pending`
- WHEN orchestration begins node N1
- THEN N1 state MUST transition to `in_flight`
- AND when `executeWorkOrder` succeeds, N1 state MUST transition to `completed`
- AND start/finish timestamps and command telemetry MUST be recorded

#### Scenario: Failed node transitions to failed and marks dependent nodes as blocked

- GIVEN node N1 with dependent downstream node N2
- WHEN node N1 execution fails
- THEN N1 state MUST transition to `failed`
- AND N2 state MUST transition from `pending` to `blocked`
- AND the failure error and partial telemetry MUST be recorded on N1

---

### Requirement: Non-Mutating Shadow Comparison Against Fixed Baseline {#REQ-repair-shadow-006}

The shadow orchestrator MUST execute side-by-side comparison between the shadow execution outcome and the fixed reference baseline via `compareShadowExecution(shadowResult, baselineResult)`. The comparison MUST evaluate all standard repair dimensions: steps, dependencies, patch diffs, file inventory, obligations satisfaction, invariants, and execution metrics.

The shadow comparator MUST operate as a strict read-only observer:
1. Shadow orchestration MUST NOT mutate active production workflow state, git branches, or persistent defaults.
2. Shadow candidate results MUST NOT be automatically promoted to active production defaults or bypass the K9 promotion gate.
3. Discrepancies between shadow and baseline MUST be recorded in telemetry (`telemetryDiff`, `discrepancy_classification`) without halting the active production pipeline.

#### Scenario: Shadow comparison records multi-dimensional match against fixed baseline

- GIVEN a shadow orchestration candidate and a baseline repair execution run under identical inputs
- WHEN `compareShadowExecution` evaluates both results
- THEN comparison MUST evaluate diffs, obligations, invariants, and inventory
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

---

### Requirement: Strict Unidirectional Architectural Boundary K4b → K6a {#REQ-repair-shadow-007}

The system architecture MUST enforce a strict unidirectional dependency boundary between the K4b Repair Shadow orchestrator and K6a worker primitives:
- K4b modules (`scripts/lib/repair-shadow/*`) MAY import and consume K6a worker primitives (`scripts/lib/worker-executor.js`, `scripts/lib/worker-workspace.js`, `scripts/lib/worker-sandbox.js`), K4a execution graph modules, and K3 execution identities.
- K6a modules MUST NOT import, reference, or depend upon K4b repair-shadow modules, execution graph compilers, or candidate freeze logic.
- K6a public schemas and APIs MUST remain strictly generic worker execution primitives free of Repair domain terminology.

Automated static boundary checks MUST verify and enforce this unidirectional architectural invariant.

#### Scenario: K4b consumes K6a primitives without circular imports

- GIVEN the repair shadow orchestration module `scripts/lib/repair-shadow/index.js`
- WHEN static dependency analysis runs
- THEN K4b MUST successfully import and call `createWorkspace`, `materializeSourceSnapshot`, `executeWorkOrder`, `captureWorkResult`, and `disposeWorkspace`

#### Scenario: Static boundary guard asserts zero K4b or Repair references in K6a

- GIVEN K6a modules (`worker-executor.js`, `worker-workspace.js`, `worker-sandbox.js`)
- WHEN static architectural boundary verification executes
- THEN zero imports or references to `repair-shadow`, `orchestrateRepairShadow`, or `freezeCandidate` MUST exist in K6a source files
