# Design: K4a — Execution Graph Compiler, Obligation Manifest, and Deterministic Replay

## Technical Approach

K4a establishes the semantic Execution Graph compilation subsystem for localized Repair routes under the kernel harness evolution roadmap (`docs/architecture/harness-evolution.md`). Following the authorization of scope `k4a-graph-snapshot-binding-new-scope-005` and the updated specification baseline, the design fulfills three foundational architectural pillars:

1. **Formal Binding between ExecutionGraph and SourceSnapshot Provenance**: Every `ExecutionGraph` v1 record mandates `source_snapshot_id` conforming to `^sha256:[a-f0-9]{64}$`. The compiler derives a deterministic, collision-resistant `GraphId` by cryptographically hashing canonical `contract_digest`, `policy_bundle_digest`, `source_snapshot_id`, and the compiled semantic `nodes` array. Recompilation under identical inputs produces identical IDs, while any change to contract text, policy rules, source snapshot provenance, or node structure produces a distinct `GraphId`.
2. **Fail-Closed Atomic Validation in `compileWorkOrdersV2`**: The public WorkOrder compilation pathway compiles coarse semantic graph nodes into declarative `work-order/v2` objects. Before emitting any WorkOrder, the compiler performs atomic validation across the entire graph: schema conformance, valid `source_snapshot_id`, exact byte-for-byte equality with any caller context SourceSnapshot, coarse node semantics (rejecting microscopic operations like `read`, `edit`, `test`, `file_edit`, `bash_run`, `grep`), valid ownership/objectives/evidence, acyclic dependencies, and complete Obligation Manifest satisfaction. Any defect aborts compilation atomically, returning zero WorkOrders and preventing partial order emission, graph escalation, or provenance bypass. Emitted WorkOrders carry zero execution authority tokens or live process permits.
3. **Strict Byte-for-Byte Preservation of Legacy WorkOrder v1 and K1 Baselines**: `work-order/v1.schema.json`, historical v1 fixtures, and the `K1_SCHEMA_BASELINE` digest pin (`sha256:a8204e...c921e5`) remain immutable historical contracts. WorkOrder v2 is published as an additive schema family (`work-order/v2.schema.json`) with independent manifest and claim registrations. `compileWorkOrdersV1` remains available as an explicit legacy-only export; the public default export `compileWorkOrders` strictly aliases `compileWorkOrdersV2`.

The subsystem resides under `scripts/lib/execution-graph/` comprising modular components: `compiler.js` (semantic DAG compilation & GraphId derivation), `obligation-manifest.js` (100% MUST coverage validation), `policy-snapshot.js` (policy digest & effectiveRules calculation), `clarify.js` (transitive descendant-scoped graph invalidation), `work-order-compiler.js` (atomic validation & declarative v1/v2 projection), `replay-engine.js` (fixture-based idempotent replay without live workers), and `shadow-comparator.js` (pure read-only observer comparing graph decisions against fixed baseline routes).

## Architecture Decisions

### Decision: Obligation Manifest as an Embedded View in Execution Graph (ADR-001)

- **Choice**: Embed `graph.obligations[]` directly inside the `execution-graph/v1` schema and enforce 100% MUST obligation mapping at compile time.
- **Alternatives considered**: Standalone external obligation registry (rejected due to synchronization lag and multi-file divergence); implicit late matching during verification (rejected because incomplete graphs would compile without prior proof guarantees).
- **Rationale**: Keeps nodes and obligations atomic under a single `GraphId`, ensuring every contract obligation is mapped to implementing semantic nodes with required verification evidence or an explicit approved deferral before any downstream consumption.

### Decision: Deterministic GraphId Coupled to Contract, Policy Bundle, and SourceSnapshot Digests (ADR-002)

- **Choice**: Derive `GraphId` as a deterministic SHA-256 fingerprint computed from canonical `contract_digest`, `policy_bundle_digest`, `source_snapshot_id`, and the compiled semantic `nodes` array.
- **Alternatives considered**: Random UUIDv4 or sequential IDs (rejected because they prevent idempotent compilation caching and cannot detect policy or code drift); contract-and-policy hash without source snapshot (rejected because graphs compiled against different code snapshots would collide on identity and risk stale replay).
- **Rationale**: Guarantees idempotent compilation, deterministic replay verification, and instant detection of code provenance, contract, or policy rule drift across environments.

### Decision: Typed ClarifyEvent with Descendant-Scoped Transitive Invalidation (ADR-003)

- **Choice**: Process typed `ClarifyEvent` records by computing the transitive closure of affected descendant nodes along DAG dependency edges, strictly invalidating only those nodes while preserving valid ancestor and sibling node states and outputs.
- **Alternatives considered**: Full graph recompilation (rejected because it wastes execution effort and resets unaffected completed work); ad-hoc single-node patch (rejected because it leaves dependent downstream nodes stale and inconsistent).
- **Rationale**: Minimizes rework during workflow clarification while mathematically guaranteeing causal dependency correctness across the DAG.

### Decision: Declarative Work Order Compilation and Fixture Replay Without Live Runtime Authority (ADR-004)

