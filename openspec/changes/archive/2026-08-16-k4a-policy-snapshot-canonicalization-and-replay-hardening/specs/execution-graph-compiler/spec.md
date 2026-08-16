# execution-graph-compiler Specification

## Purpose

Define the semantic Execution Graph schema and compiler for Repair routes, internal Obligation Manifest view, PolicySnapshot compile binding, contractual binding to SourceSnapshot provenance, typed clarify descendant invalidation/recompilation, declarative Work Order v2 compilation with atomic graph-snapshot validation, fixture-based deterministic replay, and non-mutating shadow comparison against fixed baseline flow without live runtime worker authority.

## Schema Authority Model

`schemas/kernel/execution-graph/v1.schema.json` (specifically its `$defs.node` definition) is the sole canonical authoritative schema for ExecutionGraph and GraphNode structures in K4a, enforcing `minLength: 1` across all semantic identifiers and descriptor fields.

`schemas/kernel/graph-node/v1.schema.json` is a frozen legacy K1 compatibility artifact pinned by cryptographic digest in `k1-compat.js` and MUST NOT be modified or used as the authority for K4a semantic validation.

## Requirements

### Requirement: Semantic Execution Graph Schema, SourceSnapshot Binding, PolicySnapshot ID Binding, Cycle Detection, And Deterministic Graph ID {#REQ-execution-graph-compiler-001}

The compiler MUST transform change contracts for Repair routes into a semantic Directed Acyclic Graph (DAG) bound to a canonical `SourceSnapshot` and `PolicySnapshot`. Every graph node MUST declare coarse semantic units: `node_id`, `kind`, `operation`, `objective`, `dependencies` (array of `node_id`), `ownership` (`owner` and `mode`: `exclusive|shared`), `allowed_paths`, `invariants`, `required_evidence`, and `budget_ref`. All identifier and descriptor strings MUST be non-empty (`minLength >= 1` and non-blank after trimming). The compiler and schema MUST reject microscopic worker action nodes (such as `read`, `edit`, `test`, `file_edit`, `bash_run`, `grep`) fail-closed.

The Execution Graph MUST formally bind `source_snapshot_id` matching `^sha256:[a-f0-9]{64}$` and `policy_snapshot_id` matching `^sha256:[a-f0-9]{64}$`. `compileExecutionGraph()` MUST reject explicit empty or malformed `sourceSnapshotId: ""` without silent fallback or default substitution. When `policySnapshot` is provided with a declared `snapshot_id`, `compileExecutionGraph()` MUST validate it via `validatePolicySnapshotBinding(snapshot)` and fail closed on digest mismatch (`policy-snapshot-mismatch`).

`contract.obligations` MUST be authoritative for obligation IDs and criticality: external obligation input mappings MAY supply `implemented_by` and `required_evidence`, but MUST NOT downgrade a contract `must` obligation to `should` or `may`, nor strip contract obligations. Any external obligation input specifying an obligation ID not declared in `contract.obligations` MUST be rejected fail-closed with error code `unknown-obligation-id` and include `obligation_id` in the error.

The compiler MUST detect dependency cycles via shared `hasCycle()` and fail closed before graph emission. The compiler MUST clone input and output nodes and obligations defensively (via deep clone) to ensure graph immutability against caller mutations.

The compiler MUST compute a deterministic `GraphId` by hashing canonical `contract_digest`, `policy_snapshot_id`, `policy_bundle_digest`, `source_snapshot_id`, `nodes`, and `obligations`. Recompiling under identical inputs MUST produce an identical `GraphId`. Altering `source_snapshot_id`, `policy_snapshot_id`, `contract_digest`, `policy_bundle_digest`, any node property, or any obligation property MUST produce a distinct `GraphId`. Before returning the compiled ExecutionGraph object, `compileExecutionGraph()` MUST validate the output graph via `validateExecutionGraphBinding(graph)` fail-closed.

#### Scenario: Compiler generates valid semantic DAG with SourceSnapshot and PolicySnapshot binding for Repair route

