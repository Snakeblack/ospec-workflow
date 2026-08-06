# Archive Report: k2-1e-private-runtime-real-durable-cas

**Change**: k2-1e-private-runtime-real-durable-cas  
**Archive date**: 2026-08-06  
**Verify verdict**: PASS (All tests passed, 0 failures)  
**4R gate**: approved — classification: high-risk, selected dimensions: [risk, resilience, reliability, readability]  

## Summary

`k2-1e-private-runtime-real-durable-cas` completes private runtime capability encapsulation, cross-process durable CAS, and crash-safe state recovery:
1. Eliminates all public accessors for permit issuer (`getPrivateIssuer`, `_createPermitAuthorityIssuerInternal`), encapsulating permit issuance strictly within the `createKernelRuntime` closure.
2. Fixes `AuthorityStore` convergent CAS path to execute `inner.commit(...)` before returning success so authority updates persist across restarts.
3. Implements cross-process lockfile serialization (`.lock`) and pre-commit revision checks in `FileSystemStore` to prevent multi-instance write races.
4. Enhances `FileSystemStore.load()` to recover from `.bak` backup files when primary file returns `ENOENT`, mitigating Windows atomic rename crash vulnerabilities.
5. Binds `OperationReceipt.revision` to the post-CAS winning head revision `R1`.

## Spec Sync (Promoted to Live Specs)

| Domain | Action | Requirements Promoted |
|--------|--------|-----------------------|
| `authority-store` | **Extend** | Added `REQ-authority-store-014` (Accessor Removal & Private Closure), `REQ-authority-store-015` (Durable Convergent CAS Commit), `REQ-authority-store-016` (Multi-Instance Cross-Process CAS), `REQ-authority-store-017` (Windows Fallback Recovery) |
| `lifecycle-kernel-runtime` | **Extend** | Added `REQ-lifecycle-kernel-023` (Post-CAS Receipt Revision Binding), `REQ-lifecycle-kernel-024` (Encapsulated Kernel Runtime) |

## Verification & 4R Gate

- Verification confirmed all requirement scenarios pass without regressions (`npm test`).
- 4R Review Gate approved for high-risk classification across risk, resilience, reliability, and readability dimensions.

## Archive Inventory

Directory `openspec/changes/k2-1e-private-runtime-real-durable-cas/` containing proposal, design, tasks, apply-progress, verify-report, delta specs, state, and archive-report.
