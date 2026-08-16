# Design: K4a Execution Graph Integrity and Cryptographic Bindings Remediation

## Technical Approach

Remediate critical trust boundary vulnerabilities in the K4a Execution Graph subsystem by establishing canonical cryptographic binding gates (`validateExecutionGraphBinding` and `validatePolicySnapshotBinding`), extending the execution graph schema with optional clarification context, coupling contract obligations to the deterministic `GraphId` preimage while guaranteeing immutable contract authority, enforcing strict fail-closed validation for `sourceSnapshotId`, verifying required evidence per node in the replay engine, and consolidating DAG cycle detection into a shared utility.

This approach maps directly to delta specs:
- `specs/execution-identities/spec.md`: REQ-execution-identities-011 (Execution Graph Cryptographic Binding Gate).
- `specs/kernel-contract-schemas/spec.md`: REQ-kernel-contract-schemas-015 (Execution Graph Clarification Schema), REQ-kernel-contract-schemas-018 (PolicySnapshot Canonical Binding Validation).
- `specs/execution-graph-compiler/spec.md`: REQ-execution-graph-compiler-001 (Semantic Graph & Binding), REQ-execution-graph-compiler-004 (Clarify Invalidation), REQ-execution-graph-compiler-005 (WorkOrder v2 Compilation), REQ-execution-graph-compiler-006 (Replay Engine Evidence Verification), REQ-execution-graph-compiler-007 (Hardened Shadow Comparator), REQ-execution-graph-compiler-008 (Shared DAG Utility).

## Architecture Decisions

### Decision: Canonical validateExecutionGraphBinding Primitive

| Option | Tradeoff | Decision |
|---|---|---|
| Ad-hoc schema checks in caller modules | Low initial effort, but fragmented validation, missing digest verification, and high risk of graph tampering bypass | Rejected |
| Centralized pure cryptographic validation primitive in `execution-identities` | Strict fail-closed verification of schema, snapshot formats, contextual bindings, and recomputed `GraphId` | **Chosen (ADR-001)** |

**Choice**: Implement `validateExecutionGraphBinding(graph, options)` as a pure, non-mutating validator in `scripts/lib/execution-identities/index.js` and re-export in `scripts/lib/execution-graph/index.js`.
**Alternatives considered**: Ad-hoc per-function verification was rejected due to inconsistent error semantics and vulnerability to graph property tampering.
**Rationale**: Guarantees that any ExecutionGraph passed into `compileExecutionGraph`, `compileWorkOrdersV2`, `applyClarifyEvent`, `replayExecutionGraph`, or `compareShadowExecution` is cryptographically authentic, structurally valid, and unmodified.

### Decision: Canonical validatePolicySnapshotBinding Primitive

| Option | Tradeoff | Decision |
|---|---|---|
| Trust declared `snapshot_id` without digest recomputation | Fast, but enables spoofed policy configurations and inconsistent bundle bindings | Rejected |
| Pure cryptographic binding validator `validatePolicySnapshotBinding(snapshot)` | Enforces JSON Schema conformance, SHA-256 pattern check, and exact equality with `computePolicySnapshotDigest(snapshot)` | **Chosen (ADR-002)** |

**Choice**: Implement and export `validatePolicySnapshotBinding(snapshot)` in `scripts/lib/execution-graph/policy-snapshot.js` and bridge into `execution-identities`.
**Alternatives considered**: Unchecked policy snapshot ingestion was rejected because policy bundles dictate boundary execution permissions.
**Rationale**: Ensures cryptographic binding between declared `snapshot_id`, `policy_bundle_digest`, compiler/runtime versions, and effective rules before compilation or clarify event application.

### Decision: Extension of execution-graph/v1.schema.json for Clarify Context

| Option | Tradeoff | Decision |
|---|---|---|
| Strip `clarification_context` prior to schema validation | Discards provenance of why nodes were mutated; complicates replay diagnostics | Rejected |
| Extend `$defs/node` in `execution-graph/v1.schema.json` with optional `clarification_context` | Schema-valid clarify mutations with required `event_id`, `question_id`, `answer` and `additionalProperties: false` | **Chosen (ADR-003)** |

