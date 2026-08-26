# repair-shadow-orchestration Specification

## Purpose

Define the normative requirements and scenarios for the Repair Shadow Orchestration capability (`orchestrateRepairShadow`). The orchestrator executes compiled Repair execution graphs within an isolated shadow runtime without mutating production defaults or promoting unverified candidates. It validates graph provenance against authorized SourceSnapshots, sequences declarative WorkOrders v2 in deterministic topological order, delegates execution exclusively to K6a isolation primitives under enforced host transport isolation, integrates raw worker diffs onto the authorized snapshot base, freezes candidates via K3 (`freezeCandidate`), tracks graph node state transitions, verifies the complete 4-identity cryptographic chain (`SourceSnapshotId` → `WorkOrderId` → `WorkResultId` → `CandidateId`), compares shadow outcomes against fixed baseline routes, and maintains a strict unidirectional dependency boundary (K4b → K6a).

## Requirements

### Requirement: Repair Shadow Pipeline Orchestration And Topologically Sequenced Execution {#REQ-repair-shadow-001}

The shadow orchestrator MUST provide `orchestrateRepairShadow(executionGraph, options)` to execute the complete Repair execution lifecycle in a shadow environment. The orchestrator MUST validate the input `ExecutionGraph` against its bound `SourceSnapshot` using `validateExecutionGraphBinding(graph, { sourceSnapshot })` before executing any node. If binding validation fails or if the graph contains cycles, the orchestrator MUST fail closed immediately with an error and dispatch zero worker tasks.

The orchestrator MUST compile declarative `WorkOrder` v2 objects via `compileWorkOrdersV2(executionGraph)` and execute nodes in a deterministic topological order respecting DAG dependencies. The orchestrator MUST NOT accept, honor, or invoke any caller-supplied executor substitute, including `executorFn`. For each executable node in topological order, the orchestrator MUST:
1. Allocate a fresh, isolated workspace via K6a `createWorkspace({ source_snapshot_id })`.
2. Materialize the node's effective shadow base via K6a `materializeSourceSnapshot` — the authorized `SourceSnapshot` for independent nodes, or the derived integrated predecessor base for dependents (see REQ-repair-shadow-008).
3. Dispatch execution exclusively through K6a `executeWorkOrder({ workOrder, workspace, ...allowlistedOptions })`. Allowlisted options MUST NOT overwrite WorkOrder identity, workspace authority, `WorkerTransport`, or isolation capability.
4. Capture raw execution evidence via K6a `captureWorkResult(...)`.
5. Idempotently dispose of the allocated workspace via K6a `disposeWorkspace(workspace)`.

If any node execution fails, the orchestrator MUST stop downstream dependent nodes from executing, mark dependent nodes as unfulfilled/blocked, and finalize workspace cleanup fail-closed.

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

---

### Requirement: Deterministic Patch Integration And Candidate Freeze via K3 {#REQ-repair-shadow-003}

Upon successful completion of each graph node, the shadow orchestrator MUST integrate that node's captured `WorkResult` unified diffs deterministically over the node's effective base (authorized `SourceSnapshot` for roots; derived predecessor tree for dependents). The orchestrator MUST apply diff hunks strictly within that node's `WorkOrder.allowed_paths` without escaping the target tree.

For every `WorkResult` the integrator MUST fail closed when any of the following is invalid: hunk context lines, hunk deletion lines, unified-diff file modes, or a patched path outside that WorkOrder's `allowed_paths`. File modes present on integrated diffs MUST be forwarded to K3 `freezeCandidate()` so they affect Candidate v2 (`changed_paths_modes_digest` / `CandidateId`). After applying integrated patches to produce the candidate tree, the orchestrator MUST invoke K3 `freezeCandidate()` to generate an immutable, canonical `Candidate` v2 record (`kind: "candidate/v2"`, `schema_version: 2`) with a deterministic `CandidateId`. The orchestrator MUST guarantee that `WorkResult` remains raw unapproved worker evidence and is never treated as a `Candidate`. K6a MUST NOT emit `CandidateId`, and the emission of `CandidateId` MUST be the sole responsibility of K3 `freezeCandidate()`.

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

---

### Requirement: Non-Mutating Shadow Comparison Against Fixed Baseline {#REQ-repair-shadow-006}

