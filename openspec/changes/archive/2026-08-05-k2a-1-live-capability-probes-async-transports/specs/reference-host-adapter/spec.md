# Delta for reference-host-adapter

## ADDED Requirements

### Requirement: Live Probe Gates Claude Enforced State {#REQ-reference-host-adapter-006}

The `claude` adapter MUST mark a capability as `enforced` only after a live
probe demonstrates that capability. Without real host primitives, declarative
fallbacks MUST resolve to `unavailable`, `instructional`, or `partial` — never
`enforced`. A fixture-only CapabilityProof digest MUST NOT authorize `enforced`.
Acceptable live probes include worker spawn/cancel/fail, an observable delivery
hook, a real question-transport exchange, or an explicitly instructional path
that does not claim enforcement.

#### Scenario: Missing primitive degrades honestly

- GIVEN the claude adapter lacks a real host primitive for capability C
- WHEN capability resolution runs
- THEN C MUST resolve to `unavailable`, `instructional`, or `partial`
- AND MUST NOT resolve to `enforced`

#### Scenario: Fixture-only proof cannot mark enforced

- GIVEN CapabilityProof material for C whose digest is fixture-only
- AND no live probe has demonstrated C
- WHEN the claude adapter resolves C
- THEN C MUST NOT be marked `enforced`

#### Scenario: Live probe enables enforced with proof

- GIVEN a live probe has demonstrated capability C
- AND a CapabilityProof for C verifies against expected live identity and
  expectedProbeDigest
- WHEN the claude adapter resolves C
- THEN C MAY be marked `enforced`
- AND MUST retain the proof identity with the enforcement decision

## MODIFIED Requirements

### Requirement: Enforced Capabilities Carry Proof {#REQ-reference-host-adapter-004}

Every capability the `claude` adapter claims as `enforced` MUST have a
verifiable CapabilityProof bound to its adapter_version, host_version, fixture
and evidence_digest, and MUST have passed live expected-identity verification
including `expectedProbeDigest`. Unproven claims and fixture-only digests
MUST NOT be treated as enforced.
(Previously: a verifiable CapabilityProof alone could authorize enforced
without a live probe / expectedProbeDigest binding.)

#### Scenario: Claude enforced capability has proof

- GIVEN the claude adapter declares capability C as `enforced`
- WHEN CapabilityProof verification runs for C with expected live identity
- THEN a valid proof MUST exist
- AND verification MUST succeed before enforcement
- AND a live probe digest MUST bind to expectedProbeDigest