**Choice**: Add optional `clarification_context` object to `$defs/node` in `schemas/kernel/execution-graph/v1.schema.json`.
**Alternatives considered**: External sidecar clarify maps were rejected because graph nodes must remain self-contained for deterministic replay and WorkOrder compilation.
**Rationale**: Enables clarify-mutated graphs to pass `validateExecutionGraphBinding` and compile cleanly to `WorkOrder` v2 without schema violations.

### Decision: Authoritative Contract Obligation Authority & GraphId Preimage Coupling

| Option | Tradeoff | Decision |
|---|---|---|
| Exclude obligations from `computeGraphId()` and allow caller overrides | Allows silent obligation tampering and downgrade of `must` criticality to `may`/`should` | Rejected |
| Include `obligations` in `computeGraphId()` and enforce immutable contract authority | Guarantees obligation tamper-evidence and prevents caller downgrades of `must` criticality | **Chosen (ADR-004)** |

**Choice**: Include `obligations` in `computeGraphId()` preimage hash and enforce that `contract.obligations` is authoritative for obligation IDs and criticality.
**Alternatives considered**: Preimage omitting obligations was rejected because obligations define the mandatory deliverables of the change contract.
**Rationale**: Eliminates privilege escalation where a caller could downgrade a `must` obligation to `may`, and ensures that altering any obligation property alters the `GraphId`.

### Decision: Explicit Fail-Closed sourceSnapshotId Validation

| Option | Tradeoff | Decision |
|---|---|---|
| Silent fallback to contract snapshot ID when `sourceSnapshotId: ""` is passed | Masked caller bugs and inadvertent fallback to incorrect repository states | Rejected |
| Explicit fail-closed validation when `sourceSnapshotId !== undefined` | Throws `invalid-source-snapshot-id` immediately on empty string or malformed digest | **Chosen (ADR-005)** |

**Choice**: In `compileExecutionGraph`, if `sourceSnapshotId !== undefined`, validate format strictly and throw `invalid-source-snapshot-id` on empty/malformed values without fallback.
**Alternatives considered**: Fallback chain `sourceSnapshotId || contract.source_snapshot_id` was rejected because explicit empty arguments must not silently succeed with implicit defaults.
**Rationale**: Enforces deterministic provenance contracts and prevents accidental provenance bypass.

### Decision: Per-Node Required Evidence Enforcement in Replay Engine

| Option | Tradeoff | Decision |
|---|---|---|
| Only check obligations at end of replay | Nodes with missing required evidence marked `completed`; dependent nodes execute on incomplete outputs | Rejected |
| Verify `node.required_evidence ⊆ recorded.evidence` before completing each node | Fail-closed node execution; missing evidence marks node failed/unfulfilled and blocks downstream dependencies | **Chosen (ADR-006)** |

**Choice**: In `replayExecutionGraph`, check that all `node.required_evidence` keys exist in `recorded.evidence` before adding the node to `completedNodes`.
**Alternatives considered**: Global obligation check only was rejected because graph dependency propagation must reflect actual evidence completion per node.
**Rationale**: Prevents premature completion of nodes that lack required evidence and generates actionable counterexample traces.

### Decision: Consolidated DAG Cycle Detection Utility

| Option | Tradeoff | Decision |
|---|---|---|
| Duplicate DFS/Tarjan cycle logic across 4 modules | Maintenance drift, differing edge case behaviors, and duplicate test burdens | Rejected |
| Centralized DAG utility module (`scripts/lib/execution-graph/dag.js`) | Single canonical implementation of `hasCycle` and `topologicalSort` imported by all subsystems | **Chosen (ADR-007)** |

**Choice**: Create `scripts/lib/execution-graph/dag.js` exporting `hasCycle(nodes)` and `topologicalSort(nodes)`, consumed by compiler, clarify, work order compiler, and replay engine.
**Alternatives considered**: Inlining cycle checks was rejected to ensure uniform cycle handling across all execution graph pipelines.
**Rationale**: Unifies cycle detection and topological sorting algorithms under a single audited, test-covered module.

### Decision: Hardened Multi-Dimensional Shadow Comparison Baseline

