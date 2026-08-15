# execution-graph-compiler Specification

## Purpose

Define the semantic Execution Graph schema and compiler for Repair routes, internal Obligation Manifest view, PolicySnapshot compile binding, contractual binding to SourceSnapshot provenance, typed clarify descendant invalidation/recompilation, declarative Work Order v2 compilation with atomic graph-snapshot validation, fixture-based deterministic replay, and non-mutating shadow comparison against fixed baseline flow without live runtime worker authority.

## Requirements

### Requirement: Semantic Execution Graph Schema, SourceSnapshot Binding, PolicySnapshot ID Binding, Cycle Detection, And Deterministic Graph ID {#REQ-execution-graph-compiler-001}

The compiler MUST transform change contracts for Repair routes into a semantic Directed Acyclic Graph (DAG) bound to a canonical `SourceSnapshot` and `PolicySnapshot`. Every graph node MUST declare coarse semantic units: `node_id`, `kind`, `operation`, `objective`, `dependencies` (array of `node_id`), `ownership` (`owner` and `mode`: `exclusive|shared`), `allowed_paths`, `invariants`, `required_evidence`, and `budget_ref`. The compiler and schema MUST reject microscopic worker action nodes (such as `read`, `edit`, `test`, `file_edit`, `bash_run`, `grep`) fail-closed.

The Execution Graph MUST formally bind `source_snapshot_id` matching `^sha256:[a-f0-9]{64}$` and `policy_snapshot_id` matching `^sha256:[a-f0-9]{64}$`. The compiler MUST detect dependency cycles via `hasCycle()` and fail closed before graph emission. The compiler MUST clone input and output nodes and obligations defensively (via deep clone) to ensure graph immutability against caller mutations. The compiler MUST compute a deterministic `GraphId` by hashing canonical `contract_digest`, `policy_snapshot_id`, `policy_bundle_digest`, `source_snapshot_id`, and `nodes`. Recompiling under identical inputs MUST produce an identical `GraphId`. Altering `source_snapshot_id`, `policy_snapshot_id`, `contract_digest`, `policy_bundle_digest`, or any node property MUST produce a distinct `GraphId`.
(Previously: GraphId did not require policy_snapshot_id in its preimage, compileExecutionGraph lacked cycle detection and defensive cloning of nodes/obligations.)

#### Scenario: Compiler generates valid semantic DAG with SourceSnapshot and PolicySnapshot binding for Repair route

- GIVEN a valid change contract for a localized Repair route and canonical `source_snapshot_id` and `policy_snapshot_id` matching `sha256:<64 lowercase hex>`
- WHEN the compiler executes
- THEN it MUST output an Execution Graph with coarse semantic nodes bound to `source_snapshot_id` and `policy_snapshot_id`
- AND every node MUST pass schema validation with non-empty objective, ownership, and required evidence

#### Scenario: Missing or malformed source snapshot id fails graph compilation fail-closed

- GIVEN a change contract and a missing, empty, uppercase, or malformed `source_snapshot_id`
- WHEN graph compilation executes
- THEN compilation MUST fail closed before emitting the Execution Graph
- AND it MUST NOT substitute, infer, or normalize an invalid identifier

#### Scenario: Missing or malformed policy snapshot id fails graph compilation fail-closed

- GIVEN a change contract and a missing, empty, uppercase, or malformed `policy_snapshot_id`
- WHEN graph compilation executes
- THEN compilation MUST fail closed before emitting the Execution Graph
- AND it MUST NOT substitute, infer, or normalize an invalid identifier

#### Scenario: Microscopic worker action nodes fail schema and compilation validation

- GIVEN an Execution Graph input containing a microscopic node with operation `read`, `file_edit`, or `bash_run`
- WHEN graph validation or compilation executes
- THEN validation MUST fail closed
- AND the compiler MUST reject microscopic worker actions as graph nodes

#### Scenario: Dependency cycles in graph nodes trigger fail-closed rejection

- GIVEN an Execution Graph input whose nodes contain cyclic dependencies (e.g. N1 -> N2 -> N1)
- WHEN graph compilation executes
- THEN `hasCycle` MUST detect the cycle and compilation MUST fail closed
- AND zero graph structures MUST be emitted

#### Scenario: Defensive cloning prevents post-compilation mutation of graph nodes or obligations

