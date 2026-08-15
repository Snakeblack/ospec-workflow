# Design: K4a Remediation (v2.45.1)

## Technical Approach

Remediate cryptographic interoperability gaps, schema enforcement omissions, and execution invariants across the K4a execution graph compiler and replay subsystems. The approach establishes end-to-end cryptographic coherence between K3 execution identities (`SourceSnapshot`, `WorkOrder`, `WorkResult`) and K4a execution graphs by:

1. Materializing declarative `WorkOrder` v2 dependencies as canonical `WorkOrderId` SHA-256 digests (`sha256:<64 hex>`) derived through topological compilation rather than raw string node identifiers.
2. Enforcing atomic, fail-closed schema validation against canonical schemas (`execution-graph/v1.schema.json` and `work-order/v2.schema.json`) via `validateInstance` before emitting any orders.
3. Establishing `contract.obligations` as the immutable source of authority for the embedded Obligation Manifest, rejecting caller attempts to strip `MUST` obligations.
4. Propagating ClarifyEvent invalidation sets directly to downstream consumers and the replay engine, enforcing closed completion discrimination and fail-closed rejection of stale fixtures.
5. Formally binding `policy_snapshot_id` to `ExecutionGraph` schema and incorporating it into the deterministic `GraphId` derivation preimage.
6. Enforcing graph immutability through `structuredClone()` defensive isolation and cycle detection (`hasCycle()`) in `compileExecutionGraph()`.
7. Hardening the shadow comparator to evaluate multi-dimensional execution properties (invariants, obligations, dependencies, ownership, steps, allowed paths) as a pure observer.
8. Establishing a mandatory cross-layer integration smoke suite verifying the end-to-end flow from `SourceSnapshot` to `validateWorkResultBinding`.

---

## Architecture Decisions

| Decision | Choice | Alternatives Considered | Trade-off / Rationale |
|----------|--------|-------------------------|------------------------|
| **ADR-001**: Topological WorkOrder v2 Compilation | Topologically sort DAG nodes in `compileWorkOrdersV2`, resolving each node's dependencies to upstream `WorkOrderId` SHA-256 digests. | (A) Raw string node IDs in `dependencies`.<br>(B) Lazy placeholder resolution. | Enforces cryptographic coupling with K3 `computeWorkOrderId` and `validateWorkOrderBinding` while maintaining linear compilation time for DAGs. |
| **ADR-002**: Atomic Canonical Schema Validation | Validate graph and every emitted WorkOrder fail-closed against canonical JSON schemas (`execution-graph/v1`, `work-order/v2`) via `validateInstance`. | (A) Ad-hoc property checks.<br>(B) Permitting partial emission on failure. | Eliminates silent drift between code and JSON schemas; guarantees zero partial order emission on validation failure. |
| **ADR-003**: Authoritative Contract Obligation Authority | Treat `contract.obligations` as the immutable baseline; reconcile caller obligations against contract obligations without allowing `MUST` obligations to be stripped. | (A) External obligations array overrides contract.<br>(B) Allow empty array `[]` to clear obligations. | Prevents caller bypass of mandatory governance checks and guarantees full obligation traceability. |
| **ADR-004**: Clarify Invalidation Propagation & Replay Enforcement | Propagate transitive descendant invalidation set to replay engine; reject stale fixtures fail-closed; enforce closed completion discrimination. | (A) Replay pre-recorded fixtures regardless of invalidation.<br>(B) Accept non-explicit completion statuses. | Prevents state resurrection of invalidated nodes and guarantees deterministic counterexample generation. |
| **ADR-005**: Binding `policy_snapshot_id` to Graph and GraphId | Add `policy_snapshot_id` to `execution-graph/v1.schema.json` and incorporate it into the `computeGraphId()` preimage domain. | (A) Keep `policy_snapshot_id` implicit in policy bundle.<br>(B) Omit from GraphId derivation. | Ensures complete cryptographic provenance coupling contract, source snapshot, policy snapshot, and graph structure. |
| **ADR-006**: Hardened Multi-Dimensional Shadow Comparison | Compare invariants, obligations, dependencies, ownership, steps, and allowed paths against baseline as a pure read-only observer. | (A) Compare steps and allowed paths only.<br>(B) Mutate workflow state during shadow runs. | Provides exhaustive divergence telemetry while strictly preserving zero-mutation guarantees for active state and journals. |

