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

Hard floors MUST be driven by impact evidence, not by LOC, file counts, or user intent declarations.
The initial hard floors MUST include at least:

| Evidence | Floor (minimum route severity) |
| -------- | ------------------------------ |
| Data migration impact (`data_migration`) | `critical` |
| Authentication/security impact (`auth_security`) | `critical` |
| Public API / public contract impact (`public_api`) | at least `planned` |
| Localized reproducible bug (Repair) | `repair` |
| Mechanical no-behavior change (Direct) | `direct` |

Line or file counts MAY inform reviewability or delivery slicing. They MUST NOT lower a hard floor established by impact evidence.
The classifier MUST connect these hard floors to live route dispatch. Neither small sizing nor explicit intent signals (including `hotfix` and `bugfix`) MUST downgrade or bypass a hard floor established by impact evidence.

(Previously: K1 published floors and the classifier but prohibited activating live route dispatch or modifying routing baselines, and did not explicitly guard against hotfix intent bypassing hard floors.)

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

#### Scenario: Hotfix intent cannot downgrade auth hard floor

- GIVEN impact evidence that authentication/security surfaces are affected
- AND the change request declares explicit hotfix intent
- WHEN classification and live dispatch evaluate the change
- THEN the hard floor MUST remain `critical`
- AND hotfix intent MUST NOT downgrade the floor or permit `hotfix` route selection

### Requirement: Live Dispatch Floor Guarantee Mapping {#REQ-change-classification-004}

The classifier MUST expose a deterministic mapping between K1 impact floors and live route dispatch guarantees:
- `critical` floor: MUST require full SDD guarantees (`standard`), including propose, spec, design, tasks, apply, verify, and archive phases. It MUST prohibit dispatch of `lite`, `hotfix`, `repair`, or `direct` routes.
- `planned` floor: MUST require specification and design guarantees (`standard`), including propose, spec, design, tasks, apply, verify, and archive phases. It MUST prohibit dispatch of `lite` and `hotfix` routes.
- `bounded` floor: MUST permit standard and lite workflows provided other conditions and eligibility are satisfied.
- `repair` and `direct` floors: MUST permit targeted remediation workflows only when no higher impact floor is present.

If the active candidate route does not satisfy the minimum assurance guarantees of the resolved floor, the classifier and dispatcher MUST reject the candidate route and elevate to a route satisfying the floor.

#### Scenario: Critical floor maps to standard route guarantees

- GIVEN a change with resolved risk floor `critical`
- WHEN route eligibility is evaluated for live dispatch
- THEN routes omitting specification or design (`lite`, `hotfix`) MUST be rejected
- AND the change MUST require full SDD guarantees (`standard`)

#### Scenario: Planned floor rejects lite candidate

- GIVEN a change with resolved risk floor `planned`
- AND the candidate route is `lite`
- WHEN floor mapping is applied
- THEN `lite` MUST be rejected
- AND the route MUST elevate to satisfy specification and design requirements
