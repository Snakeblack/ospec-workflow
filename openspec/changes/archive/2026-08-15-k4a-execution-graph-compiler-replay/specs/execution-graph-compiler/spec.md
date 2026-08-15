# execution-graph-compiler Specification

## Purpose

Define the semantic Execution Graph schema and compiler for Repair routes, internal Obligation Manifest view, PolicySnapshot compile binding, contractual binding to SourceSnapshot provenance, typed clarify descendant invalidation/recompilation, declarative Work Order v2 compilation with atomic graph-snapshot validation, fixture-based deterministic replay, and non-mutating shadow comparison against fixed baseline flow without live runtime worker authority.

## Requirements

### Requirement: Semantic Execution Graph Schema, SourceSnapshot Binding, And Deterministic Graph ID {#REQ-execution-graph-compiler-001}

The compiler MUST transform change contracts for Repair routes into a semantic Directed Acyclic Graph (DAG) bound to a canonical `SourceSnapshot`. Every graph node MUST declare coarse semantic units: `node_id`, `kind`, `operation`, `objective`, `dependencies` (array of `node_id`), `ownership` (`owner` and `mode`: `exclusive|shared`), `allowed_paths`, `invariants`, `required_evidence`, and `budget_ref`. The compiler and schema MUST reject microscopic worker action nodes (such as `read`, `edit`, `test`, `file_edit`, `bash_run`, `grep`) fail-closed.

The Execution Graph MUST formally bind `source_snapshot_id` matching `^sha256:[a-f0-9]{64}$`. The compiler MUST compute a deterministic `GraphId` by hashing canonical `contract_digest`, `policy_bundle_digest`, `source_snapshot_id`, and `nodes`. Recompiling under identical inputs MUST produce an identical `GraphId`. Altering `source_snapshot_id`, `contract_digest`, `policy_bundle_digest`, or any node property MUST produce a distinct `GraphId`.

#### Scenario: Compiler generates valid semantic DAG with SourceSnapshot binding for Repair route

- GIVEN a valid change contract for a localized Repair route and a canonical `source_snapshot_id` matching `sha256:<64 lowercase hex>`
- WHEN the compiler executes
- THEN it MUST output an Execution Graph with coarse semantic nodes bound to `source_snapshot_id`
- AND every node MUST pass schema validation with non-empty objective, ownership, and required evidence

#### Scenario: Missing or malformed source snapshot id fails graph compilation fail-closed

- GIVEN a change contract and a missing, empty, uppercase, or malformed `source_snapshot_id`
- WHEN graph compilation executes
- THEN compilation MUST fail closed before emitting the Execution Graph
- AND it MUST NOT substitute, infer, or normalize an invalid identifier

#### Scenario: Microscopic worker action nodes fail schema and compilation validation

- GIVEN an Execution Graph input containing a microscopic node with operation `read`, `file_edit`, or `bash_run`
- WHEN graph validation or compilation executes
- THEN validation MUST fail closed
- AND the compiler MUST reject microscopic worker actions as graph nodes

#### Scenario: Deterministic GraphId binds contract, policy, and source snapshot digests

- GIVEN a change contract digest C1, a policy bundle digest P1, and a source snapshot id S1
- WHEN `computeGraphId` is evaluated
- THEN it MUST generate a deterministic `GraphId`
- AND modifying `source_snapshot_id` from S1 to S2 MUST produce a distinct `GraphId`
- AND modifying any field in contract or policy bundle MUST produce a distinct `GraphId`

---

### Requirement: Internal Obligation Manifest Completeness {#REQ-execution-graph-compiler-002}

The Execution Graph MUST embed an internal Obligation Manifest view containing all contract obligations. For every obligation with criticality `must`, the manifest MUST declare non-empty `implemented_by` mapping to at least one semantic node ID and non-empty `required_evidence` mapping to required test or proof evidence, OR declare an explicit `deferred` record containing `reason` and `approved_by`. The compiler MUST fail closed if any contract `MUST` obligation is omitted, unmapped, or missing required evidence without an approved deferral.

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

---