- GIVEN a valid change contract for a localized Repair route and canonical `source_snapshot_id` and `policy_snapshot_id` matching `sha256:<64 lowercase hex>`
- WHEN the compiler executes
- THEN it MUST output an Execution Graph with coarse semantic nodes bound to `source_snapshot_id` and `policy_snapshot_id`
- AND every node MUST pass schema validation with non-empty objective, ownership, and required evidence (`minLength >= 1`)
- AND the returned graph MUST pass `validateExecutionGraphBinding(graph)` with `{ ok: true }`

#### Scenario: Explicit empty or malformed source snapshot id fails graph compilation fail-closed without fallback

- GIVEN a change contract and an explicit empty string `sourceSnapshotId: ""` or malformed `sourceSnapshotId`
- WHEN graph compilation executes
- THEN compilation MUST fail closed immediately with error code `invalid-source-snapshot-id`
- AND it MUST NOT substitute, infer, or fallback to any secondary snapshot identifier

#### Scenario: Missing or malformed policy snapshot id fails graph compilation fail-closed

- GIVEN a change contract and a missing, empty, uppercase, or malformed `policy_snapshot_id`
- WHEN graph compilation executes
- THEN compilation MUST fail closed before emitting the Execution Graph
- AND it MUST NOT substitute, infer, or normalize an invalid identifier

#### Scenario: PolicySnapshot cryptographic binding mismatch fails compilation fail-closed

- GIVEN an input `policySnapshot` whose declared `snapshot_id` does not match its recomputed `computePolicySnapshotDigest`
- WHEN `compileExecutionGraph()` is invoked
- THEN compilation MUST fail closed with error code `policy-snapshot-mismatch`
- AND zero graph structures MUST be emitted

#### Scenario: Authoritative contract obligation criticality cannot be downgraded by caller inputs

- GIVEN a change contract declaring an obligation with criticality `must`
- AND external caller obligations providing a mapping with criticality `may` or `should`
- WHEN `compileExecutionGraph()` executes
- THEN the compiler MUST enforce authoritative `must` criticality from the contract
- AND MUST NOT allow external input to downgrade the obligation criticality

#### Scenario: External obligation input declaring unknown obligation ID is rejected fail-closed

- GIVEN a change contract declaring obligations `[ { id: "ob-1", ... } ]`
- AND external caller obligations providing a mapping for `id: "ob-unknown"`
- WHEN `compileExecutionGraph()` executes
- THEN compilation MUST fail closed immediately with error code `unknown-obligation-id`
- AND the error object MUST report `err.obligation_id === "ob-unknown"`

#### Scenario: Node with empty string semantic fields is rejected fail-closed

- GIVEN a node input where `node_id: ""`, `operation: "  "`, `objective: ""`, or `budget_ref: ""`
- WHEN `compileExecutionGraph()` executes
- THEN compilation MUST fail closed immediately with error code `missing-required-node-field`
- AND zero graph structures MUST be emitted

#### Scenario: Microscopic worker action nodes fail schema and compilation validation

- GIVEN an Execution Graph input containing a microscopic node with operation `read`, `file_edit`, or `bash_run`
- WHEN graph validation or compilation executes
- THEN validation MUST fail closed
- AND the compiler MUST reject microscopic worker actions as graph nodes

#### Scenario: Dependency cycles in graph nodes trigger fail-closed rejection

- GIVEN an Execution Graph input whose nodes contain cyclic dependencies (e.g. N1 -> N2 -> N1)
- WHEN graph compilation executes
- THEN shared `hasCycle` MUST detect the cycle and compilation MUST fail closed with `cyclic-dependency-detected`
- AND zero graph structures MUST be emitted

#### Scenario: Defensive cloning prevents post-compilation mutation of graph nodes or obligations

- GIVEN mutable node or obligation arrays passed to `compileExecutionGraph`
- WHEN compilation succeeds and the caller mutates the input objects or the returned graph nodes
- THEN the internal graph state MUST remain isolated and unmodified

#### Scenario: Deterministic GraphId binds contract, policy snapshot, source snapshot, nodes, and obligations

- GIVEN a change contract digest C1, policy snapshot id PS1, policy bundle digest P1, source snapshot id S1, nodes N1, and obligations O1
- WHEN `computeGraphId` is evaluated
- THEN it MUST generate a deterministic `GraphId`
- AND modifying any field in `obligations` from O1 to O2 MUST produce a distinct `GraphId`
- AND modifying `policy_snapshot_id`, `source_snapshot_id`, `contract_digest`, or `nodes` MUST produce a distinct `GraphId`

