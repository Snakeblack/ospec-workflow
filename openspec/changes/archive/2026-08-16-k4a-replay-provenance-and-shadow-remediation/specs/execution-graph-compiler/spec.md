# Spec Delta: Execution Graph Compiler, Replay Engine & Shadow Semantics

## Domain: execution-graph-compiler

### Requirement: REQ-execution-graph-compiler-001 / Canonical Non-Empty Graph Node Schema & Invariant
The canonical schema `ospec://schemas/kernel/execution-graph/v1` and `ospec://schemas/kernel/graph-node/v1` MUST declare `"minLength": 1` for string identifiers and required descriptors: `node_id`, `kind`, `operation`, `objective`, `budget_ref`, `ownership.owner`, `obligation.id`, `deferred.reason`, `deferred.approved_by`.
Array items in `dependencies`, `allowed_paths`, `invariants`, `required_evidence`, and `implemented_by` MUST declare `"minLength": 1`.
`compileExecutionGraph()` MUST reject empty string values for `node_id`, `kind`, `operation`, `objective`, and `budget_ref` with code `missing-required-node-field`.

#### Scenario: Compiling graph with empty node_id or whitespace string
- GIVEN a change contract with a node declaring `node_id: ""`
- WHEN `compileExecutionGraph()` executes
- THEN it MUST reject the compilation with error code `missing-required-node-field`
- AND schema validation against `execution-graph/v1` MUST fail with a `minLength` error.

---

### Requirement: REQ-execution-graph-compiler-003 / Authoritative Obligation IDs Reconciliation
`contract.obligations` MUST be the sole authority for obligation IDs present in the Execution Graph.
When external `obligations` are supplied to `compileExecutionGraph()`, every supplied obligation item MUST match an obligation `id` present in `contract.obligations`.
If any external obligation declares an `id` that does not exist in `contract.obligations`, the compiler MUST fail closed with error code `unknown-obligation-id`.

#### Scenario: Attempting to inject external obligations not present in contract
- GIVEN a contract defining obligations `[{ id: "REQ-001", criticality: "must", ... }]`
- AND an external obligation input `[{ id: "REQ-001", ... }, { id: "INJECTED-999", criticality: "should", ... }]`
- WHEN `compileExecutionGraph()` executes
- THEN it MUST throw an error with code `unknown-obligation-id` and `obligation_id: "INJECTED-999"`
- AND no external obligations beyond the contract obligations may be incorporated into the Execution Graph.

---

### Requirement: REQ-execution-graph-compiler-006 / Replay Engine Strict Provenance & Fail-Closed WorkOrder Derivation
`replayExecutionGraph()` MUST require explicit cryptographic provenance on recorded fixtures in its canonical execution mode:
1. `recorded.graph_id` MUST be present, non-empty, and equal to `graph.graph_id`.
2. `recorded.work_order_id` MUST be present, non-empty, and equal to the derived `expectedWo.work_order_id`.
3. WorkOrder compilation for expected WorkOrders MUST fail closed: if `compileWorkOrdersV2(graph)` fails to compile or resolve WorkOrders for the graph, replay MUST fail closed and reject execution.
4. If `recorded.graph_id` or `recorded.work_order_id` is missing, malformed, or mismatched with expected values, `replayExecutionGraph()` MUST fail closed with error code `stale-fixture-rejected`.
5. Non-strict or legacy replay MAY be executed via `replayLegacyFixtureGraph()` or by passing `options.allowLegacyFixtures: true`.

#### Scenario: Unbound or pre-Clarify fixture supplied to clarified graph replay
- GIVEN a clarified ExecutionGraph with updated `graph_id` and mutated node `patch-node`
- AND a recorded fixture for `patch-node` lacking `graph_id` and `work_order_id` (or containing pre-Clarify digests)
- WHEN `replayExecutionGraph()` evaluates the clarified graph
- THEN it MUST throw an error with code `stale-fixture-rejected`
- AND the invalidated/clarified node cannot be completed using the unbound fixture.

---

### Requirement: REQ-execution-graph-compiler-007 / Shadow Decision Comparison Semantic Consistency
`compareShadowExecution()` MUST guarantee that `match: true` is returned if and only if all evaluated dimensions match AND zero dimensions are skipped (`divergences.length === 0 && skipped_dimensions.length === 0`).
When any dimensions are skipped by the baseline function (`skipped_dimensions.length > 0`), the comparator MUST return:
1. `match: false`
2. `discrepancy_classification: "partial-match"` (if divergences is 0)
3. A structured `telemetryDiff` object (non-null) detailing the skipped dimensions and match rates.

#### Scenario: Baseline function omitting dimensions such as ownership or invariants
- GIVEN a compiled ExecutionGraph with all 6 dimensions
- AND a baseline function returning only `steps` and `allowed_paths` (omitting `ownership`, `invariants`, `obligations`, `dependencies`)
- WHEN `compareShadowExecution()` executes
- THEN `match` MUST be `false`
- AND `discrepancy_classification` MUST be `"partial-match"`
- AND `telemetryDiff` MUST NOT be null and MUST include `skipped_dimensions: ["invariants", "obligations", "dependencies", "ownership"]`.
