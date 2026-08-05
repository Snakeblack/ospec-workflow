# authority-store Specification

## Purpose

Provide a mandatory compare-and-swap Authority Store so concurrent writers cannot
race from the same revision, while preserving existing journal/commit history as
the durable record under the CAS mutation contract.

## Requirements

### Requirement: Load Returns State And Revision {#REQ-authority-store-001}

The Authority Store MUST expose `load(subjectId)` that returns the subject's
authoritative state together with a stable `revision` digest for that head. A
missing subject MUST fail closed with a stable reason code and MUST NOT invent a
revision.

#### Scenario: Load returns head revision

- GIVEN an authoritative subject with committed state
- WHEN `load(subjectId)` runs
- THEN the response MUST include that state
- AND MUST include a non-empty revision digest for the current head

#### Scenario: Missing subject fails closed

- GIVEN a subjectId with no store entry
- WHEN `load(subjectId)` runs
- THEN the call MUST fail closed with a stable reason code
- AND MUST NOT return a fabricated revision

### Requirement: Compare And Swap Is The Mutation Contract {#REQ-authority-store-002}

Authoritative subject mutation MUST go through
`compareAndSwap(subjectId, expectedRevision, nextState)`. A successful CAS MUST
advance the head only when `expectedRevision` equals the current head revision.
CAS MUST wrap or replace bare `commit` as the public mutation API for
authoritative subjects; journal history MUST remain intact.

#### Scenario: Matching revision commits next state

- GIVEN `load` returned revision R for subject S
- WHEN `compareAndSwap(S, R, nextState)` runs
- THEN the store MUST persist nextState as the new head
- AND the new head revision MUST differ from R

#### Scenario: Bare commit is not a public mutation path

- GIVEN an authoritative subject mutation attempt that bypasses `compareAndSwap`
- WHEN the public store API is invoked
- THEN the attempt MUST be rejected or unreachable
- AND no authoritative head MUST advance

### Requirement: Single Writer Wins On Expected Revision {#REQ-authority-store-003}

When two writers supply the same `expectedRevision`, at most one CAS MUST
succeed. The loser MUST receive a CAS-conflict failure with a stable reason code
and the current head revision. A CAS conflict MUST NOT restart work, MUST NOT
inflate budgets, and MUST NOT silently apply `nextState`.

#### Scenario: Concurrent writers race on same revision

- GIVEN two writers both loaded revision R for subject S
- WHEN both call `compareAndSwap(S, R, …)` with distinct next states
- THEN exactly one call MUST succeed
- AND the other MUST fail with a CAS-conflict reason
- AND budgets and attempt counters MUST remain unchanged by the conflict

### Requirement: Exact Replay Converges On Same Revision {#REQ-authority-store-004}

Replaying the same successful CAS inputs against the same pre-CAS revision MUST
converge to the same post-state digest. Exact replay MUST NOT invent a second
head advance when the journal already records the completed mutation for that
revision and effect keys. When the completed mutation was permit-authorized,
exact replay MUST also return the prior OperationReceipt recorded in that
revision and MUST NOT mint a new receipt.
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