---

### Requirement: Internal Obligation Manifest Completeness And Contract Obligation Authority {#REQ-execution-graph-compiler-002}

The Execution Graph MUST embed an internal Obligation Manifest view containing all contract obligations. Contract `contract.obligations` MUST be authoritative: external obligation inputs MUST reconcile 100% against contract obligations, and passing an empty array MUST NOT strip or omit contract obligations. For every obligation with criticality `must`, the manifest MUST declare non-empty `implemented_by` mapping to at least one semantic node ID and non-empty `required_evidence` mapping to required test or proof evidence, OR declare an explicit `deferred` record containing `reason` and `approved_by`. The compiler MUST fail closed if any contract `MUST` obligation is omitted, unmapped, missing required evidence without an approved deferral, or stripped by external overrides.

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

The compiler MUST bind every compiled Execution Graph to a `PolicySnapshot` capturing the exact policy configuration used during classification and compilation. The `PolicySnapshot` MUST declare `snapshot_id` matching `^sha256:[a-f0-9]{64}$`, `policy_bundle_digest` matching `^sha256:[a-f0-9]{64}$`, non-empty `compiler_version`, `classifier_version`, `runtime_version` (`minLength >= 1`), and resolved `effective_rules`.

Defaults and normalization MUST occur exclusively during creation (`createPolicySnapshot`), while `computePolicySnapshotDigest` MUST operate strictly on the canonical, already-resolved snapshot payload and fail closed on empty string `""`, whitespace-only values, or malformed digests without injecting hidden defaults. The compiler MUST compute `computePolicySnapshotDigest` deterministically and incorporate `policy_snapshot_id` into the Execution Graph structure and `GraphId`. Any divergence in `effective_rules` or component versions MUST produce a different `PolicySnapshot` digest and consequently a different `GraphId`.

#### Scenario: PolicySnapshot captures compile configuration and effective rules

- GIVEN a policy configuration and compiler/classifier runtime components
- WHEN a `PolicySnapshot` is generated during compile
- THEN it MUST contain `snapshot_id`, `policy_bundle_digest`, component versions, and resolved `effective_rules`
- AND its digest MUST match `sha256:<64 hex>` format

#### Scenario: Empty or whitespace version fields in PolicySnapshot are rejected fail-closed

- GIVEN a policy snapshot input declaring empty string `""` or whitespace for `compiler_version`, `classifier_version`, or `runtime_version`
- WHEN `createPolicySnapshot` or `computePolicySnapshotDigest` executes
- THEN it MUST fail closed without substituting default versions
- AND `validatePolicySnapshotBinding` MUST reject the instance under `ospec://schemas/kernel/policy-snapshot/v1`

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

The system MUST represent clarifications as typed `ClarifyEvent` records specifying `event_id`, `question_id`, `answer`, `timestamp`, and `affected_nodes`. Upon receiving a `ClarifyEvent`, `applyClarifyEvent` MUST calculate the transitive closure of dependent descendant nodes in the Execution Graph DAG, mutate affected nodes in the graph structure with `clarification_context` (`event_id`, `question_id`, `answer`), and bind the updated graph to a newly derived `GraphId` incorporating the modified nodes and obligations.

The resulting mutated graph MUST conform strictly to `execution-graph/v1.schema.json`, pass `validateExecutionGraphBinding(graph)`, and be directly consumable by `compileWorkOrdersV2()`. Invalidation MUST be strictly scoped to declared descendant nodes, and `applyClarifyEvent` MUST return the list of invalidated node IDs to downstream consumers (such as replay engines) for fail-closed fixture rejection. Valid outputs and states of unaffected ancestor and independent sibling nodes MUST be preserved.

#### Scenario: ClarifyEvent invalidates descendant nodes and embeds schema-conforming clarification_context

- GIVEN an Execution Graph DAG where node N3 depends on node N2, and N2 depends on node N1
- WHEN a `ClarifyEvent` affects node N2
- THEN nodes N2 and N3 MUST be marked invalidated in the returned invalidation set
- AND affected node N2 in the returned graph MUST declare valid `clarification_context` (`event_id`, `question_id`, `answer`)
- AND the returned graph MUST validate against `execution-graph/v1.schema.json`
- AND ancestor node N1 MUST remain valid without recompilation