### Decision: Topological WorkOrder v2 Compilation with Canonical `WorkOrderId` Dependencies

**Choice**: In `compileWorkOrdersV2`, topologically sort graph nodes (failing on cycles). For each node in topological order, resolve its semantic node dependencies (`node.dependencies: ["node-1"]`) to the computed canonical `WorkOrderId` SHA-256 digests (`"sha256:<64 hex>"`) of the upstream prerequisite WorkOrders using `computeWorkOrderId()`. Enforce `dependencies.items.pattern: "^sha256:[a-f0-9]{64}$"` in `work-order/v2.schema.json`.

**Alternatives considered**:
- *Raw string node identifiers*: Retaining raw string node names in `dependencies` (e.g. `["node-1"]`) was rejected because K3's `computeWorkOrderId()` and `validateWorkOrderBinding()` strictly validate that every dependency item matches `^sha256:[a-f0-9]{64}$`.
- *Post-compilation hashing*: Deriving WorkOrder IDs in a second pass without topological sorting was rejected because downstream WorkOrder preimages depend directly on upstream WorkOrder SHA-256 digests.

**Rationale**: Guarantees deterministic, cryptographic dependency chaining matching K3 kernel identities while preventing cyclic or unresolved dependency emission.

---

### Decision: Atomic Canonical Schema Validation in `compileWorkOrdersV2`

**Choice**: Load `execution-graph/v1.schema.json` and `work-order/v2.schema.json` from the schema registry and validate the entire ExecutionGraph and every emitted WorkOrder using `validateInstance()` fail-closed. If any validation fails, throw an error immediately and emit zero WorkOrders.

**Alternatives considered**:
- *Manual field assertions only*: Rejected because manual checks drift from schema definitions and miss edge-case constraints (e.g. `additionalProperties: false`, string formats, array item patterns).
- *Partial emission on non-fatal errors*: Rejected because emitting a subset of WorkOrders leaves the system in an inconsistent intermediate state.

**Rationale**: Guarantees that only 100% schema-conforming graphs and WorkOrders enter execution pipelines, preventing provenance bypass or schema violations downstream.

---

### Decision: Contract Authority for Obligation Manifest

**Choice**: Treat `contract.obligations` as authoritative in `compileExecutionGraph()`. Reconcile caller-supplied obligations against contract obligations. If a caller supplies an empty array `[]` or omits required contract obligations, the compiler retains contract `MUST` obligations and fails closed if implementing nodes or required evidence are missing.

**Alternatives considered**:
- *Caller override authority*: Allowing the caller's `obligations` parameter to replace contract obligations unconditionally was rejected because it allowed callers to erase governance and verification requirements.

**Rationale**: Enforces that contract commitments cannot be stripped or bypassed during execution graph compilation.

---

### Decision: Clarify Invalidation Propagation & Replay Enforcement

**Choice**: `applyClarifyEvent` calculates the transitive descendant closure of affected nodes, mutates affected nodes with clarification context, recomputes `graph_id`, and returns `invalidatedNodeIds`. `replayExecutionGraph` accepts `invalidatedNodeIds` and fails closed if fixtures are provided for invalidated nodes. Replay enforces closed completion status: only explicit successful outcomes (`ok: true`, `outcome: "completed"`, `status: "completed"`) are accepted; cancelled or malformed fixtures trigger fail-closed counterexample generation.

**Alternatives considered**:
- *Silent fixture ignoring*: Silently dropping fixtures for invalidated nodes was rejected because it masks test harness configuration errors.
- *Permissive status acceptance*: Treating missing error fields as successful completion was rejected because it allowed cancelled worker tasks to pass verification.

**Rationale**: Ensures that invalidated nodes cannot be resurrected by stale test fixtures and guarantees deterministic, reproducible failure traces.

---

### Decision: Binding `policy_snapshot_id` to Graph and GraphId

**Choice**: Add `policy_snapshot_id` to `execution-graph/v1.schema.json` (`^sha256:[a-f0-9]{64}$`) and update `computeGraphId()` to hash `contract_digest`, `policy_snapshot_id`, `policy_bundle_digest`, `source_snapshot_id`, and `nodes`.