- **Choice**: Compile semantic nodes strictly into declarative Work Order structures (v2 for K4a public path, v1 for legacy export) without issuing `OperationPermit` tokens or live execution permits, and execute replay solely using pre-recorded fixtures and non-mutating shadow comparison.
- **Alternatives considered**: Minting runtime mock permits or spawning lightweight worker sub-processes (rejected because it violates the K4a architectural boundary and introduces side-effect risks); deferring Work Order structures completely to K6a (rejected because K4a must validate declarative shape conformance and mapping from semantic nodes).
- **Rationale**: Guarantees zero risk of accidental side effects, state mutation, or process leakage during compile, replay, and shadow runs while keeping the boundary with K6a clean.

### Decision: WorkOrder v2 as the K4a Public Compilation Contract and Legacy v1 Preservation (ADR-005)

- **Choice**: Introduce `compileWorkOrdersV2` emitting `kind: "work-order/v2"` and export `compileWorkOrders` as its public alias. Keep `compileWorkOrdersV1` as an explicit legacy-only export conforming to the restored, immutable v1 schema. Publish v2 via `schemas/kernel/work-order/v2.schema.json`, independent manifest/claim entries, and a `work-order/v2` ID domain; never retarget K1 pins.
- **Alternatives considered**: Mutating v1 schema and updating K1 pins (rejected because it destroys historical contract drift detection); overloading one compiler with version flags (rejected because missing options create ambiguous downgrade paths); removing v1 export (rejected because legacy compatibility can be preserved cleanly).
- **Rationale**: Provides clear contract evolution with explicit SourceSnapshot provenance for K4a while preserving the frozen K1 historical baseline byte-for-byte.

### Decision: Atomic Graph and Provenance Validation in compileWorkOrdersV2 (ADR-006)

- **Choice**: Enforce fail-closed atomic validation in `compileWorkOrdersV2` prior to emitting any Work Order: validate graph schema conformance, valid `source_snapshot_id`, exact byte-for-byte match with any context SourceSnapshot, coarse semantic node validity (no microscopic operations, valid ownership, objectives, evidence, acyclic dependencies), and complete Obligation Manifest satisfaction. If any check fails, zero Work Orders are emitted.
- **Alternatives considered**: Partial emission with per-node error logging (rejected because downstream consumers could execute incomplete order sets or bypass safety guards); late runtime validation in worker dispatcher (rejected because invalid or unverified graphs must never reach execution preparation).
- **Rationale**: Guarantees all emitted WorkOrder v2 items share validated, consistent provenance and graph integrity with zero intermediate corrupted state.

### Architecture Decisions Summary

| Decision | Choice | Alternatives considered | Rationale |
|---|---|---|---|
| Obligation Manifest placement (ADR-001) | Embed `graph.obligations[]` in Execution Graph v1 | Standalone store; late implicit matching | Keeps nodes and obligations atomic under GraphId and fails incomplete graphs at compile time. |
| Graph identity & SourceSnapshot binding (ADR-002) | Hash canonical contract digest, policy bundle digest, source_snapshot_id, and nodes | UUID; contract-only hash; hash without source snapshot | Produces reproducible graphs, binds execution to code snapshot, and makes policy/code drift observable. |
| Clarify invalidation (ADR-003) | Invalidate affected nodes plus transitive descendants | Full recompile; ad-hoc patches | Preserves valid ancestor/sibling outputs without retaining stale dependants. |
| Declarative compile & replay (ADR-004) | Pure declarative shapes; fixture replay with zero live authority | Mint mock permits; spawn worker processes | Meets K4a non-interference boundary; defers live execution authority to K6a. |
| WorkOrder v2 public contract (ADR-005) | Export `compileWorkOrders` as alias to `compileWorkOrdersV2`; keep `compileWorkOrdersV1` as legacy export | Mutate v1; overload by flags; silent downgrade | Makes successor contract explicit, prevents ambiguous output, and keeps K1 baseline immutable. |
| Atomic validation in compileWorkOrdersV2 (ADR-006) | Fail-closed atomic validation of graph and provenance before emission | Partial emission with logging; late dispatcher validation | Prevents graph escalation, provenance bypass, and partial order execution. |

## Data Flow

### 1. Compile Execution Graph and Project WorkOrder v2

```text
Validated Contract + PolicySnapshot + SourceSnapshot
                    │
                    ▼
       ┌─────────────────────────────┐
       │    compileExecutionGraph    │
       │                             │
       │ ├─ Validate coarse nodes    │
       │ ├─ Check acyclic deps       │
       │ ├─ Bind source_snapshot_id  │
       │ └─ Validate Obligation      │
       │    Manifest coverage (MUST) │
       └──────────────┬──────────────┘
                      │
                      ▼
         Deterministic GraphId
  (SHA-256 of contract + policy +
   source_snapshot_id + nodes)
                      │
                      ▼
       ┌─────────────────────────────┐
       │     compileWorkOrdersV2     │
       │  (alias: compileWorkOrders) │
       │                             │
       │ ├─ Atomic Graph Validation  │
       │ ├─ Byte-for-byte match with │
       │ │  context SourceSnapshot   │
       │ ├─ Fail-closed on ANY error │
       │ │  (zero partial emission)  │
       │ ├─ Map semantic bindings    │
       │ └─ Derive v2 WorkOrder IDs  │
       └──────────────┬──────────────┘
                      │
                      ▼
        Array of WorkOrder v2 Objects
      { kind: "work-order/v2", schema_version: 2,
        work_order_id, source_snapshot_id,
        node_id, role, operation, objective,
        dependencies, ownership, allowed_paths,
        invariants, required_evidence, budget }
```