#### Scenario: ClarifyEvent generates updated GraphId and outputs invalidated node IDs

- GIVEN an Execution Graph and a valid `ClarifyEvent`
- WHEN `applyClarifyEvent` executes
- THEN the resulting graph MUST declare an updated `graph_id` bound to the clarify state and obligations
- AND the result MUST return `invalidatedNodeIds` containing all transitive descendants
- AND `validateExecutionGraphBinding(updatedGraph)` MUST return `{ ok: true }`

#### Scenario: Clarified execution graph compiles directly to WorkOrder v2

- GIVEN an Execution Graph updated by `applyClarifyEvent()`
- WHEN passed directly to `compileWorkOrdersV2()`
- THEN compilation MUST succeed without schema or binding errors
- AND declarative WorkOrder v2 objects MUST be emitted for all nodes

#### Scenario: Unaffected ancestor and sibling node states are preserved

- GIVEN an Execution Graph with independent parallel branches B1 and B2
- WHEN a `ClarifyEvent` affects only branch B2
- THEN branch B1 nodes and their recorded outputs MUST remain intact and valid

#### Scenario: Circular or unknown dependency references in clarify fail closed

- GIVEN a `ClarifyEvent` referencing unknown node IDs or introducing a dependency cycle
- WHEN clarify processing runs
- THEN invalidation MUST fail closed with error code `unknown-affected-node` or `cyclic-dependency-detected`

---

### Requirement: Declarative Work Order v2 Compilation, Topological Dependency Resolution, And Deterministic Reproducibility {#REQ-execution-graph-compiler-005}

The compiler's `compileWorkOrders` / `compileWorkOrdersV2` public compilation path MUST emit declarative `WorkOrder` v2 structures with `kind: "work-order/v2"`, `schema_version: 2`, and bound `source_snapshot_id`. Node dependencies MUST be topologically materialized and resolved as canonical `WorkOrderId` sha256 digests (`sha256:<64 hex>`) computed via `computeWorkOrderId()` rather than raw node ID strings.

`compileWorkOrdersV2()` MUST be a strictly deterministic pure function of the `ExecutionGraph` and its bound `source_snapshot_id`. In K4a, all WorkOrders emitted MUST use canonical `role: "repair-worker"` and `DEFAULT_WORK_ORDER_BUDGET`. If compilation context attempts to supply variable `role` (other than `"repair-worker"`), variable `budgets`, or `defaultBudget`, `compileWorkOrdersV2()` MUST fail closed immediately with error code `unsupported-compilation-context`. Every WorkOrder emitted MUST be 100% reproducible by `replayExecutionGraph()` without requiring out-of-band context.

Before emitting any Work Order, `compileWorkOrdersV2()` MUST enforce `validateExecutionGraphBinding(graph)`:
1. It MUST verify cryptographic binding of `graph.graph_id` against recomputed `computeGraphId()` over contract digest, policy snapshot ID, policy bundle digest, source snapshot ID, nodes, and obligations, throwing `graph-id-mismatch` immediately if tampered.
2. It MUST verify that the graph validates against canonical `execution-graph/v1.schema.json` and declares a valid `source_snapshot_id` and `policy_snapshot_id` matching `sha256:<64 lowercase hexadecimal characters>`.
3. When external `sourceSnapshot` or `sourceSnapshotId` is supplied in context, it MUST verify that the context snapshot matches the graph's bound `source_snapshot_id` byte-for-byte; any mismatch or bypass attempt MUST fail closed (`provenance-mismatch`).
4. It MUST verify that every node in the graph is a valid coarse semantic node without microscopic operations, has valid non-empty objective, ownership, and required evidence (`minLength >= 1`), and has valid acyclic dependencies via shared `hasCycle`.
5. It MUST verify that the embedded Obligation Manifest is complete and satisfied against authoritative contract obligations.
6. Every generated WorkOrder MUST validate against canonical `work-order/v2.schema.json` with resolved `sha256:...` dependency digests.

If ANY validation check fails for ANY node, graph property, or WorkOrder, compilation MUST fail closed atomically with zero Work Orders emitted (preventing partial emission, graph escalation, and provenance bypass).

