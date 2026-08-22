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

When two writers supply the same `expectedRevision`, at most one CAS MUST succeed. The loser MUST receive a CAS-conflict failure with a stable reason code and the current head revision. A CAS conflict MUST NOT restart work, MUST NOT inflate budgets, and MUST NOT silently apply `nextState`. The Authority Store MUST provide multi-writer isolation during two-phase mid-op writes: `commitJournal` MUST perform a merge-safe upsert by `effect_id` across `AuthorityStore`, `MemoryStore`, and `FileSystemStore`, preventing duplicate journal records on retries. `commitJournal` MUST index and manage `mid_op_ticket` instances per writer/revision (keyed by token, `fromRevision`, and `stateDigest`) without allowing concurrent writers to destructively overwrite or invalidate tickets issued to other in-flight writers. When a writer wins the CAS race, the store MUST remove ONLY the winning ticket (`entry.midOpTickets.delete(midOpTicket)`), explicitly preserving the tickets of concurrent peer writers so they can be reconciled on subsequent CAS attempts. The loser of a CAS race MUST retain its durable journal records and carry-over state without corrupting concurrent operations.
(Previously: Multi-writer isolation indexed mid-op tickets but did not enforce merge-safe upsert by effect_id in commitJournal or require deleting only the winning ticket while preserving peer tickets upon CAS commit.)

#### Scenario: Concurrent writers race on same revision

- GIVEN two writers both loaded revision R for subject S
- WHEN both call `compareAndSwap(S, R, …)` with distinct next states
- THEN exactly one call MUST succeed
- AND the other MUST fail with a CAS-conflict reason
- AND budgets and attempt counters MUST remain unchanged by the conflict

#### Scenario: Multi-writer mid-op ticket isolation during concurrent commitJournal

- GIVEN two concurrent writers W1 and W2 both operating on baseline revision R0
- WHEN W1 calls `commitJournal` obtaining ticket T1 and subsequently W2 calls `commitJournal` obtaining ticket T2
- THEN the store MUST preserve ticket T1 alongside ticket T2
- AND W1 calling `compareAndSwap` with ticket T1 MUST NOT fail due to ticket overwrite by W2

#### Scenario: Winning CAS deletes winning ticket while preserving concurrent peer tickets

- GIVEN active mid-op tickets T1 for writer W1 and T2 for writer W2 under subject S
- WHEN writer W1 successfully commits `compareAndSwap` using ticket T1
- THEN the store MUST delete ticket T1 via `midOpTickets.delete(T1)`
- AND MUST preserve ticket T2 in `midOpTickets` for writer W2

#### Scenario: Merge-safe commitJournal upserts journal records by effect_id

- GIVEN a store with existing journal entries containing `effect_id: "eff-101"`
- WHEN `commitJournal` is invoked with a journal payload containing `effect_id: "eff-101"` and new entries
- THEN the store MUST merge and upsert the entry matching `eff-101` without duplicating records
- AND MUST append any new distinct effect entries

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


### Requirement: Permit Issuer Encapsulation {#REQ-authority-store-010}

The public `AuthorityStore` interface MUST NOT expose `getPermitIssuer()` or any method that leaks internal permit minting capabilities. The public interface MUST NOT export `PERMIT_AUTHORITY_ISSUER` symbol or `createPermitAuthorityIssuer` factory. Permit minting capabilities MUST remain encapsulated within internal runtime composition.

#### Scenario: getPermitIssuer is not exposed on public store

- GIVEN an initialized `AuthorityStore` instance
- WHEN its public properties and methods are inspected
- THEN `getPermitIssuer` MUST be undefined
- AND no public accessor MUST expose the internal permit issuer capability

#### Scenario: Permit authority symbols and factories are not exported publicly

- GIVEN the public export surface of `authority-store` and `permits` modules
- WHEN external callers attempt to import `PERMIT_AUTHORITY_ISSUER` or `createPermitAuthorityIssuer`
- THEN the exports MUST NOT be present on the public module interface

