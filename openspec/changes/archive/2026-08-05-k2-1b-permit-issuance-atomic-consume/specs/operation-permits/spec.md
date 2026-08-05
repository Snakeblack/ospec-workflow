# Delta for operation-permits

## ADDED Requirements

### Requirement: Controlled Issuer Issues Permits {#REQ-operation-permits-005}

Permit issuance MUST occur only through a controlled runtime issuer that
accepts a `TransitionOffer` plus exactly one of `PolicyDecision`,
`HumanDecision`, or `KernelRule`, plus `expected_revision`, and returns an
`OperationPermit`. State-validity of the offered transition alone MUST NOT
authorize issuance or mutation. Models, hosts, and public mutating entrypoints
MUST NOT self-grant or auto-mint permits.

#### Scenario: Issuer produces permit from offer plus decision

- GIVEN a valid TransitionOffer and a PolicyDecision (or HumanDecision or
  KernelRule) bound to expected_revision R
- WHEN the controlled issuer runs
- THEN it MUST return a runtime-owned OperationPermit with expected_revision R
- AND the permit MUST NOT be minted by the public mutating entrypoint

#### Scenario: State-valid offer alone does not issue

- GIVEN a TransitionOffer that is state-valid for the current head
- AND no PolicyDecision, HumanDecision, or KernelRule is supplied
- WHEN issuance is attempted
- THEN the issuer MUST fail closed
- AND no OperationPermit MUST exist for that attempt

### Requirement: Consume And Receipt Are Revision Authoritative {#REQ-operation-permits-006}

Consuming an OperationPermit and emitting its OperationReceipt MUST be recorded
in the same Authority Store revision that commits `next_state` and
`next_journal`. A failed consume MUST NOT leave committed authoritative state
without a consumed permit. Exact identical replay of a completed authorized
operation MUST return the prior OperationReceipt and MUST NOT mint a second
ledger entry or receipt. After in-process restart under the K2.1 process-local
durability model, permit consumed status and receipt MUST remain verifiable
from the Authority Store revision.

#### Scenario: Successful consume records receipt in winning revision

- GIVEN a valid unused issuer-produced permit matching head revision R
- WHEN the authorized mutation commits successfully
- THEN the winning revision MUST record permit status consumed
- AND MUST record the OperationReceipt referencing that permit_id
- AND MUST record next_state and next_journal in that same revision

#### Scenario: Failed consume does not leave orphan committed state

- GIVEN a valid unused permit matching head revision R
- WHEN consume cannot be recorded as part of the successful CAS
- THEN the authoritative head MUST remain at R
- AND no OperationReceipt MUST be treated as committed for that attempt

#### Scenario: Exact identical replay returns prior receipt

- GIVEN a completed mutation whose OperationReceipt is already recorded in the
  authority-store revision
- WHEN the exact same authorized operation is replayed
- THEN the runtime MUST return that prior OperationReceipt
- AND MUST NOT mint a new permit consume or second receipt

#### Scenario: In-process restart keeps permit and receipt verifiable

- GIVEN a process-local Authority Store revision that recorded consumed permit
  status and OperationReceipt
- WHEN the process restarts and reloads that subject
- THEN permit consumed status and receipt MUST remain verifiable from the
  loaded revision
- AND multi-process durable ledger behavior MUST NOT be required
