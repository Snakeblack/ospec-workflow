# Delta for kernel-contract-schemas

## ADDED Requirements

### Requirement: Workspace Descriptor And Capsule Definition Schema Families {#REQ-kernel-contract-schemas-021}

The contract suite MUST publish `workspace-descriptor/v1.schema.json` (`$id: "ospec://schemas/kernel/workspace-descriptor/v1"`) and `capsule-definition/v1.schema.json` (`$id: "ospec://schemas/kernel/capsule-definition/v1"`) with explicit `schema_version: 1`.

`workspace-descriptor/v1` MUST require `schema_version`, `workspace_id` (string matching `^ws-[a-f0-9-]+$`), `root_path` (string), `source_snapshot_id` (string matching `^sha256:[a-f0-9]{64}$`), `status` (`active | disposed | interrupted`), and `created_at` (ISO date-time string).

`capsule-definition/v1` MUST require `schema_version`, `capsule_id` (string), `fingerprint` (string matching `^sha256:[a-f0-9]{64}$`), `source_snapshot_id` (string matching `^sha256:[a-f0-9]{64}$`), `dependencies` (array of dependency path strings), `allowed_paths` (array of string path patterns), and `environment` (object).

Both schemas MUST enforce `additionalProperties: false` and ship valid and invalid fixtures demonstrating schema validation and rejection of missing required fields or invalid property patterns.

#### Scenario: Valid workspace descriptor and capsule definition fixtures pass validation

- GIVEN valid workspace-descriptor and capsule-definition payload objects
- WHEN validated against their respective schemas
- THEN validation MUST succeed

#### Scenario: Workspace descriptor with invalid status or malformed source_snapshot_id fails validation

- GIVEN a workspace descriptor fixture with `status: "unknown"` or malformed `source_snapshot_id`
- WHEN validated against `workspace-descriptor/v1.schema.json`
- THEN validation MUST fail closed identifying the invalid property

#### Scenario: Capsule definition missing allowed_paths or dependencies fails validation

- GIVEN a capsule definition payload missing `allowed_paths` or `dependencies`
- WHEN validated against `capsule-definition/v1.schema.json`
- THEN validation MUST fail closed identifying the missing required property

---

### Requirement: Work Result Execution Payload And Containment Violation Schema Families {#REQ-kernel-contract-schemas-022}

The contract suite MUST publish `work-result-execution-payload/v1.schema.json` (`$id: "ospec://schemas/kernel/work-result-execution-payload/v1"`) and `containment-violation/v1.schema.json` (`$id: "ospec://schemas/kernel/containment-violation/v1"`) with explicit `schema_version: 1`.

`work-result-execution-payload/v1` MUST require `schema_version`, `work_result_id` (string matching `^sha256:[a-f0-9]{64}$`), `work_order_id` (string matching `^sha256:[a-f0-9]{64}$`), `source_snapshot_id` (string matching `^sha256:[a-f0-9]{64}$`), `patch` (string), `commands` (array of command outcome objects), `logs` (array of strings), `exit_code` (integer), `filesystem_inventory` (array of file objects), and `execution_usage` (object conforming to execution usage schema). The schema MUST strictly prohibit any `candidate_id` property.

`containment-violation/v1` MUST require `schema_version`, `violation_id` (string), `workspace_id` (string), `work_order_id` (string), `attempted_path` (string), `allowed_paths` (array of strings), `violation_type` (`traversal | symlink_escape | undeclared_write | permission_denied`), and `timestamp` (ISO date-time string).

Both schemas MUST enforce `additionalProperties: false`. Negative non-aliasing fixtures MUST demonstrate that `work-result-execution-payload` cannot validate as `Candidate` or `DeliveryAuthorization`, and `containment-violation` cannot validate as `OperationReceipt` or `transport-failure`.

#### Scenario: Valid containment violation fixture passes validation

- GIVEN a valid containment violation payload declaring attempted_path and violation_type `traversal`
- WHEN validated against `containment-violation/v1.schema.json`
- THEN validation MUST succeed

#### Scenario: Containment violation with unknown violation_type fails validation