### Requirement: Unified Atomic CAS Record {#REQ-authority-store-011}

The `AuthorityStore` MUST commit authoritative `state`, `journal`, `authority` bag, and `budgets` as a single atomic CAS record. A successful `compareAndSwap` MUST update all four components together in a single atomic transaction. Journal entries in the atomic commit MUST be deduplicated and merged by `effect_id`. The store MUST NOT treat `authority` bag or `budgets` as separate, out-of-band, or detached post-CAS state. Mid-op journal durability and ticket life cycles MUST participate strictly in the atomic record boundary: completing a successful CAS MUST remove only the winning `midOpTicket` (`entry.midOpTickets.delete(midOpTicket)`), preserving concurrent peer tickets and without leaving desynchronized revisions across concurrent branches.
(Previously: Unified atomic CAS committed the four components but did not require merge-safe journal upsert by effect_id or preserving peer midOpTickets upon winning ticket deletion.)

#### Scenario: Single atomic CAS record commit

- GIVEN a valid CAS mutation payload containing updated state, journal, authority bag, and budgets
- WHEN `compareAndSwap` executes successfully
- THEN state, journal, authority bag, and budgets MUST all be committed in the winning head revision
- AND reading the head record MUST return all four components in a consistent state

#### Scenario: Atomic commit cleans up matched mid-op ticket without invalidating concurrent writer tickets

- GIVEN an Authority Store holding active mid-op tickets for writer W1 and writer W2
- WHEN writer W1 completes a successful atomic `compareAndSwap` using ticket T1
- THEN the store MUST commit state, journal, authority bag, and budgets atomically
- AND MUST remove ticket T1 while preserving ticket T2 for writer W2

#### Scenario: Atomic CAS merges journal records by effect_id

- GIVEN a CAS mutation payload with journal entries where some effect IDs already exist in the committed journal
- WHEN `compareAndSwap` executes successfully
- THEN the store MUST merge journal entries by `effect_id` atomically
- AND the committed journal MUST NOT contain duplicate entries for the same `effect_id`

### Requirement: Crash-Safe Durability {#REQ-authority-store-012}

When backed by `FileSystemStore`, persistence MUST provide crash-safe durability. Writes MUST follow a strict sequence: write data to a temporary file, perform an `fsync` flush on the temporary file descriptor, perform an atomic rename to the target head path, and perform a directory `fsync` on the parent directory.

#### Scenario: Crash before atomic rename leaves previous head intact

- GIVEN a pending CAS write operation to `FileSystemStore`
- WHEN process crash or failure occurs before the atomic rename step
- THEN the target head path MUST retain its previous committed head record intact
- AND incomplete temporary files MUST NOT be treated as valid state

#### Scenario: Crash after atomic rename leaves new head intact

- GIVEN a CAS write operation to `FileSystemStore` that completes temp write, temp fsync, and atomic rename
- WHEN process crash or system reboot occurs after rename and directory fsync
- THEN subsequent store initialization MUST read the new committed head revision intact without data corruption

### Requirement: Restart Preservation of Authority Bag {#REQ-authority-store-013}

The `AuthorityStore` MUST preserve the `authority` bag across process restart directly from disk persistence. Reloading the store from disk MUST automatically restore the authoritative state, journal, authority bag, and budgets without requiring manual snapshot extraction or out-of-band state copying.

#### Scenario: Authority bag restored on restart without manual snapshot

- GIVEN an `AuthorityStore` instance with committed state and authority bag entries
- WHEN the process terminates and a new store instance is loaded from the existing disk location
- THEN the authority bag MUST be fully restored alongside state and journal
- AND recovery MUST NOT require invoking manual `snapshot()` extraction

### Requirement: Accessor Removal & Private Closure {#REQ-authority-store-014}