**Alternatives considered**:
- *Implicit policy snapshot reference*: Relying solely on `policy_bundle_digest` was rejected because different policy snapshots (with distinct compiler/classifier/runtime versions) could share identical bundle rules but differ in execution semantics.

**Rationale**: Binds the exact policy configuration, classifier version, and compiler version cryptographically to the resulting graph identity.

---

### Decision: Graph Compiler Immutability and Cycle Detection

**Choice**: Perform cycle detection (`hasCycle()`) inside `compileExecutionGraph()` before graph generation. Isolate input and output objects using `structuredClone()` to prevent callers from mutating graph nodes, allowed paths, invariants, or obligations post-compilation.

**Alternatives considered**:
- *Shallow object spread*: Rejected because nested arrays (`allowed_paths`, `invariants`, `dependencies`) remained shared and mutable.

**Rationale**: Eliminates hidden reference mutation bugs and guarantees graph immutability.

---

### Decision: Hardened Multi-Dimensional Shadow Comparator

**Choice**: Extend `compareShadowExecution` / `compareShadowDecisions` to compare `invariants`, `obligations`, `dependencies`, `ownership`, `steps`, and `allowed_paths`. Generate structured `telemetryDiff` upon divergence while maintaining pure observer isolation (zero mutations to input, active state, or journal).

**Alternatives considered**:
- *Comparing only steps and paths*: Rejected because changes in node ownership or required invariants would go unnoticed during shadow evaluation.

**Rationale**: Provides comprehensive telemetry for shadow route verification without risking active state corruption.

---

## Data Flow

```
+──────────────────────+       +──────────────────────+       +──────────────────────+
|    Change Contract   |       |    SourceSnapshot    |       |    PolicySnapshot    |
| (contract.obligations)       | (source_snapshot_id) |       | (policy_snapshot_id) |
+──────────┬───────────+       +──────────┬───────────+       +──────────┬───────────+
           │                              │                              │
           └──────────────────────┬───────┴──────────────────────────────┘
                                  ▼
                    ┌────────────────────────────┐
                    │   compileExecutionGraph()  │
                    │  - structuredClone isol.   │
                    │  - hasCycle() check        │
                    │  - Contract obligation auth│
                    │  - computeGraphId()        │
                    └─────────────┬──────────────┘
                                  │
                                  ▼
                    ┌────────────────────────────┐
                    │       ExecutionGraph       │
                    │  (bound snapshot & policy) │
                    └─────────────┬──────────────┘
                                  │
         ┌────────────────────────┴────────────────────────┐
         ▼                                                 ▼
┌──────────────────────────────┐                ┌──────────────────────────────┐
│     applyClarifyEvent()      │                │    compileWorkOrdersV2()     │
│  - Descendant closure        │                │  - execution-graph/v1 valid. │
│  - Mutate affected nodes     │                │  - Topological DAG sort      │
│  - Recompute graph_id        │                │  - sha256 dependency digests │
│  - Return invalidatedNodeIds │                │  - work-order/v2 valid.      │
└──────────────┬───────────────┘                └──────────────┬───────────────┘
               │                                               │
               ▼                                               ▼
┌──────────────────────────────┐                ┌──────────────────────────────┐
│    replayExecutionGraph()    │                │       WorkOrder v2 []        │
│  - Reject stale fixtures on  │                │  (dependencies: sha256:...)  │
│    invalidatedNodeIds        │                └──────────────┬───────────────┘
│  - Closed status check       │                               │
│  - Counterexample trace      │                               ▼
└──────────────────────────────┘                ┌──────────────────────────────┐
                                                │ validateWorkOrderBinding()   │
                                                │ (K3 cryptographic authority) │
                                                └──────────────────────────────┘
```