### 2. Typed ClarifyEvent Descendant Invalidation

```text
       ┌─────────────────────────────┐
       │        ClarifyEvent         │
       │  (event_id, question_id,    │
       │   answer, affected_nodes)   │
       └──────────────┬──────────────┘
                      │
                      ▼
       ┌─────────────────────────────┐
       │     processClarifyEvent     │
       │                             │
       │ ├─ Calculate DAG transitive │
       │ │  descendant closure       │
       │ ├─ Invalidate affected      │
       │ │  nodes + descendants      │
       │ ├─ Preserve valid ancestor  │
       │ │  and sibling node states  │
       │ └─ Recompile invalidated    │
       │    subgraph with new policy │
       └──────────────┬──────────────┘
                      │
                      ▼
        Updated ExecutionGraph State
```

### 3. Fixture-Based Replay and Shadow Comparison

```text
Pre-recorded Worker Fixtures                Fixed Reference Route
            │                                         │
            ▼                                         ▼
┌─────────────────────────┐               ┌─────────────────────────┐
│   replayExecutionGraph  │               │   Active Fixed Runner   │
│                         │               │  (Primary workflow path)│
│ ├─ Idempotent replay    │               └───────────┬─────────────┘
│ ├─ No live workers      │                           │
│ ├─ Evaluate invariants  │                           │
│ └─ Produce reproducible │                           │
│    counterexamples      │                           │
└───────────┬─────────────┘                           │
            │                                         │
            ▼                                         ▼
   Replay Outcome State                    Fixed Routing Decisions
            │                                         │
            └───────────────┬─────────────────────────┘
                            ▼
               ┌─────────────────────────┐
               │    shadow-comparator    │
               │                         │
               │ ├─ Side-by-side compare │
               │ ├─ Pure read-only view  │
               │ ├─ Emit structured diff │
               │ └─ Zero active state    │
               │    or journal mutation  │
               └─────────────────────────┘
```

### 4. Contract Publication and Isolation Boundary

```text
Historical K1 Baseline (Frozen & Immutable)
├── schemas/kernel/work-order/v1.schema.json (SHA-256: a8204e...c921e5)
├── schemas/kernel/work-order/fixtures/valid/minimal.json
└── scripts/lib/execution-graph/work-order-compiler.js: compileWorkOrdersV1 (legacy export)

Additive K4a Architecture Evolution
├── schemas/kernel/execution-graph/v1.schema.json ($id: ospec://schemas/kernel/execution-graph/v1)
│   └── Requires: source_snapshot_id (^sha256:[a-f0-9]{64}$), nodes, obligations
├── schemas/kernel/policy-snapshot/v1.schema.json ($id: ospec://schemas/kernel/policy-snapshot/v1)
├── schemas/kernel/clarify-event/v1.schema.json ($id: ospec://schemas/kernel/clarify-event/v1)
├── schemas/kernel/work-order/v2.schema.json ($id: ospec://schemas/kernel/work-order/v2)
│   └── Requires: kind="work-order/v2", source_snapshot_id, node bindings, budget
├── schemas/kernel/manifest.json (Distinct "work-order" and "work-order-v2" families)
├── schemas/kernel/contract-claims.json (Distinct claims for v1 and v2)
└── scripts/lib/execution-graph/work-order-compiler.js: compileWorkOrdersV2 (public default)
```

## File Changes

