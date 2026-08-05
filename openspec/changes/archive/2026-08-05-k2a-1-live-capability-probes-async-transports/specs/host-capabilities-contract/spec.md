# Delta for host-capabilities-contract

## ADDED Requirements

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
