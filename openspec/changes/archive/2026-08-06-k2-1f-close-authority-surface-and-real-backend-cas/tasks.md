Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: Low

# Tasks: Close Authority Surface and Real Backend CAS

## Phase 1: Test Support Module & Public Surface Encapsulation (TDD)

- [x] Task 1.1: Create `scripts/lib/test-support/permit-test-helpers.js` exporting permit minting functions for internal unit tests.
  - [x] Create `scripts/lib/test-support/permit-test-helpers.js` exporting `createTestPermitIssuer`, `mintTestPermit`, and `issueTestPermit`.
  - [x] Support direct permit creation strictly for internal test suites without exposing functions to production exports.
  - [x] Satisfies `REQ-lifecycle-kernel-026`.

- [x] Task 1.2: Remove `_internalCreateIssuer`, `mintOperationPermit`, `issueOperationPermit`, `isPermitAuthorityIssuer`, `runKernelOperation` from production exports in `permits.js` and `lifecycle-kernel/index.js`. Ensure `createKernelRuntime` is sole public production entrypoint.
  - [x] Refactor `scripts/lib/lifecycle-kernel/permits.js` to unexport internal permit minting and validation functions from `module.exports`.
  - [x] Refactor `scripts/lib/lifecycle-kernel/index.js` to expose only `createKernelRuntime` as the primary production entrypoint.
  - [x] Update internal references and test suite imports to use `scripts/lib/test-support/permit-test-helpers.js` or `createKernelRuntime`.
  - [x] Satisfies `REQ-lifecycle-kernel-025`.

## Phase 2: Backend CAS expectedRevision & Fail-Closed Load (TDD)

- [x] Task 2.1: Update `AuthorityStore.compareAndSwap` to pass `expectedRevision: currentRevision` to `inner.commit(...)` in both normal CAS and convergent heal paths.
  - [x] Modify `AuthorityStore.compareAndSwap` in `scripts/lib/authority-store/index.js` to pass `expectedRevision: currentRevision` in `entry.inner.commit(...)` during normal CAS commits.
  - [x] Modify convergent heal path in `AuthorityStore.compareAndSwap` to pass `expectedRevision: currentRevision` to `entry.inner.commit(...)`.
  - [x] Satisfies `REQ-authority-store-018`.

- [x] Task 2.2: Update `FileSystemStore.commit(...)` to check `expectedRevision === currentRevision` inside lockfile and return `{ ok: false, code: "cas-conflict", revision: currentRevision }` if mismatched.
  - [x] Read current state from disk under lock in `FileSystemStore.commit(...)` in `scripts/lib/filesystem-store.js`.
  - [x] Compare `expectedRevision` against `currentRevision` computed from disk state.
  - [x] Return `{ ok: false, code: "cas-conflict", revision: currentRevision }` without modifying disk files if `expectedRevision !== currentRevision`.
  - [x] Satisfies `REQ-authority-store-018`.

- [x] Task 2.3: Update `FileSystemStore.load()` to throw/return `authority-head-not-found` when primary file and `.bak` file are both `ENOENT` unless `initializeIfMissing: true` is explicitly provided.
  - [x] Add `initializeIfMissing: boolean` (defaulting to `false`) option to `createFileSystemStore`.
  - [x] Update `load()` in `scripts/lib/filesystem-store.js` to check if both primary state file and backup `.bak` file return `ENOENT`.
  - [x] Fail closed by throwing/returning `authority-head-not-found` when missing unless `initializeIfMissing === true`.
  - [x] Satisfies `REQ-authority-store-019`.

## Phase 3: Lockfile Owner Token Teardown Safety (TDD)

- [x] Task 3.1: Update `withFileLock` in `FileSystemStore.js` to write JSON `{ ownerToken, pid, timestamp }` to `.lock` file and check `ownerToken` before unlinking in `finally`.
  - [x] Generate unique `ownerToken` (e.g. using `crypto.randomUUID()`) in `withFileLock`.
  - [x] Write JSON string `{ ownerToken, pid: process.pid, timestamp: Date.now() }` into `.lock` file on acquisition.
  - [x] Read `.lock` file content in `finally` cleanup block and parse JSON payload.
  - [x] Unlink `.lock` file strictly if `lockData.ownerToken === ownerToken`.
  - [x] Satisfies `REQ-authority-store-020`.