The shadow orchestrator MUST execute side-by-side comparison between the shadow execution outcome and the fixed reference baseline via `compareShadowExecution(shadowProjection, baselineProjection)`. Each argument MUST be a canonical projection of `ExecutionGraph`, frozen `Candidate`, captured `WorkResults`, and graph telemetry. The comparator MUST evaluate all seven required dimensions with zero omissions:

| Dimension | Canonical source | MUST evaluate |
|---|---|---|
| steps | ExecutionGraph node `node_id` in topological order | Yes |
| dependencies | ExecutionGraph edges keyed by `node_id` | Yes |
| diffs | Candidate / WorkResults | Yes |
| inventory | Candidate paths | Yes |
| obligations | ExecutionGraph obligations | Yes |
| invariants | ExecutionGraph node/graph invariants | Yes |
| execution metrics | telemetry keyed by `node_id` | Yes |

The `steps` dimension MUST be the topological `node_id` sequence. The comparator MUST NOT substitute `operation`, `work_order_id`, or an ad-hoc `route.steps` list for `steps`. The comparator MUST NOT skip a required dimension because extracted values are empty; an empty value is still an evaluation. The shadow comparator MUST operate as a strict read-only observer:
1. Shadow orchestration MUST NOT mutate active production workflow state, git branches, or persistent defaults.
2. Shadow candidate results MUST NOT be automatically promoted to active production defaults or bypass the K9 promotion gate.
3. Discrepancies between shadow and baseline MUST be recorded in telemetry (`telemetryDiff`, `discrepancy_classification`) without halting the active production pipeline.
(Previously: Comparison accepted ad-hoc route objects and could treat `operation` or `work_order_id` as steps.)

#### Scenario: Shadow comparison records multi-dimensional match against fixed baseline

- GIVEN a shadow orchestration candidate and a baseline repair execution run under identical inputs
- WHEN `compareShadowExecution` evaluates both canonical projections
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

- GIVEN shadow and baseline projections whose obligations and execution metrics arrays are empty
- WHEN `compareShadowExecution` runs
- THEN obligations and execution metrics MUST appear in `evaluated_dimensions`
- AND MUST NOT appear in `skipped_dimensions`

#### Scenario: Steps dimension is the topological node_id sequence

- GIVEN two projections whose ExecutionGraphs share topological `node_id` order but differ in `operation` strings
- WHEN `compareShadowExecution` evaluates the `steps` dimension
- THEN `steps` MUST compare equal
- AND MUST NOT treat `operation` or `work_order_id` as the `steps` value

#### Scenario: Comparator rejects a non-graph projection for steps

- GIVEN a comparison input that lacks an ExecutionGraph-derived `node_id` step sequence
- WHEN `compareShadowExecution` is invoked
- THEN it MUST fail closed with `reason_code: "INVALID_COMPARISON_PROJECTION"`
- AND MUST NOT silently fall back to `operation` or `work_order_id`
- AND MUST NOT claim `match: true`

---

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

---

---

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

---

### Requirement: Auditable Repair Shadow Execution Record {#REQ-repair-shadow-009}

After a successful shadow orchestration, the system MUST persist a versioned record of kind `repair-shadow-execution/v1` through the existing `filesystem-store`. The record MUST bind `CandidateId`, the executed `ExecutionGraph`, and the bound `PolicySnapshot`. The record MUST be queryable for replay and audit.

`CandidateId` MUST remain a lineage binding only. The store MUST NOT treat `CandidateId` as a unique execution slot. One `CandidateId` MUST be allowed to have N persisted records. The store MUST address records by an internal canonical fingerprint of the record payload. That fingerprint MUST NOT be published as a fifth kernel identity family and MUST NOT join the four-identity chain (`SourceSnapshotId` → `WorkOrderId` → `WorkResultId` → `CandidateId`).

Persisting a byte-identical record for an existing fingerprint MUST be idempotent. Persisting a distinct record that shares a `CandidateId` with an already stored record MUST succeed. Query by `CandidateId` MUST return the complete set of records for that candidate. Missing or divergent bindings MUST fail closed without promoting the candidate. Partial or unarchived records MUST NOT be migrated or treated as completed K4b closure.
(Previously: The store keyed a single record by CandidateId and rejected a second distinct record as CAS conflict.)

