# execution-identities Delta Specification

## Requirements

### Requirement: Bound WorkOrder And Raw WorkResult Pipeline {#REQ-execution-identities-003}

A `WorkOrder` MUST be bound to a specific `SourceSnapshotId` and declare objective, allowed paths, invariants, budget, dependencies, ownership, and required evidence. `computeWorkOrderId` MUST digest all canonical fields including `dependencies`, `ownership`, and `required_evidence`. A `WorkResult` MUST be bound to both `WorkOrderId` and `SourceSnapshotId`, capturing unapproved worker outputs (patch/commit, execution commands, logs, exit codes, filesystem inventory). `validateWorkOrderBinding(sourceSnapshot, workOrder)` MUST enforce cumulative validation: `sourceSnapshot` MUST pass JSON Schema validation against `source-snapshot/v1`, `workOrder` MUST pass JSON Schema validation against `work-order/v2`, `computeSourceSnapshotId(sourceSnapshot)` MUST equal declared `source_snapshot_id`, and `computeWorkOrderId(workOrder)` MUST equal declared `work_order_id` (fail closed on any schema invalidity or digest mismatch). `validateWorkResultBinding(workOrder, workResult)` MUST enforce cumulative validation: `workOrder` MUST pass JSON Schema validation against `work-order/v2`, `workResult` MUST pass JSON Schema validation against `work-result/v1`, `computeWorkOrderId(workOrder)` MUST equal declared `work_order_id`, and `computeWorkResultId(workResult)` MUST equal declared `work_result_id` (fail closed on any schema invalidity or digest mismatch). Payloads that are schema-invalid MUST fail binding validation even if declared digests are cryptographically self-consistent with internal payload fields.

#### Scenario: WorkOrder binding fails when payload is schema-invalid despite matching digests

- GIVEN a `sourceSnapshot` and `workOrder` whose declared IDs match their recomputed digests
- WHEN `workOrder` is missing a required schema property such as `status` or carries invalid `ownership`/`budget` structures
- THEN `validateWorkOrderBinding` MUST fail closed
- AND MUST NOT return `{ ok: true }`

#### Scenario: WorkResult binding fails when payload is schema-invalid despite matching digests

- GIVEN a `workOrder` and `workResult` whose declared IDs match their recomputed digests
- WHEN `workResult` carries invalid `commands`, `logs`, or `filesystem_inventory` item shapes
- THEN `validateWorkResultBinding` MUST fail closed
- AND MUST NOT return `{ ok: true }`

---

### Requirement: Strict Digest Compute Functions Validation {#REQ-execution-identities-007}

The four identity computation functions (`computeSourceSnapshotId`, `computeWorkOrderId`, `computeWorkResultId`, `computeCandidateId`) MUST validate all input parameters, require non-empty mandatory fields, and validate that any referenced input digest matches the `sha256:<64 hex>` format. `computeWorkOrderId` MUST validate `ownership` (`owner` string, `mode` string), `budget` (`model_turns`, `patches`, `commands`, `wall_time_minutes`, `changed_lines` numbers), and every item in `dependencies` (`sha256:<64 hex>` digest string). `computeWorkResultId` MUST validate `patch` (string if present), `commands` array items (`command` string, `exit_code` number, `duration_ms` number), `logs` array items (`stream` string `"stdout"`|`"stderr"`, `content` string), and `filesystem_inventory` array items (`path` string, `sha256` digest string, `mode` string|number). Passing missing parameters, non-object inputs, empty required fields, ill-formed digest strings, or invalid array/field element types MUST cause computation to throw a `TypeError` or `Error` immediately fail-closed. Invalid arrays or types MUST NOT be silently coerced to `[]`.

#### Scenario: computeWorkOrderId rejects invalid ownership or budget fields

- GIVEN a WorkOrder input with `ownership: {}` or `budget: {}`
- WHEN `computeWorkOrderId` is called
- THEN computation MUST throw an `Error` fail-closed

#### Scenario: computeWorkOrderId rejects non-sha256 dependency items

- GIVEN a WorkOrder input with `dependencies: ["invalid-dep-id"]`
- WHEN `computeWorkOrderId` is called
- THEN computation MUST throw an `Error` fail-closed

#### Scenario: computeWorkResultId rejects invalid command or log item shapes

- GIVEN a WorkResult input with `commands: [42]` or `logs: [{}]`
- WHEN `computeWorkResultId` is called
- THEN computation MUST throw an `Error` fail-closed

---

### Requirement: Positive Identity Kind Discrimination {#REQ-execution-identities-008}

`validateIdentityKind` MUST discriminate identities via a positive closed `EXPECTED_KINDS` table (`Candidate` -> `"candidate/v2"`, `WorkOrder` -> `"work-order/v2"`). When validating `SourceSnapshot` or `WorkResult` where `kind` is `undefined`, `validateIdentityKind` MUST validate the payload against its corresponding JSON Schema (`source-snapshot/v1` or `work-result/v1`). If schema validation fails for an un-kinded payload, `validateIdentityKind` MUST fail closed. `validateIdentityKind` MUST NOT return `{ ok: true }` for arbitrary un-kinded objects like `{}`.

#### Scenario: Empty object fails validateIdentityKind for SourceSnapshot or WorkResult

- GIVEN an empty object `{}` passed to `validateIdentityKind` for `SourceSnapshot` or `WorkResult`
- WHEN `validateIdentityKind` runs
- THEN validation MUST fail closed
- AND MUST NOT return `{ ok: true }`

#### Scenario: Schema-valid v1 payload passes validateIdentityKind without kind

- GIVEN a valid `source-snapshot/v1` or `work-result/v1` payload lacking a `kind` property
- WHEN `validateIdentityKind` runs for `SourceSnapshot` or `WorkResult`
- THEN validation MUST succeed and return `{ ok: true }`