| Option | Tradeoff | Decision |
|---|---|---|
| Compare shadow decisions without verifying graph cryptographic bindings | Vulnerable to comparing corrupted or spoofed graphs against baseline | Rejected |
| Pre-validate compiled graph via `validateExecutionGraphBinding` before multi-dimensional diffing | Cryptographically authenticated observer comparing steps, paths, invariants, obligations, dependencies, and ownership | **Chosen (ADR-008)** |

**Choice**: In `compareShadowExecution`, execute `validateExecutionGraphBinding(compiledGraph)` fail-closed before computing multi-dimensional diffs against baseline.
**Alternatives considered**: Unvalidated graph inspection was rejected to maintain kernel trust boundary invariants.
**Rationale**: Ensures that shadow comparison operates exclusively on valid graphs, discriminating complete matches (`match: true`) from partial matches (`match: false` with structured telemetry).

## Data Flow

### 1. Compilation & Cryptographic Binding Flow

```
 ChangeContract ──┐
 PolicySnapshot ──┼──→ compileExecutionGraph()
 SourceSnapshot ──┤      │
                         ├──→ dag.hasCycle() ──────────────→ [Fail if cycle]
                         ├──→ validatePolicySnapshotBinding() → [Fail if mismatch]
                         ├──→ Merge Authoritative Obligations
                         ├──→ computeGraphId(contract, ps, bundle, src, nodes, obligations)
                         └──→ validateExecutionGraphBinding() → Return ExecutionGraph
```

### 2. Clarify & Work Order Compilation Flow

```
 ExecutionGraph ──┐
 ClarifyEvent   ──┴──→ applyClarifyEvent()
                         │
                         ├──→ validateExecutionGraphBinding(inputGraph)
                         ├──→ computeDescendantClosure()
                         ├──→ Mutate affected nodes with clarification_context
                         ├──→ computeGraphId(...)
                         └──→ validateExecutionGraphBinding(updatedGraph)
                                 │
                                 ▼
                         compileWorkOrdersV2(updatedGraph, { sourceSnapshot })
                                 │
                                 ├──→ validateExecutionGraphBinding(updatedGraph)
                                 ├──→ dag.topologicalSort()
                                 ├──→ Resolve dependency digests (WorkOrderId)
                                 └──→ validateWorkOrderBinding() for each emitted order
```

### 3. Replay Engine Verification Flow

```
 ExecutionGraph ──┐
 FixtureResults ──┴──→ replayExecutionGraph()
                         │
                         ├──→ validateExecutionGraphBinding(graph)
                         ├──→ dag.topologicalSort(nodes)
                         └──→ For each node in topological order:
                                 ├── Prerequisite check (completedNodes contains all deps)
                                 ├── Fixture status check (ok === true, status === "completed")
                                 ├── Evidence check (node.required_evidence ⊆ recorded.evidence)
                                 └── IF all pass → add to completedNodes & collect evidence
                                     ELSE → add to failedNodes/blockedNodes & generate counterexample
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `schemas/kernel/execution-graph/v1.schema.json` | Modify | Add optional `clarification_context` object to `$defs/node` with required `event_id`, `question_id`, `answer` and `additionalProperties: false`. |
| `scripts/lib/execution-graph/dag.js` | Create | Consolidated DAG utility exporting canonical `hasCycle` and `topologicalSort`. |
| `scripts/lib/execution-graph/policy-snapshot.js` | Modify | Implement and export `validatePolicySnapshotBinding(snapshot)`. |
| `scripts/lib/execution-identities/index.js` | Modify | Implement and export `validateExecutionGraphBinding(graph, options)`. |
| `scripts/lib/execution-graph/compiler.js` | Modify | Update `computeGraphId()` to include `obligations`; enforce contract obligation authority; validate `sourceSnapshotId` fail-closed; invoke `validateExecutionGraphBinding` before return; import `hasCycle` from `./dag.js`. |
| `scripts/lib/execution-graph/clarify.js` | Modify | Import `hasCycle` from `./dag.js`; validate input and output graphs with `validateExecutionGraphBinding`. |
| `scripts/lib/execution-graph/work-order-compiler.js` | Modify | Invoke `validateExecutionGraphBinding(graph, context)`; import `hasCycle` and `topologicalSort` from `./dag.js`. |
| `scripts/lib/execution-graph/replay-engine.js` | Modify | Invoke `validateExecutionGraphBinding(graph)`; verify `node.required_evidence` before node completion; import `hasCycle` and `topologicalSort` from `./dag.js`. |
| `scripts/lib/execution-graph/shadow-comparator.js` | Modify | Invoke `validateExecutionGraphBinding(compiledGraph)` fail-closed; enhance multi-dimensional diff telemetry. |
| `scripts/lib/execution-graph/index.js` | Modify | Re-export `validateExecutionGraphBinding`, `validatePolicySnapshotBinding`, and consolidated `dag` functions. |
| `scripts/lib/test-support/execution-graph-fixtures.js` | Modify | Update sample graph fixtures to use canonical obligation preimages and helper methods. |
| `scripts/lib/execution-graph/*.test.js` | Modify | Update and expand test suites for binding validation, tampering rejection, clarify schema validity, and evidence replay. |
| `scripts/lib/k3-k4a-integration.test.js` | Modify | Validate complete cryptographic pipeline and clarify lifecycle under new bindings. |
| `scripts/lib/k4a-schema-fixtures.test.js` | Modify | Verify schema fixtures for `clarification_context` and obligation manifests. |

## Interfaces / Contracts

### 1. `validateExecutionGraphBinding`

```javascript
/**
 * Cryptographic validation gate for ExecutionGraph records.
 * @param {Object} graph - ExecutionGraph instance
 * @param {Object} [options]
 * @param {Object} [options.policySnapshot] - Bound PolicySnapshot instance
 * @param {Object} [options.sourceSnapshot] - Bound SourceSnapshot instance
 * @returns {{ ok: boolean, reason_code?: string, error?: string }}
 */
