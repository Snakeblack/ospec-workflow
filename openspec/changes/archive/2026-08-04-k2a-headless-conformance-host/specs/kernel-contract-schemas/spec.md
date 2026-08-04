# Delta for kernel-contract-schemas

## ADDED Requirements

### Requirement: Host And Capability-Proof Contract Families {#REQ-kernel-contract-schemas-008}

The contract suite MUST publish versioned JSON Schemas for `HostCapabilities`,
`HostAdapter`, each of the five transport contracts, and `CapabilityProof`.
Each family MUST declare a stable `$id` and explicit version.
`CapabilityProof` and host/transport contracts MUST use distinct kinds/schemas
from `receipt/v1` and `OperationReceipt`, and MUST NOT alias Candidate
Evaluation Attestation or Delivery Authorization schemas.

#### Scenario: Host families expose $id and version

- GIVEN the published K2a contract suite
- WHEN HostCapabilities, HostAdapter, transport, and CapabilityProof schemas
  are inspected
- THEN each MUST expose a non-empty `$id`
- AND MUST expose an explicit version identifier

#### Scenario: CapabilityProof is not receipt/v1 or OperationReceipt

- GIVEN CapabilityProof schema beside receipt/v1 and OperationReceipt
- WHEN their `$id`/kind identifiers are compared
- THEN CapabilityProof MUST be distinct from both
- AND MUST NOT resolve as an alias of either

#### Scenario: Valid and invalid HostCapabilities fixtures

- GIVEN HostCapabilities valid and invalid fixtures
- WHEN each is validated against the schema
- THEN the valid fixture MUST succeed
- AND the invalid fixture MUST fail identifying the violating path or rule

### Requirement: Capability State Enumeration Is Closed {#REQ-kernel-contract-schemas-009}

Host capability-state fields MUST accept only
`enforced | partial | instructional | unavailable`. Any other value MUST fail
schema validation.

#### Scenario: Unknown capability state is rejected

- GIVEN a HostCapabilities fixture with state `enabled`
- WHEN schema validation runs
- THEN validation MUST fail
- AND the failure MUST identify the state field

### Requirement: CapabilityProof Required Fields Are Closed {#REQ-kernel-contract-schemas-010}

CapabilityProof schemas MUST require `adapter_version`, `host_version`,
`fixture`, and `evidence_digest` as non-empty fields. Omitting any required
field MUST fail schema validation.

#### Scenario: Incomplete proof fixture fails

- GIVEN a CapabilityProof fixture missing `fixture`
- WHEN schema validation runs
- THEN validation MUST fail
- AND the failure MUST identify the missing required field

## MODIFIED Requirements

### Requirement: Versioned Schema Families With Id And Version {#REQ-kernel-contract-schemas-001}

The contract suite MUST publish a versioned JSON Schema for each family:
state/transition, classification, contract, graph/node, work order/result,
candidate, evidence, verification, finding/review, failure/recovery, receipt,
event, OperationPermit, OperationReceipt, effect-class, HostCapabilities,
HostAdapter, ExecutionTransport, QuestionTransport, WorkerTransport,
ToolExecutionTransport, DeliveryGateTransport, and CapabilityProof. Every
schema MUST declare a stable `$id` and an explicit version field
(`schema_version` or equivalent). Consumers MUST be able to pin a schema by
`$id`/version.
(Previously: family list ended at effect-class; K2a adds host, transport and
CapabilityProof families.)

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
