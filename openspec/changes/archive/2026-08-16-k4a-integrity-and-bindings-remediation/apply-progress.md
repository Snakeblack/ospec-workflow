# Apply Progress: K4a Execution Graph Integrity and Cryptographic Bindings Remediation

## Change Context
- **Change**: `k4a-integrity-and-bindings-remediation`
- **Goal**: Implement complete cryptographic binding gates, schema extensions, contract obligation authority protections, shared DAG utilities, and adversarial verification across the K4a Execution Graph compiler and execution subsystems.
- **TDD Mode**: Focused TDD (`testing.tdd_mode: focused`)

---

## Completed Phases and Implementation Log

### Phase 1: Shared DAG Utilities & Cycle Detection
- **Files Created/Modified**:
  - `scripts/lib/execution-graph/dag.js`: Canonical DFS coloring cycle detector (`hasCycle`), Kahn's in-degree topological sorter (`topologicalSort`), and breadth-first transitive descendant closure resolver (`computeDescendantClosure`).
  - `scripts/lib/execution-graph/dag.test.js`: Unit tests for acyclic, direct cycles, indirect cycles, disconnected components, and closure calculation.
  - Replaced duplicate cycle/sort/closure implementations across `compiler.js`, `clarify.js`, `work-order-compiler.js`, and `replay-engine.js`.
  - Re-exported utilities in `scripts/lib/execution-graph/index.js`.
- **Tests**: `scripts/lib/execution-graph/dag.test.js` (8/8 PASS).

### Phase 2: Schema Extension for Clarification Context
- **Files Modified**:
  - `schemas/kernel/execution-graph/v1.schema.json`: Added optional `clarification_context` object to `$defs/node` with required fields `event_id`, `question_id`, `answer` and `additionalProperties: false`.
  - `scripts/lib/k4a-schema-fixtures.test.js`: Added schema fixture tests for valid/invalid clarification contexts.
- **Tests**: `scripts/lib/k4a-schema-fixtures.test.js` (7/7 PASS).

### Phase 3: Policy Snapshot Cryptographic Binding Primitive
- **Files Modified**:
  - `scripts/lib/execution-graph/policy-snapshot.js`: Implemented `validatePolicySnapshotBinding(snapshot)` verifying schema validity, SHA-256 pattern, and exact computed digest equality.
  - `scripts/lib/execution-graph/policy-snapshot.test.js`: Unit tests for valid snapshots, forged snapshot IDs, malformed digests, and schema invalidity.
  - Exported in `scripts/lib/execution-graph/index.js`.
- **Tests**: `scripts/lib/execution-graph/policy-snapshot.test.js` (8/8 PASS).

### Phase 4: Execution Graph Cryptographic Binding Gate
- **Files Created/Modified**:
  - `scripts/lib/execution-graph/binding.js`: Implemented `validateExecutionGraphBinding(graph, options)` verifying schema conformance, SHA-256 snapshot formats, contextual PolicySnapshot binding, contextual SourceSnapshot binding, and deterministic `GraphId` equality.
  - Exported in `scripts/lib/execution-identities/index.js`, `scripts/lib/execution-graph/compiler.js`, and `scripts/lib/execution-graph/index.js`.
  - `scripts/lib/execution-identities/index.test.js`: Unit tests verifying valid graphs, tampered nodes/obligations/digests (`GRAPH_ID_MISMATCH`), invalid schemas (`INVALID_SCHEMA`), malformed snapshot IDs (`ILL_FORMED_SNAPSHOT_ID`), contextual mismatches, and immutability.
- **Tests**: `scripts/lib/execution-identities/index.test.js` (67/67 PASS).

