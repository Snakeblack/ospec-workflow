# minimal-kernel-harness Specification

## Purpose

Exercise the real K2 lifecycle protocol headlessly before the product-scale corpus
and longitudinal evaluation of K12.

## Requirements

### Requirement: Harness Uses The Public Kernel Entry Point {#REQ-minimal-kernel-harness-001}

The Minimal Kernel Harness MUST execute the same public kernel API used by runtime
consumers. A K2 conformance test MUST NOT pass solely by calling private reducer
helpers or mocks that bypass journal, reconciliation, transition validation or
state persistence boundaries.

#### Scenario: Private reducer-only test is insufficient

- GIVEN a reducer unit test passes
- WHEN no harness scenario exercises the public kernel entry point
- THEN K2 conformance MUST remain incomplete

### Requirement: Headless Protocol Execution {#REQ-minimal-kernel-harness-002}

The harness MUST execute lifecycle operations without conversational memory,
manual state edits or human approval. When the protocol reaches `decide`, it MUST
halt and report the pending decision; it MUST NOT auto-approve.

#### Scenario: Human decision halts

- GIVEN the selected next transition has `kind=decide`
- WHEN the harness runs
- THEN it MUST halt with structured decision metadata
- AND MUST NOT synthesize an approval or execute a substitute command

### Requirement: Interruption And Replay Scenarios {#REQ-minimal-kernel-harness-003}

The harness MUST support deterministic interruption points before and after state
persistence, journal persistence and effect execution. Replaying from every
supported interruption point MUST converge without duplicated completed effects.

#### Scenario: Interrupt after command succeeds

- GIVEN a command effect succeeds
- AND the harness interrupts before final state commit
- WHEN the scenario resumes
- THEN reconciliation MUST not run the command twice
- AND the final state MUST match the uninterrupted execution

### Requirement: Named Commands Are Executed {#REQ-minimal-kernel-harness-004}

For each `execute` or `recover` transition emitted by K2, at least one E2E fixture
MUST invoke the named operation through the harness. Merely validating the command
string or tokens is insufficient.

#### Scenario: Recovery command proves progress

- GIVEN a recovery transition with a named command
- WHEN the harness executes the command through its injected executor
- THEN the resulting state digest MUST change or become terminal

### Requirement: Snapshot And Digest Round Trip {#REQ-minimal-kernel-harness-005}

The harness MUST serialize and restore authoritative lifecycle state plus journal
metadata. A round trip MUST preserve the semantic state digest and valid ordered
transitions.

#### Scenario: Snapshot round trip

- GIVEN a non-terminal lifecycle state
- WHEN the harness snapshots, reloads and re-evaluates it
- THEN the state digest and ordered transitions MUST match the pre-snapshot values

### Requirement: Deterministic Fixture Outputs {#REQ-minimal-kernel-harness-006}

Harness fixtures MUST produce stable machine-readable results containing at least
scenario ID, initial/final state digest, operations, effects, events, outcome and
counterexample metadata when applicable. Volatile timestamps MUST be injected or
excluded from semantic digests.

#### Scenario: Repeated fixture run is equivalent

- GIVEN the same fixture, seed and kernel version
- WHEN it is executed twice
- THEN the semantic result MUST be byte-equivalent