function validateExecutionGraphBinding(graph, options = {}) {
  if (!graph || typeof graph !== "object") {
    return { ok: false, reason_code: "INVALID_PAYLOAD", error: "ExecutionGraph must be a non-null object" };
  }
  const validation = validateInstance(getExecutionGraphV1Schema(), graph);
  if (!validation.valid) {
    return { ok: false, reason_code: "INVALID_SCHEMA", error: validation.errors.map((e) => e.message).join("; ") };
  }
  if (!SHA256_REGEX.test(graph.policy_snapshot_id) || !SHA256_REGEX.test(graph.source_snapshot_id)) {
    return { ok: false, reason_code: "ILL_FORMED_SNAPSHOT_ID", error: "Snapshot IDs must match sha256:<64 hex>" };
  }
  if (options.policySnapshot) {
    const psValidation = validatePolicySnapshotBinding(options.policySnapshot);
    if (!psValidation.ok || options.policySnapshot.snapshot_id !== graph.policy_snapshot_id) {
      return { ok: false, reason_code: "POLICY_SNAPSHOT_MISMATCH", error: "PolicySnapshot mismatch or invalid" };
    }
  }
  if (options.sourceSnapshot) {
    const computedSrcId = computeSourceSnapshotId(options.sourceSnapshot);
    if (computedSrcId !== graph.source_snapshot_id) {
      return { ok: false, reason_code: "SOURCE_SNAPSHOT_MISMATCH", error: "SourceSnapshot digest mismatch" };
    }
  }
  const expectedGraphId = computeGraphId(
    graph.contract_digest,
    graph.policy_snapshot_id,
    graph.policy_bundle_digest,
    graph.source_snapshot_id,
    graph.nodes,
    graph.obligations
  );
  if (graph.graph_id !== expectedGraphId) {
    return { ok: false, reason_code: "GRAPH_ID_MISMATCH", error: `GraphId mismatch: declared ${graph.graph_id}, expected ${expectedGraphId}` };
  }
  return { ok: true };
}
```

### 2. `validatePolicySnapshotBinding`

```javascript
/**
 * Cryptographic validation gate for PolicySnapshot records.
 * @param {Object} snapshot - PolicySnapshot instance
 * @returns {{ ok: boolean, reason_code?: string, error?: string }}
 */