### Phase 5: Compiler Core Hardening & Contract Obligation Authority
- **Files Modified**:
  - `scripts/lib/execution-graph/compiler.js`:
    - Updated `computeGraphId()` to incorporate `obligations` into canonical SHA-256 preimage.
    - Added strict `sourceSnapshotId` validation failing closed on empty string or malformed digest.
    - Added `validatePolicySnapshotBinding` invocation throwing `policy-snapshot-mismatch` on forged snapshots.
    - Enforced authoritative `contract.obligations` protection: caller mappings cannot downgrade `must` criticality to `should` or `may`.
    - Added `validateExecutionGraphBinding(graph)` pre-return output check.
  - `scripts/lib/execution-graph/compiler.test.js`: Unit tests for preimage obligations, MUST protection, strict snapshot checking, and forged PolicySnapshot rejection.
- **Tests**: `scripts/lib/execution-graph/compiler.test.js` (13/13 PASS).

### Phase 6: Clarify Pipeline Hardening & Schema Alignment
- **Files Modified**:
  - `scripts/lib/execution-graph/clarify.js`: Pre-validates input graph binding, mutates affected nodes with `clarification_context`, recomputes GraphId with `obligations`, and post-validates output binding.
  - `scripts/lib/execution-graph/clarify.test.js`: Verified schema conformance, descendant closure invalidation, and tampered input rejection.
- **Tests**: `scripts/lib/execution-graph/clarify.test.js` (6/6 PASS).

### Phase 7: WorkOrder Compiler Tampering Protection & Binding Enforcement
- **Files Modified**:
  - `scripts/lib/execution-graph/work-order-compiler.js`: Pre-validates `validateExecutionGraphBinding(graph, context)` and verifies provenance fail-closed before WorkOrder v2 emission.
  - `scripts/lib/execution-graph/work-order-compiler.test.js`: Tests for clarified graph compilation, tampered graph rejection, and provenance mismatch.
- **Tests**: `scripts/lib/execution-graph/work-order-compiler.test.js` (15/15 PASS).

### Phase 8: Replay Engine Node Evidence & Binding Enforcement
- **Files Modified**:
  - `scripts/lib/execution-graph/replay-engine.js`: Pre-validates `validateExecutionGraphBinding(graph, options)`, checks `node.required_evidence ⊆ Object.keys(recorded.evidence)` before node completion, and emits structured counterexample traces on failure.
  - `scripts/lib/execution-graph/replay-engine.test.js`: Tests for node evidence checking, counterexample trace generation, and tampered graph rejection.
- **Tests**: `scripts/lib/execution-graph/replay-engine.test.js` (8/8 PASS).

### Phase 9: Shadow Comparator Multi-Dimensional Reporting & Binding Enforcement
- **Files Modified**:
  - `scripts/lib/execution-graph/shadow-comparator.js`: Pre-validates `validateExecutionGraphBinding(compiledGraph)`, reports `evaluated_dimensions`, `skipped_dimensions`, `dimension_match_rates`, and discriminates between `full-match`, `partial-match`, and `diverged`.
  - `scripts/lib/execution-graph/shadow-comparator.test.js`: Tests for multi-dimensional divergence reporting and tampered graph rejection.
- **Tests**: `scripts/lib/execution-graph/shadow-comparator.test.js` (7/7 PASS).

### Phase 10: Cross-Layer Adversarial Test Suite & Integration Verification
- **Files Modified**:
  - `scripts/lib/k3-k4a-integration.test.js`: Added adversarial tests covering tampering across 7 graph fields, MUST obligation downgrade rejection, end-to-end Clarify -> WorkOrder -> K3 execution pipeline, forged PolicySnapshot rejection, empty snapshot ID rejection, and missing node evidence counterexample generation.
  - `scripts/lib/lifecycle-model.js`: Updated `checkK4aClarifyInvalidationBoundary()` to construct schema-valid graph conforming to binding gates.
- **Tests**: `scripts/lib/k3-k4a-integration.test.js` (7/7 PASS), `scripts/lib/lifecycle-model.test.js` (15/15 PASS).
- **Workspace Verification**: `node scripts/check.js` (100% PASS across all unit, integration, and invariant tests).
