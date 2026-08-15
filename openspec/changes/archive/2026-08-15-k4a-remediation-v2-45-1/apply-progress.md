# Apply Progress: K4a Remediation (v2.45.1)

## Session Summary
- **Phase**: `apply`
- **TDD Mode**: `focused`
- **Result**: All 31 tasks across 7 phases completed and verified with 100% test suite pass (2236+ tests).

## Phase Progress

### Phase 1: Kernel Schemas & Fixtures Update
- `schemas/kernel/work-order/v2.schema.json`: Added `pattern: "^sha256:[a-f0-9]{64}$"` to `dependencies.items`.
- `schemas/kernel/execution-graph/v1.schema.json`: Added mandatory `policy_snapshot_id` property with `pattern: "^sha256:[a-f0-9]{64}$"`.
- `schemas/kernel/contract-claims.json`: Added `policy_snapshot_id` to required claims for `execution-graph`.
- `schemas/kernel/execution-graph/fixtures/valid/repair-route.json`: Added valid `policy_snapshot_id`.
- `schemas/kernel/execution-graph/fixtures/invalid/missing-policy-snapshot.json`: Created negative fixture for missing policy snapshot ID.
- `schemas/kernel/execution-graph/fixtures/invalid/malformed-policy-snapshot.json`: Created negative fixture for malformed policy snapshot ID.
- `schemas/kernel/work-order/fixtures/valid/v2-minimal.json`: Updated dependencies item to valid `sha256:...` digest.
- `schemas/kernel/work-order/fixtures/invalid/malformed-dependencies-digest.json`: Created negative fixture for invalid dependencies item.

### Phase 2: Graph Compiler Core Hardening
- `scripts/lib/execution-graph/compiler.js`:
  - Updated `computeGraphId(contractDigest, policySnapshotId, policyBundleDigest, sourceSnapshotId, nodes)` with 5-parameter preimage domain.
  - Added cycle detection using `hasCycle(graphNodes)` throwing `code = "cyclic-dependency-detected"`.
  - Added `structuredClone` defensive copies for nodes, obligations, and returned graph objects.
  - Implemented authoritative `contract.obligations` reconciliation to prevent stripping MUST obligations.
  - Emitted `policy_snapshot_id` matching bound PolicySnapshot in execution graph.

### Phase 3: WorkOrder Compiler Topological Compilation & Atomic Validation
- `scripts/lib/execution-graph/work-order-compiler.js`:
  - Implemented `topologicalSort` in `compileWorkOrdersV2`.
  - Resolved semantic node dependencies into upstream `WorkOrderId` sha256 digests.
  - Pre-validated ExecutionGraph against `execution-graph/v1.schema.json`.
  - Post-validated each emitted WorkOrder against `work-order/v2.schema.json`.
  - Preserved frozen legacy `compileWorkOrdersV1` without mutation.

### Phase 4: Clarify & Replay Engine Hardening
- `scripts/lib/execution-graph/clarify.js`:
  - Updated `applyClarifyEvent` to mutate affected nodes with `clarification_context`.
  - Recomputed `graph_id` with `policy_snapshot_id` and updated nodes.
  - Returned `{ graph, invalidatedNodeIds, preservedNodeIds }`.
- `scripts/lib/execution-graph/replay-engine.js`:
  - Added `options.invalidatedNodeIds` check to reject stale fixtures fail-closed (`code = "stale-fixture-rejected"`).
  - Enforced closed completion status discrimination (`status === "completed"`, `ok !== false`).
  - Emitted detailed counterexample traces on replay failure without live worker authority.

### Phase 5: Shadow Comparator Hardening
- `scripts/lib/execution-graph/shadow-comparator.js`:
  - Evaluated multi-dimensional execution properties: `steps`, `allowed_paths`, `invariants`, `obligations`, `dependencies`, and `ownership`.
  - Emitted structured `telemetryDiff` upon divergence without halting or mutating active state.
  - Preserved pure read-only observer isolation.

### Phase 6: Unit Test Updates Across K4a Modules
- `scripts/lib/k4a-schema-fixtures.test.js`: Verified positive and negative fixtures.
- `scripts/lib/execution-graph/compiler.test.js`: Verified 5-param `computeGraphId`, cycle detection, defensive copy immutability, and obligation authority.
- `scripts/lib/execution-graph/work-order-compiler.test.js`: Verified topological sha256 dependency digests and atomic validation.
- `scripts/lib/execution-graph/clarify.test.js`: Verified node mutation, graph_id recomputation, and descendant invalidation.
- `scripts/lib/execution-graph/replay-engine.test.js`: Verified stale fixture rejection and cancelled status discrimination.
- `scripts/lib/execution-graph/shadow-comparator.test.js`: Verified multi-dimensional divergence diffs and zero-mutation guarantees.
- `scripts/lib/k4a-lifecycle-model.test.js` & `scripts/lib/contract-checkers/k4a-checkers.test.js`: Verified model invariants.

### Phase 7: Cross-Layer Integration Smoke Test
- Created `scripts/lib/k3-k4a-integration.test.js`:
  - Full pipeline: `SourceSnapshot -> compileExecutionGraph -> compileWorkOrdersV2 -> validateWorkOrderBinding -> validateWorkResultBinding -> replayExecutionGraph -> applyClarifyEvent`.
  - Verified 100% cryptographic provenance coupling and fail-closed replay rejection.

## Verification Status
- Full repository test run (`npm test`): **PASS** (2236+ tests passing, 0 failing).