The emitted `source_snapshot_id` on every WorkOrder v2 MUST equal the validated graph `source_snapshot_id` byte-for-byte. Emitted v2 Work Orders MUST preserve the semantic node bindings for `objective`, `allowed_paths`, `invariants`, `dependencies` (as WorkOrderId digests), `ownership`, `required_evidence`, and `budget`, and MUST NOT attach execution tokens or live worker authority.

`work-order/v1` compilation consumers (`compileWorkOrdersV1`) and fixtures MAY remain available solely as legacy compatibility surfaces, but the compiler MUST NOT silently downgrade new output to v1. `work-order/v1.schema.json` and its K1 pin MUST remain byte-identical; this migration MUST NOT retarget K1 pins to accommodate altered v1 content. Compilation of Work Orders MUST NOT execute workers or dispatch runtime processes.

#### Scenario: Declarative Work Order v2 resolves topological dependencies to canonical WorkOrderId sha256 digests

- GIVEN a valid ExecutionGraph containing coarse semantic nodes N1 and N2 (where N2 depends on N1) bound to `source_snapshot_id` S1
- WHEN `compileWorkOrdersV2` executes
- THEN N1's WorkOrder MUST have empty `dependencies` `[]` and canonical `work_order_id` W1 (`sha256:...`)
- AND N2's WorkOrder MUST have `dependencies` `[W1]` containing N1's canonical `WorkOrderId` digest
- AND every WorkOrder MUST validate against `work-order/v2.schema.json`

#### Scenario: Canonical WorkOrders are 100% reproducible by Replay

- GIVEN a valid ExecutionGraph compiled for a Repair route
- WHEN `compileWorkOrdersV2(graph)` generates WorkOrders
- AND a fixture is recorded declaring `graph_id: graph.graph_id` and `work_order_id: wo.work_order_id`
- WHEN `replayExecutionGraph(graph, fixtures)` executes
- THEN Replay MUST accept the fixture and complete the node without false-positive provenance rejection

#### Scenario: Unbound role or budget overrides fail compilation fail-closed

- GIVEN compilation context supplying `role: "specialized-repair-worker"` or custom `budgets`
- WHEN `compileWorkOrdersV2(graph, context)` is invoked
- THEN compilation MUST fail closed with error code `unsupported-compilation-context`
- AND zero WorkOrders MUST be emitted

#### Scenario: Tampered ExecutionGraph throws graph-id-mismatch fail-closed

- GIVEN an ExecutionGraph where a node, obligation, or snapshot ID has been tampered with after initial compilation
- WHEN `compileWorkOrdersV2` executes
- THEN `validateExecutionGraphBinding` MUST detect the digest discrepancy
- AND compilation MUST fail closed with error code `graph-id-mismatch`
- AND zero WorkOrder objects MUST be emitted

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

### Requirement: Fixture-Based Deterministic Replay Engine With Closed Completion Discrimination And Strict Provenance {#REQ-execution-graph-compiler-006}

The system MUST provide a deterministic replay engine that executes graph transitions against pre-recorded fixture results without instantiating or invoking live worker runtime authority. The replay engine MUST enforce `validateExecutionGraphBinding(graph)` at startup and fail closed if the graph structure or `GraphId` has been manipulated.

The canonical `replayExecutionGraph()` function MUST strictly require that every recorded fixture object declares non-empty `graph_id` matching `graph.graph_id` and `work_order_id` matching the deterministically compiled WorkOrder's `work_order_id`. Any missing, empty, or mismatched `graph_id` or `work_order_id` MUST be rejected fail-closed with error code `stale-fixture-rejected`. Compiling WorkOrders during replay MUST fail closed without swallowing exceptions (`work-order-compilation-failed`).

Canonical `replayExecutionGraph()` MUST NOT accept legacy unpinned fixtures or bypass flags. Legacy unpinned fixtures MUST be processed exclusively through the dedicated `replayLegacyFixtureGraph()` function.

The replay engine MUST perform node-level required evidence verification: before marking any node completed, the engine MUST verify that `node.required_evidence ⊆ Object.keys(recorded.evidence)` (all required evidence identifiers declared on the node are present in the recorded fixture evidence object). If any required evidence item is missing from `recorded.evidence`, the node MUST NOT be marked completed, MUST be treated as unfulfilled/failed, and MUST prevent prerequisite dependent nodes from completing.

