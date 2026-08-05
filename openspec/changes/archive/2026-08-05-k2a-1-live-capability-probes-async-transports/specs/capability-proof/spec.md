# Delta for capability-proof

## ADDED Requirements

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

## MODIFIED Requirements

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
