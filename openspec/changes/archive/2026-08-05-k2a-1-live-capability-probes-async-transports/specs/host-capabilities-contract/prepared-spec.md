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


### Requirement: Async Transport Invocation Contract {#REQ-host-capabilities-contract-006}

Each of the five transport ports MUST expose an asynchronous invocation that
returns `Promise<TransportOutcome>`. Callers MUST be able to supply
`AbortSignal`, a deadline, and a `requestId` on the request. The invoke path
MUST `await` the Promise and MUST `catch` rejections. A rejected Promise MUST
NOT be normalized or reported as `{ ok: true }`.

#### Scenario: Successful invoke resolves to TransportOutcome

- GIVEN a transport port that completes successfully
- WHEN the port is invoked with a transport-request carrying requestId
- THEN the caller MUST receive a Promise that resolves to a TransportOutcome
  with `ok: true`

#### Scenario: Rejected Promise becomes structured failure

- GIVEN a transport port whose Promise rejects
- WHEN the shared invoke path awaits and catches the rejection
- THEN the outcome MUST be `{ ok: false }` with a classified transport failure
- AND MUST NOT report `ok: true`

#### Scenario: AbortSignal or deadline cancels invoke

- GIVEN an in-flight transport invoke with AbortSignal or deadline
- WHEN the signal aborts or the deadline elapses
- THEN the outcome MUST be a structured failure classified as timeout or cancel
- AND MUST preserve requestId when supplied

### Requirement: Immutable Ports After Adapter Creation {#REQ-host-capabilities-contract-007}

After `createHostAdapter` succeeds, the adapter's transport ports and
HostCapabilities surface MUST be deep-frozen or otherwise immutable to callers.
Mutation of port bindings, capability states, or wrapper methods after creation
MUST fail closed or be unreachable.

#### Scenario: Post-create port mutation is refused

- GIVEN a HostAdapter returned by `createHostAdapter`
- WHEN a caller attempts to replace or mutate a transport port binding
- THEN the mutation MUST fail closed or throw
- AND the original port binding MUST remain in effect

#### Scenario: Post-create capability state mutation is refused

- GIVEN a HostAdapter returned by `createHostAdapter`
- WHEN a caller attempts to change a capability state on the published surface
- THEN the mutation MUST fail closed or be unreachable
- AND the published capability states MUST remain unchanged

### Requirement: Structured Transport Failure Classification {#REQ-host-capabilities-contract-008}

Transport failures MUST be classified into a stable, machine-readable failure
class covering at least `timeout`, `cancel`, `reject`, `interrupt`, and
`worker-fail`. Classification MUST NOT invent a successful outcome for a
failed invoke.

#### Scenario: Timeout is classified

- GIVEN a transport invoke that exceeds its deadline or aborts as timeout
- WHEN failure classification runs
- THEN the failure class MUST be `timeout`
- AND `ok` MUST be false

#### Scenario: Worker failure is classified

- GIVEN a WorkerTransport invoke that fails
- WHEN failure classification runs
- THEN the failure class MUST be `worker-fail`
- AND `ok` MUST be false