#### Scenario: Successful run persists a queryable v1 record with required bindings

- GIVEN a successful `orchestrateRepairShadow` that froze Candidate C1 from graph G1 and PolicySnapshot P1
- WHEN the orchestrator finalizes the execution record
- THEN a `repair-shadow-execution/v1` record MUST be stored via `filesystem-store`
- AND the record MUST bind C1, G1, and P1

#### Scenario: Stored record is retrievable for replay and audit

- GIVEN a persisted `repair-shadow-execution/v1` record for Candidate C1
- WHEN an audit query loads records for C1 from the store
- THEN the loaded set MUST include that record
- AND bindings for CandidateId, ExecutionGraph, and PolicySnapshot MUST equal the stored values

#### Scenario: Incomplete bindings fail closed without promotion

- GIVEN a completed graph whose CandidateId, ExecutionGraph, or PolicySnapshot binding is missing
- WHEN the orchestrator attempts to persist `repair-shadow-execution/v1`
- THEN persistence MUST fail closed
- AND the candidate MUST NOT be promoted

#### Scenario: One Candidate persists N distinct execution records

- GIVEN two successful orchestrations that freeze the same CandidateId C1 with distinct execution-record payloads
- WHEN both records are persisted
- THEN both MUST be stored
- AND a query by C1 MUST return both records

#### Scenario: Byte-identical persist is idempotent

- GIVEN an already stored `repair-shadow-execution/v1` record with internal fingerprint F
- WHEN the same byte-identical payload is persisted again
- THEN the store MUST succeed idempotently
- AND MUST NOT duplicate the record

#### Scenario: Internal fingerprint is not a fifth domain identity

- GIVEN a persisted execution record
- WHEN lineage verification runs
- THEN the four-identity chain MUST remain `SourceSnapshotId` → `WorkOrderId` → `WorkResultId` → `CandidateId`
- AND the internal storage fingerprint MUST NOT appear as a kernel identity schema or lineage slot

---

### Requirement: Malformed Unified Diffs Fail Closed Before Freeze {#REQ-repair-shadow-010}

For every non-empty `WorkResult` patch, the integrator MUST parse unified diffs fail-closed and MUST reject the patch with `reason_code: "MALFORMED_UNIFIED_DIFF"` before `freezeCandidate()` when any of the following holds:

| Patch shape | MUST |
|---|---|
| Non-empty text with zero valid file sections or zero valid hunks | Reject `MALFORMED_UNIFIED_DIFF` |
| Create (`---` `/dev/null` or `new file mode`) without at least one valid `@@` hunk | Reject `MALFORMED_UNIFIED_DIFF` |
| Delete (`+++` `/dev/null` or `deleted file mode`) without at least one valid `@@` hunk | Reject `MALFORMED_UNIFIED_DIFF` |
| Truncated or unparseable `@@` hunk header/body | Reject `MALFORMED_UNIFIED_DIFF` |
| Mode-only (`old mode` / `new mode` on an existing path, no create/delete, no content hunks) | Accept and forward modes to K3 |

Header-only create or delete MUST NOT be treated as mode-only. Existing hunk-context, deletion-line, file-mode, and `allowed_paths` fail-closed rules in REQ-repair-shadow-003 remain in force.

#### Scenario: Header-only create is rejected as MALFORMED_UNIFIED_DIFF

- GIVEN a WorkResult patch that declares a new file via `--- /dev/null` and `+++` path (or `new file mode`) with no valid `@@` hunk
- WHEN the orchestrator integrates that WorkResult
- THEN integration MUST fail closed with `reason_code: "MALFORMED_UNIFIED_DIFF"`
- AND `freezeCandidate` MUST NOT be invoked

#### Scenario: Header-only delete is rejected as MALFORMED_UNIFIED_DIFF

- GIVEN a WorkResult patch that declares a delete via `+++ /dev/null` (or `deleted file mode`) with no valid `@@` hunk
- WHEN the orchestrator integrates that WorkResult
- THEN integration MUST fail closed with `reason_code: "MALFORMED_UNIFIED_DIFF"`
- AND `freezeCandidate` MUST NOT be invoked

#### Scenario: Non-empty patch without valid files or hunks is rejected

