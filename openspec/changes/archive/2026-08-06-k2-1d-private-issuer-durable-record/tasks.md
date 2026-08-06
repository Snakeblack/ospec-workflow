Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: Low

# Tasks: Private Issuer Capability & Single Atomic CAS Durable Record

## 1. Encapsulate Issuer & Remove Public Exports (TDD Phase 1)

- [ ] **Task 1.1**: Remove `PERMIT_AUTHORITY_ISSUER` and `createPermitAuthorityIssuer` from public exports in `permits.js`. Replace `Symbol.for` with module-scoped `Symbol()`.
  - Unexport `PERMIT_AUTHORITY_ISSUER` and `createPermitAuthorityIssuer` from `scripts/lib/lifecycle-kernel/permits.js` (and any re-exports).
  - Replace `Symbol.for("ospec.permitAuthorityIssuer")` with module-scoped private `Symbol()` so `Symbol.for` cannot be used to forge capabilities.

- [ ] **Task 1.2**: Remove `getPermitIssuer()` from public `AuthorityStore` interface in `authority-store/index.js`.
  - Strip `getPermitIssuer()` accessor from the returned public object of `createAuthorityStore` in `scripts/lib/authority-store/index.js`.
  - Ensure public interface surface contains only `load`, `compareAndSwap`, `commitJournal`, `snapshot`, `computeRevision`, `getBudgets`.

- [ ] **Task 1.3**: Refactor `runKernelOperation` & `createAuthorityRuntime` to use private internal issuer capability bindings.
  - Create internal `createAuthorityRuntime` binding that pairs `AuthorityStore` with private permit authority issuer capability internally without surfacing it on public API.
  - Update `runKernelOperation` in `scripts/lib/lifecycle-kernel/index.js` to resolve permit capability via internal runtime context instead of calling `store.getPermitIssuer()`.

## 2. Unified Atomic CAS Record & FileSystemStore Durability (TDD Phase 2)

- [ ] **Task 2.1**: Update `AuthorityStore` `compareAndSwap` to pass unified `{ state, journal, authority, budgets }` record to inner store `commit()`.
  - Update `compareAndSwap` in `scripts/lib/authority-store/index.js` to assemble and pass complete `{ state, journal, authority, budgets }` 4-tuple to `innerStore.commit()`.
  - Eliminate detached in-memory authority bag and budgets post-CAS split.

- [ ] **Task 2.2**: Implement/update `FileSystemStore` (or reference durable store in `scripts/lib/filesystem-store.js`) supporting atomic single-file CAS (write temp -> fsync -> atomic rename -> dir fsync).
  - Implement 4-step atomic persistence sequence: write serialized 4-tuple JSON to unique temp file, `fsync` temp file descriptor, atomic `rename` over `head.json`, and `fsync` parent directory descriptor.
  - Add fallback logic for OS cross-platform file locking/rename behavior if necessary.

- [ ] **Task 2.3**: Update `createAuthorityStore` to load and initialize from unified durable record on disk automatically.
  - Update `load()` and initialization in `AuthorityStore` / `FileSystemStore` to parse the 4-tuple `{ state, journal, authority, budgets }` from `head.json`.
  - Ensure authority bag (consumed permits, receipts) and budgets are fully restored on load without requiring out-of-band `snapshot()` extraction.

## 3. Adversarial & Integration Test Suite (TDD Phase 3)

- [ ] **Task 3.1**: Add adversarial encapsulation tests in `scripts/lib/authority-store/index.test.js` (`store.getPermitIssuer === undefined`, module export checks, forged `Symbol.for` rejection).
  - Verify `store.getPermitIssuer` is `undefined`.
  - Verify `PERMIT_AUTHORITY_ISSUER` and `createPermitAuthorityIssuer` are not exported on public module surfaces.
  - Assert kernel rejects forged issuer objects built with `Symbol.for("ospec.permitAuthorityIssuer")` or mock brand properties.

- [ ] **Task 3.2**: Add real crash/restart & durability tests without manual `snapshot()` extraction (`scripts/lib/authority-store/index.test.js` and `scripts/lib/lifecycle-kernel/index.test.js`).
  - Perform kernel mutations with permit authorization on `FileSystemStore`-backed store.
  - Re-instantiate `AuthorityStore` from disk without calling `snapshot()` and verify complete restoration of state, journal, authority bag (consumed permits & receipts), and budgets.

- [ ] **Task 3.3**: Add simulated crash before/after atomic rename tests proving zero state/authority skew.
  - Test simulated failure before atomic rename: assert original `head.json` stays untouched and incomplete temp files are ignored.
  - Test simulated failure after atomic rename: assert new `head.json` loads cleanly with full state + authority bag and zero torn state.
