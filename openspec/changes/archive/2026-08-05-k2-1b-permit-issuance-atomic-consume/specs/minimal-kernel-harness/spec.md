# Delta for minimal-kernel-harness

## ADDED Requirements

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

## MODIFIED Requirements

### Requirement: Authority Fault Matrix Through Public Entrypoint {#REQ-minimal-kernel-harness-007}

The Minimal Kernel Harness MUST exercise the K2.1 authority fault matrix through
the same public kernel entrypoint used by runtime consumers. The matrix MUST
cover at least: CAS conflict, stale permit, permit reuse, and ambiguous
irreversible effect. Positive companion paths in the same suite MUST use
controlled-issuer permits rather than public auto-mint. Private reducer-only
fixtures MUST NOT satisfy this requirement.
(Previously: fault matrix only; K2.1b requires issuer-first positive companions.)

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
