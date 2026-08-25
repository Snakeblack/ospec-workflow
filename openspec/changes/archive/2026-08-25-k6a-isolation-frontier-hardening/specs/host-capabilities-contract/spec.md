# Delta for host-capabilities-contract

## ADDED Requirements

### Requirement: WorkerIsolation Is Capability On WorkerTransport {#REQ-host-capabilities-contract-009}

WorkerIsolation MUST be a `HostCapabilities` capability demonstrated **on** the existing `WorkerTransport` port. The host contract MUST continue to require exactly the five transports in REQ-host-capabilities-contract-002. Isolation MUST NOT be added as a sixth required port. `WorkerTransport` MUST remain policy-free per REQ-host-capabilities-contract-005: the adapter MUST NOT embed isolation policy, Graph semantics, or Repair/compiler authority. Absence of a WorkerIsolation capability claim MUST degrade honestly (`partial`, `instructional`, or `unavailable`) and MUST NOT fail as a missing required port.

#### Scenario: Five transports remain the required port set

- GIVEN a HostAdapter binding that includes the five named transports and a WorkerIsolation capability on WorkerTransport
- WHEN the contract surface is inspected
- THEN exactly those five ports MUST be present
- AND no sixth isolation transport port MUST be required

#### Scenario: WorkerIsolation is not a missing-port failure

- GIVEN a HostAdapter with all five transports
- AND no WorkerIsolation `enforced` claim
- WHEN contract conformance evaluates required ports
- THEN validation MUST succeed as a complete five-port adapter
- AND WorkerIsolation MUST resolve to a non-`enforced` capability state rather than a missing-port error

#### Scenario: WorkerTransport still rejects embedded isolation policy

- GIVEN a WorkerTransport that authorizes isolation or command policy from adapter-local rules
- WHEN conformance evaluates the transport
- THEN the transport MUST be rejected as policy-owning
- AND MUST remain usable only as an opaque port
