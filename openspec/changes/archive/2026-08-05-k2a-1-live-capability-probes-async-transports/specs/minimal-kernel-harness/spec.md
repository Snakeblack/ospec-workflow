# Delta for minimal-kernel-harness

## ADDED Requirements

### Requirement: Negative Runtime Harness-Alone Host-Fault Assertion {#REQ-minimal-kernel-harness-013}

The test suite MUST include an automated runtime assertion that evaluates K2a
host-fault conformance with only Minimal Kernel Harness fixtures and no
Headless Conformance Host peer, and MUST assert that host-fault coverage remains
incomplete. Spec prose alone or comments MUST NOT satisfy this requirement.

#### Scenario: Harness-alone negative runtime test fails closed on coverage

- GIVEN only Minimal Kernel Harness fixtures are present
- AND no Headless Conformance Host peer fault matrix is wired
- WHEN the dedicated negative runtime test evaluates host-fault conformance
- THEN the test MUST assert that host-fault coverage is incomplete
- AND MUST NOT pass by skipping or stubbing the incompleteness check

## MODIFIED Requirements

### Requirement: Peer Host Fault Matrix Without Owning Host Policy {#REQ-minimal-kernel-harness-009}

The Minimal Kernel Harness MUST remain the protocol/lifecycle harness. It MAY
wire or peer with the Headless Conformance Host to exercise the host-fault
matrix (timeout, cancel, worker fail, interrupt), but MUST NOT own host-adapter
policy, CapabilityProof issuance, or product-host activation. Host-fault
ownership remains with the Headless Conformance Host. Harness-alone
incompleteness MUST be proven by the runtime assertion in
REQ-minimal-kernel-harness-013.
(Previously: harness-alone incompleteness was stated in prose/scenario without
requiring an automated negative runtime test.)

#### Scenario: Protocol harness peers without absorbing host policy

- GIVEN a host-fault scenario requiring timeout injection
- WHEN the Minimal Kernel Harness participates via peer/wire to the Headless
  Conformance Host
- THEN the fault MUST be driven by the conformance host
- AND the harness MUST NOT invent adapter-local delivery or capability policy

#### Scenario: Harness alone does not satisfy host-fault ownership

- GIVEN only Minimal Kernel Harness fixtures with no Headless Conformance Host
  fault matrix
- WHEN K2a host-fault conformance is evaluated by the negative runtime test
- THEN host-fault coverage MUST remain incomplete
