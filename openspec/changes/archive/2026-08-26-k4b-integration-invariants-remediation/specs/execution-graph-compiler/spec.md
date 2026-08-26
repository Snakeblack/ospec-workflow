# Delta for execution-graph-compiler

## ADDED Requirements

### Requirement: Work Order V2 Emits Deterministic Capsule Inputs {#REQ-execution-graph-compiler-009}

`compileWorkOrdersV2()` MUST emit `capsule_inputs` on every WorkOrder v2 as a lexicographically sorted array of unique concrete relative file paths. `capsule_inputs` MUST be a pure function of the ExecutionGraph node and the graph's bound `source_snapshot_id` (plus an optional compile-context path inventory that is itself bound to that same `source_snapshot_id`). Recompiling an identical graph MUST yield byte-identical `capsule_inputs` per node.

Each path MUST be a concrete relative file path: non-empty, MUST NOT contain glob metacharacters (`*`, `?`, `[`), MUST NOT contain `..`, and MUST NOT be absolute. `capsule_inputs` MUST be present on the canonical WorkOrder payload before `computeWorkOrderId()` so it participates in `WorkOrderId`.

If any node would emit a missing, non-array, or empty `capsule_inputs`, or any path that violates the concrete-path rules, compilation MUST fail closed atomically with error code `empty-capsule-inputs` (or `invalid-capsule-inputs` for malformed paths) and MUST emit zero WorkOrders. The compiler MUST NOT copy glob `allowed_paths` entries into `capsule_inputs` unchanged.

#### Scenario: Identical graphs emit identical capsule_inputs

- GIVEN a valid ExecutionGraph G1 bound to `source_snapshot_id` S1
- WHEN `compileWorkOrdersV2` runs twice
- THEN each corresponding WorkOrder pair MUST have byte-identical `capsule_inputs`
- AND each list MUST be lexicographically sorted unique concrete relative paths

#### Scenario: Emitted WorkOrder validates with required capsule_inputs

- GIVEN a valid ExecutionGraph that compiles successfully
- WHEN each emitted WorkOrder is validated against `work-order/v2.schema.json`
- THEN validation MUST succeed
- AND `capsule_inputs` MUST be a non-empty array of concrete relative paths

#### Scenario: Empty or glob capsule_inputs fail compilation atomically

- GIVEN a graph node whose derived `capsule_inputs` would be empty, omitted, or would retain glob metacharacters
- WHEN `compileWorkOrdersV2` executes
- THEN compilation MUST fail closed with `empty-capsule-inputs` or `invalid-capsule-inputs`
- AND zero WorkOrders MUST be emitted

#### Scenario: WorkOrderId includes capsule_inputs

- GIVEN two otherwise identical compilations that differ only in one node's `capsule_inputs`
- WHEN `computeWorkOrderId` is computed for those WorkOrders
- THEN the two `WorkOrderId` values MUST differ
