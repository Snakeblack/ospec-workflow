# capability-proof Specification

## Purpose

Require a reproducible CapabilityProof before any host capability may be treated
as `enforced`, binding proof digests to adapter, host, fixture and evidence.

## Requirements

### Requirement: Enforced Requires CapabilityProof {#REQ-capability-proof-001}

A capability MUST NOT be treated as `enforced` unless a valid CapabilityProof
exists for that capability. Declaration in HostCapabilities JSON alone MUST NOT
suffice for enforcement.

#### Scenario: Declared enforced without proof is refused

- GIVEN HostCapabilities marks capability C as `enforced`
- AND no CapabilityProof exists for C
- WHEN the core attempts to enforce C
- THEN enforcement MUST fail closed
- AND C MUST NOT be recorded as enforced

#### Scenario: Valid proof enables enforcement

- GIVEN a CapabilityProof for capability C that verifies
- WHEN the core evaluates enforcement eligibility for C
- THEN C MAY be treated as `enforced`
- AND the proof identity MUST be retained with the enforcement decision

### Requirement: Proof Binds Adapter Host Fixture Digest {#REQ-capability-proof-002}

Every CapabilityProof MUST include non-empty `adapter_version`, `host_version`,
`fixture`, and `evidence_digest`. Missing any field MUST fail verification. The
`evidence_digest` MUST be a reproducible digest of the fixture evidence for the
stated adapter and host versions.

#### Scenario: Complete proof verifies

- GIVEN a CapabilityProof with adapter_version, host_version, fixture and
  evidence_digest matching the fixture evidence
- WHEN proof verification runs
- THEN verification MUST succeed

#### Scenario: Missing evidence_digest fails

- GIVEN a CapabilityProof omitting `evidence_digest`
- WHEN proof verification runs
- THEN verification MUST fail closed
- AND MUST identify the missing field

#### Scenario: Digest mismatch fails

- GIVEN a CapabilityProof whose evidence_digest does not match the fixture
  evidence under the declared adapter_version and host_version
- WHEN proof verification runs
- THEN verification MUST fail closed

### Requirement: Proof Is Reproducible Across Runs {#REQ-capability-proof-003}

Verifying the same CapabilityProof inputs against the same fixture and versions
MUST converge to the same pass/fail outcome. Volatile timestamps MUST NOT be
included in `evidence_digest` inputs.

#### Scenario: Repeated verification is equivalent

- GIVEN identical CapabilityProof inputs and fixture bytes
- WHEN verification runs twice
- THEN both runs MUST produce the same verification outcome
- AND digests MUST be byte-equivalent when verification passes

### Requirement: Silent Promotion Remains Forbidden {#REQ-capability-proof-004}

Proof verification failure or absence MUST NOT fall back to treating
`unavailable`, `instructional`, or `partial` capabilities as `enforced`. Failed
proofs MUST remain non-authoritative evidence.

#### Scenario: Failed proof does not promote

- GIVEN capability C in state `partial`
- AND CapabilityProof verification for C fails
- WHEN enforcement is requested
- THEN C MUST NOT become `enforced`
- AND the failure MUST be reported with a stable reason code
