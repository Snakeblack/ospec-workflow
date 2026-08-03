# kernel-contract-schemas Specification

## Purpose

Define the versioned kernel contract suite: JSON Schemas with `$id`/version,
valid/invalid fixtures, aliases, and migration rules that preserve existing
consumer tags — without executing the lifecycle reducer.

## Requirements

### Requirement: Versioned Schema Families With Id And Version {#REQ-kernel-contract-schemas-001}

The contract suite MUST publish a versioned JSON Schema for each family:
state/transition, classification, contract, graph/node, work order/result,
candidate, evidence, verification, finding/review, failure/recovery, receipt,
and event. Every schema MUST declare a stable `$id` and an explicit version
field (`schema_version` or equivalent). Consumers MUST be able to pin a
schema by `$id`/version.

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
