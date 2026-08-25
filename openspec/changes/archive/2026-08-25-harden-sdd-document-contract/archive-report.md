# Archive Report: harden-sdd-document-contract

**Archive destination (planned)**: `openspec/changes/archive/2026-08-25-harden-sdd-document-contract/`
**Verified**: 2026-08-25
**Verify verdict**: PASS (25/25 MUST scenarios; `npm test` 2588 pass / 0 fail / 2 skipped)

## Summary

Change hardens the `sdd-document` generator contract (P1–P7): canonicity map and plan lifecycle, update-mode re-discovery and volatile-fact re-verification, factual verification pass, measurable output checklist, complete `.last-update.json` metadata, and orchestrator-owned post-run content QA (REQ-agents-018 / route J6). Implementation lives in `skills/sdd-document/SKILL.md`, `skills/_shared/route-document.md`, and L1/L2 tests in `scripts/sdd-document.test.js`. Live wiki remediation under `openwiki/` remains out of scope (sdd-propose-002).

## Verification Gate

| Check | Result |
|-------|--------|
| Verify verdict | PASS |
| CRITICAL issues | None |
| WARNING issues | None |
| Tasks complete | 23/23 |
| 4R review gate | approved (`archive_allowed: true`, `terminal_reason: no-unresolved-blocking-findings`) |
| Candidate identity (read-only) | `sha256:4af5ce8d25e9ea3471736f6d72a7571398197209ed4a64c42426917fba5c8964` |
| Lineage identity (read-only) | `sha256:7be5c1cabf71500bd3d6c272103a45ba8f1326cdbb43b1da59fa831c1a686152` |

## Spec Preparation (change-local)

| Domain | Action | Added | Modified | Removed |
|--------|--------|-------|----------|---------|
| `sdd-document` | Prepared merge | REQ-020, REQ-021, REQ-022 | REQ-007, REQ-008, REQ-011 | — |
| `agents` | Prepared merge | REQ-agents-018 | — | — |

Prepared bytes: `prepared-specs/sdd-document/spec.md`, `prepared-specs/agents/spec.md`. Live `openspec/specs/**` writes are runtime-owned.

## ADR Promotions (planned)

| Source | Planned target |
|--------|----------------|
| `decisions/adr-001.md` | `docs/adr/adr-20260825-001-qa-contenido-post-run-inline-orchestrator-owned-j6.md` |
| `decisions/adr-002.md` | `docs/adr/adr-20260825-002-automatizacion-checklist-p4-p6-contrato-estatico-especificacion-ejecutable-in-test.md` |

Change-local copies under `decisions/` travel with the archive folder as audit trail.

## Accepted Risks / Follow-ups

| ID | Type | Disposition |
|----|------|-------------|
| S1 (verify) | SUGGESTION | J6 behavioral golden eval deferred per sdd-design-003 — accepted; not blocking |
| S2 (verify) | SUGGESTION | Cosmetic tasks.md header count — no follow-up required |

## Archive Inventory

Origin paths preserved by the planned runtime move (excluding `archive-plan.json` from fingerprint):

- `.4r/` (review lineage artifacts)
- `apply-progress.md`
- `archive-report.md`
- `decisions/adr-001.md`, `decisions/adr-002.md`
- `design.md`
- `prepared-specs/agents/spec.md`, `prepared-specs/sdd-document/spec.md`
- `proposal.md`
- `specs/agents/spec.md`, `specs/sdd-document/spec.md`
- `state.yaml`
- `tasks.md`
- `verify-report.md`

## Runtime Completion (pending)

- Live spec merge and ADR promotion: `node scripts/archive-transaction-run.js harden-sdd-document-contract`
- Source directory `openspec/changes/harden-sdd-document-contract/` still exists until runtime receipt confirms full match and delete-after-commit.

## Cost

No per-phase cost data was recorded for this change
(`.ospec/session/harden-sdd-document-contract/phase-costs.jsonl` missing or empty).

**Total user questions asked**: 0
