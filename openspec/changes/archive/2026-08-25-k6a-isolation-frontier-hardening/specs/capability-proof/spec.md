# Delta for capability-proof

## ADDED Requirements

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
