# Archive Report: k2-1d-private-issuer-durable-record

**Change**: `k2-1d-private-issuer-durable-record`  
**Archive date**: 2026-08-06  
**Verify verdict**: PASSED (`npm test` passed, 0 errors, 0 warnings across full test suite)  
**4R gate**: approved (`classification: high-risk`, selected dimensions: `[risk, resilience, reliability, readability]`)  

## Executive Summary

Change `k2-1d-private-issuer-durable-record` addresses critical security and durability gaps identified during K3 readiness review:
1. **Permit Issuer Encapsulation**: Removed public exposure of `getPermitIssuer()`, `PERMIT_AUTHORITY_ISSUER`, and `createPermitAuthorityIssuer`. Enforced private internal capability resolution.
2. **Unified Atomic CAS Record**: Encapsulated `{ state, journal, authority, budgets }` into a single atomic 4-tuple CAS record.
3. **Crash-Safe Durability**: Implemented reference `FileSystemStore` using a 4-step write sequence (temp file write -> temp `fsync` -> atomic `rename` -> parent directory `fsync`).
4. **Restart Preservation**: Guaranteed automatic restoration of state, journal, authority bag, and budgets from disk without calling manual `snapshot()`.
5. **Adversarial & Rollback Guards**: Enforced internal private permit issuer resolution in `runKernelOperation`, rejected forged issuers carrying global symbols, and ensured atomic rollback on commit failure.

---

## Spec Sync & Promotion

The following spec deltas have been promoted to the authoritative source of truth:

| Target Spec File | Requirements Added | Description |
|------------------|-------------------|-------------|
| `openspec/specs/authority-store/spec.md` | `REQ-authority-store-010`<br>`REQ-authority-store-011`<br>`REQ-authority-store-012`<br>`REQ-authority-store-013` | Permit Issuer Encapsulation, Unified Atomic CAS Record, Crash-Safe Durability, Restart Preservation of Authority Bag. |
| `openspec/specs/lifecycle-kernel-runtime/spec.md` | `REQ-lifecycle-kernel-020`<br>`REQ-lifecycle-kernel-021`<br>`REQ-lifecycle-kernel-022` | Internal Permit Issuer Resolution, Forged Permit Issuer Rejection, Atomic Failure Rollback. |

---

## Archive Inventory

- `proposal.md` ✅
- `design.md` ✅
- `tasks.md` ✅
- `apply-progress.md` ✅
- `verify-report.md` ✅
- `state.yaml` ✅
- `specs/` ✅
  - `specs/authority-store/spec.md`
  - `specs/lifecycle-kernel/spec.md`

---

## SDD Cycle Complete

Change `k2-1d-private-issuer-durable-record` is fully verified, promoted to canonical specs, and ready for archive move.
