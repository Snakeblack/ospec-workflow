Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: Low

# Tasks: Close Authority Surface and Real Backend CAS

## Phase 1: Test Support Module & Public Surface Encapsulation (TDD)

- [ ] Task 1.1: Create `scripts/lib/test-support/permit-test-helpers.js` exporting permit minting functions for internal unit tests.
  - [ ] Create `scripts/lib/test-support/permit-test-helpers.js` exporting `createTestPermitIssuer`, `mintTestPermit`, and `issueTestPermit`.
  - [ ] Support direct permit creation strictly for internal test suites without exposing functions to production exports.
  - [ ] Satisfies `REQ-lifecycle-kernel-026`.

- [ ] Task 1.2: Remove `_internalCreateIssuer`, `mintOperationPermit`, `issueOperationPermit`, `isPermitAuthorityIssuer`, `runKernelOperation` from production exports in `permits.js` and `lifecycle-kernel/index.js`. Ensure `createKernelRuntime` is sole public production entrypoint.
  - [ ] Refactor `scripts/lib/lifecycle-kernel/permits.js` to unexport internal permit minting and validation functions from `module.exports`.
  - [ ] Refactor `scripts/lib/lifecycle-kernel/index.js` to expose only `createKernelRuntime` as the primary production entrypoint.
  - [ ] Update internal references and test suite imports to use `scripts/lib/test-support/permit-test-helpers.js` or `createKernelRuntime`.
  - [ ] Satisfies `REQ-lifecycle-kernel-025`.

## Phase 2: Backend CAS expectedRevision & Fail-Closed Load (TDD)

- [ ] Task 2.1: Update `AuthorityStore.compareAndSwap` to pass `expectedRevision: currentRevision` to `inner.commit(...)` in both normal CAS and convergent heal paths.
  - [ ] Modify `AuthorityStore.compareAndSwap` in `scripts/lib/authority-store/index.js` to pass `expectedRevision: currentRevision` in `entry.inner.commit(...)` during normal CAS commits.
  - [ ] Modify convergent heal path in `AuthorityStore.compareAndSwap` to pass `expectedRevision: currentRevision` to `entry.inner.commit(...)`.
  - [ ] Satisfies `REQ-authority-store-018`.

- [ ] Task 2.2: Update `FileSystemStore.commit(...)` to check `expectedRevision === currentRevision` inside lockfile and return `{ ok: false, code: "cas-conflict", revision: currentRevision }` if mismatched.
  - [ ] Read current state from disk under lock in `FileSystemStore.commit(...)` in `scripts/lib/filesystem-store.js`.
  - [ ] Compare `expectedRevision` against `currentRevision` computed from disk state.
  - [ ] Return `{ ok: false, code: "cas-conflict", revision: currentRevision }` without modifying disk files if `expectedRevision !== currentRevision`.
  - [ ] Satisfies `REQ-authority-store-018`.

- [ ] Task 2.3: Update `FileSystemStore.load()` to throw/return `authority-head-not-found` when primary file and `.bak` file are both `ENOENT` unless `initializeIfMissing: true` is explicitly provided.
  - [ ] Add `initializeIfMissing: boolean` (defaulting to `false`) option to `createFileSystemStore`.
  - [ ] Update `load()` in `scripts/lib/filesystem-store.js` to check if both primary state file and backup `.bak` file return `ENOENT`.
  - [ ] Fail closed by throwing/returning `authority-head-not-found` when missing unless `initializeIfMissing === true`.
  - [ ] Satisfies `REQ-authority-store-019`.

## Phase 3: Lockfile Owner Token Teardown Safety (TDD)

- [ ] Task 3.1: Update `withFileLock` in `FileSystemStore.js` to write JSON `{ ownerToken, pid, timestamp }` to `.lock` file and check `ownerToken` before unlinking in `finally`.
  - [ ] Generate unique `ownerToken` (e.g. using `crypto.randomUUID()`) in `withFileLock`.
  - [ ] Write JSON string `{ ownerToken, pid: process.pid, timestamp: Date.now() }` into `.lock` file on acquisition.
  - [ ] Read `.lock` file content in `finally` cleanup block and parse JSON payload.
  - [ ] Unlink `.lock` file strictly if `lockData.ownerToken === ownerToken`.
  - [ ] Satisfies `REQ-authority-store-020`.

## Phase 4: Adversarial & Integration Test Suite (TDD)

- [ ] Task 4.1: Add export non-leakage tests checking `runKernelOperation` and `_internalCreateIssuer` are undefined on production exports.
  - [ ] Create/update test suite in `scripts/lib/lifecycle-kernel/index.test.js` or `scripts/lib/export-surface.test.js`.
  - [ ] Assert `_internalCreateIssuer`, `mintOperationPermit`, `issueOperationPermit`, `isPermitAuthorityIssuer`, and `runKernelOperation` are `undefined` on `lifecycle-kernel` exports.
  - [ ] Assert `createKernelRuntime` is defined and functional.
  - [ ] Satisfies `REQ-lifecycle-kernel-025`.

- [ ] Task 4.2: Add concurrent race test using `Promise.all` with a barrier/latch ensuring 2 separate `FileSystemStore` instances read R0 before either commits (verify 1 ok, 1 cas-conflict).
  - [ ] Add race test in `scripts/lib/filesystem-store.test.js`.
  - [ ] Setup two separate `FileSystemStore` instances targeting the same underlying disk state file.
  - [ ] Synchronize both instances to read head revision R0 before issuing concurrent commits via `Promise.all`.
  - [ ] Assert exactly one commit succeeds with `{ ok: true, revision: R1 }` and one commit fails with `{ ok: false, code: "cas-conflict", revision: R1 }`.
  - [ ] Satisfies `REQ-authority-store-018`.

- [ ] Task 4.3: Add fail-closed test when deleting primary and `.bak` files.
  - [ ] Add test cases in `scripts/lib/filesystem-store.test.js`.
  - [ ] Remove primary state file and `.bak` backup file.
  - [ ] Call `load()` with default options (`initializeIfMissing: false`) and verify error code `authority-head-not-found` is thrown/returned.
  - [ ] Call `load()` with `initializeIfMissing: true` and verify default initial record is returned.
  - [ ] Satisfies `REQ-authority-store-019`.

- [ ] Task 4.4: Add lockfile owner token safety tests.
  - [ ] Add lockfile teardown unit tests in `scripts/lib/filesystem-store.test.js`.
  - [ ] Verify normal teardown with matching `ownerToken` successfully deletes `.lock`.
  - [ ] Verify teardown with mismatched `ownerToken` (simulating active lock replaced by another process) does not delete `.lock`.
  - [ ] Verify stale lock recovery behavior works safely.
  - [ ] Satisfies `REQ-authority-store-020`.