| File | Action | Description |
|---|---|---|
| `schemas/kernel/execution-graph/v1.schema.json` | Modify | Require `source_snapshot_id` matching `^sha256:[a-f0-9]{64}$`, semantic nodes without microscopic operations, and embedded obligations. |
| `schemas/kernel/execution-graph/fixtures/valid/*.json` | Modify | Update valid Execution Graph fixtures to include canonical `source_snapshot_id`. |
| `schemas/kernel/execution-graph/fixtures/invalid/*.json` | Create/Modify | Add negative fixtures for missing `source_snapshot_id`, malformed `source_snapshot_id`, microscopic nodes, unmapped MUST obligations, and cyclic dependencies. |
| `schemas/kernel/policy-snapshot/v1.schema.json` | Create/Verify | PolicySnapshot schema requiring `snapshot_id`, `policy_bundle_digest`, compiler/classifier/runtime versions, and `effective_rules`. |
| `schemas/kernel/policy-snapshot/fixtures/**/*.json` | Create/Verify | Valid and invalid fixtures for PolicySnapshot schema. |
| `schemas/kernel/clarify-event/v1.schema.json` | Create/Verify | ClarifyEvent schema requiring `event_id`, `question_id`, `answer`, `timestamp`, and `affected_nodes`. |
| `schemas/kernel/clarify-event/fixtures/**/*.json` | Create/Verify | Valid and invalid fixtures for ClarifyEvent schema. |
| `schemas/kernel/work-order/v1.schema.json` | Restore/Preserve | Preserve byte-for-byte historical K1 schema matching `sha256:a8204e...c921e5`. |
| `schemas/kernel/work-order/fixtures/valid/{minimal,canonical-bounded-work-order}.json` | Preserve | Keep historical v1 fixtures byte-identical and valid under v1 schema. |
| `schemas/kernel/work-order/v2.schema.json` | Modify | WorkOrder v2 schema requiring `kind: "work-order/v2"`, `source_snapshot_id`, semantic node properties, and budget. |
| `schemas/kernel/work-order/fixtures/valid/v2-minimal.json` | Modify | Canonical v2 fixture with valid `source_snapshot_id` and semantic node fields. |
| `schemas/kernel/work-order/fixtures/invalid/v2-*.json` | Create/Modify | Negative fixtures for missing kind, absent/malformed `source_snapshot_id`, and authority leakage. |
| `schemas/kernel/manifest.json` | Modify | Register `execution-graph`, `policy-snapshot`, `clarify-event`, and distinct `work-order` (v1) and `work-order-v2` families. |
| `schemas/kernel/contract-claims.json` | Modify | Include claims for `execution-graph`, `policy-snapshot`, `clarify-event`, and distinct `work-order` / `work-order-v2`. |
| `scripts/lib/execution-graph/compiler.js` | Modify | Compile Repair DAG with mandatory `source_snapshot_id` validation, embedded Obligation Manifest validation, microscopic node rejection, and deterministic `GraphId` derivation. |
| `scripts/lib/execution-graph/obligation-manifest.js` | Create/Verify | Validate 100% MUST obligation coverage by semantic nodes and required evidence or approved deferrals. |
| `scripts/lib/execution-graph/policy-snapshot.js` | Create/Verify | Generate PolicySnapshot and calculate deterministic `computePolicySnapshotDigest`. |
| `scripts/lib/execution-graph/clarify.js` | Create/Verify | Calculate transitive descendant closure and recompile invalidated subgraphs. |
| `scripts/lib/execution-graph/work-order-compiler.js` | Modify | Implement atomic graph & provenance validation in `compileWorkOrdersV2`, export `compileWorkOrders` as v2 alias, and maintain `compileWorkOrdersV1` legacy export. |
| `scripts/lib/execution-graph/replay-engine.js` | Create/Verify | Fixture-based idempotent replay runner with counterexample generation and zero live authority. |
| `scripts/lib/execution-graph/shadow-comparator.js` | Create/Verify | Pure read-only shadow comparator evaluating graph decisions side-by-side with fixed baseline routes. |
| `scripts/lib/execution-graph/index.js` | Modify | Export compiler, obligation, policy, clarify, work order (v1, v2, default alias), replay, and shadow modules. |
| `scripts/lib/contract-checkers/k4a-microscopic-nodes.js` | Create/Verify | Contract-lint checker rejecting microscopic worker operations. |
| `scripts/lib/contract-checkers/k4a-obligation-completeness.js` | Create/Verify | Contract-lint checker verifying Obligation Manifest completeness. |
| `scripts/lib/contract-lint.js` | Modify | Register K4a checkers in the contract-lint execution pipeline. |
| `scripts/lib/lifecycle-model.js` | Modify | Implement executable checkers for K4a compile/replay invariants and remove from deferred list. |
| `scripts/lib/lifecycle-kernel/k1-compat.js` | Verify/Preserve | Preserve K1 schema baseline assertions and historical digests. |
| `scripts/lib/execution-graph/*.test.js` | Create/Modify | Unit tests for compiler, obligation manifest, policy snapshot, clarify, work order compiler (v1/v2/atomic validation), replay, and shadow comparator. |
| `scripts/lib/contract-checkers/k4a-checkers.test.js` | Create/Verify | Tests for microscopic node rejection and obligation completeness checkers. |
| `scripts/lib/k4a-schema-fixtures.test.js` | Create/Modify | Schema fixture tests for execution-graph, policy-snapshot, clarify-event, and work-order v2. |
| `scripts/lib/k4a-lifecycle-model.test.js` | Create/Modify | Conformance tests for K4a lifecycle invariants. |
| `scripts/lib/k1-scope-guard.test.js` | Verify/Preserve | Ensure K1 baseline remains untouched and immutable. |
| `openspec/changes/k4a-execution-graph-compiler-replay/decisions/adr-001.md` | Preserve | ADR-001: Obligation Manifest as an Embedded View in Execution Graph. |
| `openspec/changes/k4a-execution-graph-compiler-replay/decisions/adr-002.md` | Modify | ADR-002: Deterministic GraphId Coupled to Contract, Policy Bundle, and SourceSnapshot Digests. |
| `openspec/changes/k4a-execution-graph-compiler-replay/decisions/adr-003.md` | Preserve | ADR-003: Typed ClarifyEvent with Descendant-Scoped Transitive Invalidation. |
| `openspec/changes/k4a-execution-graph-compiler-replay/decisions/adr-004.md` | Modify | ADR-004: Declarative Work Order Compilation and Fixture Replay Without Live Runtime Authority. |
| `openspec/changes/k4a-execution-graph-compiler-replay/decisions/adr-005.md` | Preserve | ADR-005: WorkOrder v2 as the K4a Public Compilation Contract and Legacy v1 Preservation. |
| `openspec/changes/k4a-execution-graph-compiler-replay/decisions/adr-006.md` | Create | ADR-006: Atomic Graph and Provenance Validation in compileWorkOrdersV2. |

## Interfaces / Contracts

### 1. ExecutionGraph v1 (`ospec://schemas/kernel/execution-graph/v1`)

