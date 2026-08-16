# Delta for execution-identities

## ADDED Requirements

### Requirement: Execution Graph Cryptographic Binding Gate {#REQ-execution-identities-011}

The kernel MUST provide a pure cryptographic validation gate `validateExecutionGraphBinding(graph, options)` that verifies the integrity, schema conformance, and provenance couplings of an `ExecutionGraph` record before compilation, clarify processing, replay execution, or shadow comparison.

`validateExecutionGraphBinding` MUST perform the following validations:
1. **Input Payload Validation**: Verify that `graph` is a non-null object. If null or not an object, return `{ ok: false, reason_code: "INVALID_PAYLOAD", error: "..." }`.
2. **Schema Conformance**: Validate `graph` against `ospec://schemas/kernel/execution-graph/v1`. If invalid, return `{ ok: false, reason_code: "INVALID_SCHEMA", error: "..." }`.
3. **Snapshot ID Format**: Verify that `graph.policy_snapshot_id` and `graph.source_snapshot_id` match `^sha256:[a-f0-9]{64}$`. If malformed, return `{ ok: false, reason_code: "ILL_FORMED_SNAPSHOT_ID", error: "..." }`.
4. **Contextual PolicySnapshot Binding**: If `options.policySnapshot` is provided, validate it via `validatePolicySnapshotBinding(options.policySnapshot)`. If invalid or if `options.policySnapshot.snapshot_id !== graph.policy_snapshot_id`, return `{ ok: false, reason_code: "POLICY_SNAPSHOT_MISMATCH", error: "..." }`.
5. **Contextual SourceSnapshot Binding**: If `options.sourceSnapshot` is provided, verify that `computeSourceSnapshotId(options.sourceSnapshot) === graph.source_snapshot_id`. If mismatched, return `{ ok: false, reason_code: "SOURCE_SNAPSHOT_MISMATCH", error: "..." }`.
6. **GraphId Cryptographic Recomputation**: Recompute the deterministic graph identifier via `computeGraphId(graph.contract_digest, graph.policy_snapshot_id, graph.policy_bundle_digest, graph.source_snapshot_id, graph.nodes, graph.obligations)`. If declared `graph.graph_id !== recomputedGraphId`, return `{ ok: false, reason_code: "GRAPH_ID_MISMATCH", error: "..." }`.

If all validation checks pass, `validateExecutionGraphBinding` MUST return `{ ok: true }`. The function MUST operate as a pure validator without mutating input graph objects.

#### Scenario: Valid intact ExecutionGraph passes cryptographic binding gate

- GIVEN a schema-valid ExecutionGraph where declared `graph_id` matches recomputed `computeGraphId()`
- WHEN `validateExecutionGraphBinding(graph)` is invoked
- THEN it MUST return `{ ok: true }`

#### Scenario: Tampered node, obligation, or snapshot ID triggers GRAPH_ID_MISMATCH fail-closed

- GIVEN an ExecutionGraph where any node, obligation, policy digest, or snapshot identifier has been altered after GraphId calculation
- WHEN `validateExecutionGraphBinding(graph)` is invoked
- THEN it MUST return `{ ok: false, reason_code: "GRAPH_ID_MISMATCH" }`
- AND the error message MUST identify the cryptographic digest divergence

#### Scenario: Schema-invalid ExecutionGraph fails validation with INVALID_SCHEMA

- GIVEN an ExecutionGraph object missing required properties (`nodes`, `obligations`, `contract_digest`) or containing microscopic node operations
- WHEN `validateExecutionGraphBinding(graph)` is invoked
- THEN it MUST return `{ ok: false, reason_code: "INVALID_SCHEMA" }`

#### Scenario: Contextual PolicySnapshot mismatch fails validation

- GIVEN an ExecutionGraph with policy_snapshot_id PS1
- AND an options context containing a PolicySnapshot with snapshot_id PS2
- WHEN `validateExecutionGraphBinding(graph, { policySnapshot })` is invoked
- THEN it MUST return `{ ok: false, reason_code: "POLICY_SNAPSHOT_MISMATCH" }`

#### Scenario: Contextual SourceSnapshot mismatch fails validation

- GIVEN an ExecutionGraph with source_snapshot_id S1
- AND an options context containing a SourceSnapshot whose digest computes to S2
- WHEN `validateExecutionGraphBinding(graph, { sourceSnapshot })` is invoked
- THEN it MUST return `{ ok: false, reason_code: "SOURCE_SNAPSHOT_MISMATCH" }`

#### Scenario: Validator guarantees purity and zero object mutations

- GIVEN an ExecutionGraph object passed to `validateExecutionGraphBinding`
- WHEN validation executes
- THEN all properties, node arrays, and obligation arrays of the input object MUST remain unmodified
