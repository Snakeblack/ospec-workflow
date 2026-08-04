# Archive Report: k2-1-authority-store-permits

**Change**: k2-1-authority-store-permits  
**Archive date**: 2026-08-04  
**Verify verdict**: PASS (Strict TDD; 54/54 MUST scenarios at runtime-test; npm test 1868 pass / 0 fail)  
**4R gate**: approved — `archive_allowed: true`, `terminal_reason: all-remediation-slices-passed`, lineage revision 33  
**Plan**: `openspec/changes/k2-1-authority-store-permits/archive-plan.json` (schema v1)  
**User approval**: `archive-001` → `proceed-archive`

## Summary

K2.1 closes the authority gap between K2 and K2a/K3: mandatory CAS Authority Store,
runtime-owned OperationPermit/OperationReceipt (distinct from TransitionOffer and
`receipt/v1`), closed effect-class retry policy, harness fault matrix, seven executable
model checkers, and schema families. Implementation spans `scripts/lib/authority-store/**`,
`lifecycle-kernel/{permits,effect-policy,memory-store}.js`, harness/model/schema updates.
Verify PASS after 4R remediation of 8 blocking findings (mid-op CAS ticket, authorize
binding, interrupt unknown, permit-operation link, etc.).

## Spec Sync (runtime-owned live writes)

| Domain | Action | Requirements |
|--------|--------|--------------|
| `authority-store` | **Create** | 4 added (REQ-001..004) |
| `operation-permits` | **Create** | 4 added (REQ-001..004) |
| `effect-semantics` | **Create** | 4 added (REQ-001..004) |
| `lifecycle-kernel-runtime` | **Extend** | 3 added (REQ-010..012); REQ-006 modified (token≠permit + CAS); REQ-001..005,007..009 preserved |
| `minimal-kernel-harness` | **Extend** | 2 added (REQ-007..008); REQ-001..006 preserved |
| `lifecycle-model-conformance` | **Extend** | 1 added (REQ-007); REQ-003..004 modified; REQ-001..002,005..006 preserved |
| `kernel-contract-schemas` | **Extend** | 2 added (REQ-006..007); REQ-001 modified (family inventory); REQ-002..005 preserved |
| `harness-authority-canon` | **Extend** | 2 added (REQ-005..006); REQ-001..004 preserved |

Prepared merges for delta domains are change-local at
`specs/{domain}/prepared-spec.md`. Live `openspec/specs/**` writes are deferred to
the archive transaction runtime.

## ADR Promotions (proposed)

| Source | Target |
|--------|--------|
| `decisions/adr-001.md` | `docs/adr/adr-20260804-001-cas-wraps-journaled-commit.md` |
| `decisions/adr-002.md` | `docs/adr/adr-20260804-002-operation-receipt-distinct-from-receipt-v1.md` |
| `decisions/adr-003.md` | `docs/adr/adr-20260804-003-runtime-owned-operation-permit-ledger.md` |
| `decisions/adr-004.md` | `docs/adr/adr-20260804-004-effect-class-governs-retry-policy.md` |

Change-local copies under `decisions/` travel with the archive audit trail.

## Accepted Residual Follow-ups (non-blocking)

Bounded 4R lineage approved; 10 advisory WARNING/SUGGESTION findings remain
accepted as follow-up work (listed in `archive-plan.json` `accepted_warnings[]`):

- CAS guard ordering (`blockDirectWrite` pre-CAS claim)
- Public `commitJournal` revision anchoring
- Post-CAS consume failure / double-consume coverage
- Barrier `ok:false` handling
- Mid-execution interrupt + mid-op CAS test gaps
- Readability: empty `consumePermit` if, offer parameter naming, effect-loop nesting,
  interrupt barrier comment, duplicate irreversible branch

All four low-reversibility assumptions (`sdd-design-001`, `sdd-apply-001`,
`sdd-propose-001`, `sdd-design-002`) confirmed during verify.

## Task Completion

54/55 tasks complete. Task 10.5 (orchestrator-owned bounded 4R) satisfied via
approved lineage `all-remediation-slices-passed`.

## Archive Inventory

47 origin paths listed in `archive-plan.json` `archive_inventory[]` (excludes
self-referential `archive-plan.json`). Includes proposal, design, tasks,
apply-progress, verify-report, delta specs, prepared merges, four ADRs, `.4r/`
review artifacts, and state.

## Move Completion

**Pending orchestrator runtime.** Source directory
`openspec/changes/k2-1-authority-store-permits/` still exists. Invoke:

```text
node scripts/archive-transaction-run.js k2-1-authority-store-permits
```

Runtime success receipt is the sole close authority for live spec/ADR promotion and
archive-folder move.

## Cost

No per-phase cost data was recorded for this change
(`.ospec/session/k2-1-authority-store-permits/phase-costs.jsonl` missing or empty).

**Total user questions asked**: 0
