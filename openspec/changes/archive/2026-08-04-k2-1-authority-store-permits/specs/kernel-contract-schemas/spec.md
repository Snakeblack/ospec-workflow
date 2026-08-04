# Delta for kernel-contract-schemas

## ADDED Requirements

### Requirement: Permit Receipt And Effect-Class Contract Families {#REQ-kernel-contract-schemas-006}

The contract suite MUST publish versioned JSON Schemas for `OperationPermit`,
`OperationReceipt`, and effect-class (or effect-intent class) contracts. Each
family MUST declare a stable `$id` and explicit version. `OperationReceipt`
MUST use a distinct kind/schema from `receipt/v1` and MUST NOT be an alias of
Candidate Evaluation Attestation or Delivery Authorization schemas.

#### Scenario: New families expose $id and version

- GIVEN the published K2.1 contract suite
- WHEN OperationPermit, OperationReceipt and effect-class schemas are inspected
- THEN each MUST expose a non-empty `$id`
- AND MUST expose an explicit version identifier

#### Scenario: OperationReceipt is not receipt/v1

- GIVEN the OperationReceipt schema and the existing receipt/v1 schema
- WHEN their `$id`/kind identifiers are compared
- THEN they MUST be distinct
- AND OperationReceipt MUST NOT resolve as an alias of receipt/v1

#### Scenario: Valid and invalid permit fixtures

- GIVEN OperationPermit valid and invalid fixtures
- WHEN each is validated against the permit schema
- THEN the valid fixture MUST succeed
- AND the invalid fixture MUST fail identifying the violating path or rule

### Requirement: Effect Class Enumeration Is Closed {#REQ-kernel-contract-schemas-007}

Effect-class contracts MUST accept only
`pure | idempotent-keyed | probeable | compensatable | irreversible`. Any other
value MUST fail schema validation.

#### Scenario: Unknown effect class is rejected

- GIVEN an effect-class fixture with value `exactly-once`
- WHEN schema validation runs
- THEN validation MUST fail
- AND the failure MUST identify the class field

## MODIFIED Requirements

### Requirement: Versioned Schema Families With Id And Version {#REQ-kernel-contract-schemas-001}

The contract suite MUST publish a versioned JSON Schema for each family:
state/transition, classification, contract, graph/node, work order/result,
candidate, evidence, verification, finding/review, failure/recovery, receipt,
event, OperationPermit, OperationReceipt, and effect-class. Every schema MUST
declare a stable `$id` and an explicit version field (`schema_version` or
equivalent). Consumers MUST be able to pin a schema by `$id`/version.
(Previously: family list ended at receipt/event; K2.1 adds permit, operation
receipt and effect-class families.)

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
