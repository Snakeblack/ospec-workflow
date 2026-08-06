# Proposal: Private Runtime, Real Durable CAS & Crash-Safe Recovery

## Intent

Eliminate all remaining public accessors for the permit issuer (`getPrivateIssuer`, `_createPermitAuthorityIssuerInternal`) to achieve strict capability encapsulation. Fix convergent CAS authority persistence so `inner.commit(...)` is called before returning success. Implement cross-process multi-instance CAS on `FileSystemStore` via lockfile exclusion and revision checks. Fix Windows atomic rename crash-safety by recovering `.bak` files when primary target is missing upon `load()`. Bind `OperationReceipt.revision` to the post-CAS winning head revision (R1), generating a clean 4R lineage for terminal archive.

## Scope

### In Scope
- Remove `getPrivateIssuer` from exports in `authority-store/index.js`, `lifecycle-kernel/index.js`, and from `createAuthorityRuntime()`.
- Remove `_createPermitAuthorityIssuerInternal` from `permits.js`.
- Introduce `createKernelRuntime(options)` with encapsulated private closure for operation execution & permit issuance.
- Update `AuthorityStore` convergent path to perform `inner.commit({ state, journal, authority, budgets })`.
- Add cross-process lockfile / revision check to `FileSystemStore` for multi-instance CAS.
- Update `FileSystemStore.load()` to recover `.bak` files when primary file is missing.
- Bind `OperationReceipt.revision` to post-CAS winning revision.
- Comprehensive test suite covering multi-instance CAS, `.bak` recovery, convergent durability, receipt revision, and private capability isolation.

### Out of Scope
- Broad kernel architecture changes outside of authority/durability boundary.

## Capabilities

### New Capabilities
None

### Modified Capabilities
- `authority-store`: Remove `getPrivateIssuer`, fix convergent commit, multi-instance cross-process CAS.
- `lifecycle-kernel-runtime`: Introduce `createKernelRuntime`, remove `getPrivateIssuer`, bind post-CAS receipt revision.

## Approach

- Move permit issuance capabilities strictly inside `createKernelRuntime` closure.
- Add `.lock` lockfile helper to `FileSystemStore` for `commit` serialization and revision checking across processes.
- Update `load()` in `FileSystemStore` to inspect `.bak` if primary `filePath` returns `ENOENT`.
- Ensure convergent path in `compareAndSwap` explicitly calls `entry.inner.commit`.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `scripts/lib/authority-store/index.js` | Modified | Remove `getPrivateIssuer`, call `inner.commit` on convergent path |
| `scripts/lib/lifecycle-kernel/permits.js` | Modified | Remove `_createPermitAuthorityIssuerInternal` export |
| `scripts/lib/lifecycle-kernel/index.js` | Modified | Introduce `createKernelRuntime(options)`, remove `getPrivateIssuer`, bind post-CAS receipt revision |
| `scripts/lib/filesystem-store.js` | Modified | Cross-process lockfile exclusion, revision check, and `.bak` recovery on `load()` |
| `scripts/lib/atomic-write.js` | Modified | Windows crash-safety support for backup recovery |
| `scripts/lib/authority-store/index.test.js` | Modified | Tests for private capability isolation and convergent persistence |
| `scripts/lib/lifecycle-kernel/index.test.js` | Modified | Tests for `createKernelRuntime` and receipt revision binding |
| `scripts/lib/filesystem-store.test.js` | Modified | Tests for multi-instance CAS conflicts and `.bak` crash recovery |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Stale `.lock` files left on process crash | Low | Implement lock timeout and atomic cleanup |
| Intermittent test collisions in multi-instance CAS | Low | Use isolated temporary directories per test run |

## Rollback Plan

Revert changes to `authority-store`, `lifecycle-kernel`, `filesystem-store`, and `atomic-write`. Restore `getPrivateIssuer` and `_createPermitAuthorityIssuerInternal` exports if temporary backward compatibility is needed.

## Dependencies

- Node.js `fs/promises` and atomic file system operations.

## Success Criteria

- [ ] `require("permits")._createPermitAuthorityIssuerInternal` is undefined.
- [ ] `require("authority-store").getPrivateIssuer` is undefined.
- [ ] `require("lifecycle-kernel").getPrivateIssuer` is undefined.
- [ ] Two `FileSystemStore` instances operating on same R0 head -> exactly one succeeds, one returns `cas-conflict`.
- [ ] Convergent authority heal persists to disk across restart.
- [ ] `OperationReceipt.revision` matches post-CAS revision `R1`.
- [ ] Crash between target->bak leaves state recoverable via `load()`.