### Requirement: PolicySnapshot Compile Binding And Digest {#REQ-execution-graph-compiler-003}

The compiler MUST bind every compiled Execution Graph to a `PolicySnapshot` capturing the exact policy configuration used during classification and compilation. The `PolicySnapshot` MUST declare `policy_bundle_digest`, `compiler_version`, `classifier_version`, `runtime_version`, and resolved `effective_rules`. The compiler MUST compute `computePolicySnapshotDigest` deterministically. Any divergence in `effective_rules` or component versions MUST produce a different `PolicySnapshot` digest and consequently a different `GraphId`.

#### Scenario: PolicySnapshot captures compile configuration and effective rules

- GIVEN a policy configuration and compiler/classifier runtime components
- WHEN a `PolicySnapshot` is generated during compile
- THEN it MUST contain `policy_bundle_digest`, component versions, and resolved `effective_rules`
- AND its digest MUST match `sha256:<64 hex>` format

#### Scenario: Divergent effective rules produce distinct PolicySnapshot and GraphId digests

- GIVEN two compile runs with identical contract input but different `effective_rules` in policy configuration
- WHEN `PolicySnapshot` and `GraphId` are generated
- THEN the two `PolicySnapshot` digests MUST be distinct
- AND the two resulting `GraphId` digests MUST be distinct

---

### Requirement: Typed ClarifyEvent Descendant Invalidation And Recompilation {#REQ-execution-graph-compiler-004}

The system MUST represent clarifications as typed `ClarifyEvent` records specifying `event_id`, `question_id`, `answer`, and `affected_nodes`. Upon receiving a `ClarifyEvent`, the compiler MUST calculate the transitive closure of dependent descendant nodes in the Execution Graph DAG. Invalidation MUST be strictly scoped to those declared descendant nodes. Valid outputs and states of unaffected ancestor and independent sibling nodes MUST be preserved. The compiler MUST recompile only the invalidated subgraph and re-bind the graph policy digest when `effective_rules` change.

#### Scenario: ClarifyEvent invalidates only descendant nodes in the DAG

- GIVEN an Execution Graph DAG where node N3 depends on node N2, and N2 depends on node N1
- WHEN a `ClarifyEvent` affects node N2
- THEN nodes N2 and N3 MUST be invalidated
- AND ancestor node N1 MUST remain valid without recompilation

#### Scenario: Unaffected ancestor and sibling node states are preserved

- GIVEN an Execution Graph with independent parallel branches B1 and B2
- WHEN a `ClarifyEvent` affects only branch B2
- THEN branch B1 nodes and their recorded outputs MUST remain intact and valid

#### Scenario: Circular or unknown dependency references in clarify fail closed

- GIVEN a `ClarifyEvent` referencing unknown node IDs or introducing a dependency cycle
- WHEN clarify processing runs
- THEN invalidation MUST fail closed with an invalid graph error

---

### Requirement: Declarative Work Order v2 Compilation With Frozen V1 Compatibility And Atomic Provenance Binding {#REQ-execution-graph-compiler-005}

The compiler's `compileWorkOrders` / `compileWorkOrdersV2` public compilation path MUST emit declarative `WorkOrder` v2 structures with `kind: "work-order/v2"`, `schema_version: 2`, and bound `source_snapshot_id`.

Before emitting any Work Order, the compiler MUST perform atomic validation of the entire `ExecutionGraph`:
1. It MUST verify that the graph conforms to `execution-graph/v1.schema.json` and declares a valid `source_snapshot_id` matching `sha256:<64 lowercase hexadecimal characters>`.
2. When external `sourceSnapshot` or `sourceSnapshotId` is supplied in context, it MUST verify that the context snapshot matches the graph's bound `source_snapshot_id` byte-for-byte; any mismatch or bypass attempt MUST fail closed.
3. It MUST verify that every node in the graph is a valid coarse semantic node without microscopic operations, has valid non-empty objective, ownership, and required evidence, and has valid acyclic dependencies.
4. It MUST verify that the embedded Obligation Manifest is complete and satisfied.

