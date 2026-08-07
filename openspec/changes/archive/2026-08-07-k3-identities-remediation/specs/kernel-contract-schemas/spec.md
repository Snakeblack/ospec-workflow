# kernel-contract-schemas Specification

## Purpose

Define the versioned kernel contract suite: JSON Schemas with `$id`/version,
valid/invalid fixtures, aliases, and migration rules that preserve existing
consumer tags — without executing the lifecycle reducer.

## Requirements

### Requirement: Versioned Schema Families With Id And Version {#REQ-kernel-contract-schemas-001}

The contract suite MUST publish a versioned JSON Schema for each family: state/transition, classification, contract, graph/node, work order/result, candidate, SourceSnapshot, WorkOrder, WorkResult, Candidate, evidence, verification, finding/review, failure/recovery, receipt, event, OperationPermit, OperationReceipt, effect-class, HostCapabilities, HostAdapter, ExecutionTransport, QuestionTransport, WorkerTransport, ToolExecutionTransport, DeliveryGateTransport, CapabilityProof, transport-request, transport-outcome, and transport-failure. Every schema MUST declare a stable `$id` and an explicit version field (`schema_version` or equivalent). Consumers MUST be able to pin a schema by `$id`/version.
(Previously: transport-request, transport-outcome, and transport-failure were the latest added families; k3 adds explicit SourceSnapshot, WorkOrder, WorkResult, and Candidate execution identity families.)

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


### Requirement: Valid And Invalid Fixtures Per Schema Family {#REQ-kernel-contract-schemas-002}

Each schema family MUST ship at least one fixture that validates successfully
and at least one fixture that MUST be rejected. Fixtures MUST exercise
required fields and at least one material negative case (missing required
field, wrong type, or forbidden extra authority field as applicable).

#### Scenario: Valid fixture passes

- GIVEN a schema family and its valid fixture
- WHEN the fixture is validated against the schema
- THEN validation MUST succeed

#### Scenario: Invalid fixture fails

- GIVEN a schema family and its invalid fixture
- WHEN the fixture is validated against the schema
- THEN validation MUST fail
- AND the failure MUST identify the violating path or rule


### Requirement: Versioned Aliases Preserve Existing Tags {#REQ-kernel-contract-schemas-003}

The suite MUST provide versioned aliases that map legacy or current stable
codes/tags to the canonical vocabulary. Migration rules MUST preserve existing
tags: a previously emitted stable tag MUST remain resolvable to an equivalent
canonical code after migration. Aliases MUST NOT silently drop or rename a
known consumer-facing tag without an explicit mapping entry.

#### Scenario: Legacy tag resolves through alias

- GIVEN a legacy stable tag that existing consumers emit
- AND a versioned alias mapping that tag to a canonical code
- WHEN migration/alias resolution runs
- THEN the legacy tag MUST resolve to the mapped canonical code
- AND MUST NOT be reported as unknown solely because of the rename

#### Scenario: Unmapped tag is not silently dropped

- GIVEN a known consumer-facing tag with no alias or migration entry
- WHEN migration/alias resolution runs under a strict mode that requires
  coverage of known tags
- THEN resolution MUST fail closed or report the unmapped tag
- AND MUST NOT drop the tag silently


### Requirement: Graph And Work-Order Shapes Are Consumable Contracts Only {#REQ-kernel-contract-schemas-004}

Graph/node and work-order/result schemas MUST be published as consumable
contracts for later kernel work (K2–K4). Publishing those schemas MUST NOT
activate Graph IR as authority and MUST NOT implement or invoke a lifecycle
reducer.

#### Scenario: Graph schema exists without reducer activation

- GIVEN graph/node schemas are published with fixtures
- WHEN the repository is checked for K1 deliverables
- THEN the schemas and fixtures MUST be present and validatable
- AND no lifecycle reducer execution path MUST be introduced solely by those
  schemas


### Requirement: Schema Docs Cannot Name Unemitted Fields Or Commands {#REQ-kernel-contract-schemas-005}

Contract documentation and fixtures that claim to describe emitted surfaces
MUST NOT name a field, operation, or command that the emitting code does not
produce. Such mismatches MUST be detectable by contract validation (enforced
via `contract-lint` checkers).

#### Scenario: Fixture field absent from emitter is rejected

- GIVEN a fixture or contract doc that names field `F` as emitted
- AND the emitter under test never produces `F`
- WHEN emission/contract validation runs
- THEN the check MUST report an offender for `F`


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


### Requirement: Execution Identity Schemas With Non-Aliasing Fixtures {#REQ-kernel-contract-schemas-012}

The contract suite MUST publish versioned JSON Schemas for `SourceSnapshot`, `WorkOrder`, `WorkResult`, and `Candidate` execution identity families. Each identity schema MUST declare a stable `$id` and explicit version field. The suite MUST define `candidate/v2.schema.json` (`$id: "ospec://schemas/kernel/candidate/v2"`) and `work-order/v2.schema.json` (`$id: "ospec://schemas/kernel/work-order/v2"`) with explicit `kind` field ("candidate/v2" and "work-order/v2"). Baseline `candidate/v1.schema.json`, `work-order/v1.schema.json`, and `K1_SCHEMA_BASELINE` MUST be preserved and restored as immutable contracts. Each identity family MUST include valid fixtures and negative non-aliasing fixtures demonstrating that `WorkResult` cannot validate as `Candidate`, and `Candidate` cannot validate as `CandidateEvaluationAttestation` or `DeliveryAuthorization`.
(Previously: Execution identity schemas only defined v1 schemas without explicit kind discriminators in candidate and work-order schemas or explicit immutability pins for v1 schemas.)

#### Scenario: K3 identity families expose stable id and version

- GIVEN the published contract suite after this change
- WHEN SourceSnapshot, WorkOrder, WorkResult, and Candidate schemas are inspected
- THEN each MUST expose a non-empty stable `$id`
- AND MUST expose an explicit version identifier

#### Scenario: Identity confusion negative fixtures fail validation

- GIVEN negative fixtures cross-substituting WorkResult, Candidate, CandidateEvaluationAttestation, and DeliveryAuthorization structures
- WHEN schema validation runs for each family
- THEN validation MUST fail closed
- AND the failure MUST identify the schema kind or identifier mismatch

#### Scenario: Schema v2 exposes explicit kind discriminator for candidate and work-order

- GIVEN a candidate/v2 or work-order/v2 JSON payload
- WHEN validated against `candidate/v2.schema.json` or `work-order/v2.schema.json`
- THEN the payload MUST contain property `kind` matching `"candidate/v2"` or `"work-order/v2"` respectively
- AND payloads lacking `kind` or carrying invalid `kind` values MUST be rejected fail-closed

#### Scenario: Legacy v1 schemas and K1 baseline remain intact and immutable

- GIVEN `candidate/v1.schema.json`, `work-order/v1.schema.json`, and `K1_SCHEMA_BASELINE` pins
- WHEN verified against repository schema baseline rules
- THEN v1 schemas MUST remain unchanged without modifying existing v1 properties or constraints
