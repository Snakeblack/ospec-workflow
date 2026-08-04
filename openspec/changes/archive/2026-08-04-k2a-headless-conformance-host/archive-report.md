# Archive Report: k2a-headless-conformance-host

**Change**: k2a-headless-conformance-host  
**Archive date**: 2026-08-05  
**Verify verdict**: PASS WITH WARNINGS (Strict TDD; npm test 1917 pass / 0 fail; 42/43 scenario rows at acceptable evidence)  
**4R gate**: approved — `archive_allowed: true`, `terminal_reason: all-remediation-slices-passed`, 4/4 CRITICAL remediated, 11 advisory WARNING remain  
**Plan**: `openspec/changes/k2a-headless-conformance-host/archive-plan.json` (schema v1)  
**User approvals**: `archive-001` → `proceed-archive`; `archive-warnings-001` → `accept-11-warning-as-follow-up`

## Summary

K2a delivers the host contract surface for headless conformance: HostCapabilities +
five transports, CapabilityProof gating, Headless Conformance Host fault matrix,
sole Claude Code reference adapter, kernel host-boundary/scope-guard deltas, eight
JSON Schema families, six model checkers, and harness peer wiring — without
reopening K2.1 CAS/permits. Verify PASS WITH WARNINGS after bounded 4R remediation
of four CRITICAL findings (authority denylist, invokePort catch, pass ok===true,
selectEnforcementFailureReason).

## Spec Sync (runtime-owned live writes)

| Domain | Action | Requirements |
|--------|--------|--------------|
| `host-capabilities-contract` | **Create** | 5 added (REQ-001..005) |
| `capability-proof` | **Create** | 4 added (REQ-001..004) |
| `headless-conformance-host` | **Create** | 4 added (REQ-001..004) |
| `reference-host-adapter` | **Create** | 5 added (REQ-001..005) |
| `lifecycle-kernel-runtime` | **Extend** | 2 added (REQ-013..014); REQ-001..012 preserved |
| `minimal-kernel-harness` | **Extend** | 2 added (REQ-009..010); REQ-001..008 preserved |
| `kernel-contract-schemas` | **Extend** | 3 added (REQ-008..010); REQ-001 modified (family inventory); REQ-002..005 preserved |
| `harness-authority-canon` | **Extend** | 1 added (REQ-007); REQ-005 modified (K2a maturity labels); REQ-001..004,006 preserved |
| `lifecycle-model-conformance` | **Extend** | 1 added (REQ-008); REQ-003..004 modified; REQ-001..002,005..007 preserved |

Prepared merges for delta domains are change-local at
`specs/{domain}/prepared-spec.md`. Live `openspec/specs/**` writes are deferred to
the archive transaction runtime.

## ADR Promotions (proposed)

| Source | Target |
|--------|--------|
| `decisions/adr-001.md` | `docs/adr/adr-20260805-001-one-versioned-schema-family-per-host-contract.md` |
| `decisions/adr-002.md` | `docs/adr/adr-20260805-002-canonical-domain-prefixed-capabilityproof-digests.md` |
| `decisions/adr-003.md` | `docs/adr/adr-20260805-003-peer-headless-conformance-host.md` |
| `decisions/adr-004.md` | `docs/adr/adr-20260805-004-explicit-single-product-adapter-registry.md` |

Change-local copies under `decisions/` travel with the archive audit trail.

## Accepted Residual Follow-ups (non-blocking)

User accepted PASS WITH WARNINGS and all 11 advisory 4R WARNINGs as follow-up
(`archive-warnings-001`). Listed in `archive-plan.json` `accepted_warnings[]`:

- **Verify WARNING [tasks-gap]**: REQ-minimal-kernel-harness-009 scenario
  "Harness alone does not satisfy host-fault ownership" lacks an explicit negative
  runtime case (tracked in `openspec/memory/known-issues.md`).
- **4R advisory (11)**: proof identity/version revalidation, harness-alone negative
  test, canonical transition equivalence, observeHostPort/normalizeTransportOutcome/
  createHostAdapter test gaps, Claude fixture resilience, dual promotion APIs,
  detectDuplication fallback docs, HARNESS_KIND export naming, port→capability_id
  contract documentation.

All three apply-phase assumptions (`sdd-propose-001`, `sdd-apply-001`,
`sdd-apply-002`) confirmed during verify.

## 4R Terminal Identity (read-only revalidation)

| Field | Value |
|-------|-------|
| `lineage_id` | `sha256:02c94ef67c42f3bba0044fd8f6e770927be4cf8130355e6bb70e60e0f9778797` |
| `lineage_status` | `approved` |
| `terminal_reason` | `all-remediation-slices-passed` |
| `archive_allowed` | `true` |
| CRITICAL resolved | 4/4 |
| Advisory WARNING | 11 (accepted as follow-up) |

No reviewers relaunched; identity matches `state.yaml` `gates.4r-review-gate`.

## Task Completion

53/54 tasks complete. Task 11.5 (orchestrator-owned bounded 4R) satisfied via
approved lineage `all-remediation-slices-passed`.

## Archive Inventory

Origin paths listed in `archive-plan.json` `archive_inventory[]` (excludes
self-referential `archive-plan.json`). Includes proposal, design, tasks,
apply-progress, verify-report, archive-report, delta specs, prepared merges,
four ADRs, `.4r/` review artifacts, and state.

## Move Completion

**Pending orchestrator runtime.** Source directory
`openspec/changes/k2a-headless-conformance-host/` still exists until the
transaction runtime completes. Invoke:

```text
node scripts/archive-transaction-run.js k2a-headless-conformance-host
```

Runtime success receipt is the sole close authority for live spec/ADR promotion and
archive-folder move to `openspec/changes/archive/2026-08-05-k2a-headless-conformance-host/`.

## Cost

No per-phase cost data was recorded for this change
(`.ospec/session/k2a-headless-conformance-host/phase-costs.jsonl` missing or empty).

**Total user questions asked**: 0
