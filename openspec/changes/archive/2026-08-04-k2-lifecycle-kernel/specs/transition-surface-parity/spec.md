# transition-surface-parity Delta — K2 Runtime Parity

## MODIFIED Requirements

### Requirement: Human And Negotiated Envelope Runtime Parity {#REQ-transition-surface-parity-006}

For the same committed lifecycle state, the human-readable projection and
negotiated machine envelope MUST be derived from the same K2-selected transition.
They MUST recover the same reason/code, cause, state digest and next action
(`kind`, `operation`, arguments and command when `kind=execute`).

Neither surface MAY independently infer a different operation from prose.

#### Scenario: Runtime parity from one selected transition

- GIVEN one committed lifecycle state
- WHEN K2 selects its ordered next transition
- AND human and negotiated projections are rendered
- THEN both projections MUST normalize to identical material discriminants
- AND both MUST reference the same state digest

#### Scenario: Projection cannot override the kernel

- GIVEN K2 selected operation A
- AND a human or model projection proposes operation B
- WHEN parity validation runs
- THEN validation MUST fail
- AND authoritative state MUST remain unchanged

### Requirement: Named Command Is Operationally Honest {#REQ-transition-surface-parity-007}

A human or negotiated surface MAY name a command only when the Minimal Kernel
Harness proves that executing the named operation advances lifecycle state or
reaches an explicit terminal outcome for the represented condition.

#### Scenario: Syntactically valid dead-end command is rejected

- GIVEN an `execute` or recovery command passes K1 shape validation
- BUT executing it reproduces the same blocking state
- WHEN K2 runtime parity/conformance runs
- THEN the command MUST be rejected as an honest continuation
- AND the surface MUST use `decide` or `stop` unless another advancing recovery exists