- GIVEN a non-empty WorkResult patch that contains no `diff --git` or `---`/`+++` file section with a valid hunk
- WHEN the orchestrator integrates that WorkResult
- THEN integration MUST fail closed with `reason_code: "MALFORMED_UNIFIED_DIFF"`
- AND `freezeCandidate` MUST NOT be invoked

#### Scenario: Mode-only diff remains valid and affects Candidate v2

- GIVEN a WorkResult whose only change is `old mode` / `new mode` on an existing path with no create/delete and no content hunks
- WHEN the orchestrator integrates that WorkResult and freezes via `freezeCandidate()`
- THEN integration MUST succeed
- AND Candidate v2 `changed_paths_modes_digest` / `CandidateId` MUST reflect the mode change

---

---

### Requirement: Predecessor Conflicts Apply Only To Incomparable DAG Nodes {#REQ-repair-shadow-011}

When deriving a dependent node's effective base, the orchestrator MUST classify predecessor patch overlaps using DAG reachability. Two predecessors A and B of the node being prepared are **incomparable** if and only if A is not in B's ancestor closure and B is not in A's ancestor closure.

The orchestrator MUST fail closed with `reason_code: "PREDECESSOR_CONTEXT_CONFLICT"` before `freezeCandidate()` when incomparable predecessors claim overlapping original hunk context on the same path. Ancestor→descendant overlaps on the same path MUST be permitted (the descendant already incorporates the ancestor's material output). Last-writer-wins MUST NOT be a legal merge among incomparable predecessors.

#### Scenario: Ancestor-descendant overlap on the same path is permitted

- GIVEN N1 completes with a patch on `src/app.js` and N2 depends on N1 and also patches overlapping original context on `src/app.js`
- WHEN the orchestrator prepares N2's derived base
- THEN overlap MUST NOT be classified as `PREDECESSOR_CONTEXT_CONFLICT`
- AND N2 MUST execute against the derived base that includes N1's material output

#### Scenario: Incomparable diamond predecessors with overlapping context fail closed

- GIVEN independent N1 and N2 that both patch overlapping original hunk context on `src/app.js`, and N3 depends on both
- WHEN the orchestrator prepares N3's derived base
- THEN it MUST fail closed with `reason_code: "PREDECESSOR_CONTEXT_CONFLICT"`
- AND `freezeCandidate` MUST NOT be invoked for N3

#### Scenario: Comparable chain with a later diamond does not inherit false conflicts

- GIVEN N0 → N1 and N0 → N2 where N1 and N2 are incomparable, and only N1 and N2 overlap on a path
- WHEN the orchestrator prepares a node whose predecessor set is {N0, N1} (N2 not a predecessor)
- THEN N0/N1 overlap MUST NOT fail closed solely because N1 also overlaps N2 elsewhere
- AND only incomparable pairs inside the node's predecessor set MUST be evaluated

---

---

### Requirement: Capsule Inputs Bound Materialization Of EffectiveShadowBase {#REQ-repair-shadow-012}

When allocating a node workspace, the orchestrator MUST invoke K6a `materializeSourceSnapshot` with the compiled WorkOrder v2 (including its `capsule_inputs`) and that node's `EffectiveShadowBase`. The orchestrator MUST NOT omit, replace, or expand `capsule_inputs` at the call site. Materialized files MUST be exactly `EffectiveShadowBase ∩ capsule_inputs` (see worker-isolation). Paths present on `EffectiveShadowBase` but absent from `capsule_inputs` MUST NOT be written. A declared `capsule_input` missing from `EffectiveShadowBase` MUST fail closed before worker dispatch.

#### Scenario: K4b materializes only the intersection

- GIVEN an EffectiveShadowBase containing `src/app.js` and `README.md`, and WorkOrder `capsule_inputs: ["src/app.js"]`
- WHEN the orchestrator materializes the node via K6a
- THEN `src/app.js` MUST be present in the workspace
- AND `README.md` MUST NOT be present

#### Scenario: Missing capsule input on the effective base fails closed

- GIVEN WorkOrder `capsule_inputs` including `src/missing.js` that is absent from the node's EffectiveShadowBase
- WHEN the orchestrator materializes the node
- THEN materialization MUST fail closed
- AND `executeWorkOrder` MUST NOT run for that node

---
