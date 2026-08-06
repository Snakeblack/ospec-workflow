Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: Low

# Tasks: Private Runtime, Real Durable CAS & Crash-Safe Recovery

## Phase 1: Private Kernel Runtime Closure & Accessor Removal (TDD)

- [x] **Task 1.1**: Remove `_createPermitAuthorityIssuerInternal` from `permits.js` exports
  - **Files**: `scripts/lib/lifecycle-kernel/permits.js`
  - **Requirement**: REQ-authority-store-014
  - **Description**: Remove `_createPermitAuthorityIssuerInternal` from `module.exports` in `permits.js` while retaining `createPermitAuthorityIssuer` as a module-internal helper.

- [x] **Task 1.2**: Remove `getPrivateIssuer` from exports and runtime interfaces
  - **Files**: `scripts/lib/authority-store/index.js`, `scripts/lib/lifecycle-kernel/index.js`
  - **Requirement**: REQ-authority-store-014, REQ-lifecycle-kernel-024
  - **Description**: Remove `getPrivateIssuer` from `authority-store` and `lifecycle-kernel` exports, as well as `STORE_ISSUERS` WeakMap reflection and `createAuthorityRuntime()`.

- [x] **Task 1.3**: Implement `createKernelRuntime(options)` with encapsulated private closure
  - **Files**: `scripts/lib/lifecycle-kernel/index.js`
  - **Requirement**: REQ-lifecycle-kernel-024, REQ-authority-store-014
  - **Description**: Create `createKernelRuntime(options)` holding `permitIssuer` strictly inside private closure scope, returning `{ runOperation, issuePermitForSelectedTransition, getStatus, snapshot }`.

## Phase 2: Durable Convergent CAS & Post-CAS Receipt Revision Binding (TDD)

- [x] **Task 2.1**: Update `AuthorityStore.compareAndSwap` convergent path to call `inner.commit`
  - **Files**: `scripts/lib/authority-store/index.js`
  - **Requirement**: REQ-authority-store-015
  - **Description**: In `compareAndSwapLocked`, update convergent heal branch to execute `await entry.inner.commit({ state: loaded.state, journal: loaded.journal, authority: nextAuthority, budgets: entry.budgets })` before returning `ok: true`.

- [x] **Task 2.2**: Bind winning post-CAS revision `R1` to `receipt.revision` in `runKernelOperation`
  - **Files**: `scripts/lib/lifecycle-kernel/index.js`
  - **Requirement**: REQ-lifecycle-kernel-023
  - **Description**: Set `receipt.revision = "pending"` pre-CAS, pass into CAS, and assign winning post-CAS revision `cas.revision` (R1) to `receipt.revision` upon successful commit.

## Phase 3: Multi-Instance Cross-Process CAS & Windows .bak Recovery (TDD)

- [x] **Task 3.1**: Implement `withFileLock` helper and multi-instance CAS revision checking in `FileSystemStore`
  - **Files**: `scripts/lib/filesystem-store.js`
  - **Requirement**: REQ-authority-store-016
  - **Description**: Add `withFileLock` using `.lock` lockfile with backoff, stale lock cleanup, and `finally` release. Update `FileSystemStore.commit(...)` to check on-disk `expectedRevision` inside the lock, returning `{ ok: false, code: "cas-conflict", revision: currentRevision }` on mismatch.

- [x] **Task 3.2**: Implement resilient `.bak` recovery in `FileSystemStore.load()`
  - **Files**: `scripts/lib/filesystem-store.js`
  - **Requirement**: REQ-authority-store-017
  - **Description**: Update `load()` to catch `ENOENT` on primary file, inspect `filePath + ".bak"`, and if present, restore target using `renameWithFallback`, populating cache and returning the restored record. Fail closed if both are missing.

## Phase 4: Adversarial & Integration Test Suite (TDD)

- [x] **Task 4.1**: Add export non-leakage tests
  - **Files**: `scripts/lib/authority-store/index.test.js`, `scripts/lib/lifecycle-kernel/index.test.js`
  - **Requirement**: REQ-authority-store-014, REQ-lifecycle-kernel-024
  - **Description**: Verify `getPrivateIssuer` and `_createPermitAuthorityIssuerInternal` are `undefined` on all module exports and runtime objects.

- [x] **Task 4.2**: Add multi-instance CAS concurrency test
  - **Files**: `scripts/lib/filesystem-store.test.js`
  - **Requirement**: REQ-authority-store-016
  - **Description**: Test 2 separate `FileSystemStore` instances pointing to the same R0 file concurrently attempting `compareAndSwap`, verifying 1 succeeds and 1 fails with `cas-conflict`.

- [x] **Task 4.3**: Add convergent authority heal durability test
  - **Files**: `scripts/lib/authority-store/index.test.js`
  - **Requirement**: REQ-authority-store-015
  - **Description**: Verify authority bag updates in convergent CAS persist to disk and survive process/store re-initialization.

- [x] **Task 4.4**: Add `.bak` recovery test
  - **Files**: `scripts/lib/filesystem-store.test.js`
  - **Requirement**: REQ-authority-store-017
  - **Description**: Simulate process crash between atomic rename step 1 and step 2 (where primary is ENOENT and `.bak` exists) and verify `load()` restores state without data loss.

- [x] **Task 4.5**: Assert `OperationReceipt.revision === cas.revision` (R1) in kernel integration tests
  - **Files**: `scripts/lib/lifecycle-kernel/index.test.js`
  - **Requirement**: REQ-lifecycle-kernel-023
  - **Description**: Assert that returned `OperationReceipt.revision` equals `cas.revision` (R1) post-CAS and on replayed operations.
