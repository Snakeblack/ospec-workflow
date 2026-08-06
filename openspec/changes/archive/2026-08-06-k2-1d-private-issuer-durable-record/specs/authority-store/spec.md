# authority-store Specification Delta

## Purpose

Encapsulate permit issuer capability from public exposure, unify state, journal, authority bag, and budgets into a single atomic CAS durable record, and provide crash-safe filesystem durability without manual snapshot recovery.

## Requirements

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

The `AuthorityStore` MUST commit authoritative `state`, `journal`, `authority` bag, and `budgets` as a single atomic CAS record. A successful `compareAndSwap` MUST update all four components together in a single atomic transaction. The store MUST NOT treat `authority` bag or `budgets` as separate, out-of-band, or detached post-CAS state.

#### Scenario: Single atomic CAS record commit

- GIVEN a valid CAS mutation payload containing updated state, journal, authority bag, and budgets
- WHEN `compareAndSwap` executes successfully
- THEN state, journal, authority bag, and budgets MUST all be committed in the winning head revision
- AND reading the head record MUST return all four components in a consistent state

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
