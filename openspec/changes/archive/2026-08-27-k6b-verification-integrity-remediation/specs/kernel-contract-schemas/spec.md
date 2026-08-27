# Delta for kernel-contract-schemas

## ADDED Requirements

### Requirement: Additive Assessment Binding Family Distinct From Evidence And Verification {#REQ-kernel-contract-schemas-027}

The suite MUST publish an additive assessment/binding schema family with a
distinct `$id` and explicit `schema_version`. Exact `$id` is design-owned.
Required persistable fields: assessment identity, `evidence_id`, `role`,
`obligation_id`, `node_id`, `candidate_id` (`^sha256:[a-f0-9]{64}$`), and bound
policy-snapshot identity. Assessment identity MUST incorporate `role` and
`obligation_id`. The schema MUST enforce `additionalProperties: false` and
MUST NOT include `verdict`. The family MUST NOT validate as `evidence/v2` or
`verification/v2`. `evidence/v2`, `verification/v2`, and K1 v1 schema bytes
and `K1_SCHEMA_BASELINE` pins MUST remain byte-identical. Valid and invalid
fixtures MUST cover a complete binding, missing required fields, and
cross-family substitution.

#### Scenario: Valid assessment fixture passes

- GIVEN a complete assessment/binding payload with role, obligation_id, node_id, evidence_id, and policy-snapshot identity
- WHEN validated against the assessment/binding schema
- THEN validation MUST succeed

#### Scenario: Cross-family substitution and verdict fail closed

- GIVEN an assessment payload validated as evidence/v2 or verification/v2, or an assessment payload that includes `verdict`
- WHEN schema validation runs
- THEN validation MUST fail closed identifying kind or required-field mismatch

#### Scenario: Four-role assessments remain distinct under the schema

- GIVEN four assessment payloads that share one `evidence_id` and differ only by `role`
- WHEN each is validated and identities are compared
- THEN all four MUST be schema-valid
- AND their assessment identities MUST be pairwise distinct

#### Scenario: Evidence v2, verification v2, and K1 v1 pins remain frozen

- GIVEN `evidence/v2.schema.json`, `verification/v2.schema.json`, K1 v1 schemas, and `K1_SCHEMA_BASELINE`
- WHEN verified after assessment/binding publication
- THEN those schema and fixture bytes and K1 pins MUST remain byte-identical

## MODIFIED Requirements

### Requirement: Versioned Schema Families With Id And Version {#REQ-kernel-contract-schemas-001}

The contract suite MUST publish a versioned JSON Schema for each family: state/transition, classification, contract, graph/node, work order/result, candidate, SourceSnapshot, WorkOrder, WorkResult, Candidate, evidence, verification, finding/review, failure/recovery, receipt, event, OperationPermit, OperationReceipt, effect-class, HostCapabilities, HostAdapter, ExecutionTransport, QuestionTransport, WorkerTransport, ToolExecutionTransport, DeliveryGateTransport, CapabilityProof, transport-request, transport-outcome, transport-failure, execution-graph, policy-snapshot, clarify-event, execution-budget, authority-effect-budget, causal-failure, failure-recovery-transition, workspace-descriptor, capsule-definition, work-result-execution-payload, containment-violation, assurance-graph, and assessment/binding. Every schema MUST declare a stable `$id` and an explicit version field (`schema_version` or equivalent). Consumers MUST be able to pin a schema by `$id`/version.
(Previously: K6b closed the inventory at assurance-graph; this remediation adds an additive assessment/binding family without mutating evidence/v2, verification/v2, or K1 v1 pins.)

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

#### Scenario: K6b assurance-graph family is included in the required set

- GIVEN the required schema family inventory
- WHEN assurance-graph is checked
- THEN it MUST be present as a pinned versioned family with a distinct non-empty `$id`
- AND evidence/v2 and verification/v2 MUST be pinnable without mutating K1 evidence/v1 or verification/v1

#### Scenario: Assessment/binding family is included without mutating K6b pins

- GIVEN the required schema family inventory
- WHEN assessment/binding is checked
- THEN it MUST be present as a pinned versioned family with a distinct non-empty `$id`
- AND evidence/v2, verification/v2, and K1 v1 pins MUST remain byte-identical
