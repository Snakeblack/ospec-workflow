# Delta for repair-shadow-orchestration

## ADDED Requirements

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

## MODIFIED Requirements

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