```json
{
  "schema_version": 1,
  "graph_id": "sha256:...",
  "contract_digest": "sha256:...",
  "policy_bundle_digest": "sha256:...",
  "source_snapshot_id": "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  "nodes": [
    {
      "node_id": "node-repair-01",
      "kind": "semantic-node",
      "operation": "repair_syntax",
      "objective": "Fix syntax error in parser",
      "dependencies": [],
      "ownership": {
        "owner": "agent:repair",
        "mode": "exclusive"
      },
      "allowed_paths": ["scripts/lib/parser.js"],
      "invariants": ["No syntax errors on require"],
      "required_evidence": ["test-parser-pass"],
      "budget_ref": "budget-standard"
    }
  ],
  "obligations": [
    {
      "id": "req-parser-001",
      "criticality": "must",
      "implemented_by": ["node-repair-01"],
      "required_evidence": ["test-parser-pass"],
      "deferred": null
    }
  ]
}
```

### 2. WorkOrder v2 (`ospec://schemas/kernel/work-order/v2`)

```json
{
  "schema_version": 2,
  "kind": "work-order/v2",
  "work_order_id": "sha256:...",
  "source_snapshot_id": "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  "node_id": "node-repair-01",
  "role": "repair-worker",
  "status": "pending",
  "operation": "repair_syntax",
  "objective": "Fix syntax error in parser",
  "dependencies": [],
  "ownership": {
    "owner": "agent:repair",
    "mode": "exclusive"
  },
  "allowed_paths": ["scripts/lib/parser.js"],
  "invariants": ["No syntax errors on require"],
  "required_evidence": ["test-parser-pass"],
  "budget": {
    "model_turns": 5,
    "patches": 3,
    "commands": 5,
    "wall_time_minutes": 10,
    "changed_lines": 100
  }
}
```

### 3. JavaScript API Signatures

```javascript
// scripts/lib/execution-graph/compiler.js
function computeGraphId(contractDigest, policyBundleDigest, sourceSnapshotId, nodes);
function compileExecutionGraph({
  contract,
  policySnapshot,
  sourceSnapshotId,
  classification,
  nodes,
  obligations,
});

// scripts/lib/execution-graph/work-order-compiler.js
function compileWorkOrdersV1(graph, context = {});
function compileWorkOrdersV2(graph, context = {});
const compileWorkOrders = compileWorkOrdersV2;

// scripts/lib/execution-graph/policy-snapshot.js
function createPolicySnapshot(options = {});
function computePolicySnapshotDigest(snapshot);

// scripts/lib/execution-graph/clarify.js
function calculateDescendantClosure(nodes, affectedNodeIds);
function processClarifyEvent(graph, clarifyEvent, options = {});

// scripts/lib/execution-graph/replay-engine.js
function replayExecutionGraph(graph, fixtureResults, options = {});

// scripts/lib/execution-graph/shadow-comparator.js
function compareShadowDecisions(graphDecisions, baselineDecisions, options = {});
```

## Requirement Allocation

