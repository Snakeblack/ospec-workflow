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

---

### Requirement: Proof Binds Adapter Host Fixture Digest {#REQ-capability-proof-002}

Every CapabilityProof MUST include non-empty `adapter_version`, `host_version`,
`fixture`, and `evidence_digest`. Missing any field MUST fail verification. The
`evidence_digest` MUST be a reproducible digest of the fixture evidence for the
stated adapter and host versions. Successful verification MUST also bind those
proof fields to the caller's expected live identity and `expectedProbeDigest`
per REQ-capability-proof-005.
(Previously: verification succeeded from proof-declared versions and fixture
digest alone, without live expected identity / probe digest binding.)

#### Scenario: Complete proof verifies

- GIVEN a CapabilityProof with adapter_version, host_version, fixture and
  evidence_digest matching the fixture evidence
- AND expected live identity inputs matching that proof and a live probe digest
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

---

### Requirement: Proof Is Reproducible Across Runs {#REQ-capability-proof-003}

Verifying the same CapabilityProof inputs against the same fixture and versions
MUST converge to the same pass/fail outcome. Volatile timestamps MUST NOT be
included in `evidence_digest` inputs.

#### Scenario: Repeated verification is equivalent

- GIVEN identical CapabilityProof inputs and fixture bytes
- WHEN verification runs twice
- THEN both runs MUST produce the same verification outcome
- AND digests MUST be byte-equivalent when verification passes

---

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

---

### Requirement: Live Expected Identity And Probe Binding {#REQ-capability-proof-005}

`verifyCapabilityProof` MUST require expected live identity inputs:
`expectedAdapterId`, `expectedAdapterVersion`, `expectedHostRuntimeVersion`,
and `expectedProbeDigest`. Verification MUST fail closed when any expected
field is missing, or when the proof's adapter/host identity, fixture evidence,
or probe digest does not match the expected live values. Digests bound only to
versions declared inside the proof MUST NOT suffice when expected live identity
is supplied or required. A fixture-only digest MUST NOT substitute for
`expectedProbeDigest`.

#### Scenario: Matching live identity verifies

- GIVEN a CapabilityProof whose adapter, host, fixture evidence, and probe
  digest match the expected live identity inputs
- WHEN `verifyCapabilityProof` runs with those expected fields
- THEN verification MUST succeed

#### Scenario: Foreign adapter or version is rejected

- GIVEN a CapabilityProof whose adapter id or adapter version differs from
  `expectedAdapterId` / `expectedAdapterVersion`
- WHEN `verifyCapabilityProof` runs
- THEN verification MUST fail closed
- AND MUST report a stable mismatch reason

#### Scenario: Foreign host runtime is rejected

- GIVEN a CapabilityProof whose host version differs from
  `expectedHostRuntimeVersion`
- WHEN `verifyCapabilityProof` runs
- THEN verification MUST fail closed

#### Scenario: Fixture digest is not a live probe digest

- GIVEN a CapabilityProof whose evidence_digest matches fixture bytes only
- AND `expectedProbeDigest` reflects a distinct live probe
- WHEN `verifyCapabilityProof` runs
- THEN verification MUST fail closed
- AND MUST NOT treat the fixture digest as the live probe digest

#### Scenario: Missing expected live identity fails closed

- GIVEN otherwise complete proof and evidence inputs
- AND any of expectedAdapterId, expectedAdapterVersion,
  expectedHostRuntimeVersion, or expectedProbeDigest is omitted
- WHEN `verifyCapabilityProof` runs
- THEN verification MUST fail closed
- AND MUST identify the missing expected field

---

### Requirement: WorkerIsolation Binds Executing WorkerTransport Identity {#REQ-capability-proof-006}

When verifying WorkerIsolation for `enforced`, `verifyCapabilityProof` MUST extend REQ-capability-proof-005 live identity with the executing `WorkerTransport` `port_id` and fingerprint. Verification MUST fail closed when either identifier is missing, or when it does not match the transport that will execute commands and the containment probe. A proof that matches adapter, host, fixture, and probe digest against a **different** WorkerTransport MUST NOT authorize `enforced` on the executing transport. This binding is live-identity only: the CapabilityProof **document schema** MUST NOT gain a new required field for `port_id` or fingerprint. WorkerIsolation MUST NOT be treated as a sixth required host port.

#### Scenario: Matching executing transport live identity verifies

- GIVEN a WorkerIsolation CapabilityProof whose REQ-005 live identity matches
- AND expected `port_id` and fingerprint equal the executing WorkerTransport
- WHEN `verifyCapabilityProof` runs for WorkerIsolation
- THEN verification MUST succeed
- AND the proof document MUST still be valid without an extra required schema field

#### Scenario: Different transport invalidates enforced

- GIVEN a WorkerIsolation CapabilityProof that verifies against transport identity F
- WHEN verification is requested with executing WorkerTransport identity G, G ≠ F
- THEN verification MUST fail closed
- AND WorkerIsolation MUST NOT be treated as `enforced` on G

#### Scenario: Missing executing transport identity fails closed

- GIVEN otherwise complete WorkerIsolation proof and REQ-005 expected inputs
- AND expected executing `port_id` or fingerprint is omitted
- WHEN `verifyCapabilityProof` runs for WorkerIsolation
- THEN verification MUST fail closed
- AND MUST identify the missing live-identity input