- GIVEN mutable node or obligation arrays passed to `compileExecutionGraph`
- WHEN compilation succeeds and the caller mutates the input objects or the returned graph nodes
- THEN the internal graph state MUST remain isolated and unmodified

#### Scenario: Deterministic GraphId binds contract, policy snapshot, and source snapshot digests

- GIVEN a change contract digest C1, a policy snapshot id PS1, a policy bundle digest P1, and a source snapshot id S1
- WHEN `computeGraphId` is evaluated
- THEN it MUST generate a deterministic `GraphId`
- AND modifying `policy_snapshot_id` from PS1 to PS2 MUST produce a distinct `GraphId`
- AND modifying `source_snapshot_id` from S1 to S2 MUST produce a distinct `GraphId`
- AND modifying any field in contract or policy bundle MUST produce a distinct `GraphId`

---

### Requirement: Internal Obligation Manifest Completeness And Contract Obligation Authority {#REQ-execution-graph-compiler-002}

The Execution Graph MUST embed an internal Obligation Manifest view containing all contract obligations. Contract `contract.obligations` MUST be authoritative: external obligation inputs MUST reconcile 100% against contract obligations, and passing an empty array MUST NOT strip or omit contract obligations. For every obligation with criticality `must`, the manifest MUST declare non-empty `implemented_by` mapping to at least one semantic node ID and non-empty `required_evidence` mapping to required test or proof evidence, OR declare an explicit `deferred` record containing `reason` and `approved_by`. The compiler MUST fail closed if any contract `MUST` obligation is omitted, unmapped, missing required evidence without an approved deferral, or stripped by external overrides.
(Previously: Empty obligation parameters could bypass contract obligations without enforcing authoritative contract reconciliation.)

#### Scenario: All MUST obligations mapped with evidence pass compilation

- GIVEN a contract declaring `MUST` obligations for a Repair route
- WHEN the Execution Graph is compiled with each obligation mapped to implementing nodes and required evidence
- THEN Obligation Manifest validation MUST succeed
- AND the graph MUST be marked complete

#### Scenario: Orphan MUST obligation fails compilation fail-closed

- GIVEN a contract declaring a `MUST` obligation that is omitted from `implemented_by` or lacks `required_evidence`
- WHEN the compiler validates the Obligation Manifest
- THEN compilation MUST fail closed
- AND the report MUST identify the unfulfilled obligation ID

#### Scenario: Explicit approved deferral satisfies obligation manifest check

- GIVEN a contract obligation with an explicit `deferred` entry specifying rationale and approver
- WHEN the compiler validates the Obligation Manifest
- THEN validation MUST succeed
- AND the deferred status MUST be recorded in the compiled graph view

#### Scenario: Authoritative contract obligations cannot be stripped by empty external obligation inputs

- GIVEN a change contract declaring `MUST` obligations and an empty obligations array passed to compilation
- WHEN `compileExecutionGraph` executes
- THEN the compiler MUST enforce authoritative `contract.obligations` without stripping
- AND compilation MUST fail closed if implementing nodes do not cover the contract obligations

---

### Requirement: PolicySnapshot Compile Binding And Digest {#REQ-execution-graph-compiler-003}

The compiler MUST bind every compiled Execution Graph to a `PolicySnapshot` capturing the exact policy configuration used during classification and compilation. The `PolicySnapshot` MUST declare `snapshot_id` matching `^sha256:[a-f0-9]{64}$`, `policy_bundle_digest`, `compiler_version`, `classifier_version`, `runtime_version`, and resolved `effective_rules`. The compiler MUST compute `computePolicySnapshotDigest` deterministically and incorporate `policy_snapshot_id` into the Execution Graph structure and `GraphId`. Any divergence in `effective_rules` or component versions MUST produce a different `PolicySnapshot` digest and consequently a different `GraphId`.
(Previously: PolicySnapshot ID was generated but not required as a top-level bound property in ExecutionGraph schema and GraphId derivation.)

#### Scenario: PolicySnapshot captures compile configuration and effective rules

- GIVEN a policy configuration and compiler/classifier runtime components
- WHEN a `PolicySnapshot` is generated during compile
- THEN it MUST contain `snapshot_id`, `policy_bundle_digest`, component versions, and resolved `effective_rules`
- AND its digest MUST match `sha256:<64 hex>` format

#### Scenario: Divergent effective rules produce distinct PolicySnapshot and GraphId digests

