# Complexity Architecture Delta Specification

## Purpose

Define reproducible, Candidate-bound complexity and architecture deltas as
advisory evidence for later consumers without creating review, promotion, or
delivery authority.

## Requirements

### Requirement: Canonical Candidate-Bound Delta Report {#REQ-complexity-architecture-delta-001}

The system MUST produce a versioned delta report bound to one frozen Candidate.
The report MUST carry its content-addressed identity, Candidate identity, and
canonical input identity. Equivalent canonical inputs MUST produce
byte-equivalent reports and identities; a change to canonical input MUST change
the report identity. Missing, malformed, or divergent bindings MUST fail closed.

#### Scenario: Equivalent canonical inputs reproduce the report

- GIVEN two executions with the same frozen Candidate and canonical inputs
- WHEN each produces a K6d report
- THEN their bytes and content-addressed identities MUST be identical

#### Scenario: Candidate binding is missing or divergent

- GIVEN a report with an absent, malformed, or non-matching Candidate binding
- WHEN the report is validated or consumed
- THEN validation MUST fail closed with a structured reason

### Requirement: Complete Structural Delta Coverage {#REQ-complexity-architecture-delta-002}

Each valid report MUST express a structured delta for modules, interfaces,
dependencies, configuration, states, compatibility, duplication, dead code,
and public API. Each dimension MUST distinguish an observed fact from an
unavailable observation; unavailable data MUST NOT be represented as zero or
as an unchanged dimension.

#### Scenario: All dimensions are represented

- GIVEN a Candidate with complete analyzable inputs
- WHEN a K6d report is produced
- THEN it MUST include a structured entry for every required dimension

#### Scenario: A dimension cannot be observed

- GIVEN inputs that cannot establish duplication for a Candidate
- WHEN the report is produced
- THEN that dimension MUST be marked unavailable with its reason
- AND it MUST NOT be reported as zero duplication or unchanged

### Requirement: Alternatives And New-Abstraction Rationale {#REQ-complexity-architecture-delta-003}

The report MUST classify each assessed alternative as `no-op`, `local`,
`extend-pattern`, or `new-abstraction`. A `new-abstraction` entry MUST state
the problem, consumers, variability, boundary, simpler alternative, and
retirement path. An incomplete entry MUST fail validation; it MUST NOT be
silently treated as a justified abstraction.

#### Scenario: New abstraction includes complete rationale

- GIVEN an assessed alternative classified as `new-abstraction`
- WHEN the report is validated
- THEN validation MUST require every rationale field

#### Scenario: Simpler alternative or retirement path is absent

- GIVEN a `new-abstraction` entry without either field
- WHEN the report is validated
- THEN validation MUST fail closed identifying the missing field

### Requirement: Anti-Overengineering Signals Remain Advisory {#REQ-complexity-architecture-delta-004}

The system MUST emit a structured question or finding when alternatives or
delta facts indicate possible overengineering. A K6d signal MUST be advisory:
it MUST NOT approve or reject a Candidate, grant review or delivery authority,
or mutate lifecycle state. K6d MUST NOT collect, derive, or require context
consumption, percentiles, coverage, or other CX0 telemetry.

#### Scenario: Heuristic produces a reviewable question

- GIVEN a fixture indicating an unnecessary new abstraction
- WHEN K6d evaluates the fixture
- THEN it MUST emit an advisory question or finding
- AND it MUST NOT automatically approve or reject the Candidate

#### Scenario: CX0 telemetry is unavailable

- GIVEN no context-consumption telemetry is provided
- WHEN K6d produces a valid report
- THEN the report MUST remain valid without CX0-derived fields

