# TDD Cycle Evidence: k2-1d-private-issuer-durable-record

**Status**: Completed  
**Phase**: Apply  
**Strict TDD Mode**: Active  

---

## TDD Cycle Evidence Table

| Phase / Feature | Stage | Command / Test Target | Outcome / Evidence |
|-----------------|-------|-----------------------|--------------------|
| **Phase 1: Encapsulate Issuer & Remove Public Exports** | **RED** | `node --test scripts/lib/authority-store/index.test.js scripts/lib/lifecycle-kernel/permits.test.js` | ❌ Failed as expected: `store.getPermitIssuer` was defined, `PERMIT_AUTHORITY_ISSUER` & `createPermitAuthorityIssuer` were exported, `Symbol.for` returned `true`. |
| **Phase 1: Encapsulate Issuer & Remove Public Exports** | **GREEN** | `node --test scripts/lib/authority-store/index.test.js scripts/lib/lifecycle-kernel/permits.test.js scripts/lib/lifecycle-kernel/index.test.js scripts/lib/lifecycle-kernel/operations.test.js scripts/lib/minimal-kernel-harness.test.js` | ✅ Passed: 109/109 tests passed. Issuer capability encapsulated in private WeakMap, `store.getPermitIssuer` removed, module-scoped `Symbol` identity enforced. |
| **Phase 2 & 3: Single CAS Unit & FileSystemStore Durability** | **RED** | `node --test scripts/lib/filesystem-store.test.js` | ❌ Failed as expected: `MODULE_NOT_FOUND` (missing `./filesystem-store.js`). |
| **Phase 2 & 3: Single CAS Unit & FileSystemStore Durability** | **GREEN** | `node --test scripts/lib/filesystem-store.test.js` | ✅ Passed: 4/4 durability tests passed (save/load 4-tuple unit, real restart without `snapshot()`, crash before rename, crash after rename). |
| **Full Verification & Refactoring** | **REFACTOR** | `npm test` | ✅ Passed 100%: 0 errors, 0 warnings. All unit tests, contract checkers, and scope guards passed cleanly across workspace. |

---

## Tasks Execution Summary

1. **Phase 1: Encapsulate Issuer & Remove Public Exports**
   - Removed `PERMIT_AUTHORITY_ISSUER` & `createPermitAuthorityIssuer` from public exports in `scripts/lib/lifecycle-kernel/permits.js`.
   - Replaced `Symbol.for("ospec.permitAuthorityIssuer")` with module-scoped private `Symbol("ospec.permitAuthorityIssuer")`.
   - Removed `getPermitIssuer()` from public `AuthorityStore` interface in `scripts/lib/authority-store/index.js`.
   - Introduced `getPrivateIssuer(store)` and `createAuthorityRuntime(options)` to bind store instances to private permit authority issuers via internal `WeakMap`.

2. **Phase 2: Single CAS Unit & FileSystemStore Durability**
   - Updated `AuthorityStore` `compareAndSwap` to commit unified 4-tuple `{ state, journal, authority, budgets }` record to inner store.
   - Implemented `createFileSystemStore(options)` in `scripts/lib/filesystem-store.js` adhering to 4-step atomic write protocol:
     1. Temp file write (`<head-path>.tmp.<uuid>`)
     2. Open file descriptor `fsync`
     3. Atomic `rename` overwriting target path `head.json`
     4. Parent directory file descriptor `fsync`
   - Updated `createAuthorityStore` to load and initialize from unified durable record on disk automatically.

3. **Phase 3: Tests & Adversarial Verification**
   - Added adversarial security tests: `store.getPermitIssuer === undefined`, unexported symbol/issuer checks, forged `Symbol.for` rejection.
   - Added real process restart tests reading directly from `FileSystemStore` without out-of-band `snapshot()` extraction.
   - Added crash recovery tests simulating pre-rename and post-rename failures with zero torn writes.