- GIVEN a containment violation payload with `violation_type: "kernel_panic"`
- WHEN validated against `containment-violation/v1.schema.json`
- THEN validation MUST fail closed identifying the invalid enum value

#### Scenario: Valid work result execution payload passes validation

- GIVEN a valid work-result-execution-payload object with valid cryptographic digests and execution usage
- WHEN validated against `work-result-execution-payload/v1.schema.json`
- THEN validation MUST succeed

#### Scenario: WorkResult payload declaring candidate_id fails validation

- GIVEN a work result execution payload containing property `candidate_id`
- WHEN validated against `work-result-execution-payload/v1.schema.json`
- THEN validation MUST fail closed due to forbidden candidate property

---

## MODIFIED Requirements

### Requirement: Versioned Schema Families With Id And Version {#REQ-kernel-contract-schemas-001}

The contract suite MUST publish a versioned JSON Schema for each family: state/transition, classification, contract, graph/node, work order/result, candidate, SourceSnapshot, WorkOrder, WorkResult, Candidate, evidence, verification, finding/review, failure/recovery, receipt, event, OperationPermit, OperationReceipt, effect-class, HostCapabilities, HostAdapter, ExecutionTransport, QuestionTransport, WorkerTransport, ToolExecutionTransport, DeliveryGateTransport, CapabilityProof, transport-request, transport-outcome, transport-failure, execution-graph, policy-snapshot, clarify-event, execution-budget, authority-effect-budget, causal-failure, failure-recovery-transition, workspace-descriptor, capsule-definition, work-result-execution-payload, and containment-violation. Every schema MUST declare a stable `$id` and an explicit version field (`schema_version` or equivalent). Consumers MUST be able to pin a schema by `$id`/version.
(Previously: K5 added execution-budget, authority-effect-budget, causal-failure, and failure-recovery-transition families; K6a adds workspace-descriptor, capsule-definition, work-result-execution-payload, and containment-violation families.)

#### Scenario: Every required family has $id and version

- GIVEN the published contract suite
- WHEN each required schema family is inspected
- THEN the schema MUST expose a non-empty `$id`
- AND MUST expose an explicit version identifier

#### Scenario: Consumer can pin a schema version

- GIVEN a schema family published at version N
- WHEN a consumer references that family's `$id` and version N
- THEN resolution MUST return the schema for version N
- AND MUST NOT silently substitute a different version

#### Scenario: K2.1 families are included in the required set

- GIVEN the required schema family inventory
- WHEN OperationPermit, OperationReceipt and effect-class are checked
- THEN each MUST be present as a pinned versioned family

#### Scenario: K2a families are included in the required set

- GIVEN the required schema family inventory
- WHEN HostCapabilities, HostAdapter, the five transports and CapabilityProof
  are checked
- THEN each MUST be present as a pinned versioned family

#### Scenario: k2a-1 transport envelope families are included

- GIVEN the required schema family inventory
- WHEN transport-request, transport-outcome, and transport-failure are checked
- THEN each MUST be present as a pinned versioned family

#### Scenario: K3 execution identity families are included in the required set

- GIVEN the required schema family inventory
- WHEN SourceSnapshot, WorkOrder, WorkResult, and Candidate identity schemas are checked
- THEN each MUST be present as a pinned versioned family with distinct $id

#### Scenario: K4a execution graph, policy snapshot, and clarify event families are included in the required set

- GIVEN the required schema family inventory
- WHEN execution-graph, policy-snapshot, and clarify-event schemas are checked
- THEN each MUST be present as a pinned versioned family with a distinct non-empty $id

#### Scenario: K5 budget and failure recovery families are included in the required set

- GIVEN the required schema family inventory
- WHEN execution-budget, authority-effect-budget, causal-failure, and failure-recovery-transition schemas are checked
- THEN each MUST be present as a pinned versioned family with a distinct non-empty $id

#### Scenario: K6a worker isolation and containment families are included in the required set

- GIVEN the required schema family inventory
- WHEN workspace-descriptor, capsule-definition, work-result-execution-payload, and containment-violation schemas are checked
- THEN each MUST be present as a pinned versioned family with a distinct non-empty $id
