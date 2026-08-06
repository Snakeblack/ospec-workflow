# Verify Report: k2-1f-close-authority-surface-and-real-backend-cas

## Summary

All 5 requirements (`REQ-authority-store-018`–`020`, `REQ-lifecycle-kernel-025`–`026`) are **PASS**. The test suite (`npm test`) exits with code 0 and 0 errors, 0 warnings. TDD evidence in `apply-progress.md` covers all 4 phases with RED→GREEN→REFACTOR cycles documented.

## Requirement Verification

### REQ-authority-store-018 — Backend CAS `expectedRevision` Verification

**Status: PASS**

Evidence:
- [`authority-store/index.js` L372–377](file:///c:/Users/sn4ke/dev/activos/ospec-workflow/scripts/lib/authority-store/index.js#L372-L377): Convergent heal path passes `expectedRevision: currentRevision` to `entry.inner.commit(...)`.
- [`authority-store/index.js` L418–424](file:///c:/Users/sn4ke/dev/activos/ospec-workflow/scripts/lib/authority-store/index.js#L418-L424): Normal CAS path passes `expectedRevision: currentRevision` to `entry.inner.commit(...)`.
- [`filesystem-store.js` L183–216](file:///c:/Users/sn4ke/dev/activos/ospec-workflow/scripts/lib/filesystem-store.js#L183-L216): `commit(...)` reads current record inside `withFileLock`, computes `currentRevision` via `computeRevision`, and returns `{ ok: false, code: "cas-conflict", revision: currentRevision }` if `expectedRevision !== currentRevision`.
- [`filesystem-store.test.js` L288–323](file:///c:/Users/sn4ke/dev/activos/ospec-workflow/scripts/lib/filesystem-store.test.js#L288-L323): Concurrent race test with synchronization barrier using `Promise.all` — 2 `FileSystemStore` instances read R0 before either commits. Verifies exactly 1 success and 1 `cas-conflict`.

### REQ-authority-store-019 — Fail-Closed on Missing Authority Records

**Status: PASS**

Evidence:
- [`filesystem-store.js` L79](file:///c:/Users/sn4ke/dev/activos/ospec-workflow/scripts/lib/filesystem-store.js#L79): `initializeIfMissing` option defaults to `false`.
- [`filesystem-store.js` L154–162](file:///c:/Users/sn4ke/dev/activos/ospec-workflow/scripts/lib/filesystem-store.js#L154-L162): When both primary file and `.bak` are `ENOENT`, if `initializeIfMissing !== true`, throws `Error` with `code: "authority-head-not-found"`. Only when `initializeIfMissing === true` does it initialize with `defaultRecord()`.
- [`filesystem-store.test.js` L275–286](file:///c:/Users/sn4ke/dev/activos/ospec-workflow/scripts/lib/filesystem-store.test.js#L275-L286): Test verifies `load()` rejects with `authority-head-not-found` when both files missing without `initializeIfMissing: true`.

### REQ-authority-store-020 — Lockfile Owner Token & Safe Unlink

**Status: PASS**

Evidence:
- [`filesystem-store.js` L18–23](file:///c:/Users/sn4ke/dev/activos/ospec-workflow/scripts/lib/filesystem-store.js#L18-L23): `withFileLock` generates `ownerToken = randomUUID()` and writes JSON `{ ownerToken, pid: process.pid, timestamp: Date.now() }` to `.lock`.
- [`filesystem-store.js` L29–30](file:///c:/Users/sn4ke/dev/activos/ospec-workflow/scripts/lib/filesystem-store.js#L29-L30): Owner payload is fsynced to the lockfile.
- [`filesystem-store.js` L63–69](file:///c:/Users/sn4ke/dev/activos/ospec-workflow/scripts/lib/filesystem-store.js#L63-L69): `finally` block reads lockfile content, parses JSON, and only unlinks if `lockData.ownerToken === ownerToken`.
- [`filesystem-store.test.js` L326–364](file:///c:/Users/sn4ke/dev/activos/ospec-workflow/scripts/lib/filesystem-store.test.js#L326-L364): Tests verify: (a) normal teardown deletes lockfile, (b) when lockfile content is overwritten by another process's token, teardown does NOT delete it — lockfile remains on disk.

### REQ-lifecycle-kernel-025 — Complete Public Surface Encapsulation

**Status: PASS**

Evidence:
- [`permits.js` L285–300](file:///c:/Users/sn4ke/dev/activos/ospec-workflow/scripts/lib/lifecycle-kernel/permits.js#L285-L300): `module.exports` contains ONLY `EFFECT_CLASSES`, `createPermitLedger`, `authorizeMutation`, `authorizeOperationWithPermit`, `consumePermit`, `prepareOperationReceipt`, `computeOperationIntentDigest`, `computePermitDigest`, `findReplayReceipt`, `assertNotReceiptV1`, and decision kind constants. No `_internalCreateIssuer`, `mintOperationPermit`, `issueOperationPermit`, `isPermitAuthorityIssuer`, or `createPermitAuthorityIssuer`.
- [`lifecycle-kernel/index.js` L702–719](file:///c:/Users/sn4ke/dev/activos/ospec-workflow/scripts/lib/lifecycle-kernel/index.js#L702-L719): `module.exports` does NOT include `runKernelOperation`. `createKernelRuntime` is the sole public production entrypoint.
- [`export-surface.test.js`](file:///c:/Users/sn4ke/dev/activos/ospec-workflow/scripts/lib/lifecycle-kernel/export-surface.test.js): Two tests verify `_internalCreateIssuer`, `mintOperationPermit`, `issueOperationPermit`, `isPermitAuthorityIssuer`, `runKernelOperation`, `PERMIT_AUTHORITY_ISSUER`, and `createPermitAuthorityIssuer` are all `undefined` on production `require()`.
- Internal minting functions reside in [`internal/permit-authority.js`](file:///c:/Users/sn4ke/dev/activos/ospec-workflow/scripts/lib/lifecycle-kernel/internal/permit-authority.js) — not reachable from any public module.exports chain.

### REQ-lifecycle-kernel-026 — Isolated Test Support Module

**Status: PASS**

Evidence:
- [`test-support/permit-test-helpers.js`](file:///c:/Users/sn4ke/dev/activos/ospec-workflow/scripts/lib/test-support/permit-test-helpers.js): Exports `createTestPermitIssuer`, `mintTestPermit`, `issueTestPermit`, `issueFixturePermit`, `withRuntimePermit` for unit test use only. Imports from `../lifecycle-kernel/internal/permit-authority.js`.
- NOT re-exported from `lifecycle-kernel/index.js` or `permits.js` production surfaces.

## TDD Evidence Audit

| Phase | RED | GREEN | REFACTOR | Status |
|-------|-----|-------|----------|--------|
| Phase 1 — Surface Encapsulation | `AssertionError: Expected values to be strictly equal` on export-surface test | Created internal module, test-support, removed exports | Test file import migration | ✅ |
| Phase 2 — expectedRevision & Fail-Closed | `Missing expected rejection for authority-head-not-found` | CAS propagation, expectedRevision check, fail-closed | Clean error propagation | ✅ |
| Phase 3 — Lockfile Owner Token | `SyntaxError: Unexpected end of JSON input` | ownerToken JSON write/verify | Safe JSON parsing | ✅ |
| Phase 4 — Adversarial Suite | `K1 implementation changes absent from frozen inventory` | scope-guard update, barrier race test, fail-closed tests | Full suite 2017+ pass | ✅ |

## Runtime Test Execution

```
npm test → exit code 0
0 errors, 0 warnings
All checks passed.
```

## Verdict

**PASS** — All requirements verified. No CRITICAL or WARNING issues found. Ready for archive phase.
