# Delta for Authority Store

## MODIFIED Requirements

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

---

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
