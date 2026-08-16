# Tasks: K4a Execution Graph Integrity and Cryptographic Bindings Remediation

## Spec/Design Reconciliation

| Requirement / Scenario | Priority | Design Allocation | Status | Notes |
|------------------------|----------|-------------------|--------|-------|
| REQ-execution-graph-compiler-008: Shared DAG Cycle Detection | MUST | `scripts/lib/execution-graph/dag.js`, canonical `hasCycle` & `topologicalSort` | covered-by-design | Unifies DFS coloring cycle detector across all 4 subsystems |
| REQ-kernel-contract-schemas-015: Execution Graph Schema Clarification Context | MUST | `schemas/kernel/execution-graph/v1.schema.json`, `$defs/node.clarification_context` | covered-by-design | Optional context with `event_id`, `question_id`, `answer` and `additionalProperties: false` |
| REQ-kernel-contract-schemas-018: PolicySnapshot Canonical Binding Validation | MUST | `scripts/lib/execution-graph/policy-snapshot.js`, `validatePolicySnapshotBinding` | covered-by-design | Validates schema, SHA-256 pattern, and exact recomputed digest equality |
| REQ-execution-identities-011: Execution Graph Cryptographic Binding Gate | MUST | `scripts/lib/execution-identities/index.js`, `validateExecutionGraphBinding` | covered-by-design | Pure validator checking schema, snapshot IDs, context bindings, and recomputed GraphId |
| REQ-execution-graph-compiler-001: Semantic Graph Compilation & Obligations | MUST | `scripts/lib/execution-graph/compiler.js`, `compileExecutionGraph`, `computeGraphId` | covered-by-design | Includes obligations in preimage, locks authoritative `must` criticality, validates `sourceSnapshotId` fail-closed |
| REQ-execution-graph-compiler-004: Typed ClarifyEvent Invalidation & Graph Mutation | MUST | `scripts/lib/execution-graph/clarify.js`, `applyClarifyEvent` | covered-by-design | Outputs schema-valid graphs with `clarification_context` and validates bindings |
| REQ-execution-graph-compiler-005: Work Order v2 Compilation & Binding Protection | MUST | `scripts/lib/execution-graph/work-order-compiler.js`, `compileWorkOrdersV2` | covered-by-design | Enforces `validateExecutionGraphBinding` before emission, resolves WorkOrderId digests |
| REQ-execution-graph-compiler-006: Replay Engine Node Evidence & Binding Gate | MUST | `scripts/lib/execution-graph/replay-engine.js`, `replayExecutionGraph` | covered-by-design | Validates graph binding and verifies `node.required_evidence ⊆ recorded.evidence` per node |
| REQ-execution-graph-compiler-007: Hardened Multi-Dimensional Shadow Comparator | MUST | `scripts/lib/execution-graph/shadow-comparator.js`, `compareShadowExecution` | covered-by-design | Enforces `validateExecutionGraphBinding` and discriminates complete vs partial matches |

### Reconciliation Verdict
- MUST coverage: complete (9/9 requirements and 37/37 scenarios mapped)
- SHOULD/MAY gaps: none
- Ambiguities to track: none

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 350 - 450 lines |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR (size-exception) |
| Delivery strategy | exception-ok |
| Chain strategy | size-exception |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Complete K4a Execution Graph Integrity & Bindings Remediation | PR 1 | Base branch `main` (or feature branch); cohesive kernel trust boundary remediation across schema, bindings, compiler, clarify, replay, shadow comparator, and adversarial test suites |

### Checklist Status Legend

- `[ ]` Not implemented yet
- `[~]` Implemented but not yet verified locally
- `[x]` Implemented and verified locally

---

## Phase 1: Shared DAG Utilities & Cycle Detection

