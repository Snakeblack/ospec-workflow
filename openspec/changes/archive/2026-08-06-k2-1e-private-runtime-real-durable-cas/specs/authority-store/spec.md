# authority-store Specification

## Added Requirements

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