## Phase 4: Adversarial & Integration Test Suite (TDD)

- [x] Task 4.1: Add export non-leakage tests checking `runKernelOperation` and `_internalCreateIssuer` are undefined on production exports.
  - [x] Create/update test suite in `scripts/lib/lifecycle-kernel/index.test.js` or `scripts/lib/export-surface.test.js`.
  - [x] Assert `_internalCreateIssuer`, `mintOperationPermit`, `issueOperationPermit`, `isPermitAuthorityIssuer`, and `runKernelOperation` are `undefined` on `lifecycle-kernel` exports.
  - [x] Assert `createKernelRuntime` is defined and functional.
  - [x] Satisfies `REQ-lifecycle-kernel-025`.

- [x] Task 4.2: Add concurrent race test using `Promise.all` with a barrier/latch ensuring 2 separate `FileSystemStore` instances read R0 before either commits (verify 1 ok, 1 cas-conflict).
  - [x] Add race test in `scripts/lib/filesystem-store.test.js`.
  - [x] Setup two separate `FileSystemStore` instances targeting the same underlying disk state file.
  - [x] Synchronize both instances to read head revision R0 before issuing concurrent commits via `Promise.all`.
  - [x] Assert exactly one commit succeeds with `{ ok: true, revision: R1 }` and one commit fails with `{ ok: false, code: "cas-conflict", revision: R1 }`.
  - [x] Satisfies `REQ-authority-store-018`.

- [x] Task 4.3: Add fail-closed test when deleting primary and `.bak` files.
  - [x] Add test cases in `scripts/lib/filesystem-store.test.js`.
  - [x] Remove primary state file and `.bak` backup file.
  - [x] Call `load()` with default options (`initializeIfMissing: false`) and verify error code `authority-head-not-found` is thrown/returned.
  - [x] Call `load()` with `initializeIfMissing: true` and verify default initial record is returned.
  - [x] Satisfies `REQ-authority-store-019`.

- [x] Task 4.4: Add lockfile owner token safety tests.
  - [x] Add lockfile teardown unit tests in `scripts/lib/filesystem-store.test.js`.
  - [x] Verify normal teardown with matching `ownerToken` successfully deletes `.lock`.
  - [x] Verify teardown with mismatched `ownerToken` (simulating active lock replaced by another process) does not delete `.lock`.
  - [x] Verify stale lock recovery behavior works safely.
  - [x] Satisfies `REQ-authority-store-020`.

## Phase 5: KernelRuntime Permit Issuer Isolation & AuthorityStore CAS Propagation Patches

- [x] Task 5.1: `KernelRuntime.runOperation` strictly ignores caller-supplied `permitLedger` input and uses internal `permitIssuer`.
  - [x] Refactor `runOperation` in `scripts/lib/lifecycle-kernel/index.js` to discard `input.permitLedger` and force `permitIssuer`.
  - [x] Add unit test in `index.test.js` asserting rogue caller-supplied `permitLedger` is rejected with `permit-not-runtime-issued`.
  - [x] Satisfies `REQ-lifecycle-kernel-027`.

- [x] Task 5.2: `AuthorityStore.compareAndSwapLocked` propagates `inner.commit(...)` failure (e.g., `cas-conflict`) without updating local authority state.
  - [x] Inspect `persisted?.ok === false` in both normal and convergent heal paths in `scripts/lib/authority-store/index.js`.
  - [x] Return `persisted` with `budgets: budgetsBefore` when `inner.commit(...)` returns `ok: false`.
  - [x] Add `Promise.all` concurrent race test with two `AuthorityStore` instances over `FileSystemStore` in `filesystem-store.test.js` asserting 1 winner and 1 `cas-conflict`.
  - [x] Satisfies `REQ-authority-store-018`.

- [x] Task 5.3: `FileSystemStore.withFileLock` validates lock owner process liveness (`isPidAlive`) before unlinking stale lockfiles.
  - [x] Add `isPidAlive(pid)` helper in `scripts/lib/filesystem-store.js`.
  - [x] Read lock content and verify `!isPidAlive(lockData.pid)` before deleting stale `.lock` files.
  - [x] Satisfies `REQ-authority-store-020`.