- GIVEN two compile runs with identical contract input but different `effective_rules` in policy configuration
- WHEN `PolicySnapshot` and `GraphId` are generated
- THEN the two `PolicySnapshot` digests MUST be distinct
- AND the two resulting `GraphId` digests MUST be distinct

#### Scenario: ExecutionGraph includes valid policy_snapshot_id matching PolicySnapshot digest

- GIVEN a compiled ExecutionGraph
- WHEN inspected for policy provenance
- THEN `policy_snapshot_id` MUST equal the bound PolicySnapshot's `snapshot_id` byte-for-byte

---

### Requirement: Typed ClarifyEvent Descendant Invalidation And Recompilation {#REQ-execution-graph-compiler-004}

The system MUST represent clarifications as typed `ClarifyEvent` records specifying `event_id`, `question_id`, `answer`, `timestamp`, and `affected_nodes`. Upon receiving a `ClarifyEvent`, `applyClarifyEvent` MUST calculate the transitive closure of dependent descendant nodes in the Execution Graph DAG, mutate affected nodes in the graph structure with clarify answer context, and bind the `ClarifyEvent` to a newly derived `GraphId`. Invalidation MUST be strictly scoped to those declared descendant nodes, and `applyClarifyEvent` MUST return the list of invalidated node IDs to downstream consumers (such as replay engines) for fail-closed fixture rejection. Valid outputs and states of unaffected ancestor and independent sibling nodes MUST be preserved.
(Previously: ClarifyEvent did not mutate affected node structures, re-bind to new GraphId, or propagate invalidated node IDs to replay engine.)

#### Scenario: ClarifyEvent invalidates descendant nodes and mutates affected graph node structure

- GIVEN an Execution Graph DAG where node N3 depends on node N2, and N2 depends on node N1
- WHEN a `ClarifyEvent` affects node N2
- THEN nodes N2 and N3 MUST be marked invalidated in the returned invalidation set
- AND affected node N2 in the returned graph MUST reflect clarify modifications
- AND ancestor node N1 MUST remain valid without recompilation

#### Scenario: ClarifyEvent generates updated GraphId and outputs invalidated node IDs

- GIVEN an Execution Graph and a valid `ClarifyEvent`
- WHEN `applyClarifyEvent` executes
- THEN the resulting graph MUST declare an updated `graph_id` bound to the clarify state
- AND the result MUST return `invalidatedNodeIds` containing all transitive descendants

#### Scenario: Unaffected ancestor and sibling node states are preserved

- GIVEN an Execution Graph with independent parallel branches B1 and B2
- WHEN a `ClarifyEvent` affects only branch B2
- THEN branch B1 nodes and their recorded outputs MUST remain intact and valid

#### Scenario: Circular or unknown dependency references in clarify fail closed

- GIVEN a `ClarifyEvent` referencing unknown node IDs or introducing a dependency cycle
- WHEN clarify processing runs
- THEN invalidation MUST fail closed with an invalid graph error

---

### Requirement: Declarative Work Order v2 Compilation With Topological Dependency Resolution And Atomic Provenance Binding {#REQ-execution-graph-compiler-005}

The compiler's `compileWorkOrders` / `compileWorkOrdersV2` public compilation path MUST emit declarative `WorkOrder` v2 structures with `kind: "work-order/v2"`, `schema_version: 2`, and bound `source_snapshot_id`. Node dependencies MUST be topologically materialized and resolved as canonical `WorkOrderId` sha256 digests (`sha256:<64 hex>`) computed via `computeWorkOrderId()` rather than raw node ID strings.

Before emitting any Work Order, the compiler MUST perform atomic canonical schema validation of the entire `ExecutionGraph` and every emitted `WorkOrder`:
1. It MUST verify that the graph validates against canonical `execution-graph/v1.schema.json` and declares a valid `source_snapshot_id` and `policy_snapshot_id` matching `sha256:<64 lowercase hexadecimal characters>`.
2. When external `sourceSnapshot` or `sourceSnapshotId` is supplied in context, it MUST verify that the context snapshot matches the graph's bound `source_snapshot_id` byte-for-byte; any mismatch or bypass attempt MUST fail closed.
3. It MUST verify that every node in the graph is a valid coarse semantic node without microscopic operations, has valid non-empty objective, ownership, and required evidence, and has valid acyclic dependencies.
4. It MUST verify that the embedded Obligation Manifest is complete and satisfied against authoritative contract obligations.
5. Every generated WorkOrder MUST validate against canonical `work-order/v2.schema.json` with resolved `sha256:...` dependency digests.

