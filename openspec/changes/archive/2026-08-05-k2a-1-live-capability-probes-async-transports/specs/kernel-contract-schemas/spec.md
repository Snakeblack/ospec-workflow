# Delta for kernel-contract-schemas

## ADDED Requirements

### Requirement: Transport Request Outcome And Failure Families {#REQ-kernel-contract-schemas-011}

The contract suite MUST publish additive versioned JSON Schema families
`transport-request`, `transport-outcome`, and `transport-failure` at v1. Each
family MUST declare a stable `$id` and explicit version distinct from the five
existing transport port schemas. Existing transport v1 `$id`s MUST remain
pinned and MUST NOT be silently mutated. Each new family MUST ship at least one
valid and one invalid fixture.

`transport-request` MUST allow `requestId` and MAY carry `AbortSignal`/deadline
descriptors as schema-representable fields. `transport-outcome` MUST distinguish
success (`ok: true`) from failure. `transport-failure` MUST require `ok: false`
and a stable failure class covering at least timeout, cancel, reject, interrupt,
and worker-fail.

#### Scenario: Additive families expose $id and version

- GIVEN the published contract suite after this change
- WHEN transport-request, transport-outcome, and transport-failure schemas are
  inspected
- THEN each MUST expose a non-empty `$id`
- AND MUST expose an explicit version identifier
- AND MUST NOT alias an existing transport port `$id`

#### Scenario: Existing transport v1 ids remain unchanged

- GIVEN the five existing transport port schemas published at v1
- WHEN their `$id` values are compared to the pre-change pins
- THEN each `$id` MUST remain identical
- AND MUST NOT be silently rewritten by the additive families

#### Scenario: Valid and invalid transport-failure fixtures

- GIVEN transport-failure valid and invalid fixtures
- WHEN each is validated against the schema
- THEN the valid fixture MUST succeed
- AND the invalid fixture MUST fail identifying the violating path or rule

#### Scenario: Outcome success cannot claim ok false simultaneously

- GIVEN a transport-outcome fixture with contradictory ok/success markers
- WHEN schema validation runs
- THEN validation MUST fail closed

## MODIFIED Requirements

### Requirement: Versioned Schema Families With Id And Version {#REQ-kernel-contract-schemas-001}

The contract suite MUST publish a versioned JSON Schema for each family:
state/transition, classification, contract, graph/node, work order/result,
candidate, evidence, verification, finding/review, failure/recovery, receipt,
event, OperationPermit, OperationReceipt, effect-class, HostCapabilities,
HostAdapter, ExecutionTransport, QuestionTransport, WorkerTransport,
ToolExecutionTransport, DeliveryGateTransport, CapabilityProof,
transport-request, transport-outcome, and transport-failure. Every schema MUST
declare a stable `$id` and an explicit version field (`schema_version` or
equivalent). Consumers MUST be able to pin a schema by `$id`/version.
(Previously: family list ended at CapabilityProof; k2a-1 adds
transport-request, transport-outcome, and transport-failure.)

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
