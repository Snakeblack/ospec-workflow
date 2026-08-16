# Delta for kernel-contract-schemas

## ADDED Requirements

### Requirement: PolicySnapshot v1 Canonical Binding Validation {#REQ-kernel-contract-schemas-018}

The contract suite MUST provide a canonical validation function `validatePolicySnapshotBinding(snapshot)` that validates `PolicySnapshot` records against `policy-snapshot/v1.schema.json` and cryptographically verifies that `snapshot.snapshot_id === computePolicySnapshotDigest(snapshot)`.

The validation function MUST return `{ ok: true }` when:
1. `snapshot` is a non-null object and successfully validates against `ospec://schemas/kernel/policy-snapshot/v1`.
2. `snapshot.snapshot_id` is a valid SHA-256 digest string matching `^sha256:[a-f0-9]{64}$`.
3. The recomputed digest `computePolicySnapshotDigest(snapshot)` exactly equals declared `snapshot.snapshot_id` byte-for-byte.

If `snapshot` is null, non-object, fails schema validation, has a malformed digest string, or fails cryptographic digest equality, `validatePolicySnapshotBinding` MUST return `{ ok: false, reason_code: "...", error: "..." }` fail-closed (using reason codes `INVALID_PAYLOAD`, `INVALID_SCHEMA`, `ILL_FORMED_SNAPSHOT_ID`, or `POLICY_SNAPSHOT_MISMATCH`). The validator MUST operate as a pure function and MUST NOT mutate the input object.

#### Scenario: Schema-valid PolicySnapshot with matching cryptographic digest passes validation

- GIVEN a valid PolicySnapshot object created with canonical versioning and effective rules
- WHEN `validatePolicySnapshotBinding(snapshot)` is executed
- THEN validation MUST return `{ ok: true }`

#### Scenario: PolicySnapshot with spoofed snapshot_id fails validation with digest mismatch

- GIVEN a PolicySnapshot object whose declared `snapshot_id` does not match the recomputed `computePolicySnapshotDigest(snapshot)`
- WHEN `validatePolicySnapshotBinding(snapshot)` is executed
- THEN validation MUST return `{ ok: false, reason_code: "POLICY_SNAPSHOT_MISMATCH" }`

#### Scenario: PolicySnapshot failing JSON schema validation is rejected fail-closed

- GIVEN a PolicySnapshot object missing required `compiler_version`, `runtime_version`, or `effective_rules`
- WHEN `validatePolicySnapshotBinding(snapshot)` is executed
- THEN validation MUST return `{ ok: false, reason_code: "INVALID_SCHEMA" }`

#### Scenario: Non-object or malformed PolicySnapshot input fails validation

- GIVEN a `null`, non-object, or empty input passed to `validatePolicySnapshotBinding`
- WHEN `validatePolicySnapshotBinding(snapshot)` is executed
- THEN validation MUST return `{ ok: false, reason_code: "INVALID_PAYLOAD" }`

## MODIFIED Requirements

### Requirement: Execution Graph And Obligation Manifest Schema Family {#REQ-kernel-contract-schemas-015}

The contract suite MUST publish `execution-graph/v1.schema.json` (`$id: "ospec://schemas/kernel/execution-graph/v1"`) with explicit `schema_version: 1`. The schema MUST require `schema_version`, `graph_id`, `contract_digest`, `policy_bundle_digest`, `policy_snapshot_id`, `source_snapshot_id`, `nodes` (array of semantic graph node objects), and `obligations` (array of obligation items). Both `source_snapshot_id` and `policy_snapshot_id` properties MUST match `^sha256:[a-f0-9]{64}$`.

In `$defs/node`, the schema MUST define an optional `clarification_context` object property with required fields `event_id` (string), `question_id` (string), and `answer` (string or object), with `additionalProperties: false`.

Each obligation item MUST require `id`, `criticality` (`must | should | may`), `implemented_by` (array of node IDs), and `required_evidence` (array of evidence identifiers), and MAY include an optional `deferred` object (`reason`, `approved_by`). The schema MUST enforce `additionalProperties: false`. The family MUST ship valid and invalid fixtures demonstrating acceptance of complete graphs with bound source snapshot, policy snapshot provenance, and optional clarification context on nodes, and rejection of missing required fields, malformed source snapshot id, malformed policy snapshot id, or microscopic nodes.
(Previously: execution-graph/v1.schema.json did not define clarification_context on node definitions, causing valid clarify-mutated graphs to fail schema validation.)

#### Scenario: Valid execution graph with embedded obligations and source snapshot provenance passes validation

- GIVEN a valid execution graph payload containing semantic nodes, source snapshot provenance, policy snapshot provenance, and an obligation manifest
- WHEN validated against `execution-graph/v1.schema.json`
- THEN validation MUST succeed

#### Scenario: Execution graph node with clarification_context validates successfully

- GIVEN an execution graph containing a node mutated with `clarification_context` containing `event_id`, `question_id`, and `answer`
- WHEN validated against `execution-graph/v1.schema.json`
- THEN schema validation MUST succeed

#### Scenario: Node clarification_context with missing required fields or additional properties fails validation

- GIVEN an execution graph node with `clarification_context` missing `question_id` or containing unknown additional properties
- WHEN validated against `execution-graph/v1.schema.json`
- THEN validation MUST fail closed identifying the invalid property in `clarification_context`

#### Scenario: Execution graph missing required fields, policy snapshot, source snapshot provenance, or embedded obligations fails validation

- GIVEN an execution graph payload missing `policy_snapshot_id`, `source_snapshot_id`, `policy_bundle_digest`, or `obligations`
- WHEN validated against `execution-graph/v1.schema.json`
- THEN validation MUST fail closed identifying the missing property

#### Scenario: Execution graph with malformed source snapshot id or policy snapshot id fails validation fail-closed

- GIVEN an execution graph payload containing a `source_snapshot_id` or `policy_snapshot_id` with uppercase characters, wrong length, or invalid prefix
- WHEN validated against `execution-graph/v1.schema.json`
- THEN validation MUST fail closed identifying the malformed property
