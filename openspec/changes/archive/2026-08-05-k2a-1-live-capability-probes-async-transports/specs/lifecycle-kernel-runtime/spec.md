# Delta for lifecycle-kernel-runtime

## ADDED Requirements

### Requirement: Host Boundary Awaits And Catches Transport Promises {#REQ-lifecycle-kernel-runtime-017}

The lifecycle kernel host-boundary MUST invoke host contract transports through
an async observe path that `await`s `Promise<TransportOutcome>` and `catch`es
rejections. A rejected Promise MUST be observed as a structured failure
(`ok: false`) and MUST NEVER be treated as a successful transport outcome.
Host-boundary fault observation MUST NOT bypass OperationPermit + CAS
requirements for authoritative mutation.

#### Scenario: Rejected transport Promise is observed as failure

- GIVEN a host transport port whose Promise rejects
- WHEN the host-boundary observes the invoke
- THEN the observed outcome MUST have `ok: false`
- AND MUST NOT be treated as success

#### Scenario: Successful transport Promise is observed as success

- GIVEN a host transport port that resolves `{ ok: true, ... }`
- WHEN the host-boundary awaits the invoke
- THEN the observed outcome MUST preserve `ok: true`
- AND MUST remain consumable by subsequent kernel decisions without host-brand
  branching

#### Scenario: Transport rejection does not mint authority

- GIVEN a rejected transport Promise observed at the host-boundary
- WHEN the kernel continues after the failure
- THEN authoritative mutation MUST still require OperationPermit + CAS
- AND MUST NOT invent a host-local success path from the rejection