If ANY validation check fails for ANY node, graph property, or WorkOrder, compilation MUST fail closed atomically with zero Work Orders emitted (preventing partial emission, graph escalation, and provenance bypass).

The emitted `source_snapshot_id` on every WorkOrder v2 MUST equal the validated graph `source_snapshot_id` byte-for-byte. Emitted v2 Work Orders MUST preserve the semantic node bindings for `objective`, `allowed_paths`, `invariants`, `dependencies` (as WorkOrderId digests), `ownership`, `required_evidence`, and `budget`, and MUST NOT attach execution tokens or live worker authority.

`work-order/v1` compilation consumers (`compileWorkOrdersV1`) and fixtures MAY remain available solely as legacy compatibility surfaces, but the compiler MUST NOT silently downgrade new output to v1. `work-order/v1.schema.json` and its K1 pin MUST remain byte-identical; this migration MUST NOT retarget K1 pins to accommodate altered v1 content. Compilation of Work Orders MUST NOT execute workers or dispatch runtime processes.
(Previously: WorkOrder v2 emitted raw string node IDs in dependencies without topological sha256 WorkOrderId digest resolution, and schema validation relied on manual checks rather than canonical schema validators.)

#### Scenario: Declarative Work Order v2 resolves topological dependencies to canonical WorkOrderId sha256 digests

- GIVEN a valid ExecutionGraph containing coarse semantic nodes N1 and N2 (where N2 depends on N1) bound to `source_snapshot_id` S1
- WHEN `compileWorkOrdersV2` executes
- THEN N1's WorkOrder MUST have empty `dependencies` `[]` and canonical `work_order_id` W1 (`sha256:...`)
- AND N2's WorkOrder MUST have `dependencies` `[W1]` containing N1's canonical `WorkOrderId` digest
- AND every WorkOrder MUST validate against `work-order/v2.schema.json`

#### Scenario: Atomic canonical schema validation validates ExecutionGraph and all WorkOrders v2 fail-closed

- GIVEN an ExecutionGraph or generated WorkOrder that fails canonical JSON Schema validation
- WHEN `compileWorkOrdersV2` executes
- THEN compilation MUST fail closed atomically
- AND zero Work Orders MUST be emitted

#### Scenario: Provenance mismatch or bypass attempt fails closed before emission

- GIVEN an ExecutionGraph bound to `source_snapshot_id` S1
- AND compilation context providing a mismatched or unverified `sourceSnapshotId` S2
- WHEN `compileWorkOrdersV2` is invoked
- THEN compilation MUST fail closed with a provenance mismatch error
- AND zero Work Orders MUST be emitted

#### Scenario: Missing, malformed, or invalid source snapshot provenance fails closed

- GIVEN an ExecutionGraph or context with an absent, empty, uppercase, or malformed `source_snapshot_id`
- WHEN `compileWorkOrdersV2` is invoked
- THEN compilation MUST fail closed before emitting any Work Order
- AND it MUST NOT substitute, normalize, or derive another source snapshot identifier

#### Scenario: Atomic graph validation fails closed on invalid node or graph escalation with zero emitted orders

- GIVEN an ExecutionGraph containing a node with an invalid dependency, microscopic operation, or missing required evidence
- WHEN `compileWorkOrdersV2` is invoked
- THEN compilation MUST fail closed atomically
- AND zero WorkOrder objects MUST be returned

#### Scenario: Frozen v1 legacy fixtures and consumers remain valid without output downgrade

- GIVEN an existing valid `work-order/v1` fixture or consumer
- WHEN legacy compatibility validation runs after the v2 migration
- THEN the v1 artifact MUST remain valid under its frozen v1 schema
- AND `compileWorkOrders` MUST still emit only `work-order/v2` for new compilation
- AND K1 schema pins MUST NOT be retargeted

#### Scenario: Work Order compilation does not issue execution authority or invoke workers

- GIVEN a compiled declarative `WorkOrder` v2
- WHEN inspected for authority and worker execution tokens
- THEN the Work Order MUST contain zero authority permits or live execution credentials
- AND no worker process MUST have been spawned during compilation

---