---

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `schemas/kernel/work-order/v2.schema.json` | Modify | Add `pattern: "^sha256:[a-f0-9]{64}$"` to `dependencies.items`. |
| `schemas/kernel/execution-graph/v1.schema.json` | Modify | Add required `policy_snapshot_id` property with `^sha256:[a-f0-9]{64}$` pattern. |
| `schemas/kernel/contract-claims.json` | Modify | Add `policy_snapshot_id` to required fields of `execution-graph` claim. |
| `scripts/lib/execution-graph/compiler.js` | Modify | Add `hasCycle()` check, `structuredClone()` defensive copy, `contract.obligations` authority reconciliation, and update `computeGraphId()` to bind `policy_snapshot_id`. |
| `scripts/lib/execution-graph/work-order-compiler.js` | Modify | Implement topological dependency resolution (`computeWorkOrderId()` digests) and atomic schema validation for graph and emitted WorkOrders. |
| `scripts/lib/execution-graph/clarify.js` | Modify | Mutate affected nodes in returned graph, recompute `graph_id` with `policy_snapshot_id`, and output `invalidatedNodeIds`. |
| `scripts/lib/execution-graph/replay-engine.js` | Modify | Add `invalidatedNodeIds` rejection check and closed completion status discrimination. |
| `scripts/lib/execution-graph/shadow-comparator.js` | Modify | Harden comparator to evaluate `invariants`, `obligations`, `dependencies`, `ownership`, `steps`, and `allowed_paths`. |
| `scripts/lib/execution-graph/compiler.test.js` | Modify | Update unit tests for `policy_snapshot_id` binding, cycle detection, defensive copy, and obligation authority. |
| `scripts/lib/execution-graph/work-order-compiler.test.js` | Modify | Update unit tests for topological `sha256:` dependency resolution and atomic schema validation. |
| `scripts/lib/execution-graph/replay-engine.test.js` | Modify | Add unit tests for invalidated node fixture rejection and closed completion discrimination. |
| `scripts/lib/execution-graph/shadow-comparator.test.js` | Modify | Add unit tests for multi-dimensional shadow comparison and divergence telemetry. |
| `scripts/lib/k4a-schema-fixtures.test.js` | Modify | Update schema fixture tests for `policy_snapshot_id` in execution-graph and `sha256:` dependencies in work-order v2. |
| `schemas/kernel/execution-graph/fixtures/valid/repair-route.json` | Modify | Update fixture with valid `policy_snapshot_id`. |
| `schemas/kernel/execution-graph/fixtures/invalid/missing-policy-snapshot.json` | Create | Negative fixture missing `policy_snapshot_id`. |
| `schemas/kernel/execution-graph/fixtures/invalid/malformed-policy-snapshot.json` | Create | Negative fixture with malformed `policy_snapshot_id`. |
| `schemas/kernel/work-order/fixtures/valid/work-order-v2.json` | Modify | Update fixture with valid `sha256:` dependencies. |
| `schemas/kernel/work-order/fixtures/invalid/malformed-dependencies-digest.json` | Create | Negative fixture with non-sha256 dependency item. |
| `scripts/lib/k3-k4a-integration.test.js` | Create | Cross-layer smoke integration test verifying `SourceSnapshot -> ExecutionGraph -> WorkOrder[] -> validateWorkOrderBinding -> validateWorkResultBinding -> replayExecutionGraph`. |
| `openspec/changes/k4a-remediation-v2-45-1/decisions/adr-001.md` | Create | ADR for topological WorkOrder compilation. |
| `openspec/changes/k4a-remediation-v2-45-1/decisions/adr-002.md` | Create | ADR for atomic canonical schema validation. |
| `openspec/changes/k4a-remediation-v2-45-1/decisions/adr-003.md` | Create | ADR for authoritative contract obligation reconciliation. |
| `openspec/changes/k4a-remediation-v2-45-1/decisions/adr-004.md` | Create | ADR for clarify invalidation propagation and replay enforcement. |
| `openspec/changes/k4a-remediation-v2-45-1/decisions/adr-005.md` | Create | ADR for policy_snapshot_id binding in graph and GraphId. |
| `openspec/changes/k4a-remediation-v2-45-1/decisions/adr-006.md` | Create | ADR for hardened multi-dimensional shadow comparison. |

---

## Interfaces / Contracts

### 1. `computeGraphId` Signature & Canonical Preimage

```javascript
/**
 * Derives a deterministic GraphId from contract digest, policy snapshot id,
 * policy bundle digest, source snapshot id, and nodes.
 *
 * @param {string} contractDigest - sha256:...
 * @param {string} policySnapshotId - sha256:...
 * @param {string} policyBundleDigest - sha256:...
 * @param {string} sourceSnapshotId - sha256:...
 * @param {Array<Object>} nodes - Array of semantic graph node objects
 * @returns {string} sha256:<64 hex>
 */
function computeGraphId(contractDigest, policySnapshotId, policyBundleDigest, sourceSnapshotId, nodes) {
  // Domain: "execution-graph/v1"
  return sha256Fingerprint("execution-graph/v1", {
    contract_digest: contractDigest,
    policy_snapshot_id: policySnapshotId,
    policy_bundle_digest: policyBundleDigest,
    source_snapshot_id: sourceSnapshotId,
    nodes: Array.isArray(nodes) ? nodes : [],
  });
}
```

