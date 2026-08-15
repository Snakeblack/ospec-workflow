# Tasks: K4a Remediation (v2.45.1)

## Spec/Design Reconciliation

| Requirement / Scenario | Priority | Design Allocation | Status | Notes |
|------------------------|----------|-------------------|--------|-------|
| `REQ-execution-graph-compiler-001`: Semantic Execution Graph Schema, SourceSnapshot Binding, PolicySnapshot ID Binding, Cycle Detection, Deterministic Graph ID | MUST | `scripts/lib/execution-graph/compiler.js`, `computeGraphId()` | covered-by-design | Full binding of `policy_snapshot_id`, `hasCycle()`, `structuredClone()` isolation |
| `REQ-execution-graph-compiler-002`: Internal Obligation Manifest Completeness & Contract Authority | MUST | `scripts/lib/execution-graph/compiler.js`, `obligation-manifest.js` | covered-by-design | Reconciles against authoritative `contract.obligations`, rejecting stripping |
| `REQ-execution-graph-compiler-003`: PolicySnapshot Compile Binding & Digest | MUST | `scripts/lib/execution-graph/policy-snapshot.js`, `compiler.js` | covered-by-design | Enforces `policy_snapshot_id` matching PolicySnapshot digest |
| `REQ-execution-graph-compiler-004`: Typed ClarifyEvent Descendant Invalidation & Recompilation | MUST | `scripts/lib/execution-graph/clarify.js` | covered-by-design | Transitive descendant closure, node mutation, graph_id recomputation, returns `invalidatedNodeIds` |
| `REQ-execution-graph-compiler-005`: Declarative WorkOrder v2 Topological Compilation & Atomic Schema Validation | MUST | `scripts/lib/execution-graph/work-order-compiler.js` | covered-by-design | Topological sort, `computeWorkOrderId()` sha256 digests in dependencies, canonical schema validation |
| `REQ-execution-graph-compiler-006`: Fixture-Based Deterministic Replay Engine With Closed Completion Discrimination | MUST | `scripts/lib/execution-graph/replay-engine.js` | covered-by-design | Rejects stale fixtures on `invalidatedNodeIds`, closed status check, counterexample generation |
| `REQ-execution-graph-compiler-007`: Hardened Non-Mutating Shadow Comparison | MUST | `scripts/lib/execution-graph/shadow-comparator.js` | covered-by-design | Multi-dimensional comparison (invariants, obligations, dependencies, ownership, steps, allowed_paths) |
| `REQ-kernel-contract-schemas-012`: Execution Identity Schemas With Non-Aliasing Fixtures | MUST | `schemas/kernel/work-order/v2.schema.json`, test fixtures | covered-by-design | `dependencies.items` sha256 digest pattern constraint |
| `REQ-kernel-contract-schemas-015`: Execution Graph & Obligation Manifest Schema Family | MUST | `schemas/kernel/execution-graph/v1.schema.json`, claims | covered-by-design | Required `policy_snapshot_id` property with sha256 pattern |
| `REQ-execution-identities-003`: Bound WorkOrder & Raw WorkResult Pipeline | MUST | `scripts/lib/execution-identities.js`, `k3-k4a-integration.test.js` | covered-by-design | Validates WorkOrder v2 with sha256 dependency digests against K3 cryptographic validators |

### Reconciliation Verdict
- MUST coverage: complete (10/10 MUST requirements allocated and covered)
- SHOULD/MAY gaps: none
- Ambiguities to track: none

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 280 - 380 lines |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR (or 3-4 stacked units) |
| Delivery strategy | ask-on-risk |
| Chain strategy | stacked-to-main |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: stacked-to-main
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Kernel Schemas & Fixtures Update | PR 1 | Update `work-order/v2.schema.json`, `execution-graph/v1.schema.json`, claims, and positive/negative fixtures |
| 2 | Graph Compiler Core & WorkOrder Compiler | PR 1 (or PR 2) | Cycle check, `policy_snapshot_id` binding, obligation authority, topological WorkOrder compilation |
| 3 | Clarify, Replay & Shadow Comparator Hardening | PR 1 (or PR 3) | Clarify invalidation, closed completion replay discrimination, hardened multi-dimensional comparator |
| 4 | Test Suites & Cross-Layer Integration Smoke | PR 1 (or PR 4) | Unit test suite updates and end-to-end `k3-k4a-integration.test.js` smoke suite |

