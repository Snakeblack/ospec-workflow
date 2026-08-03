# transition-surface-parity Specification

## Purpose

Define the `next_transition` shape (`execute|collect|decide|stop`) and require
material parity between the human projection and the negotiated envelope for
the same condition (code, cause, next action) — without implementing the
lifecycle reducer.

## Requirements

### Requirement: Next Transition Shape And Kinds {#REQ-transition-surface-parity-001}

A `next_transition` object MUST declare `kind` ∈
`{execute, collect, decide, stop}`, an `operation` identifier, and
`arguments` where each argument that is command-line material carries an
exact `token`. K1 MUST publish and validate this shape; K1 MUST NOT implement
the reducer that chooses transitions from live status.

#### Scenario: Valid execute transition shape

- GIVEN a `next_transition` with `kind=execute`, a known `operation`, a
  `command` string, and `arguments` each carrying a `token`
- WHEN the transition schema is validated
- THEN validation MUST succeed

#### Scenario: Unknown kind is rejected

- GIVEN a `next_transition` whose `kind` is not one of
  `execute|collect|decide|stop`
- WHEN the transition schema is validated
- THEN validation MUST fail

### Requirement: Execute Requires Command And Tokens {#REQ-transition-surface-parity-002}

When `kind=execute`, `command` MUST be present and non-empty, and every
argument required to invoke that command MUST include the exact `token` that
appears (or would appear) on the command line. An `execute` transition
without `command` MUST be rejected.

#### Scenario: Execute without command fails

- GIVEN a `next_transition` with `kind=execute` and no `command`
- WHEN the transition is validated
- THEN validation MUST fail

#### Scenario: Execute with command and tokens passes

- GIVEN `kind=execute`, a non-empty `command`, and arguments whose `token`
  values match the command invocation
- WHEN the transition is validated
- THEN validation MUST succeed

### Requirement: Collect Must Not Invent Commands {#REQ-transition-surface-parity-003}

When `kind=collect`, the transition MAY carry admission tokens, but it MUST
NOT invent a `command` that presupposes an artifact that does not yet exist.
A `collect` transition that names an executable `command` for a missing
artifact MUST be rejected.

#### Scenario: Collect without invented command passes

- GIVEN `kind=collect` describing a missing external or model result
- AND no `command` that presupposes that missing artifact
- WHEN the transition is validated
- THEN validation MUST succeed

#### Scenario: Collect inventing command for missing artifact fails

- GIVEN `kind=collect` for an artifact that does not exist
- AND a `command` that claims to operate on that artifact as if present
- WHEN the transition is validated
- THEN validation MUST fail

### Requirement: Decide And Stop Continuations {#REQ-transition-surface-parity-004}

`kind=decide` MUST indicate that a human decision is required and MUST NOT
require an executable `command`. `kind=stop` MUST indicate that no safe
continuation exists and MUST NOT name an executable recovery `command`.

#### Scenario: Decide does not require command

- GIVEN `kind=decide` with an `operation` identifying the decision point
- WHEN the transition is validated
- THEN validation MUST succeed without a `command`

#### Scenario: Stop forbids recovery command

- GIVEN `kind=stop`
- AND a `command` purporting to recover automatically
- WHEN the transition is validated
- THEN validation MUST fail

### Requirement: Human And Negotiated Envelope Parity {#REQ-transition-surface-parity-005}

For the same blocking or status condition, the human-readable projection and
the negotiated machine envelope MUST recover the same material
discriminants: reason/code, cause, and next action (`next_transition` kind
and operation, plus command when `kind=execute`). Fixtures MUST prove both
surfaces round-trip to those discriminants.

#### Scenario: Parity fixture recovers shared discriminants

- GIVEN a parity fixture pair (human projection + negotiated envelope) for
  one condition
- WHEN both surfaces are normalized to material discriminants
- THEN reason/code, cause, and next action MUST match
- AND when `kind=execute`, the command discriminant MUST match

#### Scenario: Divergent next action fails parity

- GIVEN a human projection that names next action A
- AND a negotiated envelope for the same condition that names next action B
- WHEN parity validation runs
- THEN it MUST report a parity failure
