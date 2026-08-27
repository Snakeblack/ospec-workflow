# Delta for kernel-contract-schemas

## ADDED Requirements

### Requirement: Evidence V2 Provenance Binding Distinct From Verdict {#REQ-kernel-contract-schemas-024}

The suite MUST publish `evidence/v2.schema.json`
(`$id: "ospec://schemas/kernel/evidence/v2"`) with `schema_version: 2` and
`kind: "evidence/v2"`. Required fields: `schema_version`, `kind`,
`evidence_id`, `candidate_id` (`^sha256:[a-f0-9]{64}$`), `provenance`
(`runtime-observed | host-attested | tool-produced | model-reported |
human-decision | external-unverified`), `origin`, `digest`
(`^sha256:[a-f0-9]{64}$`), and `node_id`. The schema MUST forbid `verdict`
and MUST enforce `additionalProperties: false`. `evidence/v1.schema.json`,
its K1 fixtures, and `K1_SCHEMA_BASELINE` pins MUST remain byte-identical.
Valid and invalid fixtures MUST cover complete provenance-bound evidence,
missing required fields, unknown provenance, malformed `candidate_id`, and
payloads that include `verdict`.

#### Scenario: Valid evidence v2 fixture passes

- GIVEN a complete evidence/v2 payload with `runtime-observed` provenance and a valid CandidateId
- WHEN validated against `evidence/v2.schema.json`
- THEN validation MUST succeed

#### Scenario: Evidence v2 with verdict or unknown provenance fails closed

- GIVEN an evidence/v2 payload that includes `verdict` or `provenance: "worker-said-so"`
- WHEN schema validation runs
- THEN validation MUST fail closed identifying the violating property

#### Scenario: Evidence v1 pins remain frozen

- GIVEN `evidence/v1.schema.json`, its K1 fixtures, and `K1_SCHEMA_BASELINE`
- WHEN verified after evidence/v2 publication
- THEN v1 schema and fixture bytes and K1 pins MUST remain byte-identical

### Requirement: Verification V2 Verdict Distinct From Evidence {#REQ-kernel-contract-schemas-025}

The suite MUST publish `verification/v2.schema.json`
(`$id: "ospec://schemas/kernel/verification/v2"`) with `schema_version: 2` and
`kind: "verification/v2"`. Required fields: `schema_version`, `kind`,
`verification_id`, `candidate_id` (`^sha256:[a-f0-9]{64}$`), `verdict`
(`PASS | PASS WITH WARNINGS | FAIL`), and `evidence_ids` (array of
`^sha256:[a-f0-9]{64}$`). The schema MUST enforce `additionalProperties: false`.
`verification/v1.schema.json`, its K1 fixtures, and `K1_SCHEMA_BASELINE` pins
MUST remain byte-identical. Negative non-aliasing fixtures MUST reject
verification/v2 as evidence/v2 and evidence/v2 as verification/v2.

#### Scenario: Valid verification v2 fixture passes

- GIVEN a verification/v2 payload with `verdict: "PASS"` and bound evidence_ids
- WHEN validated against `verification/v2.schema.json`
- THEN validation MUST succeed

#### Scenario: Cross-family substitution fails closed

- GIVEN an evidence/v2 payload validated as verification/v2, or a verification/v2 payload validated as evidence/v2
- WHEN schema validation runs
- THEN validation MUST fail closed identifying kind or required-field mismatch

#### Scenario: Verification v1 pins remain frozen

- GIVEN `verification/v1.schema.json`, its K1 fixtures, and `K1_SCHEMA_BASELINE`
- WHEN verified after verification/v2 publication
- THEN v1 schema and fixture bytes and K1 pins MUST remain byte-identical

### Requirement: Assurance Graph Schema Family And Equivalence Manifest {#REQ-kernel-contract-schemas-026}

The suite MUST publish `assurance-graph/v1.schema.json`
(`$id: "ospec://schemas/kernel/assurance-graph/v1"`) with `schema_version: 1`.
Required fields: `schema_version`, `graph_id` (`^sha256:[a-f0-9]{64}$`),
`candidate_id` (`^sha256:[a-f0-9]{64}$`), `nodes` (array), and `edges` (array
of `{from, relation, to}` with `relation` in
`verified-by | satisfies | derived-from | invalidates`). The schema MUST
enforce `additionalProperties: false` and MUST NOT alias
CandidateEvaluationAttestation or DeliveryAuthorization. An optional
equivalence-manifest object MAY appear with a distinct `kind` and MUST NOT
validate as attestation or authorization. The family MUST ship valid fixtures
and invalid fixtures for missing fields, unknown relation, and malformed
digests.

#### Scenario: Valid assurance-graph fixture passes

- GIVEN a complete assurance-graph/v1 payload with four-relation edges and matching graph_id digest form
- WHEN validated against `assurance-graph/v1.schema.json`
- THEN validation MUST succeed

#### Scenario: Unknown relation or attestation alias fails closed

- GIVEN an edge with `relation: "reviewed-by"` or a graph payload that validates as CandidateEvaluationAttestation
- WHEN schema validation runs
- THEN validation MUST fail closed

---

## MODIFIED Requirements

### Requirement: Versioned Schema Families With Id And Version {#REQ-kernel-contract-schemas-001}

The contract suite MUST publish a versioned JSON Schema for each family: state/transition, classification, contract, graph/node, work order/result, candidate, SourceSnapshot, WorkOrder, WorkResult, Candidate, evidence, verification, finding/review, failure/recovery, receipt, event, OperationPermit, OperationReceipt, effect-class, HostCapabilities, HostAdapter, ExecutionTransport, QuestionTransport, WorkerTransport, ToolExecutionTransport, DeliveryGateTransport, CapabilityProof, transport-request, transport-outcome, transport-failure, execution-graph, policy-snapshot, clarify-event, execution-budget, authority-effect-budget, causal-failure, failure-recovery-transition, workspace-descriptor, capsule-definition, work-result-execution-payload, containment-violation, and assurance-graph. Every schema MUST declare a stable `$id` and an explicit version field (`schema_version` or equivalent). Consumers MUST be able to pin a schema by `$id`/version.
(Previously: K6a closed the inventory at containment-violation; K6b adds assurance-graph and additive evidence/v2 and verification/v2 without replacing K1 evidence/v1 or verification/v1 pins.)

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