The replay engine MUST perform closed completion discrimination: it MUST fail closed on malformed, incomplete, or cancelled fixtures (such as `status: "cancelled"`, missing output fields, missing or non-object `evidence` payload for completed nodes, non-zero `exit_code` claiming `completed` status, or unfulfilled obligations), and MUST reject recorded fixtures for nodes that have been invalidated by clarify events. Replay MUST be idempotent: replaying identical valid fixtures MUST yield identical node outcomes, preserve obligation mappings, and avoid resurrecting invalidated nodes. Replay failure on an expected invariant MUST produce a reproducible counterexample trace.

#### Scenario: Fixture replay converges deterministically without live worker invocation

- GIVEN a valid Execution Graph and a pre-recorded test fixture of worker results with `graph_id`, `work_order_id`, and all required evidence satisfied
- WHEN the replay engine executes
- THEN graph transitions MUST complete deterministically with identical outcome state
- AND no live worker transport or runtime process MUST be invoked

#### Scenario: Fixture claiming completed without evidence object fails closed

- GIVEN a fixture declaring `status: "completed"`, matching `graph_id` and `work_order_id`, but omitting `evidence` object or providing null/primitive evidence
- WHEN `replayExecutionGraph()` executes
- THEN the node MUST NOT be marked completed
- AND replay MUST mark the node as failed and generate a counterexample trace

#### Scenario: Fixture declaring completed status with non-zero exit_code is rejected as contradictory

- GIVEN a fixture declaring `status: "completed"` but `exit_code: 1`
- WHEN `replayExecutionGraph()` executes
- THEN the node MUST be classified as failed due to contradictory outcome status
- AND dependent downstream nodes MUST be blocked

#### Scenario: Replay fails closed on tampered execution graph binding

- GIVEN an Execution Graph whose `graph_id` does not match its recomputed digest
- WHEN `replayExecutionGraph()` executes
- THEN replay MUST fail closed immediately with error code `graph-id-mismatch`
- AND zero nodes MUST be executed or completed

#### Scenario: Replay rejects fixture with missing or mismatched graph_id or work_order_id

- GIVEN a fixture missing `graph_id`, missing `work_order_id`, or declaring a mismatched `work_order_id`
- WHEN `replayExecutionGraph()` executes
- THEN replay MUST fail closed immediately with error code `stale-fixture-rejected`

#### Scenario: Legacy unpinned fixtures are rejected by canonical replay and accepted by replayLegacyFixtureGraph

- GIVEN a legacy fixture omitting `graph_id` and `work_order_id`
- WHEN passed to `replayExecutionGraph()`
- THEN replay MUST throw `stale-fixture-rejected`
- WHEN passed to `replayLegacyFixtureGraph()`
- THEN legacy replay MUST proceed with compatibility evaluation

#### Scenario: Node missing required evidence in fixture is not marked completed

- GIVEN a node declaring `required_evidence: ["test_report", "lint_attestation"]`
- AND a fixture result declaring `status: "completed"`, valid `graph_id`, valid `work_order_id`, but `evidence: { test_report: { ... } }` (missing `lint_attestation`)
- WHEN `replayExecutionGraph()` executes
- THEN the node MUST NOT be marked as completed
- AND the node MUST be classified as failed or unfulfilled in the replay outcome
- AND downstream dependent nodes MUST remain blocked

#### Scenario: Replay fails closed on cancelled or malformed fixture results

- GIVEN a recorded fixture containing a node result with `status: "cancelled"`, missing evidence, or invalid status
- WHEN the replay engine executes
- THEN replay MUST fail closed and mark the execution unsuccessful
- AND a counterexample trace identifying the failed or cancelled node MUST be generated

#### Scenario: Replay rejects fixtures for invalidated nodes and does not resurrect them

- GIVEN an Execution Graph with a set of invalidated node IDs resulting from a ClarifyEvent
- AND pre-recorded fixtures corresponding to the pre-clarification graph
- WHEN replay executes
- THEN fixtures for invalidated node IDs MUST be rejected fail-closed (`stale-fixture-rejected`)
- AND invalidated nodes MUST NOT be completed or resurrected by stale fixtures