| Spec | Requirement & Title | Scenario | Allocation (Component / File / Test) |
|---|---|---|---|
| `execution-graph-compiler` | REQ-001: Semantic Execution Graph Schema, SourceSnapshot Binding, And Deterministic Graph ID | Compiler generates valid semantic DAG with SourceSnapshot binding for Repair route | `compiler.js`, `schemas/kernel/execution-graph/v1.schema.json`, `compiler.test.js` |
| `execution-graph-compiler` | REQ-001 | Missing or malformed source snapshot id fails graph compilation fail-closed | `compiler.js`, `compiler.test.js` |
| `execution-graph-compiler` | REQ-001 | Microscopic worker action nodes fail schema and compilation validation | `compiler.js`, `execution-graph/v1.schema.json`, `compiler.test.js` |
| `execution-graph-compiler` | REQ-001 | Deterministic GraphId binds contract, policy, and source snapshot digests | `compiler.js:computeGraphId`, `compiler.test.js` |
| `execution-graph-compiler` | REQ-002: Internal Obligation Manifest Completeness | All MUST obligations mapped with evidence pass compilation | `obligation-manifest.js`, `compiler.js`, `obligation-manifest.test.js` |
| `execution-graph-compiler` | REQ-002 | Orphan MUST obligation fails compilation fail-closed | `obligation-manifest.js`, `compiler.js`, `obligation-manifest.test.js` |
| `execution-graph-compiler` | REQ-002 | Explicit approved deferral satisfies obligation manifest check | `obligation-manifest.js`, `compiler.js`, `obligation-manifest.test.js` |
| `execution-graph-compiler` | REQ-003: PolicySnapshot Compile Binding And Digest | PolicySnapshot captures compile configuration and effective rules | `policy-snapshot.js`, `policy-snapshot.test.js` |
| `execution-graph-compiler` | REQ-003 | Divergent effective rules produce distinct PolicySnapshot and GraphId digests | `policy-snapshot.js`, `compiler.js`, `policy-snapshot.test.js` |
| `execution-graph-compiler` | REQ-004: Typed ClarifyEvent Descendant Invalidation And Recompilation | ClarifyEvent invalidates only descendant nodes in the DAG | `clarify.js`, `clarify.test.js` |
| `execution-graph-compiler` | REQ-004 | Unaffected ancestor and sibling node states are preserved | `clarify.js`, `clarify.test.js` |
| `execution-graph-compiler` | REQ-004 | Circular or unknown dependency references in clarify fail closed | `clarify.js`, `clarify.test.js` |
| `execution-graph-compiler` | REQ-005: Declarative Work Order v2 Compilation With Frozen V1 Compatibility And Atomic Provenance Binding | Declarative Work Order v2 is compiled with exact Graph-SourceSnapshot binding | `work-order-compiler.js:compileWorkOrdersV2`, `work-order/v2.schema.json`, `work-order-compiler.test.js` |
| `execution-graph-compiler` | REQ-005 | Provenance mismatch or bypass attempt fails closed before emission | `work-order-compiler.js:compileWorkOrdersV2`, `work-order-compiler.test.js` |
| `execution-graph-compiler` | REQ-005 | Missing, malformed, or invalid source snapshot provenance fails closed | `work-order-compiler.js:compileWorkOrdersV2`, `work-order-compiler.test.js` |
| `execution-graph-compiler` | REQ-005 | Atomic graph validation fails closed on invalid node or graph escalation with zero emitted orders | `work-order-compiler.js:compileWorkOrdersV2`, `work-order-compiler.test.js` |
| `execution-graph-compiler` | REQ-005 | Frozen v1 legacy fixtures and consumers remain valid without output downgrade | `work-order-compiler.js:compileWorkOrdersV1`, `work-order/v1.schema.json`, `k1-scope-guard.test.js` |
| `execution-graph-compiler` | REQ-005 | Work Order compilation does not issue execution authority or invoke workers | `work-order-compiler.js`, `work-order-compiler.test.js` |
| `execution-graph-compiler` | REQ-006: Fixture-Based Deterministic Replay Engine | Fixture replay converges deterministically without live worker invocation | `replay-engine.js`, `replay-engine.test.js` |
| `execution-graph-compiler` | REQ-006 | Replay does not resurrect invalidated nodes or drop obligations | `replay-engine.js`, `replay-engine.test.js` |
| `execution-graph-compiler` | REQ-007: Non-Mutating Shadow Comparison Against Fixed Baseline | Shadow comparison runs alongside fixed baseline on identical inputs | `shadow-comparator.js`, `shadow-comparator.test.js` |
| `execution-graph-compiler` | REQ-007 | Shadow observer guarantees zero mutation of active workflow state | `shadow-comparator.js`, `shadow-comparator.test.js` |
| `execution-graph-compiler` | REQ-007 | Divergence between shadow and fixed decisions emits telemetry without halting fixed route | `shadow-comparator.js`, `shadow-comparator.test.js` |
| `kernel-contract-schemas` | REQ-001: Versioned Schema Families With Id And Version | Every required family has $id and version | `manifest.json`, `contract-claims.json`, `kernel-schema-fixtures.test.js` |
| `kernel-contract-schemas` | REQ-001 | Consumer can pin a schema version | `manifest.json`, `scripts/lib/kernel-schema-fixtures.test.js` |
| `kernel-contract-schemas` | REQ-001 | K2.1 families are included in the required set | `manifest.json`, `scripts/lib/kernel-schema-fixtures.test.js` |
| `kernel-contract-schemas` | REQ-001 | K2a families are included in the required set | `manifest.json`, `scripts/lib/kernel-schema-fixtures.test.js` |
| `kernel-contract-schemas` | REQ-001 | k2a-1 transport envelope families are included | `manifest.json`, `scripts/lib/kernel-schema-fixtures.test.js` |
| `kernel-contract-schemas` | REQ-001 | K3 execution identity families are included in the required set | `manifest.json`, `scripts/lib/kernel-schema-fixtures.test.js` |
| `kernel-contract-schemas` | REQ-001 | K4a execution graph, policy snapshot, and clarify event families are included in the required set | `manifest.json`, `schemas/kernel/execution-graph/`, `schemas/kernel/policy-snapshot/`, `schemas/kernel/clarify-event/`, `k4a-schema-fixtures.test.js` |
| `kernel-contract-schemas` | REQ-012: Execution Identity Schemas With Non-Aliasing Fixtures | K3 identity families expose stable id and version | `manifest.json`, `schemas/kernel/work-order/v2.schema.json`, `k4a-schema-fixtures.test.js` |
| `kernel-contract-schemas` | REQ-012 | Identity confusion negative fixtures fail validation | `schemas/kernel/work-order/fixtures/invalid/`, `k4a-schema-fixtures.test.js` |
| `kernel-contract-schemas` | REQ-012 | Schema v2 exposes explicit kind discriminator for candidate and work-order | `work-order/v2.schema.json`, `k4a-schema-fixtures.test.js` |
| `kernel-contract-schemas` | REQ-012 | WorkOrder v2 requires and preserves a valid source snapshot identifier | `work-order/v2.schema.json`, `k4a-schema-fixtures.test.js` |
| `kernel-contract-schemas` | REQ-012 | WorkOrder v2 rejects absent or malformed source snapshot identifier | `work-order/v2.schema.json`, `k4a-schema-fixtures.test.js` |
| `kernel-contract-schemas` | REQ-012 | Candidate v2 rejects retired relation and inconsistent successor fixture | `candidate/v2.schema.json`, `k3-schema-fixtures.test.js` |
| `kernel-contract-schemas` | REQ-012 | Legacy v1 schemas and K1 baseline remain byte-identical and immutable | `work-order/v1.schema.json`, `k1-scope-guard.test.js` |
| `kernel-contract-schemas` | REQ-012 | Legacy WorkOrder v1 fixtures remain valid alongside v2 | `work-order/fixtures/valid/minimal.json`, `k4a-schema-fixtures.test.js` |
| `kernel-contract-schemas` | REQ-012 | SourceSnapshot v1 and WorkResult v1 allow optional kind property | `source-snapshot/v1.schema.json`, `work-result/v1.schema.json`, `kernel-schema-fixtures.test.js` |
| `kernel-contract-schemas` | REQ-015: Execution Graph And Obligation Manifest Schema Family | Valid execution graph with embedded obligations and source snapshot provenance passes validation | `execution-graph/v1.schema.json`, `schemas/kernel/execution-graph/fixtures/valid/`, `k4a-schema-fixtures.test.js` |
| `kernel-contract-schemas` | REQ-015 | Execution graph missing required fields, source snapshot provenance, or embedded obligations fails validation | `execution-graph/v1.schema.json`, `schemas/kernel/execution-graph/fixtures/invalid/`, `k4a-schema-fixtures.test.js` |
| `kernel-contract-schemas` | REQ-015 | Execution graph with malformed source snapshot id fails validation fail-closed | `execution-graph/v1.schema.json`, `schemas/kernel/execution-graph/fixtures/invalid/`, `k4a-schema-fixtures.test.js` |
| `kernel-contract-schemas` | REQ-016: PolicySnapshot Schema Family With Effective Rules | Valid PolicySnapshot schema validates successfully | `policy-snapshot/v1.schema.json`, `schemas/kernel/policy-snapshot/fixtures/valid/`, `k4a-schema-fixtures.test.js` |
| `kernel-contract-schemas` | REQ-016 | PolicySnapshot missing required versions or rules fails validation | `policy-snapshot/v1.schema.json`, `schemas/kernel/policy-snapshot/fixtures/invalid/`, `k4a-schema-fixtures.test.js` |
| `kernel-contract-schemas` | REQ-017: ClarifyEvent Schema Family | Valid ClarifyEvent fixture validates successfully | `clarify-event/v1.schema.json`, `schemas/kernel/clarify-event/fixtures/valid/`, `k4a-schema-fixtures.test.js` |
| `kernel-contract-schemas` | REQ-017 | ClarifyEvent missing question_id or affected_nodes fails validation | `clarify-event/v1.schema.json`, `schemas/kernel/clarify-event/fixtures/invalid/`, `k4a-schema-fixtures.test.js` |
| `contract-lint` | REQ-012: Microscopic Graph Node Rejection Checker | Microscopic node in graph is rejected as an offender | `scripts/lib/contract-checkers/k4a-microscopic-nodes.js`, `k4a-checkers.test.js` |
| `contract-lint` | REQ-012 | Semantic coarse graph nodes pass without offenders | `scripts/lib/contract-checkers/k4a-microscopic-nodes.js`, `k4a-checkers.test.js` |
| `contract-lint` | REQ-013: Obligation Manifest Completeness Checker | Unmapped MUST obligation is reported as an offender | `scripts/lib/contract-checkers/k4a-obligation-completeness.js`, `k4a-checkers.test.js` |
| `contract-lint` | REQ-013 | Complete Obligation Manifest passes lint | `scripts/lib/contract-checkers/k4a-obligation-completeness.js`, `k4a-checkers.test.js` |
| `lifecycle-model-conformance` | REQ-003: Opaque Future Ports | Subject change invalidates bound decision abstractly | `scripts/lib/lifecycle-model.js`, `lifecycle-model.test.js` |
| `lifecycle-model-conformance` | REQ-003 | Opaque AuthorityToken is insufficient for mutation | `scripts/lib/lifecycle-model.js`, `lifecycle-model.test.js` |
| `lifecycle-model-conformance` | REQ-003 | CapabilityProof fields are concrete | `scripts/lib/lifecycle-model.js`, `lifecycle-model.test.js` |
| `lifecycle-model-conformance` | REQ-003 | PolicySnapshot and Execution Graph compile structures are concrete | `scripts/lib/lifecycle-model.js`, `k4a-lifecycle-model.test.js` |
| `lifecycle-model-conformance` | REQ-004: Deferred Invariants Are Not Enforced In K2.1 | Deferred invariant cannot satisfy K2.1 gate | `scripts/lib/lifecycle-model.js`, `lifecycle-model.test.js` |
| `lifecycle-model-conformance` | REQ-004 | CAS and permit invariants are not deferred | `scripts/lib/lifecycle-model.js`, `lifecycle-model.test.js` |
| `lifecycle-model-conformance` | REQ-004 | K2a host invariants are not deferred | `scripts/lib/lifecycle-model.js`, `lifecycle-model.test.js` |
| `lifecycle-model-conformance` | REQ-004 | K4a Execution Graph and replay invariants are not deferred | `scripts/lib/lifecycle-model.js`, `k4a-lifecycle-model.test.js` |
| `lifecycle-model-conformance` | REQ-010: Executable K4a Execution Graph Compile And Replay Invariants | Every K4a invariant has an executable checker | `scripts/lib/lifecycle-model.js`, `k4a-lifecycle-model.test.js` |
| `lifecycle-model-conformance` | REQ-010 | Graph ID divergence upon policy rule modification | `scripts/lib/lifecycle-model.js`, `k4a-lifecycle-model.test.js` |
| `lifecycle-model-conformance` | REQ-010 | Non-interference checker verifies zero active state mutation | `scripts/lib/lifecycle-model.js`, `k4a-lifecycle-model.test.js` |

