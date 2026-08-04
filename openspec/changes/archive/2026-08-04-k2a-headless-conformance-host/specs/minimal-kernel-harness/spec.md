# Delta for minimal-kernel-harness

## ADDED Requirements

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