### 2. `compileWorkOrdersV2` Topological Compilation Algorithm

```javascript
/**
 * Compiles coarse semantic graph nodes into declarative WorkOrder v2 shapes
 * with canonical WorkOrderId SHA-256 dependency digests.
 *
 * @param {Object} graph - ExecutionGraph instance
 * @param {Object} [context] - Declarative compilation context
 * @returns {Array<Object>} Array of WorkOrder v2 objects
 */
function compileWorkOrdersV2(graph, context = {}) {
  // 1. Schema Pre-validation
  const graphValidation = validateInstance(getExecutionGraphV1Schema(), graph);
  if (!graphValidation.valid) {
    const err = new Error(`ExecutionGraph failed schema validation: ${graphValidation.errors.map(e => e.message).join("; ")}`);
    err.code = "invalid-graph-schema";
    throw err;
  }

  // 2. Provenance verification
  const sourceSnapshotId = resolveVerifiedSourceSnapshotId(graph, context);

  // 3. Cycle check
  if (hasCycle(graph.nodes)) {
    const err = new Error("Dependency cycle detected in Execution Graph");
    err.code = "cyclic-dependency-detected";
    throw err;
  }

  // 4. Obligation manifest validation
  const obligationValidation = validateObligationManifest(graph.obligations, graph.nodes);
  if (!obligationValidation.valid) {
    const err = new Error(`Obligation manifest validation failed: ${obligationValidation.errors.join("; ")}`);
    err.code = "obligation-manifest-incomplete";
    throw err;
  }

  // 5. Topological Sort
  const sortedNodes = topologicalSort(graph.nodes);
  const nodeIdToWorkOrderId = new Map();
  const workOrders = [];
  const woSchema = getWorkOrderV2Schema();

  for (const node of sortedNodes) {
    // Resolve semantic node dependencies to canonical upstream WorkOrderId digests
    const rawDeps = Array.isArray(node.dependencies) ? node.dependencies : [];
    const resolvedDeps = rawDeps.map(depNodeId => {
      const parentWorkOrderId = nodeIdToWorkOrderId.get(depNodeId);
      if (!parentWorkOrderId) {
        const err = new Error(`Unresolved dependency WorkOrderId for node "${depNodeId}" (dependent: "${node.node_id}")`);
        err.code = "unresolved-dependency-digest";
        throw err;
      }
      return parentWorkOrderId;
    });

    const budget = (context.budgets && context.budgets[node.node_id]) || context.defaultBudget || DEFAULT_WORK_ORDER_BUDGET;
    const normalizedBudget = {
      model_turns: Number(budget.model_turns ?? DEFAULT_WORK_ORDER_BUDGET.model_turns),
      patches: Number(budget.patches ?? DEFAULT_WORK_ORDER_BUDGET.patches),
      commands: Number(budget.commands ?? DEFAULT_WORK_ORDER_BUDGET.commands),
      wall_time_minutes: Number(budget.wall_time_minutes ?? DEFAULT_WORK_ORDER_BUDGET.wall_time_minutes),
      changed_lines: Number(budget.changed_lines ?? DEFAULT_WORK_ORDER_BUDGET.changed_lines),
    };

    const workOrderPayload = {
      schema_version: 2,
      kind: "work-order/v2",
      source_snapshot_id: sourceSnapshotId,
      node_id: String(node.node_id),
      role: String(context.role || "repair-worker"),
      operation: String(node.operation),
      objective: String(node.objective),
      dependencies: resolvedDeps,
      ownership: node.ownership && typeof node.ownership === "object"
        ? { owner: String(node.ownership.owner), mode: String(node.ownership.mode) }
        : { owner: "agent:repair", mode: "exclusive" },
      allowed_paths: Array.isArray(node.allowed_paths) ? [...node.allowed_paths] : [],
      invariants: Array.isArray(node.invariants) ? [...node.invariants] : [],
      required_evidence: Array.isArray(node.required_evidence) ? [...node.required_evidence] : [],
      budget: normalizedBudget,
    };

    const workOrderId = computeWorkOrderId(workOrderPayload);
    const workOrder = {
      ...workOrderPayload,
      work_order_id: workOrderId,
      status: "pending",
    };

    // 6. WorkOrder v2 Schema Post-validation
    const woValidation = validateInstance(woSchema, workOrder);
    if (!woValidation.valid) {
      const err = new Error(`Emitted WorkOrder failed schema validation: ${woValidation.errors.map(e => e.message).join("; ")}`);
      err.code = "invalid-work-order-schema";
      throw err;
    }

    nodeIdToWorkOrderId.set(node.node_id, workOrderId);
    workOrders.push(workOrder);
  }

  return workOrders;
}
```

