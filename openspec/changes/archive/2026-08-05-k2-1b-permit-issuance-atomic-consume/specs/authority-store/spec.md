# Delta for authority-store

## ADDED Requirements

### Requirement: CAS Payload Atomically Includes Permit And Receipt {#REQ-authority-store-005}

A successful authoritative `compareAndSwap` for a permit-authorized mutation
MUST atomically persist, in the winning revision: `next_state`, `next_journal`,
permit consumed status for the authorizing `permit_id`, and the corresponding
`OperationReceipt`. The store MUST NOT treat a separate post-CAS side map as the
sole authoritative consume truth. If permit consumed status and receipt cannot
be included in that same winning revision, the CAS MUST fail closed and MUST NOT
advance the head.

#### Scenario: Winning revision carries state journal permit and receipt

- GIVEN expectedRevision R and a permit-authorized next_state / next_journal
- WHEN `compareAndSwap` succeeds
- THEN the new head revision MUST include next_state and next_journal
- AND MUST include permit status consumed for that permit_id
- AND MUST include the OperationReceipt for that consume

#### Scenario: Incomplete consume payload rejects CAS

- GIVEN a CAS attempt whose payload omits permit consumed status or
  OperationReceipt for a permit-authorized mutation
- WHEN `compareAndSwap` is evaluated
- THEN the call MUST fail closed
- AND the head revision MUST remain unchanged

### Requirement: Replay Returns Stored Receipt Without Second Advance {#REQ-authority-store-006}

Exact identical replay of a previously successful permit-authorized CAS MUST
converge on the stored post-state and MUST expose the prior OperationReceipt
already recorded in that revision. Replay MUST NOT invent a second head advance
or a second receipt for the same completed mutation keys.

#### Scenario: Exact replay exposes prior receipt

- GIVEN a successful CAS that recorded OperationReceipt Rc at head N
- WHEN the same CAS inputs are reconciled or replayed
- THEN the authoritative head MUST remain N
- AND the returned receipt MUST equal Rc
- AND no second consume record MUST be created

## MODIFIED Requirements

### Requirement: Exact Replay Converges On Same Revision {#REQ-authority-store-004}

Replaying the same successful CAS inputs against the same pre-CAS revision MUST
converge to the same post-state digest. Exact replay MUST NOT invent a second
head advance when the journal already records the completed mutation for that
revision and effect keys. When the completed mutation was permit-authorized,
exact replay MUST also return the prior OperationReceipt recorded in that
revision and MUST NOT mint a new receipt.
(Previously: replay converged on state/effects only; K2.1b binds receipt
identity to the same revision.)

#### Scenario: Exact replay after successful CAS

- GIVEN a successful CAS from revision R to state N with recorded journal keys
- WHEN the same CAS inputs are reconciled or replayed
- THEN the authoritative head MUST remain N
- AND completed effects MUST NOT execute again

#### Scenario: Stale expected revision is rejected

- GIVEN the head revision advanced beyond R
- WHEN `compareAndSwap(S, R, nextState)` runs
- THEN the call MUST fail closed as stale or conflict
- AND the head MUST remain unchanged

#### Scenario: Exact replay returns prior OperationReceipt

- GIVEN a successful permit-authorized CAS that recorded OperationReceipt Rc
- WHEN the same CAS inputs are reconciled or replayed
- THEN the runtime MUST return Rc
- AND MUST NOT emit a distinct second OperationReceipt
