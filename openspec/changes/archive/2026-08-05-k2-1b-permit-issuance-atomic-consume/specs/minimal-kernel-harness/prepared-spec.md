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

### Requirement: Authority Fault Matrix Through Public Entrypoint {#REQ-minimal-kernel-harness-007}

The Minimal Kernel Harness MUST exercise the K2.1 authority fault matrix through
the same public kernel entrypoint used by runtime consumers. The matrix MUST
cover at least: CAS conflict, stale permit, permit reuse, and ambiguous
irreversible effect. Positive companion paths in the same suite MUST use
controlled-issuer permits rather than public auto-mint. Private reducer-only
fixtures MUST NOT satisfy this requirement.
#### Scenario: CAS conflict fixture

- GIVEN two concurrent writers sharing the same loaded revision
- WHEN both attempt compareAndSwap through the public entrypoint
- THEN exactly one MUST succeed
- AND the harness result MUST record a CAS-conflict outcome for the loser
- AND budgets MUST NOT inflate because of the conflict

#### Scenario: Stale permit fixture

- GIVEN a permit whose expected_revision no longer matches the head
- WHEN the harness authorizes a mutation with that permit
- THEN authorize MUST fail closed as stale
- AND the final head digest MUST match the pre-attempt head

#### Scenario: Permit reuse fixture

- GIVEN a permit already consumed into an OperationReceipt
- WHEN the harness presents the same permit again
- THEN the attempt MUST fail closed
- AND no second authoritative advance MUST occur

#### Scenario: Ambiguous irreversible effect fixture

- GIVEN an irreversible effect whose outcome is injected as ambiguous
- WHEN the harness continues the protocol
- THEN the next kind MUST be `decide` or `stop`
- AND the same irreversible effect MUST NOT auto-retry

#### Scenario: Positive companion uses issuer permit

- GIVEN a harness positive path that expects a successful CAS advance
- WHEN authorization is prepared
- THEN the permit MUST come from the controlled issuer
- AND mintPermit on the public entrypoint MUST remain false by default

### Requirement: Fixed Path No Regression Under K2.1 {#REQ-minimal-kernel-harness-008}

Harness fixtures that encode the fixed-policy control path MUST continue to pass
after Authority Store, permits, and effect classes are enforced. K2.1 MUST NOT
alter fixed defaults or invent a second lifecycle authority inside the harness.

#### Scenario: Fixed-path fixture remains green

- GIVEN an accepted fixed-policy lifecycle harness fixture
- WHEN it runs under K2.1 permit and CAS enforcement
- THEN the fixture MUST still converge to its expected terminal outcome
- AND MUST NOT require a changed global default policy

### Requirement: Peer Host Fault Matrix Without Owning Host Policy {#REQ-minimal-kernel-harness-009}

The Minimal Kernel Harness MUST remain the protocol/lifecycle harness. It MAY
wire or peer with the Headless Conformance Host to exercise the host-fault
matrix (timeout, cancel, worker fail, interrupt), but MUST NOT own host-adapter
policy, CapabilityProof issuance, or product-host activation. Host-fault
ownership remains with the Headless Conformance Host.

#### Scenario: Protocol harness peers without absorbing host policy

- GIVEN a host-fault scenario requiring timeout injection
- WHEN the Minimal Kernel Harness participates via peer/wire to the Headless
  Conformance Host
- THEN the fault MUST be driven by the conformance host
- AND the harness MUST NOT invent adapter-local delivery or capability policy

#### Scenario: Harness alone does not satisfy host-fault ownership

- GIVEN only Minimal Kernel Harness fixtures with no Headless Conformance Host
  fault matrix
- WHEN K2a host-fault conformance is evaluated
- THEN host-fault coverage MUST remain incomplete

### Requirement: Fixed Path No Regression Under K2a {#REQ-minimal-kernel-harness-010}

Harness fixtures that encode the fixed-policy control path and K2.1 authority
fault matrix MUST continue to pass after the host contract, CapabilityProof,
and Headless Conformance Host are introduced. K2a MUST NOT alter fixed defaults
or invent a second lifecycle authority inside the harness.

#### Scenario: Fixed-path fixture remains green under K2a

- GIVEN an accepted fixed-policy lifecycle harness fixture
- WHEN it runs with K2a host-contract ports available
- THEN the fixture MUST still converge to its expected terminal outcome
- AND MUST NOT require a changed global default policy

#### Scenario: Authority fault matrix remains green

- GIVEN K2.1 CAS-conflict, stale-permit, permit-reuse, and ambiguous-irreversible
  harness fixtures
- WHEN they run under K2a
- THEN each MUST retain its expected fail-closed or single-writer outcome

### Requirement: Positive Paths Use Controlled Issuer Permits {#REQ-minimal-kernel-harness-011}

Positive mutating harness fixtures that authorize an advance MUST obtain an
OperationPermit from the controlled issuer before calling the public kernel
entrypoint. Fixtures MUST NOT rely on public-path auto-mint (`mintPermit`
default true) to pass. Fault-matrix fixtures MAY continue to inject stale,
reused, or missing permits explicitly.

#### Scenario: Positive mutation issues permit first

- GIVEN a positive mutating harness fixture that expects a successful advance
- WHEN the fixture prepares authorization
- THEN it MUST call the controlled issuer with TransitionOffer plus
  PolicyDecision, HumanDecision, or KernelRule and expected_revision
- AND MUST present that issuer-produced permit to the public entrypoint

#### Scenario: Auto-mint convenience does not satisfy positive coverage

- GIVEN a fixture that mutates solely by enabling public auto-mint
- WHEN K2.1b harness conformance is evaluated
- THEN that fixture MUST NOT count as a passing positive authorization path

### Requirement: Atomic Consume Replay And Restart Fixtures {#REQ-minimal-kernel-harness-012}

The harness MUST exercise atomic consume, exact identical replay receipt
stability, and in-process restart verifiability through the public entrypoint.
Private reducer-only fixtures MUST NOT satisfy these checks.

#### Scenario: Atomic consume fixture

- GIVEN an issuer-produced valid permit and a successful public mutation
- WHEN the harness inspects the Authority Store winning revision
- THEN next_state, next_journal, permit consumed status, and OperationReceipt
  MUST all be present in that revision
- AND a failed consume path MUST leave the pre-attempt head unchanged

#### Scenario: Exact replay receipt fixture

- GIVEN a completed authorized mutation with OperationReceipt Rc
- WHEN the harness replays the exact identical operation
- THEN the result MUST return Rc
- AND MUST NOT record a second consume or receipt

#### Scenario: In-process restart receipt fixture

- GIVEN a process-local store revision that recorded consumed permit and receipt
- WHEN the harness restarts the in-process store and reloads the subject
- THEN permit consumed status and OperationReceipt MUST remain verifiable
- AND multi-process durability MUST NOT be required for the fixture to pass
