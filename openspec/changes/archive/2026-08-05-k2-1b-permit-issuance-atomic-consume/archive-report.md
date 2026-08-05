# Archive Report: k2-1b-permit-issuance-atomic-consume

**Change**: k2-1b-permit-issuance-atomic-consume  
**Archive date**: 2026-08-05  
**Verify verdict**: PASS WITH WARNINGS (Strict TDD; npm test 1944 pass / 0 fail; 40/40 MUST scenarios)  
**4R gate**: approved — `archive_allowed: true`, `terminal_reason: all-remediation-slices-passed`, 3/3 CRITICAL remediated, authority WARNINGs remediated in-code  
**Plan**: `openspec/changes/k2-1b-permit-issuance-atomic-consume/archive-plan.json` (schema v1)  
**User approvals**: `remediation-001` → correct-all-3-critical-plus-authority-warnings; verify assertion-quality WARNING accepted as advisory follow-up

## Summary

K2.1b closes the two remaining K2.1 authority gaps before K3: controlled issuer
(`issueOperationPermit`) separate from public `runKernelOperation` with
`mintPermit=false` default, and atomic CAS co-commit of consumed permit status +
OperationReceipt with next_state/next_journal via the Authority Store authority
bag. Harness/model/docs deltas enforce issuer-first positives, replay/restart
receipt stability, K2.1b invariant checkers, and WARNING5 roadmap quick-path fix.
Verify PASS WITH WARNINGS after bounded 4R remediation of three CRITICAL findings
and in-code authority WARNING remediation.

## Spec Sync (runtime-owned live writes)

| Domain | Action | Requirements |
|--------|--------|--------------|
| `operation-permits` | **Extend** | 2 added (REQ-005..006); REQ-001..004 preserved |
| `authority-store` | **Extend** | 2 added (REQ-005..006); REQ-004 modified (replay receipt); REQ-001..003 preserved |
| `lifecycle-kernel-runtime` | **Extend** | 2 added (REQ-015..016); REQ-011 modified (controlled issuer); REQ-001..010,012..014 preserved |
| `minimal-kernel-harness` | **Extend** | 2 added (REQ-011..012); REQ-007 modified (issuer-first positive companion); REQ-001..006,008..010 preserved |
| `lifecycle-model-conformance` | **Extend** | 1 added (REQ-009); REQ-007 modified (inv 8–9); REQ-001..006,008 preserved |
| `harness-authority-canon` | **Extend** | 2 added (REQ-008..009); REQ-001..007 preserved |

Prepared merges for delta domains are change-local at
`specs/{domain}/prepared-spec.md`. Live `openspec/specs/**` writes are deferred to
the archive transaction runtime.

## ADR Promotions (proposed)

| Source | Target |
|--------|--------|
| `decisions/adr-001.md` | `docs/adr/adr-20260805-005-controlled-issuer-separate-from-public-mutate-path.md` |
| `decisions/adr-002.md` | `docs/adr/adr-20260805-006-cas-authority-bag-co-commits-consume-and-receipt.md` |

Change-local copies under `decisions/` travel with the archive audit trail.

## Accepted Residual Follow-ups (non-blocking)

Verify PASS WITH WARNINGS: one non-blocking assertion-quality WARNING on
type-only re-export smoke for `issueOperationPermit` at
`lifecycle-kernel/index.test.js:341` (task 2.4). Behavior is covered by issuer,
atomic consume, and replay tests elsewhere. Listed in `archive-plan.json`
`accepted_warnings[]`. No CRITICAL issues remain.

All three apply-phase assumptions (`sdd-design-001`, `sdd-design-002`,
`sdd-apply-001`) confirmed during verify.

## 4R Terminal Identity (read-only revalidation)

| Field | Value |
|-------|-------|
| `lineage_id` | `sha256:0d1158ee797b506ed828184bd3564b6415196dc2781ccd7194a1ead6870e8d61` |
| `lineage_status` | `approved` |
| `terminal_reason` | `all-remediation-slices-passed` |
| `archive_allowed` | `true` |
| CRITICAL resolved | 3/3 |
| Advisory WARNING | assertion-quality smoke (accepted) |

No reviewers relaunched; identity matches `state.yaml` `gates.4r-review-gate`.

## Task Completion

22/22 tasks complete (`[x]` in `tasks.md`).

## Archive Inventory

Origin paths listed in `archive-plan.json` `archive_inventory[]` (excludes
self-referential `archive-plan.json`). Includes proposal, design, tasks,
apply-progress, verify-report, archive-report, delta specs, prepared merges,
two ADRs, `.4r/` review artifacts (including remediation snapshots), and state.

## Move Completion

**Pending orchestrator runtime.** Source directory
`openspec/changes/k2-1b-permit-issuance-atomic-consume/` still exists until the
transaction runtime completes. Invoke:

```text
node scripts/archive-transaction-run.js k2-1b-permit-issuance-atomic-consume
```

Destination (planned): `openspec/changes/archive/2026-08-05-k2-1b-permit-issuance-atomic-consume/`

## Cost

No per-phase cost data was recorded for this change
(`.ospec/session/k2-1b-permit-issuance-atomic-consume/phase-costs.jsonl` missing or empty).

**Total user questions asked**: 0