#### Scenario: Replay counterexample trace generated on invariant or obligation failure

- GIVEN an Execution Graph replay where a MUST obligation lacks required evidence
- WHEN replay completes
- THEN `ok` MUST be false
- AND a detailed `counterexample` trace MUST identify the missing evidence and unfulfilled obligations

---

### Requirement: Hardened Non-Mutating Shadow Comparison Against Fixed Baseline {#REQ-execution-graph-compiler-007}

The system MUST provide a shadow comparison mode that evaluates compiled Execution Graph decisions side-by-side with the fixed reference baseline under identical inputs. Shadow comparison MUST operate as a pure observer and MUST NOT mutate active workflow state, journal records, or baseline routing.

Before evaluating decisions, `compareShadowExecution()` MUST validate the compiled graph via `validateExecutionGraphBinding(compiledGraph)` fail-closed. The shadow comparator MUST compare invariants, obligations, dependencies, ownership, steps, and allowed paths between the compiled graph and baseline route.

`match: true` MUST be strictly reserved for complete comparisons where all evaluated dimensions match and zero dimensions were omitted (`skipped_dimensions.length === 0`). If the baseline route omits dimensions (such as `ownership`), the comparator MUST return `match: false`, classify the discrepancy as `discrepancy_classification: "partial-match"`, and emit the omitted dimensions in `telemetryDiff.skipped_dimensions`.

#### Scenario: Shadow comparison runs alongside fixed baseline on identical inputs

- GIVEN a Repair change contract executed under standard baseline routing
- WHEN shadow comparison is active
- THEN both fixed routing and graph compilation MUST receive identical inputs
- AND compiled decisions MUST be evaluated side-by-side

#### Scenario: Shadow comparator fails closed on tampered execution graph binding

- GIVEN a compiled graph whose binding validation fails (`validateExecutionGraphBinding` returns `{ ok: false }`)
- WHEN `compareShadowExecution()` is invoked
- THEN it MUST fail closed with a graph binding mismatch error

#### Scenario: Shadow comparator discriminates complete match from partial match on skipped dimensions

- GIVEN a compiled graph matching baseline in steps, obligations, and invariants, but baseline omits `ownership`
- WHEN `compareShadowExecution()` evaluates the execution
- THEN `match` MUST be `false`
- AND `discrepancy_classification` MUST be `"partial-match"`
- AND `telemetryDiff.skipped_dimensions` MUST contain `["ownership"]`

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

---

### Requirement: Shared DAG Cycle Detection Utility {#REQ-execution-graph-compiler-008}

The system MUST provide a single canonical, shared `hasCycle` implementation in a centralized DAG utility module. All Execution Graph compiler subsystems (`compileExecutionGraph`, `applyClarifyEvent`, `compileWorkOrdersV2`, `replayExecutionGraph`, and `topologicalSort`) MUST import and consume this shared implementation rather than defining redundant or divergent cycle detection algorithms. The shared `hasCycle` function MUST detect back-edges and cycles in directed graphs of node objects declaring `node_id` and `dependencies` (array of string IDs), returning `true` when a cycle is present and `false` when the graph is an acyclic DAG. Passing non-array or empty inputs MUST return `false` without throwing.

#### Scenario: Shared hasCycle detects direct and indirect dependency cycles

- GIVEN a graph of nodes containing a cycle (such as N1 -> N2 -> N1 or N1 -> N2 -> N3 -> N1)
- WHEN `hasCycle` is evaluated
- THEN it MUST return `true`
- AND compiler subsystems invoking `hasCycle` MUST fail closed with error code `cyclic-dependency-detected`

#### Scenario: Acyclic graph nodes pass shared cycle detection

- GIVEN a valid directed acyclic graph where all dependency references form a topological order
- WHEN `hasCycle` is evaluated
- THEN it MUST return `false`
- AND execution graph compilation MUST proceed

#### Scenario: Subsystems consume canonical hasCycle without local duplicate implementations

- GIVEN the execution graph subsystem modules (`compiler.js`, `clarify.js`, `work-order-compiler.js`, `replay-engine.js`)
- WHEN inspected for cycle detection logic
- THEN each module MUST reference the single canonical `hasCycle` export
- AND no subsystem module MUST maintain a duplicate private cycle detector implementation
