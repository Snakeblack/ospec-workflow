# Proposal: Close Authority Surface and Real Backend CAS

## Intent

Address 3 CRITICAL vulnerabilities and 1 HIGH security issue identified in v2.40.6 (K3 NO-GO decision):
1. **Unencapsulated Issuer Surface**: Public production modules export direct permit minting/issuance functions (`_internalCreateIssuer`, `mintOperationPermit`, `issueOperationPermit`, `isPermitAuthorityIssuer`, `runKernelOperation`), allowing un-scoped authority bypass.
2. **CAS Backdoor & Missing Verification**: `AuthorityStore.compareAndSwap` omits `expectedRevision` when delegating to `entry.inner.commit(...)` (both normal and convergent heal paths), and `FileSystemStore.commit(...)` fails to check `expectedRevision === currentRevision` under lock.
3. **Silent Re-initialization Data Loss**: `FileSystemStore.load()` silently initializes a blank lifecycle when primary and backup files are missing, risking state loss during file corruptions or path mismatches.
4. **Unsafe Lockfile Teardown**: `withFileLock` unlinks `.lock` unconditionally in `finally`, enabling concurrent processes to delete another process's active lock file.

## Scope

### In Scope
- Remove direct permit minting/issuance functions (`_internalCreateIssuer`, `mintOperationPermit`, `issueOperationPermit`, `isPermitAuthorityIssuer`, `runKernelOperation`) from public production exports in `scripts/lib/lifecycle-kernel/`.
- Move permit authority creation to internal runtime modules (`scripts/lib/lifecycle-kernel/internal/permit-authority.js`) and isolate direct minting test helpers in `scripts/lib/test-support/`.
- Make `createKernelRuntime` in `scripts/lib/lifecycle-kernel/index.js` the sole public entrypoint for runtime operations and transition permit issuance.
- Pass `expectedRevision: currentRevision` to `entry.inner.commit(...)` in `AuthorityStore.compareAndSwap` across both regular CAS and convergent heal paths.
- Enforce `expectedRevision === currentRevision` inside `FileSystemStore.commit(...)` within `withFileLock`.
- Add `initializeIfMissing: boolean` (default `false`) option to `createFileSystemStore`, and return/throw `authority-head-not-found` on double `ENOENT` when `false`.
- Write JSON `{ ownerToken, pid, timestamp }` into `.lock` files, unlinking in `finally` strictly if `ownerToken` matches the caller's token, while preventing stale cleanup from unlinking active locks.
- Add real multi-instance concurrent race test using `Promise.all` with a synchronization barrier/latch to verify exact 1 winner and 1 `cas-conflict`.

### Out of Scope
- Altering the underlying state reducer logic or event schema.
- Refactoring `MemoryStore` beyond standard `expectedRevision` parity if required.
- Modifying non-kernel host adapters or CLI interface contracts.

## Capabilities

### New Capabilities
None

### Modified Capabilities
- `authority-store`: Enforce `expectedRevision` propagation in `AuthorityStore.compareAndSwap` and `FileSystemStore.commit`, add `initializeIfMissing` option (default `false`) with fail-closed behavior, structured JSON lock ownership with owner-matching teardown, and race test requirements.
- `lifecycle-kernel-runtime`: Restrict public production exports to encapsulate permit issuance, making `createKernelRuntime` the sole entrypoint and delegating direct minting test helpers to `test-support`.

## Approach

1. **Encapsulate Permit Issuer Surface**:
   - Create `scripts/lib/lifecycle-kernel/internal/permit-authority.js` (or private closure) for permit authority generation.
   - Refactor `scripts/lib/lifecycle-kernel/index.js` to export only `createKernelRuntime` as the public entrypoint.
   - Move test-only helper utilities relying on direct permit minting into `scripts/lib/test-support/kernel-helpers.js`.

2. **Harden CAS in AuthorityStore and FileSystemStore**:
   - Modify `AuthorityStore.compareAndSwap` to forward `{ expectedRevision: currentRevision, ... }` to `inner.commit()`.
   - Update `FileSystemStore.commit()` to validate `expectedRevision === currentRevision` under `withFileLock` lock before committing state to disk.
   - Write a deterministic concurrent race integration test utilizing two `FileSystemStore` instances and a `Promise` barrier to verify 1 success and 1 `cas-conflict`.

3. **Fail-Closed FileSystemStore Initialization**:
   - Update `createFileSystemStore(options)` signature to accept `initializeIfMissing` defaulting to `false`.
   - Update `load()` to check if primary `filePath` and `filePath + ".bak"` are missing; throw `authority-head-not-found` unless `initializeIfMissing: true`.

4. **Safe Lockfile Ownership**:
   - Update `withFileLock` to format `.lock` content as `{ ownerToken, pid, timestamp }`.
   - In `finally`, read lockfile and unlink strictly when `lockData.ownerToken === ownerToken`.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `scripts/lib/lifecycle-kernel/index.js` | Modified | Restrict exports to `createKernelRuntime` sole entrypoint. |
| `scripts/lib/lifecycle-kernel/internal/` | New | Private module for internal permit authority logic. |
| `scripts/lib/authority-store/index.js` | Modified | Forward `expectedRevision` in `compareAndSwap` for CAS & heal paths. |
| `scripts/lib/filesystem-store.js` | Modified | Enforce `expectedRevision` check, fail-closed `load()`, and JSON lock ownership. |
| `scripts/lib/test-support/` | New | Dedicated non-production test helper for permit minting in unit tests. |
| `scripts/lib/filesystem-store.test.js` | Modified | Add concurrent CAS race test and missing-file fail-closed tests. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Existing unit tests fail due to removed public permit minting exports | Medium | Migrate test suites to consume `scripts/lib/test-support/` or `createKernelRuntime`. |
| Unintended `cas-conflict` on valid sequential operations | Low | Ensure state load returns exact head revision before CAS attempt. |
| Lock contention or stale lock deadlocks on abnormal process exit | Low | Retain PID check and timestamp-based stale threshold before lock acquisition. |

## Rollback Plan

Revert git commit containing changes to `scripts/lib/lifecycle-kernel/`, `scripts/lib/authority-store/`, and `scripts/lib/filesystem-store.js`. Re-export legacy functions if temporary backward compatibility is strictly required.

## Dependencies

- Node.js native test runner (`node --test`).
- File system locks (`fs` module).

## Success Criteria

- [ ] Production exports of `lifecycle-kernel` expose ONLY `createKernelRuntime`.
- [ ] Direct permit minting methods (`_internalCreateIssuer`, `mintOperationPermit`, etc.) are absent from public exports and isolated in `test-support`.
- [ ] `AuthorityStore.compareAndSwap` passes `expectedRevision` to `inner.commit()` for normal and convergent heal paths.
- [ ] `FileSystemStore.commit()` rejects mismatches between `expectedRevision` and `currentRevision` under file lock.
- [ ] Concurrent CAS race test using `Promise.all` with a barrier proves exactly 1 winner and 1 `cas-conflict`.
- [ ] `FileSystemStore.load()` fails closed with `authority-head-not-found` when both primary and `.bak` files are missing unless `initializeIfMissing: true`.
- [ ] `withFileLock` writes JSON `{ ownerToken, pid, timestamp }` and unlinks `.lock` only when `ownerToken` matches.
