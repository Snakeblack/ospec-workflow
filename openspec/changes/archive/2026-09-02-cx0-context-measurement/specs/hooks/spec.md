# Delta for hooks

## ADDED Requirements

### Requirement: Fail-Safe CX0 Measurement Emission {#REQ-hooks-017}

`SubagentStop` and its durable state support MUST emit one CX0 measurement
record for a supported dispatch after existing envelope and legacy phase-cost
processing. The emitter MUST normalize host observations into the versioned
CX0 contract, preserve field-level source and coverage, and attach a stable
fallback reason whenever collection degrades. It MUST preserve the existing
hook stdout and `continue: true` behavior. CX0 collection, normalization, or
durable-write failures MUST be isolated from envelope persistence, legacy
phase-cost recording, dispatch outcome, authority, and routing.

#### Scenario: Measurement emission succeeds without changing hook behavior

- GIVEN an active change and a supported dispatch with collectable host metadata
- WHEN `SubagentStop` completes its existing processing
- THEN it MUST persist one coverage-aware CX0 record after legacy processing
- AND its stdout and continuation behavior MUST remain unchanged

#### Scenario: CX0 collector cannot read a host field

- GIVEN a supported dispatch whose host field is absent or malformed
- WHEN `SubagentStop` emits CX0 telemetry
- THEN it MUST mark that CX0 field unavailable with source, coverage, and reason
- AND it MUST NOT fail the hook or replace the field with an evidentiary zero

#### Scenario: CX0 durable write fails

- GIVEN CX0 record persistence raises an error
- WHEN `SubagentStop` handles the dispatch
- THEN the hook MUST continue its existing fail-safe output behavior
- AND legacy phase-cost and envelope outcomes MUST remain unaffected