### Requirement: Fixture-Based Deterministic Replay Engine With Closed Completion Discrimination {#REQ-execution-graph-compiler-006}

The system MUST provide a deterministic replay engine that executes graph transitions against pre-recorded fixture results without instantiating or invoking live worker runtime authority. The replay engine MUST perform closed completion discrimination: it MUST fail closed on malformed, incomplete, or cancelled fixtures (such as `status: "cancelled"`, missing output fields, or unfulfilled obligations), and MUST reject recorded fixtures for nodes that have been invalidated by clarify events. Replay MUST be idempotent: replaying identical valid fixtures MUST yield identical node outcomes, preserve obligation mappings, and avoid resurrecting invalidated nodes. Replay failure on an expected invariant MUST produce a reproducible counterexample trace.
(Previously: Replay engine accepted cancelled or malformed fixtures without closed status discrimination and did not reject fixtures for invalidated nodes.)

#### Scenario: Fixture replay converges deterministically without live worker invocation

- GIVEN an Execution Graph and a pre-recorded test fixture of worker results
- WHEN the replay engine executes
- THEN graph transitions MUST complete deterministically with identical outcome state
- AND no live worker transport or runtime process MUST be invoked

#### Scenario: Replay fails closed on cancelled or malformed fixture results

- GIVEN a recorded fixture containing a node result with `status: "cancelled"`, missing evidence, or invalid status
- WHEN the replay engine executes
- THEN replay MUST fail closed and mark the execution unsuccessful
- AND a counterexample trace identifying the failed or cancelled node MUST be generated

#### Scenario: Replay rejects fixtures for invalidated nodes and does not resurrect them

- GIVEN an Execution Graph with a set of invalidated node IDs resulting from a ClarifyEvent
- AND pre-recorded fixtures corresponding to the pre-clarification graph
- WHEN replay executes
- THEN fixtures for invalidated node IDs MUST be rejected fail-closed
- AND invalidated nodes MUST NOT be completed or resurrected by stale fixtures

#### Scenario: Replay counterexample trace generated on invariant or obligation failure

- GIVEN an Execution Graph replay where a MUST obligation lacks required evidence
- WHEN replay completes
- THEN `ok` MUST be false
- AND a detailed `counterexample` trace MUST identify the missing evidence and unfulfilled obligations

---

### Requirement: Hardened Non-Mutating Shadow Comparison Against Fixed Baseline {#REQ-execution-graph-compiler-007}

The system MUST provide a shadow comparison mode that evaluates compiled Execution Graph decisions side-by-side with the fixed reference baseline under identical inputs. Shadow comparison MUST operate as a pure observer and MUST NOT mutate active workflow state, journal records, or baseline routing. The shadow comparator MUST be hardened to compare invariants, obligations, dependencies, and ownership in addition to steps and allowed paths between the compiled graph and the baseline route. Any decision divergence between shadow-compiled graph and fixed baseline MUST be emitted as structured comparison telemetry.
(Previously: Shadow comparator only evaluated steps and allowed paths, omitting comparisons of invariants, obligations, dependencies, and ownership.)

#### Scenario: Shadow comparison runs alongside fixed baseline on identical inputs

- GIVEN a Repair change contract executed under standard baseline routing
- WHEN shadow comparison is active
- THEN both fixed routing and graph compilation MUST receive identical inputs
- AND compiled decisions MUST be evaluated side-by-side

#### Scenario: Shadow comparator detects divergence in invariants, obligations, dependencies, or ownership

- GIVEN a scenario where shadow graph compilation diverges from baseline in invariants, obligations, dependencies, or ownership
- WHEN shadow comparison evaluates the decisions
- THEN divergence telemetry MUST record the specific divergent fields
- AND telemetry diff MUST detail baseline versus shadow values

#### Scenario: Shadow observer guarantees zero mutation of active workflow state

- GIVEN active workflow state and journal
- WHEN shadow comparison executes
- THEN active state, journal entries, and baseline route outcome MUST remain byte-identical to a non-shadow run

#### Scenario: Divergence between shadow and fixed decisions emits telemetry without halting fixed route

- GIVEN a scenario where shadow graph compilation suggests an alternative decision from fixed baseline
- WHEN shadow comparison evaluates the step
- THEN divergence telemetry MUST be logged
- AND the active fixed baseline route MUST continue execution uninterrupted