### 3. Replay Closed Completion Discrimination & Invalidation Rejection

```javascript
/**
 * @param {Object} graph - ExecutionGraph instance
 * @param {Object} [fixtureResults] - Pre-recorded fixture outcomes
 * @param {Object} [options] - Replay options
 * @param {string[]|Set<string>} [options.invalidatedNodeIds] - Transitive invalidated node IDs
 */
function replayExecutionGraph(graph, fixtureResults = {}, options = {}) {
  const invalidatedSet = new Set(options.invalidatedNodeIds || []);
  
  // Rejection of stale fixtures for invalidated nodes
  for (const nodeId of invalidatedSet) {
    if (fixtureResults[nodeId]) {
      const err = new Error(`Stale fixture result supplied for invalidated node "${nodeId}"`);
      err.code = "stale-fixture-rejected";
      err.node_id = nodeId;
      throw err;
    }
  }

  // Closed status evaluation
  // Only status === "completed" and ok !== false is valid.
  // "cancelled", "failed", null, undefined -> counterexample trace.
}
```

---

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| **Schema Validation** | `execution-graph/v1` requires `policy_snapshot_id`; `work-order/v2` requires `sha256:` dependencies. | Validate positive and negative fixtures against canonical schemas via `validateInstance` in `k4a-schema-fixtures.test.js`. |
| **Unit: Compiler** | `computeGraphId()` coupling to `policy_snapshot_id`; cycle rejection in `compileExecutionGraph()`; defensive copying with `structuredClone()`; contract obligation authority reconciliation. | Unit test suite in `scripts/lib/execution-graph/compiler.test.js`. |
| **Unit: WorkOrder Compiler** | Topological sort and SHA-256 `WorkOrderId` dependency digest resolution; fail-closed schema validation on invalid graph/orders; zero-token declarative safety. | Unit test suite in `scripts/lib/execution-graph/work-order-compiler.test.js`. |
| **Unit: Clarify & Replay** | Transitive invalidation set computation; updated `graph_id`; fail-closed rejection of stale fixtures on invalidated nodes; closed completion discrimination. | Unit test suites in `clarify.test.js` and `replay-engine.test.js`. |
| **Unit: Shadow Comparator** | Hardened multi-dimensional comparison (`invariants`, `obligations`, `dependencies`, `ownership`, `steps`, `allowed_paths`); zero-mutation observer guarantees. | Unit test suite in `scripts/lib/execution-graph/shadow-comparator.test.js`. |
| **Integration: Cross-Layer Smoke (K3 ↔ K4a)** | End-to-end cryptographic pipeline: `SourceSnapshot -> ExecutionGraph -> WorkOrder[] -> validateWorkOrderBinding -> validateWorkResultBinding -> replayExecutionGraph`. | Integration test in `scripts/lib/k3-k4a-integration.test.js`. |

---

## Migration / Rollout

No database migration or persistent storage format migration is required. All changes are confined to compiler and verification libraries within the kernel contract suite:
1. Update schema documents and claims: `work-order/v2.schema.json`, `execution-graph/v1.schema.json`, `contract-claims.json`.
2. Update compiler core: `compiler.js`, `work-order-compiler.js`, `clarify.js`, `replay-engine.js`, `shadow-comparator.js`.
3. Update unit and fixture test suites to use valid `sha256:` dependency digests and `policy_snapshot_id`.
4. Run the complete kernel and execution-graph test suite to verify 100% green conformance.

---

## Open Questions

None. All architectural constraints and remediation requirements have been formalized.