### Checklist Status Legend

- `[ ]` Not implemented yet
- `[~]` Implemented but not yet verified locally
- `[x]` Implemented and verified locally

## Phase 1: Kernel Schemas & Fixtures Update

- [x] 1.1 Update `schemas/kernel/work-order/v2.schema.json` to enforce `pattern: "^sha256:[a-f0-9]{64}$"` on `dependencies.items` [REQ-kernel-contract-schemas-012]
- [x] 1.2 Update `schemas/kernel/execution-graph/v1.schema.json` to add required `policy_snapshot_id` property with `^sha256:[a-f0-9]{64}$` pattern [REQ-kernel-contract-schemas-015]
- [x] 1.3 Update `schemas/kernel/contract-claims.json` to include `policy_snapshot_id` in required claims for `execution-graph` [REQ-kernel-contract-schemas-015]
- [x] 1.4 Update existing valid execution graph fixture `schemas/kernel/execution-graph/fixtures/valid/repair-route.json` with canonical `policy_snapshot_id` [REQ-kernel-contract-schemas-015]
- [x] 1.5 Create negative execution graph fixtures `schemas/kernel/execution-graph/fixtures/invalid/missing-policy-snapshot.json` and `malformed-policy-snapshot.json` [REQ-kernel-contract-schemas-015]
- [x] 1.6 Update existing valid work order fixture `schemas/kernel/work-order/fixtures/valid/work-order-v2.json` with canonical `sha256:...` dependency digests [REQ-kernel-contract-schemas-012]
- [x] 1.7 Create negative work order fixture `schemas/kernel/work-order/fixtures/invalid/malformed-dependencies-digest.json` [REQ-kernel-contract-schemas-012]

## Phase 2: Graph Compiler Core Hardening

- [x] 2.1 Update `scripts/lib/execution-graph/compiler.js` `computeGraphId()` to incorporate `policy_snapshot_id` into canonical preimage hashing [REQ-execution-graph-compiler-001, REQ-execution-graph-compiler-003]
- [x] 2.2 Add cycle detection (`hasCycle()`) in `scripts/lib/execution-graph/compiler.js` `compileExecutionGraph()` to fail closed on cyclic node dependencies [REQ-execution-graph-compiler-001]
- [x] 2.3 Add defensive cloning (`structuredClone()`) for input and emitted graph nodes and obligations in `scripts/lib/execution-graph/compiler.js` [REQ-execution-graph-compiler-001]
- [x] 2.4 Update obligation manifest reconciliation in `scripts/lib/execution-graph/compiler.js` to enforce authoritative `contract.obligations`, rejecting silent omission via empty arrays [REQ-execution-graph-compiler-002]
- [x] 2.5 Ensure compiled execution graph outputs include validated `policy_snapshot_id` matching bound PolicySnapshot [REQ-execution-graph-compiler-003]

## Phase 3: WorkOrder Compiler Topological Compilation & Atomic Validation

- [x] 3.1 Implement topological sorting and canonical upstream `WorkOrderId` SHA-256 digest resolution in `scripts/lib/execution-graph/work-order-compiler.js` `compileWorkOrdersV2()` [REQ-execution-graph-compiler-005, REQ-execution-identities-003]
- [x] 3.2 Add atomic canonical schema validation for entire `ExecutionGraph` against `execution-graph/v1.schema.json` before emitting WorkOrders [REQ-execution-graph-compiler-005]
- [x] 3.3 Add atomic canonical schema post-validation for each emitted WorkOrder against `work-order/v2.schema.json` [REQ-execution-graph-compiler-005, REQ-kernel-contract-schemas-012]
- [x] 3.4 Ensure fail-closed atomic rollback (zero emitted orders) upon any node validation failure or provenance mismatch [REQ-execution-graph-compiler-005]
- [x] 3.5 Preserve frozen legacy `compileWorkOrdersV1` compatibility without output downgrade [REQ-execution-graph-compiler-005, REQ-kernel-contract-schemas-012]

