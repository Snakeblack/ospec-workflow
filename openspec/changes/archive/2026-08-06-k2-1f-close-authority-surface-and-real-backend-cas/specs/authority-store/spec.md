# authority-store Specification Delta

## Purpose

Enforce strict verification of `expectedRevision` in backend CAS commits, prevent silent state re-initialization on missing authority records, and secure lockfile ownership tearing down.

## Requirements

### Requirement: Backend CAS ExpectedRevision Verification {#REQ-authority-store-018}

`AuthorityStore.compareAndSwap` MUST pass `expectedRevision: currentRevision` to `inner.commit(...)` in both normal CAS and convergent authority heal paths. `FileSystemStore.commit` MUST check `expectedRevision === currentRevision` inside the lockfile before persisting state.

#### Scenario: Normal CAS passes expectedRevision to inner commit

- GIVEN an `AuthorityStore` instance evaluating a normal `compareAndSwap` call with head revision R0
- WHEN `compareAndSwap` delegates to `inner.commit(...)`
- THEN it MUST explicitly pass `expectedRevision: R0` in the options object to `inner.commit`

#### Scenario: Convergent heal path passes expectedRevision to inner commit

- GIVEN an `AuthorityStore` instance evaluating a convergent authority heal path with head revision R0
- WHEN `compareAndSwap` delegates to `inner.commit(...)` to persist updated authority bag or budgets
- THEN it MUST explicitly pass `expectedRevision: R0` in the options object to `inner.commit`

#### Scenario: FileSystemStore commit verifies expectedRevision inside lockfile

- GIVEN a `FileSystemStore` executing `commit(...)` while holding `.lock`
- WHEN `expectedRevision` is provided in commit options
- THEN `FileSystemStore.commit` MUST compare `expectedRevision` against `currentRevision` read under lock
- AND IF `expectedRevision !== currentRevision`, `commit` MUST fail closed with `cas-conflict` without mutating disk state

#### Scenario: AuthorityStore propagates backend commit conflict

- GIVEN an `AuthorityStore` calling `inner.commit(...)` during `compareAndSwap`
- WHEN `inner.commit(...)` returns an un-successful result (e.g. `{ ok: false, code: "cas-conflict", revision }`)
- THEN `AuthorityStore` MUST NOT update its local authority bag or baselines
- AND MUST propagate the failed commit result directly to the caller with original `budgets`

### Requirement: Fail-Closed on Missing Authority Records {#REQ-authority-store-019}

`FileSystemStore.load()` MUST NOT re-initialize state to `defaultRecord()` when both primary and `.bak` files are missing, unless `initializeIfMissing: true` is explicitly provided. In normal operation, missing records MUST fail closed with `authority-head-not-found`.

#### Scenario: Missing primary and backup files fail closed by default

- GIVEN a `FileSystemStore` instance where neither `filePath` nor `filePath + ".bak"` exists
- AND `initializeIfMissing` is `false` or unprovided
- WHEN `load()` is executed
- THEN `load()` MUST fail closed with reason `authority-head-not-found`
- AND MUST NOT re-initialize state to `defaultRecord()` or invent an initial revision

#### Scenario: Explicit initializeIfMissing allows initial state creation

- GIVEN a `FileSystemStore` instance initialized with `initializeIfMissing: true`
- AND neither `filePath` nor `filePath + ".bak"` exists
- WHEN `load()` is executed
- THEN `load()` MAY return a default initial state record with a fresh initial head revision

### Requirement: Lockfile Owner Token & Safe Unlink {#REQ-authority-store-020}

`FileSystemStore` `withFileLock` MUST store a JSON object containing `{ ownerToken, pid, timestamp }` in `.lock`. Unlinking in `finally` or during stale lock inspection MUST only occur if the lockfile content matches current `ownerToken` or is verified via valid token inspection without racing active locks.

#### Scenario: Lockfile carries JSON owner metadata

- GIVEN a `FileSystemStore` acquiring a lock via `withFileLock`
- WHEN the `.lock` file is created or written to disk
- THEN the lockfile content MUST be a valid JSON object containing `ownerToken`, `pid`, and `timestamp`

#### Scenario: Safe lock teardown verifies ownerToken match

- GIVEN a process executing `withFileLock` with assigned `ownerToken`
- WHEN `withFileLock` enters its `finally` cleanup block
- THEN it MUST read the current content of `.lock`
- AND MUST unlink `.lock` strictly if the `ownerToken` in the lockfile matches the process's `ownerToken`
- AND MUST NOT unlink `.lock` if the file is missing or contains a different `ownerToken`

#### Scenario: Stale lock recovery fails closed with stale-lock-recovery-required

- GIVEN a process attempting lock acquisition on a stale `.lock` file owned by a dead process
- WHEN evaluating lock staleness
- THEN `withFileLock` MUST fail closed by throwing an error with code `stale-lock-recovery-required`
- AND MUST NOT attempt automatic in-place recovery or unsafe renaming of `.lock` files
- AND MUST NOT unlink `.lock` files owned by active or changed processes