## Testing Strategy

| Layer | What to Test | Approach | Command / Evidence |
|---|---|---|---|
| Unit (Execution Graph Compiler) | Node validation, `source_snapshot_id` binding, microscopic node rejection, deterministic `GraphId` derivation | Mock inputs, corrupted inputs, valid inputs | `node --test scripts/lib/execution-graph/compiler.test.js` |
| Unit (Obligation Manifest) | 100% MUST coverage, evidence requirements, structured deferral validation | Complete, incomplete, and deferred obligation sets | `node --test scripts/lib/execution-graph/obligation-manifest.test.js` |
| Unit (PolicySnapshot) | Version capture, effectiveRules calculation, deterministic digest computation | Divergent rules, identical rules | `node --test scripts/lib/execution-graph/policy-snapshot.test.js` |
| Unit (Clarify Invalidation) | Transitive descendant calculation, cycle rejection, state preservation of ancestors/siblings | Directed DAG fixtures with branching | `node --test scripts/lib/execution-graph/clarify.test.js` |
| Unit (WorkOrder Compiler) | Atomic validation, byte-for-byte `source_snapshot_id` match, v2 projection, v1 legacy compatibility, zero execution authority permits | Corrupted graphs, mismatched snapshots, valid v1/v2 graphs | `node --test scripts/lib/execution-graph/work-order-compiler.test.js scripts/lib/execution-graph/index.test.js` |
| Unit (Replay & Shadow) | Idempotent replay with counterexamples, pure read-only shadow comparison against fixed routes | Fixture result catalogs, divergent and matching decision sets | `node --test scripts/lib/execution-graph/replay-engine.test.js scripts/lib/execution-graph/shadow-comparator.test.js` |
| Contract Lint | Fail-closed lint checkers for microscopic nodes and obligation manifest completeness | Valid and invalid ExecutionGraph contract files | `node --test scripts/lib/contract-checkers/k4a-checkers.test.js` |
| Schema Conformance | Valid/invalid fixtures for execution-graph, policy-snapshot, clarify-event, and work-order v2 | AJV validation against schema files | `node --test scripts/lib/k4a-schema-fixtures.test.js scripts/lib/kernel-schema-fixtures.test.js` |
| Baseline Invariance | Strict byte-for-byte preservation of WorkOrder v1 and K1 schema digests | Digest verification against historical baseline pins | `node --test scripts/lib/k1-scope-guard.test.js` |
| Lifecycle Conformance | Executable checkers for all 7 K4a invariants in lifecycle model | Full lifecycle model check suite | `node --test scripts/lib/k4a-lifecycle-model.test.js` |
| Full Regression | End-to-end repository test suite across all kernel slices | Full test runner | `npm test` |