## Phase 4: Clarify & Replay Engine Hardening

- [x] 4.1 Update `scripts/lib/execution-graph/clarify.js` `applyClarifyEvent()` to mutate affected graph nodes with clarification context, recompute `graph_id`, and return `invalidatedNodeIds` [REQ-execution-graph-compiler-004]
- [x] 4.2 Update `scripts/lib/execution-graph/replay-engine.js` `replayExecutionGraph()` to accept `invalidatedNodeIds` and fail closed if stale fixtures are provided for invalidated nodes [REQ-execution-graph-compiler-006]
- [x] 4.3 Enforce closed completion status discrimination (`status: "completed"`, `ok: true`) in `replayExecutionGraph()`, failing closed on cancelled or malformed fixtures [REQ-execution-graph-compiler-006]
- [x] 4.4 Ensure detailed counterexample trace generation on replay invariant or obligation failure without live worker authority [REQ-execution-graph-compiler-006]

## Phase 5: Shadow Comparator Hardening

- [x] 5.1 Update `scripts/lib/execution-graph/shadow-comparator.js` to evaluate multi-dimensional execution properties: `invariants`, `obligations`, `dependencies`, `ownership`, `steps`, and `allowed_paths` [REQ-execution-graph-compiler-007]
- [x] 5.2 Implement structured `telemetryDiff` emission upon shadow divergence between compiled graph and baseline route [REQ-execution-graph-compiler-007]
- [x] 5.3 Enforce pure read-only observer behavior (zero mutation of active workflow state, journal, or baseline execution) in `shadow-comparator.js` [REQ-execution-graph-compiler-007]

## Phase 6: Unit Test Updates Across K4a Modules

- [x] 6.1 Update `scripts/lib/k4a-schema-fixtures.test.js` to test positive and negative fixtures for `execution-graph/v1` and `work-order/v2` [REQ-kernel-contract-schemas-012, REQ-kernel-contract-schemas-015]
- [x] 6.2 Update `scripts/lib/execution-graph/compiler.test.js` to verify `policy_snapshot_id` binding, cycle detection, defensive copy immutability, and obligation authority [REQ-execution-graph-compiler-001, REQ-execution-graph-compiler-002, REQ-execution-graph-compiler-003]
- [x] 6.3 Update `scripts/lib/execution-graph/work-order-compiler.test.js` to test topological `sha256:...` dependency resolution, atomic canonical schema validation, and zero-token safety [REQ-execution-graph-compiler-005, REQ-execution-identities-003]
- [x] 6.4 Update `scripts/lib/execution-graph/clarify.test.js` to verify node mutation, `graph_id` update, and `invalidatedNodeIds` output [REQ-execution-graph-compiler-004]
- [x] 6.5 Update `scripts/lib/execution-graph/replay-engine.test.js` to test invalidated node fixture rejection and closed completion discrimination [REQ-execution-graph-compiler-006]
- [x] 6.6 Update `scripts/lib/execution-graph/shadow-comparator.test.js` to test multi-dimensional comparison and zero-mutation observer guarantees [REQ-execution-graph-compiler-007]
- [x] 6.7 Update `scripts/lib/k4a-lifecycle-model.test.js` and `contract-checkers/k4a-checkers.test.js` for remediated invariant checks [REQ-execution-graph-compiler-001, REQ-execution-graph-compiler-002]

## Phase 7: Cross-Layer End-to-End Integration Smoke Test

- [x] 7.1 Create `scripts/lib/k3-k4a-integration.test.js` implementing end-to-end cryptographic pipeline: `SourceSnapshot -> ExecutionGraph -> WorkOrder[] -> validateWorkOrderBinding -> validateWorkResultBinding -> replayExecutionGraph` [REQ-execution-identities-003, REQ-execution-graph-compiler-005, REQ-execution-graph-compiler-006]
- [x] 7.2 Verify cryptographic binding validation passes for topologically compiled WorkOrder v2 objects under K3 `validateWorkOrderBinding` [REQ-execution-identities-003, REQ-execution-graph-compiler-005]
- [x] 7.3 Verify replay engine deterministically executes against bound WorkResult objects without worker execution [REQ-execution-graph-compiler-006, REQ-execution-identities-003]
