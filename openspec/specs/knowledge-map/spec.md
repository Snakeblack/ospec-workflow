# Knowledge Map Specification

## Purpose

The foundation knowledge map records what a project knows before architecture
decisions are taken. A project stores it at `docs/architecture/knowledge-map.yaml`.
The contract below is the document model: JSON Schema
`schemas/foundation/knowledge-map/v1.schema.json` (`ospec-knowledge-map/v1`)
and the slot catalog `schemas/foundation/knowledge-map/catalog.json`.
Fixtures are JSON documents of that same model. This requirement does not
select questions or write the file; that engine is E2.2.

## Requirements

### Requirement: Slot States Distinguish Unknown From Not Applicable {#REQ-knowledge-map-001}

A knowledge map MUST declare `schema` as `ospec-knowledge-map/v1` and a
`profile` of `prototype`, `internal-tool`, `product`, `regulated`,
`public-library` or `embedded`. Each slot MUST name its id, dimension and
one state: `unknown`, `confirmed`, `assumed`, `n/a` or `deferred`.
`unknown` and `n/a` MUST be different states. An `unknown` slot MUST NOT
carry a source, a reason, an owner or a review trigger. An `n/a` slot MUST
carry a reason that says why the slot does not apply.

#### Scenario: Unknown is not a reason to skip

- GIVEN a slot whose state is `unknown`
- WHEN the map is validated
- THEN the slot MUST be accepted without a reason
- AND a slot whose state is `n/a` without a reason MUST be rejected

### Requirement: Provenance And Slot-To-Decision Links {#REQ-knowledge-map-002}

A `confirmed` slot MUST name its source (`user`, `document` or `repository`,
plus a ref). An `assumed` slot MUST name its source and the review trigger
that would change the assumption. A `deferred` slot MUST name an owner.
Every slot MUST name at least one decision it feeds, and each decision MUST
be one the catalog lists for that slot. A slot id or a decision outside the
catalog MUST be rejected.

#### Scenario: An assumption without a trigger is not recorded

- GIVEN an `assumed` slot with a source and no review trigger
- WHEN the map is validated
- THEN the map MUST be rejected

#### Scenario: A deferred slot without an owner is not recorded

- GIVEN a `deferred` slot with no owner
- WHEN the map is validated
- THEN the map MUST be rejected

#### Scenario: A confirmed slot without a source is not recorded

- GIVEN a `confirmed` slot with no source
- WHEN the map is validated
- THEN the map MUST be rejected

### Requirement: Profile Mandatory Slots {#REQ-knowledge-map-003}

The catalog MUST give each of the six profiles its own mandatory slot set.
A mandatory slot MUST be present and MUST NOT be `unknown`. `confirmed`,
`assumed`, `n/a` and `deferred` all answer it. A profile example MUST include
every mandatory slot. `regulated` MUST require `architecture.trust` and
`operation.backup`. `public-library` MUST require `technology.licenses` and
`delivery.versioning` and MUST NOT require `operation.backup`. `embedded`
MUST require `business.constraints` and `architecture.deployment`.
`prototype` MUST NOT require `operation.backup`.

#### Scenario: A regulated map cannot leave trust unknown

- GIVEN a `regulated` map that omits `architecture.trust`
- WHEN the map is validated
- THEN the map MUST be rejected for the missing mandatory slot

### Requirement: Quality Scenarios Do Not Invent Measures {#REQ-knowledge-map-004}

A quality scenario MUST state its origin, stimulus, environment, artifact and
observable response. A measure MUST be accepted only together with
`measure_source`, the person or document that defined it. A scenario with no
measure MUST be accepted.

#### Scenario: A number without a source is rejected

- GIVEN a scenario that states a measure and no `measure_source`
- WHEN the map is validated
- THEN the map MUST be rejected
