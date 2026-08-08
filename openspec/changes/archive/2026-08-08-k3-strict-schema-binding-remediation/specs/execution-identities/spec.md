# Delta for execution-identities

## MODIFIED Requirements

### Requirement: Bound WorkOrder And Raw WorkResult Pipeline {#REQ-execution-identities-003}

A `WorkOrder` MUST be bound to a specific `SourceSnapshotId` and declare objective, allowed paths, invariants, budget, dependencies, ownership, and required evidence. `computeWorkOrderId` MUST digest all canonical fields including `dependencies`, `ownership`, and `required_evidence`. A `WorkResult` MUST be bound to both `WorkOrderId` and `SourceSnapshotId`, capturing unapproved worker outputs (patch/commit, execution commands, logs, exit codes, filesystem inventory). `validateWorkOrderBinding(sourceSnapshot, workOrder)` MUST validate that `sourceSnapshot` is a valid SourceSnapshot and `workOrder` is a schema-valid WorkOrder before recomputing `computeSourceSnapshotId(sourceSnapshot)` and `computeWorkOrderId(workOrder)` and comparing them to the declared `source_snapshot_id` and `work_order_id` (failing closed if schema-invalid or on mismatch). `validateWorkResultBinding(workOrder, workResult)` MUST validate that `workOrder` is a schema-valid WorkOrder and `workResult` is a schema-valid WorkResult before recomputing `computeWorkOrderId(workOrder)` and `computeWorkResultId(workResult)` and comparing them to the declared `work_order_id` and `work_result_id` (failing closed if schema-invalid or on mismatch). String equality of declared IDs alone MUST NOT pass when recomputed digests differ or when payloads fail schema validation. The system MUST NOT accept a raw `WorkResult` as a `Candidate` or for attestation/delivery without candidate integration and freeze.
(Previously: validateWorkOrderBinding and validateWorkResultBinding recomputed digests but did not validate schema compliance prior to digest comparison.)

#### Scenario: WorkResult requires Candidate freeze before evaluation

- GIVEN an unapproved `WorkResult` emitted by a worker
- WHEN passed directly to candidate verification or attestation
- THEN the kernel MUST fail closed and reject the `WorkResult`

#### Scenario: WorkOrder binding validation

- GIVEN a `WorkOrder` referencing `SourceSnapshotId` S1 and a `WorkResult` claiming execution under `SourceSnapshotId` S2
- WHEN the kernel validates the `WorkResult`
- THEN validation MUST fail closed due to snapshot mismatch

#### Scenario: WorkOrderId canonical payload includes dependencies ownership and required evidence

- GIVEN two WorkOrder definitions with identical core fields but different dependencies, ownership, or required evidence
- WHEN `computeWorkOrderId` generates their digests
- THEN the system MUST produce distinct `WorkOrderId` digests for each WorkOrder

#### Scenario: validateWorkResultBinding fails on work order mismatch

- GIVEN a `WorkOrder` with ID W1 and a `WorkResult` referencing work_order_id W2
- WHEN `validateWorkResultBinding` is executed
- THEN validation MUST fail closed and return a binding mismatch error

#### Scenario: Spoofed declared IDs fail cryptographic binding recompute

- GIVEN a `sourceSnapshot`/`workOrder` pair whose declared IDs are string-equal to expected values but whose canonical payloads recompute to different digests
- WHEN `validateWorkOrderBinding` runs
- THEN validation MUST fail closed
- AND the same recomputation rule MUST apply for `validateWorkResultBinding` on spoofed `work_order_id`/`work_result_id`

#### Scenario: Schema-invalid WorkOrder or WorkResult rejected during binding validation

- GIVEN a `workOrder` or `workResult` missing required schema fields but carrying self-consistent IDs
- WHEN `validateWorkOrderBinding` or `validateWorkResultBinding` is executed
- THEN validation MUST fail closed with a schema or payload validation error
- AND MUST NOT return `{ ok: true }`

### Requirement: Strict Digest Compute Functions Validation {#REQ-execution-identities-007}