`getPrivateIssuer` MUST NOT be exported by any module (`authority-store`, `lifecycle-kernel`, etc.) or returned on store or runtime objects. Permit issuance capability MUST be encapsulated strictly within the `createKernelRuntime` private closure.

#### Scenario: getPrivateIssuer is not exported on any module or object

- GIVEN the public export surfaces of `authority-store` and `lifecycle-kernel`
- WHEN inspecting exports or initialized store/runtime objects
- THEN `getPrivateIssuer` MUST be undefined
- AND no accessor MUST expose the internal permit issuer capability

#### Scenario: Permit issuance encapsulated within createKernelRuntime closure

- GIVEN a kernel runtime initialized via `createKernelRuntime`
- WHEN operations require permit issuance and transition authorization
- THEN permit issuance MUST occur internally within the runtime closure
- AND external callers MUST NOT be able to extract the permit issuer capability object

### Requirement: Durable Convergent CAS Commit {#REQ-authority-store-015}

When `compareAndSwap` resolves a convergent heal (where state and journal match existing records but the authority bag or budgets require update), it MUST execute `inner.commit({ state, journal, authority, budgets })` before returning success to ensure durability.

#### Scenario: Convergent heal executes inner commit before returning success

- GIVEN a CAS attempt matching committed state and journal but with updated authority bag entries
- WHEN `compareAndSwap` evaluates the convergent heal path
- THEN the store MUST execute `inner.commit({ state, journal, authority, budgets })`
- AND MUST NOT return success until the inner commit has persisted the updated authority bag

#### Scenario: Convergent heal updates authority bag and persists across restart

- GIVEN a convergent heal CAS operation that completes successfully
- WHEN the process restarts and re-initializes the `AuthorityStore`
- THEN the reloaded store MUST reflect the updated authority bag from disk

### Requirement: Multi-Instance Cross-Process CAS {#REQ-authority-store-016}

`FileSystemStore` MUST serialize concurrent writes across processes using a `.lock` file or atomic revision check. Two store instances in separate processes attempting `compareAndSwap` against the same pre-CAS revision `R0` MUST result in exactly one successful commit and one `cas-conflict` rejection.

#### Scenario: Concurrent cross-process CAS against same revision results in one winner and one conflict

- GIVEN two distinct `FileSystemStore` instances (in the same or separate processes) referencing the same underlying storage location at revision R0
- WHEN both instances attempt `compareAndSwap` with distinct state updates against R0 concurrently
- THEN exactly one CAS attempt MUST succeed and advance head to R1
- AND the other CAS attempt MUST fail with a `cas-conflict` error code

#### Scenario: Lockfile serialization prevents race conditions between process instances

- GIVEN a `FileSystemStore` write operation in progress holding the `.lock` file
- WHEN a second process instance attempts a `compareAndSwap` write
- THEN the second instance MUST await or observe the lock file / revision check
- AND MUST reject the write with `cas-conflict` if the revision advanced while locked

### Requirement: Windows Fallback Recovery {#REQ-authority-store-017}

`FileSystemStore.load()` MUST inspect and recover from `filePath + ".bak"` if primary `filePath` returns `ENOENT`, preventing accidental lifecycle re-initialization due to interrupted atomic renames on Windows file systems.

#### Scenario: Primary file missing recovers from backup file

- GIVEN a store directory where primary `filePath` is missing (`ENOENT`) but `filePath + ".bak"` exists
- WHEN `FileSystemStore.load()` is invoked
- THEN `load()` MUST recover state and revision from `filePath + ".bak"`
- AND MUST restore `filePath` from `.bak` to maintain state continuity

#### Scenario: Missing primary and missing backup fails closed without re-initialization

- GIVEN a subject ID where neither `filePath` nor `filePath + ".bak"` exists
- WHEN `FileSystemStore.load()` is invoked
- THEN `load()` MUST fail closed with a missing-subject error
- AND MUST NOT invent an initial blank revision or re-initialize state automatically
