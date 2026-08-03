# change-classification Specification

## Purpose

Define deterministic change classification by risk, uncertainty, and
execution evidence, producing a stable fingerprint and machine-readable
`reasons`, with impact hard floors that MUST NOT be degraded by LOC or file
counts.

## Requirements

### Requirement: Multidimensional Classification Profile {#REQ-change-classification-001}

Classification MUST produce a structured profile with three independent axes:
`risk`, `uncertainty`, and `execution`. The profile MUST include a selected
`route` (or equivalent route label) and a `reasons` array of stable,
machine-readable reason codes. Classification MUST NOT rely on free-form
prose as the sole explanation of the route.

#### Scenario: Profile contains all required axes

- GIVEN sufficient structured evidence inputs for a change
- WHEN classification runs
- THEN the result MUST include `risk`, `uncertainty`, and `execution`
- AND MUST include `route` and a `reasons` array

#### Scenario: Reasons are machine-readable codes

- GIVEN a classification result with one or more hard-floor or evidence hits
- WHEN `reasons` is inspected
- THEN every entry MUST be a stable code (not free-form prose alone)
- AND re-running classification on the same inputs MUST emit the same codes

### Requirement: Stable Fingerprint For Identical Classification Inputs {#REQ-change-classification-002}

Identical normalized classification inputs MUST produce an identical
fingerprint. Any material change to normalized inputs MUST change the
fingerprint. The fingerprint algorithm MUST be deterministic across
supported platforms for the same normalized payload.

#### Scenario: Same inputs same fingerprint

- GIVEN two classification runs with byte-identical normalized inputs
- WHEN fingerprints are compared
- THEN they MUST be equal

#### Scenario: Material input change alters fingerprint

- GIVEN a classification fingerprint for input set A
- WHEN a material evidence field in A is changed to produce input set B
- THEN the fingerprint for B MUST differ from A

### Requirement: Impact Hard Floors Not Degradable By Size {#REQ-change-classification-003}

Hard floors MUST be driven by impact evidence, not by LOC or file counts.
The initial hard floors MUST include at least:

| Evidence | Floor (minimum route severity) |
| -------- | ------------------------------ |
| Data migration impact | `critical` |
| Authentication/security impact | `critical` |
| Public API / public contract impact | at least `planned` |
| Localized reproducible bug (Repair) | `repair` |
| Mechanical no-behavior change (Direct) | `direct` |

Line or file counts MAY inform reviewability or delivery slicing. They MUST
NOT lower a hard floor established by impact evidence. K1 MUST publish these
floors and the classifier; it MUST NOT activate adaptive route execution or
change fixed/default routing baselines.

#### Scenario: Auth evidence floors to critical despite tiny diff

- GIVEN impact evidence that authentication/security surfaces are affected
- AND the diff is only a few lines
- WHEN classification runs
- THEN the hard floor MUST be `critical`
- AND LOC/file counts MUST NOT downgrade that floor

#### Scenario: Large docs-only change does not invent critical floor

- GIVEN a large documentation-only change with no migration, auth, public
  API, Repair, or other material impact evidence
- WHEN classification runs
- THEN size alone MUST NOT force a `critical` hard floor

#### Scenario: Public API evidence floors to at least planned

- GIVEN impact evidence that a public API/contract is affected
- WHEN classification runs
- THEN the resulting floor MUST be at least `planned`

#### Scenario: Repair evidence selects repair floor

- GIVEN evidence of a localized reproducible bug suitable for Repair
- AND no higher hard-floor evidence is present
- WHEN classification runs
- THEN the hard floor MUST be `repair`

#### Scenario: Direct evidence selects direct floor

- GIVEN evidence of a mechanical, reversible, no-behavior change
- AND no higher hard-floor evidence is present
- WHEN classification runs
- THEN the hard floor MUST be `direct`

#### Scenario: Migration evidence floors to critical

- GIVEN impact evidence of a data migration
- WHEN classification runs
- THEN the hard floor MUST be `critical`