If ANY validation check fails for ANY node or graph property, compilation MUST fail closed atomically with zero Work Orders emitted (preventing partial emission, graph escalation, and provenance bypass).

The emitted `source_snapshot_id` on every WorkOrder v2 MUST equal the validated graph `source_snapshot_id` byte-for-byte. Emitted v2 Work Orders MUST preserve the semantic node bindings for `objective`, `allowed_paths`, `invariants`, `dependencies`, `ownership`, `required_evidence`, and `budget`, and MUST validate against `work-order/v2.schema.json` without attaching execution tokens or live worker authority.

`work-order/v1` compilation consumers (`compileWorkOrdersV1`) and fixtures MAY remain available solely as legacy compatibility surfaces, but the compiler MUST NOT silently downgrade new output to v1. `work-order/v1.schema.json` and its K1 pin MUST remain byte-identical; this migration MUST NOT retarget K1 pins to accommodate altered v1 content. Compilation of Work Orders MUST NOT execute workers or dispatch runtime processes.

#### Scenario: Declarative Work Order v2 is compiled with exact Graph-SourceSnapshot binding

- GIVEN a valid ExecutionGraph containing coarse semantic nodes bound to `source_snapshot_id` S1
- AND a matching validated SourceSnapshot S1
- WHEN `compileWorkOrdersV2` executes
- THEN every emitted Work Order MUST validate against `work-order/v2.schema.json` with `kind: "work-order/v2"` and `schema_version: 2`
- AND every Work Order MUST carry `source_snapshot_id` equal to S1 byte-for-byte
- AND all semantic node properties MUST be preserved

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

### Requirement: Fixture-Based Deterministic Replay Engine {#REQ-execution-graph-compiler-006}

The system MUST provide a deterministic replay engine that executes graph transitions against pre-recorded fixture results without instantiating or invoking live worker runtime authority. Replay MUST be idempotent: replaying identical fixtures MUST yield identical node outcomes, preserve obligation mappings, and avoid resurrecting invalidated nodes. Replay failure on an expected invariant MUST produce a reproducible counterexample trace.

#### Scenario: Fixture replay converges deterministically without live worker invocation

- GIVEN an Execution Graph and a pre-recorded test fixture of worker results
- WHEN the replay engine executes
- THEN graph transitions MUST complete deterministically with identical outcome state
- AND no live worker transport or runtime process MUST be invoked

#### Scenario: Replay does not resurrect invalidated nodes or drop obligations

- GIVEN a partially invalidated graph replaying with fixture results
- WHEN replay completes
- THEN invalidated nodes not satisfied by fixtures MUST remain unfulfilled
- AND all Obligation Manifest tracking MUST remain fully accounted for

---

### Requirement: Non-Mutating Shadow Comparison Against Fixed Baseline {#REQ-execution-graph-compiler-007}

The system MUST provide a shadow comparison mode that evaluates compiled Execution Graph decisions side-by-side with the fixed reference baseline under identical inputs. Shadow comparison MUST operate as a pure observer and MUST NOT mutate active workflow state, journal records, or baseline routing. Any decision divergence between shadow-compiled graph and fixed baseline MUST be emitted as structured comparison telemetry.

#### Scenario: Shadow comparison runs alongside fixed baseline on identical inputs

- GIVEN a Repair change contract executed under standard baseline routing
- WHEN shadow comparison is active
- THEN both fixed routing and graph compilation MUST receive identical inputs
- AND compiled decisions MUST be evaluated side-by-side

#### Scenario: Shadow observer guarantees zero mutation of active workflow state

- GIVEN active workflow state and journal
- WHEN shadow comparison executes
- THEN active state, journal entries, and baseline route outcome MUST remain byte-identical to a non-shadow run

#### Scenario: Divergence between shadow and fixed decisions emits telemetry without halting fixed route

- GIVEN a scenario where shadow graph compilation suggests an alternative step from fixed baseline
- WHEN shadow comparison evaluates the step
- THEN divergence telemetry MUST be logged
- AND the active fixed baseline route MUST continue execution uninterrupted