function validatePolicySnapshotBinding(snapshot) {
  if (!snapshot || typeof snapshot !== "object") {
    return { ok: false, reason_code: "INVALID_PAYLOAD", error: "PolicySnapshot must be a non-null object" };
  }
  const validation = validateInstance(getPolicySnapshotV1Schema(), snapshot);
  if (!validation.valid) {
    return { ok: false, reason_code: "INVALID_SCHEMA", error: validation.errors.map((e) => e.message).join("; ") };
  }
  if (!SHA256_REGEX.test(snapshot.snapshot_id)) {
    return { ok: false, reason_code: "ILL_FORMED_SNAPSHOT_ID", error: "snapshot_id must match sha256:<64 hex>" };
  }
  const expectedSnapshotId = computePolicySnapshotDigest(snapshot);
  if (snapshot.snapshot_id !== expectedSnapshotId) {
    return { ok: false, reason_code: "POLICY_SNAPSHOT_MISMATCH", error: `PolicySnapshot digest mismatch: declared ${snapshot.snapshot_id}, expected ${expectedSnapshotId}` };
  }
  return { ok: true };
}
```

### 3. `computeGraphId`

```javascript
/**
 * Computes deterministic GraphId incorporating contract, policy, source, nodes, and obligations.
 * @param {string} contractDigest
 * @param {string} policySnapshotId
 * @param {string} policyBundleDigest
 * @param {string} sourceSnapshotId
 * @param {Array<Object>} nodes
 * @param {Array<Object>} obligations
 * @returns {string} sha256:<64 hex>
 */
function computeGraphId(contractDigest, policySnapshotId, policyBundleDigest, sourceSnapshotId, nodes, obligations = []) {
  return sha256Fingerprint("execution-graph/v1", {
    contract_digest: contractDigest,
    policy_snapshot_id: policySnapshotId,
    policy_bundle_digest: policyBundleDigest,
    source_snapshot_id: sourceSnapshotId,
    nodes: Array.isArray(nodes) ? nodes : [],
    obligations: Array.isArray(obligations) ? obligations : [],
  });
}
```

### 4. `dag.js` Utility

```javascript
/**
 * Shared DAG utilities for Execution Graph subsystems.
 */
function hasCycle(nodes) { /* 3-state DFS coloring */ }
function topologicalSort(nodes) { /* Kahn's in-degree queue sort; throws on cycle */ }
```

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit (`compiler.test.js`) | Preimage calculation with obligations, authoritative obligation preservation, `sourceSnapshotId: ""` rejection, output `validateExecutionGraphBinding` validation. | Node test runner with parameterized valid/tampered inputs. |
| Unit (`policy-snapshot.test.js`) | `validatePolicySnapshotBinding` acceptance of valid snapshots and rejection of spoofed `snapshot_id`, malformed strings, or missing fields. | Pure function assertion tests against canonical schema. |
| Unit (`clarify.test.js`) | Mutation with `clarification_context`, schema validation against `execution-graph/v1`, descendant closure invalidation, updated `GraphId`. | Execution graph clarify pipeline verification. |
| Unit (`work-order-compiler.test.js`) | Pre-emission `validateExecutionGraphBinding` enforcement, WorkOrder v2 digest resolution, rejection on tampered graph. | Compilation tests with tampered and valid graphs. |
| Unit (`replay-engine.test.js`) | Per-node `required_evidence` enforcement, counterexample generation on missing evidence, `validateExecutionGraphBinding` pre-check. | Replay evaluation with complete, incomplete, and tampered fixtures. |
| Unit (`shadow-comparator.test.js`) | Fail-closed rejection on tampered graph, multi-dimensional diffing across steps, paths, invariants, obligations, dependencies, ownership. | Comparative tests with matching and divergent baselines. |
| Integration (`k3-k4a-integration.test.js`) | Complete end-to-end flow: Contract -> PolicySnapshot -> SourceSnapshot -> Graph -> WorkOrders v2 -> WorkResults -> Replay -> Clarify -> Re-compilation. | End-to-end lifecycle integration test suite. |
| Schema Conformance (`k4a-schema-fixtures.test.js`) | JSON schema acceptance of nodes with `clarification_context`, rejection of microscopic nodes, malformed snapshot IDs, and unknown properties. | Ajv schema validator against valid/invalid fixture catalogs. |

## Migration / Rollout

No data migration required. All changes are backward compatible with existing valid v2 contracts and schemas while hardening cryptographic validation gates and failing closed on previously undetected tampering.

## Open Questions

None. All architecture decisions and validation primitives have been specified and aligned with K3/K4a requirements.
