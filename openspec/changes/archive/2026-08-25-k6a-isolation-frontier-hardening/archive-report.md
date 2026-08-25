# Archive Report: k6a-isolation-frontier-hardening

**Archive destination (planned)**: `openspec/changes/archive/2026-08-25-k6a-isolation-frontier-hardening/`
**Verified**: 2026-08-25
**Verify verdict**: PASS (35/35 MUST scenarios; `npm test` 2608 pass / 0 fail / 2 skipped)

## Summary

Software-surface K6a isolation frontier hardening: immutable captured sandbox policy (`confineChildEnv` from snapshot), exhaustive mutating-fs wrap, live three-way containment probe on the executing `WorkerTransport`, WorkerIsolation live-identity binding (`expectedPortId` / `expectedFingerprint` without new CapabilityProof schema field), REQ-008 fail-closed commands unless `isolationReported=enforced`, and ten executable K6a lifecycle invariants. K4b / OS jail remain out of scope; `enforced` is a software-boundary claim.

## Verification Gate

| Check | Result |
|-------|--------|
| Verify verdict | PASS |
| CRITICAL issues | None |
| WARNING issues | None |
| Tasks complete | 39/39 |
| 4R review gate | approved (`archive_allowed: true`, `terminal_reason: all-remediation-slices-passed`) |
| Candidate identity (read-only) | `sha256:50f15c0ed9485de31c94cc0ff4e1b5815ddc0416d80f42ce1049a84074a2b432` |
| Lineage identity (read-only) | `sha256:976c7edf481a4cb370e80778117d7d2c0a247498915415204026f22223b5b675` |
| Remediation slice S-2331116459080264 | passed; F-a93a0811da865770 resolved |

## Spec Preparation (change-local)

| Domain | Action | Added | Modified | Removed |
|--------|--------|-------|----------|---------|
| `worker-isolation` | Prepared merge | REQ-011, REQ-012, REQ-013, REQ-014 | REQ-008 | — |
| `capability-proof` | Prepared merge | REQ-006 | — | — |
| `host-capabilities-contract` | Prepared merge | REQ-009 | — | — |
| `reference-host-adapter` | Prepared merge | REQ-007 | — | — |
| `lifecycle-model-conformance` | Prepared merge | — | REQ-004, REQ-012 | — |

Prepared bytes under `prepared-specs/{domain}/spec.md`. Live `openspec/specs/**` writes are runtime-owned. Stale-baseline preflight uses `baseline_fingerprints` from `state.yaml` (all five domains match live bytes at archive time).

## ADR Promotions (planned)

| Source | Planned target |
|--------|----------------|
| `decisions/adr-001.md` | `docs/adr/adr-20260825-003-immutable-captured-sandbox-policy.md` |
| `decisions/adr-002.md` | `docs/adr/adr-20260825-004-workerisolation-live-identity-binding-without-schema-field.md` |
| `decisions/adr-003.md` | `docs/adr/adr-20260825-005-fail-closed-commands-unless-isolation-is-enforced.md` |

Change-local copies under `decisions/` travel with the archive folder as audit trail.

## Accepted Risks / Follow-ups

| ID | Type | Disposition |
|----|------|-------------|
| F-4f89ecce967aa993 … F-f1212234c3ba4b00 (4R lineage) | WARNING / SUGGESTION | Non-blocking follow-ups from terminal 4R lineage; not verify blockers |

## Archive Inventory

Origin paths preserved by the planned runtime move (excluding `archive-plan.json` from fingerprint):

- `.4r/lineage.json`, `.4r/record-slice.js`, `.4r/validate-slice.js`
- `apply-progress.md`
- `archive-report.md`
- `decisions/adr-001.md`, `decisions/adr-002.md`, `decisions/adr-003.md`
- `design.md`
- `prepared-specs/capability-proof/spec.md`, `prepared-specs/host-capabilities-contract/spec.md`, `prepared-specs/lifecycle-model-conformance/spec.md`, `prepared-specs/reference-host-adapter/spec.md`, `prepared-specs/worker-isolation/spec.md`
- `proposal.md`
- `specs/capability-proof/spec.md`, `specs/host-capabilities-contract/spec.md`, `specs/lifecycle-model-conformance/spec.md`, `specs/reference-host-adapter/spec.md`, `specs/worker-isolation/spec.md`
- `state.yaml`
- `tasks.md`
- `verify-report.md`

## Runtime Completion (pending)

- Live spec merge and ADR promotion: `node scripts/archive-transaction-run.js k6a-isolation-frontier-hardening`
- Source directory `openspec/changes/k6a-isolation-frontier-hardening/` still exists until runtime receipt confirms full match and delete-after-commit.

## Cost

No per-phase cost data was recorded for this change
(`.ospec/session/k6a-isolation-frontier-hardening/phase-costs.jsonl` missing or empty).

**Total user questions asked**: 0