- [x] 1.1 Create `scripts/lib/execution-graph/dag.js` exporting `hasCycle(nodes)` (DFS coloring algorithm) and `topologicalSort(nodes)` (Kahn's in-degree algorithm with cycle guard) [REQ-execution-graph-compiler-008]
- [x] 1.2 Write unit tests in `scripts/lib/execution-graph/dag.test.js` validating cycle detection on direct cycles (N1 -> N2 -> N1), indirect cycles (N1 -> N2 -> N3 -> N1), acyclic DAGs, empty inputs, and disconnected components [REQ-execution-graph-compiler-008]
- [x] 1.3 Export `hasCycle` and `topologicalSort` from `scripts/lib/execution-graph/index.js` [REQ-execution-graph-compiler-008]

## Phase 2: Schema Extension for Clarification Context

- [x] 2.1 Update `schemas/kernel/execution-graph/v1.schema.json` to add optional `clarification_context` object to `$defs/node` with required fields `event_id`, `question_id`, `answer` and `additionalProperties: false` [REQ-kernel-contract-schemas-015]
- [x] 2.2 Add valid and invalid fixture tests in `scripts/lib/k4a-schema-fixtures.test.js` verifying schema acceptance of nodes with `clarification_context` and rejection of missing fields or extra properties [REQ-kernel-contract-schemas-015]

## Phase 3: Policy Snapshot Cryptographic Binding Primitive

- [x] 3.1 Implement and export `validatePolicySnapshotBinding(snapshot)` in `scripts/lib/execution-graph/policy-snapshot.js` verifying schema validity, SHA-256 pattern, and `snapshot.snapshot_id === computePolicySnapshotDigest(snapshot)` [REQ-kernel-contract-schemas-018]
- [x] 3.2 Add unit tests in `scripts/lib/execution-graph/policy-snapshot.test.js` verifying validation of intact snapshots and rejection of forged `snapshot_id`, malformed digest strings, non-objects, and missing schema fields [REQ-kernel-contract-schemas-018]

## Phase 4: Execution Graph Cryptographic Binding Gate

- [x] 4.1 Implement `validateExecutionGraphBinding(graph, options)` in `scripts/lib/execution-identities/index.js` verifying schema conformance, SHA-256 snapshot formats, contextual PolicySnapshot binding, contextual SourceSnapshot binding, and deterministic `GraphId` equality [REQ-execution-identities-011]
- [x] 4.2 Export `validateExecutionGraphBinding` from `scripts/lib/execution-identities/index.js` and re-export in `scripts/lib/execution-graph/index.js` [REQ-execution-identities-011]
- [x] 4.3 Add unit tests in `scripts/lib/execution-identities/index.test.js` covering valid graphs, tampered nodes/obligations/digests (`GRAPH_ID_MISMATCH`), invalid schemas (`INVALID_SCHEMA`), malformed snapshot IDs (`ILL_FORMED_SNAPSHOT_ID`), contextual mismatches, and purity [REQ-execution-identities-011]

## Phase 5: Compiler Core Hardening & Contract Obligation Authority

- [x] 5.1 Update `computeGraphId()` in `scripts/lib/execution-graph/compiler.js` to incorporate `obligations` into the canonical SHA-256 preimage payload [REQ-execution-graph-compiler-001]
- [x] 5.2 Import `hasCycle` from `./dag.js` in `scripts/lib/execution-graph/compiler.js` and remove private cycle detector [REQ-execution-graph-compiler-008]
- [x] 5.3 Enforce strict `sourceSnapshotId` validation in `compileExecutionGraph()`: fail closed with `invalid-source-snapshot-id` on empty string `""` or malformed digest without silent fallback [REQ-execution-graph-compiler-001]
- [x] 5.4 Validate `policySnapshot` via `validatePolicySnapshotBinding()` during `compileExecutionGraph()` and throw `policy-snapshot-mismatch` on failure [REQ-execution-graph-compiler-001]
- [x] 5.5 Enforce authoritative `contract.obligations` protection: preserve contract obligation IDs and prevent external callers from downgrading `must` criticality to `should` or `may` [REQ-execution-graph-compiler-001]
- [x] 5.6 Invoke `validateExecutionGraphBinding(graph)` before returning compiled graph from `compileExecutionGraph()` to guarantee fail-closed output validity [REQ-execution-graph-compiler-001]
- [x] 5.7 Update unit tests in `scripts/lib/execution-graph/compiler.test.js` and fixtures in `scripts/lib/test-support/execution-graph-fixtures.js` for new preimage and obligation protection [REQ-execution-graph-compiler-001]

## Phase 6: Clarify Pipeline Hardening & Schema Alignment

- [x] 6.1 Update `scripts/lib/execution-graph/clarify.js` to import `hasCycle` from `./dag.js` and use updated `computeGraphId` with `obligations` [REQ-execution-graph-compiler-004, REQ-execution-graph-compiler-008]
- [x] 6.2 Pre-validate input graph and post-validate mutated graph with `validateExecutionGraphBinding` inside `applyClarifyEvent()` [REQ-execution-graph-compiler-004]
- [x] 6.3 Update unit tests in `scripts/lib/execution-graph/clarify.test.js` validating schema conformance of clarified graphs, descendant closure invalidation, and updated `GraphId` derivation [REQ-execution-graph-compiler-004]

## Phase 7: WorkOrder Compiler Tampering Protection & Binding Enforcement

- [x] 7.1 Update `scripts/lib/execution-graph/work-order-compiler.js` to import `hasCycle` and `topologicalSort` from `./dag.js` [REQ-execution-graph-compiler-008]
- [x] 7.2 Enforce `validateExecutionGraphBinding(graph, { sourceSnapshot, sourceSnapshotId })` in `compileWorkOrdersV2()` and fail closed with `graph-id-mismatch` on tampered graph input [REQ-execution-graph-compiler-005]
- [x] 7.3 Update unit tests in `scripts/lib/execution-graph/work-order-compiler.test.js` to verify WorkOrder compilation from clarified graphs and rejection of tampered graphs [REQ-execution-graph-compiler-005]

## Phase 8: Replay Engine Node Evidence & Binding Enforcement

- [x] 8.1 Update `scripts/lib/execution-graph/replay-engine.js` to import `hasCycle` and `topologicalSort` from `./dag.js` [REQ-execution-graph-compiler-008]
- [x] 8.2 Invoke `validateExecutionGraphBinding(graph)` at startup of `replayExecutionGraph()` and throw `graph-id-mismatch` on tampered graph [REQ-execution-graph-compiler-006]
- [x] 8.3 Implement node-level required evidence verification in `replayExecutionGraph()`: verify `node.required_evidence ⊆ Object.keys(recorded.evidence)` before marking each node completed [REQ-execution-graph-compiler-006]
- [x] 8.4 Generate actionable counterexample traces when node required evidence is missing or prerequisite dependency fails [REQ-execution-graph-compiler-006]
- [x] 8.5 Update unit tests in `scripts/lib/execution-graph/replay-engine.test.js` testing node evidence verification, missing evidence counterexamples, and binding enforcement [REQ-execution-graph-compiler-006]

## Phase 9: Shadow Comparator Multi-Dimensional Reporting & Binding Enforcement

- [x] 9.1 Update `scripts/lib/execution-graph/shadow-comparator.js` to validate `compiledGraph` via `validateExecutionGraphBinding(compiledGraph)` fail-closed before comparison [REQ-execution-graph-compiler-007]
- [x] 9.2 Ensure `compareShadowExecution()` discriminates complete match (`match: true`) from partial match (`match: false` with detailed `telemetryDiff` across steps, paths, invariants, obligations, dependencies, ownership) [REQ-execution-graph-compiler-007]
- [x] 9.3 Update unit tests in `scripts/lib/execution-graph/shadow-comparator.test.js` testing tampered graph rejection and multi-dimensional divergence discrimination [REQ-execution-graph-compiler-007]

## Phase 10: Cross-Layer Adversarial Test Suite & Integration Verification

- [x] 10.1 Add adversarial tampering tests verifying that modifying node properties, obligations, or snapshot digests after compilation causes immediate fail-closed rejection in compiler, clarify, work order compiler, replay engine, and shadow comparator [REQ-execution-identities-011, REQ-execution-graph-compiler-001, REQ-execution-graph-compiler-005, REQ-execution-graph-compiler-006, REQ-execution-graph-compiler-007]
- [x] 10.2 Add MUST obligation downgrade rejection tests verifying that caller overrides cannot downgrade `must` obligations to `should` or `may` [REQ-execution-graph-compiler-001]
- [x] 10.3 Add Clarify end-to-end composition tests verifying that `applyClarifyEvent` produces graphs that compile cleanly to `WorkOrder` v2 and replay valid fixtures without schema errors [REQ-execution-graph-compiler-004, REQ-execution-graph-compiler-005]
- [x] 10.4 Add PolicySnapshot forge rejection tests validating that modified rule arrays with stale `snapshot_id` are rejected [REQ-kernel-contract-schemas-018]
- [x] 10.5 Add explicit empty `sourceSnapshotId: ""` rejection tests in `compiler.test.js` and `work-order-compiler.test.js` [REQ-execution-graph-compiler-001, REQ-execution-graph-compiler-005]
- [x] 10.6 Add node evidence missing in replay tests verifying blocked downstream dependencies and counterexample generation [REQ-execution-graph-compiler-006]
- [x] 10.7 Expand `scripts/lib/k3-k4a-integration.test.js` to validate complete cryptographic lifecycle: Contract -> PolicySnapshot -> SourceSnapshot -> Graph -> WorkOrders v2 -> Replay -> Clarify -> Re-compilation [REQ-execution-graph-compiler-001, REQ-execution-graph-compiler-004, REQ-execution-graph-compiler-005, REQ-execution-graph-compiler-006]
- [x] 10.8 Run full test suite (`scripts/lib/execution-graph/*.test.js`, `scripts/lib/execution-identities/index.test.js`, `scripts/lib/k3-k4a-integration.test.js`, `scripts/lib/k4a-schema-fixtures.test.js`) and ensure 100% pass rate [REQ-execution-graph-compiler-001]