The four identity computation functions (`computeSourceSnapshotId`, `computeWorkOrderId`, `computeWorkResultId`, `computeCandidateId`) MUST validate all input parameters, require non-empty mandatory fields, and validate that any referenced input digest matches the `sha256:<64 hex>` format. `computeSourceSnapshotId` MUST require a non-empty `repository_id` string and restrict `projection` strictly to `"workspace"`, `"staged"`, or `"commit"`. `computeWorkOrderId` MUST require `operation`, `objective`, `dependencies` (array), `ownership` (object), `allowed_paths` (array), `invariants` (array), `required_evidence` (array), and `budget` (object), failing closed when any field is missing or ill-typed without substituting silent defaults (`""`, `[]`, `{}`). `computeWorkResultId` MUST require `commands` (array), `logs` (array), and `filesystem_inventory` (array) alongside `patch` and `exit_code`, failing closed when any field is missing without defaulting to `[]`. Passing missing parameters, non-object inputs, empty required fields, ill-formed digest strings, or invalid array/field types MUST cause computation to throw a `TypeError` or `Error` immediately fail-closed.
(Previously: computeSourceSnapshotId allowed missing repository_id and unchecked projection string; computeWorkOrderId and computeWorkResultId defaulted missing arrays/objects to [] and {}.)

#### Scenario: computeWorkOrderId rejects ill-formed snapshot digest format

- GIVEN a WorkOrder input whose `source_snapshot_id` does not match `sha256:<64 hex>`
- WHEN `computeWorkOrderId` is called
- THEN computation MUST throw an error fail-closed

#### Scenario: computeCandidateId rejects missing required properties

- GIVEN a Candidate input missing required fields `projection` or `base_tree`
- WHEN `computeCandidateId` is called
- THEN computation MUST throw a `TypeError` or `Error` fail-closed

#### Scenario: Invalid array or type throws without silent empty coercion

- GIVEN a compute* input where a required array/object field has an incompatible type or is missing
- WHEN the corresponding `compute*` function is called
- THEN it MUST throw fail-closed
- AND MUST NOT coerce the value to `[]` or `{}` or proceed with defaults

#### Scenario: computeWorkResultId rejects missing required fields without defaults

- GIVEN a WorkResult missing a required field (`patch`, `exit_code`, `commands`, `logs`, or `filesystem_inventory`)
- WHEN `computeWorkResultId` is called
- THEN computation MUST throw fail-closed
- AND MUST NOT invent default values for the missing required fields

#### Scenario: computeSourceSnapshotId rejects missing repository_id or invalid projection

- GIVEN a SourceSnapshot input missing `repository_id` or carrying an invalid `projection` value like `"banana"`
- WHEN `computeSourceSnapshotId` is called
- THEN computation MUST throw fail-closed

### Requirement: Positive Identity Kind Discrimination {#REQ-execution-identities-008}

`validateIdentityKind` MUST discriminate identities via a positive closed `EXPECTED_KINDS` table that maps each validated surface to its required `kind` value(s). Missing `kind`, empty `kind`, or a `kind` incompatible with the expected surface MUST fail closed for versioned identity kinds (`v2`, `attestation`, `authorization`). For `SourceSnapshot` v1 and `WorkResult` v1 payloads whose baseline JSON Schemas allow optional `kind` or omit `kind`, `validateIdentityKind` MUST validate payload structure against the respective v1 schema while allowing `kind: "source-snapshot/v1"` and `kind: "work-result/v1"` without `additionalProperties: false` conflict. Candidate Evaluation Attestation validation MUST NOT accept a SourceSnapshot (or other non-attestation identity) disguised with an `attestation_id` field when `kind` is missing or mismatched.
(Previously: validateIdentityKind rejected all SourceSnapshot v1 and WorkResult v1 objects lacking kind, causing conflict with v1 schemas that forbid additionalProperties.)

#### Scenario: Missing kind fails closed for expected surface

- GIVEN a payload for an attestation surface with no `kind` property
- WHEN `validateIdentityKind` runs
- THEN validation MUST fail closed
- AND MUST NOT succeed via blacklist-only or optional-kind logic

#### Scenario: Attestation rejects SourceSnapshot disguise

- GIVEN a SourceSnapshot-shaped payload that also carries `attestation_id` but lacks attestation `kind`
- WHEN attestation kind validation runs
- THEN validation MUST fail closed
- AND MUST NOT treat the payload as a valid attestation

#### Scenario: Compatible kind passes positive table

- GIVEN a payload whose `kind` exactly matches the `EXPECTED_KINDS` entry for its surface
- WHEN `validateIdentityKind` runs
- THEN validation MUST succeed for that kind check

#### Scenario: Valid SourceSnapshot v1 or WorkResult v1 passes identity kind check

- GIVEN a schema-valid SourceSnapshot v1 or WorkResult v1 object
- WHEN `validateIdentityKind` runs for `SourceSnapshot` or `WorkResult`
- THEN validation MUST succeed whether `kind` is present or omitted per v1 contract