### Review Workload Guard & PR Slicing Strategy

To comply with the repository's 400-line PR review budget, implementation will be executed in autonomous, verifiable slices following the stacked-to-main strategy:
1. **Slice 1 (Schemas & Fixtures)**: Add `source_snapshot_id` to `execution-graph/v1.schema.json`, add valid/invalid fixtures, verify PolicySnapshot, ClarifyEvent, and WorkOrder v2 schemas and fixtures, and verify K1 baseline freeze.
2. **Slice 2 (Compiler & Obligation Manifest)**: Update `compiler.js` (`source_snapshot_id` validation & `GraphId` derivation), verify `obligation-manifest.js` and `policy-snapshot.js`, and add unit tests.
3. **Slice 3 (WorkOrder Compiler Atomic Validation)**: Implement fail-closed atomic validation in `work-order-compiler.js` (`compileWorkOrdersV2`), maintain `compileWorkOrdersV1`, export alias in `index.js`, and add tests.
4. **Slice 4 (Clarify, Replay & Shadow Modules)**: Implement `clarify.js`, `replay-engine.js`, and `shadow-comparator.js` with comprehensive test coverage.
5. **Slice 5 (Contract Lint, Lifecycle Model & Full Verification)**: Register contract-lint checkers, implement K4a executable lifecycle invariants in `lifecycle-model.js`, update integration tests, and run `npm test`.

## Migration / Rollout

1. **Step 1: Schema and Baseline Verification**: Confirm `work-order/v1.schema.json` is byte-identical to K1 pin `sha256:a8204e...c921e5`. Validate `execution-graph/v1.schema.json` requiring `source_snapshot_id` and `work-order/v2.schema.json` independently.
2. **Step 2: Compiler & WorkOrder v2 Implementation**: Deploy `compileExecutionGraph` with `source_snapshot_id` binding and `compileWorkOrdersV2` with atomic validation.
3. **Step 3: Lifecycle Model & Checker Integration**: Wire K4a lifecycle invariant checkers into `scripts/lib/lifecycle-model.js`.
4. **Step 4: Shadow & Replay Validation**: Execute fixture replay and shadow comparison alongside fixed baseline routes in read-only observation mode.
5. **Rollback Plan**: If rollback is necessary, revert K4a compiler aliases and caller imports back to baseline routing. Because K4a operates purely on declarative shapes without issuing runtime execution authority or mutating workflow state, rollback leaves existing fixed execution routes and kernel state completely undisturbed.

## Open Questions

None. All technical contracts, schemas, and invariants are fully resolved by the specifications and ADRs (ADR-001 through ADR-006).
