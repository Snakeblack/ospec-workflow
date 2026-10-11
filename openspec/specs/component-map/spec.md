# Component Map Specification

## Purpose

Foundation recovers the architecture of an existing repository as a
component map, `ospec-component-map/v2`
(`schemas/foundation/component-map/v2.schema.json`; v1 is still read), kept in
`docs/architecture/component-map.yaml`. It lists components, boundaries,
dependencies and divergences between the documentation and the code. Every
entry cites `path:line` evidence. Inferred ADRs use `status: inferred` of
`ospec-decision-record/v1` (REQ-decision-records-006). Quality hints are
`assumed` knowledge-map slots whose source is the repository. The model
infers; `validateComponentMap` checks shape, references and, given a root,
that the evidence exists. There is no `ospec` command for it.

## Requirements

### Requirement: A Sample Repository Yields A Map And Inferred ADRs {#REQ-component-map-001}

The sample repository under `schemas/foundation/component-map/fixtures/`
MUST come with a component map, an inferred ADR and a knowledge map whose
quality hint is an `assumed` slot with `source.kind` `repository` and a
`path:line` reference. Linted against that repository, the map and the ADR
MUST be valid and the ADR MUST have no warnings.

#### Scenario: The recovery of the sample repository validates

- GIVEN the sample repository and its recovery fixtures
- WHEN the map and the ADR are validated with the repository as root
- THEN both MUST be valid
- AND every component and dependency MUST cite at least one `path:line`

### Requirement: Evidence Must Resolve In The Repository {#REQ-component-map-002}

A reference MUST be `path:line`: a relative POSIX path and a line from 1.
Given a root, the file MUST exist inside it and the line MUST NOT be past
the last line; otherwise the map MUST be rejected with rule `evidence` at
the path of that reference. A divergence MAY name the documented text it
departs from in `documented`, which MUST resolve the same way, or the
inferred ADR the user rejected in `rejected_adr`. A divergence records the
difference and MUST NOT require changing the documented text.

#### Scenario: A missing file, a line past the end and a path outside the root reject

- GIVEN a component whose evidence is a missing file, a line past the end or a path outside the root
- WHEN the map is validated with the repository as root
- THEN it MUST be rejected with rule `evidence` at that reference

### Requirement: Entries Reference Known Components {#REQ-component-map-003}

Component, boundary and divergence ids MUST be unique within their list.
A boundary member and both ends of a dependency MUST name a component of
the map, and a dependency MUST NOT go from a component to itself. Without a
root the map is checked for shape and references only. Each entry MUST cite
at least one reference.

#### Scenario: An unknown component and a self dependency reject

- GIVEN a dependency to an unknown component and one from a component to itself
- WHEN the map is validated
- THEN each MUST be rejected with rule `reference`

### Requirement: Components Name Their Paths And Knowledge {#REQ-component-map-004}

`ospec-component-map/v2` MUST be v1 plus two optional fields per component:
`paths`, a non-empty list of unique relative globs (no leading `/`, no
whitespace), and `knowledge`, with optional non-empty lists of unique
`adrs` (four-digit ids), `scenarios` (quality scenario ids), `terms` (glossary
terms) and `constraints` (knowledge-map slot ids). IDD reads them as knowledge
by reference (REQ-idd-021). A v1 map MUST still validate against its own
schema and MUST NOT carry these fields; a map that names neither version MUST
be rejected with rule `schema` at `/schema`.

#### Scenario: Each version validates against its own schema

- GIVEN the sample recovery as v1 and as v2 with paths and knowledge
- WHEN both are validated with the repository as root
- THEN both MUST be valid
- AND a v1 component with `paths` MUST be rejected with rule
  `additionalProperties`
