# Delta for kernel-contract-schemas

## ADDED Requirements

### Requirement: Result Envelope Schema Family and Fixtures {#REQ-kernel-contract-schemas-031}

The kernel contract schemas MUST register and pin the `result-envelope` schema family at version 1 (`schemas/kernel/result-envelope/v1/envelope.schema.json` with `$id: "https://openspec.io/schemas/kernel/result-envelope/v1.schema.json"`). The schema MUST strictly validate `schema_version: 1`, `status` (`success`, `partial`, `blocked`), `executive_summary`, `artifacts`, `next_recommended`, `risks`, and `skill_resolution`. Optional fields (`assumptions`, `key_decisions`, `question_gate`, `blocker_type`, `runtime_observability`, `approval_updates`, and `sdd-spec` ambiguity signals) MUST enforce their respective structural types when present. The schema family MUST ship with at least one valid fixture and at least one invalid fixture exercising required fields, enum constraints, and edge cases.

#### Scenario: Valid result-envelope v1 fixture passes validation

- GIVEN a compliant `result-envelope/v1` payload
- WHEN validated against `schemas/kernel/result-envelope/v1/envelope.schema.json`
- THEN validation MUST succeed without errors

#### Scenario: Invalid fixture with missing required field fails validation

- GIVEN a result envelope payload missing `status` or `executive_summary`
- WHEN validated against the `result-envelope/v1` schema
- THEN validation MUST fail
- AND MUST identify the missing required property

#### Scenario: Valid blocked fixture with question_gate passes validation

- GIVEN a result envelope with `status: "blocked"` and a valid `question_gate` object
- WHEN validated against the schema
- THEN validation MUST succeed

#### Scenario: Valid sdd-spec success fixture with ambiguity signals passes validation

- GIVEN an `sdd-spec` success envelope containing `residual_ambiguity: false` and the three signal string arrays
- WHEN validated against the schema
- THEN validation MUST succeed

## MODIFIED Requirements

### Requirement: Versioned Schema Families With Id And Version {#REQ-kernel-contract-schemas-001}

The contract suite MUST publish a versioned JSON Schema for each family: state/transition, classification, contract, graph/node, work order/result, candidate, SourceSnapshot, WorkOrder, WorkResult, Candidate, evidence, verification, finding/review, failure/recovery, receipt, event, OperationPermit, OperationReceipt, effect-class, HostCapabilities, HostAdapter, ExecutionTransport, QuestionTransport, WorkerTransport, ToolExecutionTransport, DeliveryGateTransport, CapabilityProof, transport-request, transport-outcome, transport-failure, execution-graph, policy-snapshot, clarify-event, execution-budget, authority-effect-budget, causal-failure, failure-recovery-transition, workspace-descriptor, capsule-definition, work-result-execution-payload, containment-violation, assurance-graph, assessment/binding, runner-receipt, challenge-plan, challenge-result, and result-envelope. Every schema MUST declare a stable `$id` and an explicit version field (`schema_version` or equivalent). Consumers MUST be able to pin a schema by `$id`/version.
(Previously: K6c inventory ended at challenge-result; CX1 adds additive result-envelope family without mutating existing pins.)

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
- WHEN HostCapabilities, HostAdapter, the five transports and CapabilityProof are checked
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

#### Scenario: Runner-receipt family is included without mutating K6b or K1 pins

- GIVEN the required schema family inventory
- WHEN runner-receipt is checked
- THEN it MUST be present as a pinned versioned family with a distinct non-empty `$id`
- AND evidence/v2, verification/v2, and K1 v1 pins MUST remain byte-identical

#### Scenario: Challenge-plan and challenge-result families are included in the required set

- GIVEN the required schema family inventory
- WHEN challenge-plan and challenge-result are checked
- THEN each MUST be present as a pinned versioned family with a distinct non-empty `$id`
- AND evidence/v2, verification/v2, and K1 v1 pins MUST remain byte-identical

#### Scenario: Result-envelope family is included in the required set

- GIVEN the required schema family inventory
- WHEN result-envelope is checked
- THEN it MUST be present as a pinned versioned family (`result-envelope/v1`) with a distinct non-empty `$id`
- AND all prior versioned families MUST remain byte-identical
