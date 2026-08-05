# Archive Report: k2a-1-live-capability-probes-async-transports

**Change**: k2a-1-live-capability-probes-async-transports  
**Archive date**: 2026-08-05  
**Verify verdict**: PASS WITH WARNINGS (Strict TDD; npm test 1969 pass / 0 fail; 70/70 focused k2a-1 tests)  
**4R gate**: approved — `archive_allowed: true`, `terminal_reason: all-remediation-slices-passed`, 4/4 CRITICAL remediated  
**Plan**: `openspec/changes/k2a-1-live-capability-probes-async-transports/archive-plan.json` (schema v1)  
**User approvals**: `remediation-001` → correct-all-4-critical-slices; `assumption-reconciliation-001` → all five assumptions confirmed

## Summary

k2a-1 closes the pre-K3 host-contract correctives (CRITICAL 3–5 + W1–W4): live
expected-identity binding on `verifyCapabilityProof` with independent probe digest,
Claude `enforced` only after live probe, shared async `invokeTransportAsync` with
fail-closed rejection handling, fault matrix via adapter ports, additive transport
envelope schemas, deep-freeze after `createHostAdapter`, and harness-alone negative
runtime assertion (W4). Verify PASS WITH WARNINGS after bounded 4R remediation of
four CRITICAL findings; one advisory assertion-quality WARNING on host-boundary
success-path triangulation remains accepted.

## Spec Sync (runtime-owned live writes)

| Domain | Action | Requirements |
|--------|--------|--------------|
| `capability-proof` | **Extend** | 1 added (REQ-005); REQ-002 modified (live bind); REQ-001..004 preserved |
| `host-capabilities-contract` | **Extend** | 3 added (REQ-006..008); REQ-001..005 preserved |
| `reference-host-adapter` | **Extend** | 1 added (REQ-006); REQ-004 modified (live probe gate); REQ-001..003,005 preserved |
| `headless-conformance-host` | **Extend** | 1 added (REQ-005); REQ-002 modified (fault via ports); REQ-001,003..004 preserved |
| `kernel-contract-schemas` | **Extend** | 1 added (REQ-011); REQ-001 modified (envelope families); prior families preserved |
| `minimal-kernel-harness` | **Extend** | 1 added (REQ-013); REQ-009 modified (runtime negative); prior REQs preserved |
| `lifecycle-kernel-runtime` | **Extend** | 1 added (REQ-017); prior REQs preserved |

Prepared merges for delta domains are change-local at
`specs/{domain}/prepared-spec.md`. Live `openspec/specs/**` writes are deferred to
the archive transaction runtime.

## ADR Promotions (proposed)

| Source | Target |
|--------|--------|
| `decisions/adr-001.md` | `docs/adr/adr-20260805-007-live-expected-identity-probe-binding-on-verify.md` |
| `decisions/adr-002.md` | `docs/adr/adr-20260805-008-shared-async-transport-invoke-and-failure-classification.md` |
| `decisions/adr-003.md` | `docs/adr/adr-20260805-009-claude-enforced-only-after-live-probe.md` |

Change-local copies under `decisions/` travel with the archive audit trail.

## Accepted Residual Follow-ups (non-blocking)

Verify PASS WITH WARNINGS:

1. **Assertion quality (accepted)**: `observeHostPort` success path in
   `host-boundary.test.js` compares `a.ok === b.ok` without asserting
   `ok === true` (REQ-lifecycle-kernel-runtime-017). Behavior is exercised;
   explicit success triangulation deferred. Listed in `archive-plan.json`
   `accepted_warnings[]`.

2. **Suggestion (follow-up)**: Add dedicated `invokeTransportAsync` success unit
   in `host-contract/index.test.js` for REQ-host-capabilities-contract-006
   contract-layer triangulation (covered today via headless/claude consumers).

Prior known-issue W4 (harness-alone host-fault incompleteness) addressed by
REQ-minimal-kernel-harness-013 runtime negative test; may retire from
`known-issues.md` during post-archive cleanup.

All five apply-phase assumptions confirmed during verify
(`assumption-reconciliation-001`). No CRITICAL issues remain.

## 4R Terminal Identity (read-only revalidation)

| Field | Value |
|-------|-------|
| `lineage_id` | `sha256:2281b0e342ea5703d979af46c08a6e8afd3a658ded26cc962d4a21e7570e77a8` |
| `candidate_id` | `sha256:6d3793a48ec0c9bdafa82d107dbcbd98103b7089b709f9b3507ffc1973da32e5` |
| `lineage_status` | `approved` |
| `terminal_reason` | `all-remediation-slices-passed` |
| `archive_allowed` | `true` |
| CRITICAL resolved | 4/4 |
| Advisory WARNING | assertion-quality observeHostPort (accepted) |

No reviewers relaunched; identity matches `state.yaml` `gates.4r-review-gate`.

## Task Completion

28/28 tasks complete (`[x]` in `tasks.md`).

## Archive Inventory

Origin paths listed in `archive-plan.json` `archive_inventory[]` (excludes
self-referential `archive-plan.json`). Includes proposal, design, tasks,
apply-progress, verify-report, archive-report, delta specs, prepared merges,
three ADRs, `.4r/` review artifacts (including remediation lineage), and state.

## Move Completion

**Pending orchestrator runtime.** Source directory
`openspec/changes/k2a-1-live-capability-probes-async-transports/` still exists until the
transaction runtime completes. Invoke:

```text
node scripts/archive-transaction-run.js k2a-1-live-capability-probes-async-transports
```

Destination (planned): `openspec/changes/archive/2026-08-05-k2a-1-live-capability-probes-async-transports/`

## Cost

No per-phase cost data was recorded for this change
(`.ospec/session/k2a-1-live-capability-probes-async-transports/phase-costs.jsonl` missing or empty).

**Total user questions asked**: 0
