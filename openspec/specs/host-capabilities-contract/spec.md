# host-capabilities-contract Specification

## Purpose

Define the host-agnostic product contract consumed by the lifecycle core:
`HostCapabilities`, `HostAdapter`, the five transports, and capability-state
semantics with honest degradation.

## Requirements

### Requirement: HostCapabilities Declares Closed Capability States {#REQ-host-capabilities-contract-001}

`HostCapabilities` MUST declare each advertised capability with exactly one
state from `{enforced, partial, instructional, unavailable}`. Any other state
value MUST be rejected. A missing state for an advertised capability MUST fail
closed.

#### Scenario: Valid four-state declaration

- GIVEN a HostCapabilities document listing five transports with states from
  the closed set
- WHEN the contract is validated
- THEN validation MUST succeed

#### Scenario: Unknown capability state is rejected

- GIVEN a HostCapabilities document with state `full`
- WHEN the contract is validated
- THEN validation MUST fail closed
- AND MUST identify the offending capability path

### Requirement: Five Transports Are Required Ports {#REQ-host-capabilities-contract-002}

The host contract MUST expose these five transport ports:
`ExecutionTransport`, `QuestionTransport`, `WorkerTransport`,
`ToolExecutionTransport`, and `DeliveryGateTransport`. Each MUST be addressable
as an opaque port by the core. Absence of a required port declaration MUST fail
closed. Ports MUST NOT embed lifecycle reducer, Graph compiler, CAS, or permit
policy.

#### Scenario: All five transports are present

- GIVEN a HostAdapter binding
- WHEN its transport surface is inspected
- THEN all five named transports MUST be present as ports

#### Scenario: Transport must not own lifecycle policy

- GIVEN a transport implementation that selects lifecycle transitions or mints
  OperationPermits
- WHEN contract conformance evaluates the adapter
- THEN the adapter MUST be rejected
- AND MUST NOT be accepted as a valid HostAdapter

### Requirement: HostAdapter Translates Without Authority {#REQ-host-capabilities-contract-003}

A `HostAdapter` MUST translate host-specific tools, UX, delegation, and hooks
into the five transports and `HostCapabilities`. It MUST NOT grant
OperationPermits, mutate Authority Store heads, approve operations, or set
lifecycle status. Adapters MUST NOT be treated as semantic authority.

#### Scenario: Adapter cannot mint permits

- GIVEN a HostAdapter invocation that attempts to mint an OperationPermit
- WHEN authorization boundaries are checked
- THEN the attempt MUST fail closed
- AND authoritative state MUST remain unchanged

### Requirement: No Silent Capability Promotion {#REQ-host-capabilities-contract-004}

A capability whose declared or effective state is `unavailable` or
`instructional` MUST NOT become `enforced` by silent fallback, defaulting, or
retry. Promotion to `enforced` MUST require an explicit CapabilityProof path
owned by `capability-proof`. Transition from `partial` to `enforced` MUST also
require proof.

#### Scenario: Unavailable does not silently become enforced

- GIVEN capability C with state `unavailable`
- WHEN the core requests enforcement of C without a valid CapabilityProof
- THEN enforcement MUST be refused
- AND the effective state MUST remain `unavailable` or degrade honestly

#### Scenario: Instructional promotion without proof fails

- GIVEN capability C with state `instructional`
- WHEN a consumer treats C as `enforced` without CapabilityProof
- THEN conformance MUST fail
- AND MUST NOT record C as enforced

### Requirement: Delivery And Worker Ports Stay Policy-Free {#REQ-host-capabilities-contract-005}

`DeliveryGateTransport` and `WorkerTransport` MUST expose opaque hooks usable
by later slices (K6a / K10-delivery). They MUST NOT embed delivery
authorization policy, isolation policy, or Graph semantics inside the adapter.

#### Scenario: DeliveryGateTransport rejects embedded policy

- GIVEN a DeliveryGateTransport that authorizes delivery from adapter-local
  rules
- WHEN conformance evaluates the transport
- THEN the transport MUST be rejected as policy-owning
- AND MUST remain usable only as an opaque port
