# Archive Report: orchestrator-intent-briefing

**Archive destination (planned)**: `openspec/changes/archive/2026-08-27-orchestrator-intent-briefing/`
**Verified**: 2026-08-27
**Verify verdict**: PASS WITH WARNINGS (41/41 scenarios; `npm test` 2677 pass / 0 fail / 2 skipped)

## Summary

Change extends orchestrator D2 Intent Restatement into a mandatory functional intent briefing for every eligible new SDD request (vague or specific), with bounded correction (max 2 rounds), persist-before-classify via `intent-briefing` ledger entry, and golden eval corpus expansion 7→9. Implementation spans `agents/sdd-orchestrator.agent.md`, `skills/_shared/approval-ledger.md`, configure goldens, contract tests, and eval fixtures. Task 6.1 (baseline Purpose promotion) completed in this archive phase.

## Verification Gate

| Check | Result |
|-------|--------|
| Verify verdict | PASS WITH WARNINGS |
| CRITICAL issues | None |
| WARNING issues (verify) | Task 6.1 deferred to archive — resolved in this phase |
| Apply tasks complete | 26/26 (6.1 archive-only) |
| 4R review gate | approved (`archive_allowed: true`, `terminal_reason: no-unresolved-blocking-findings`) |
| Candidate identity (read-only) | `sha256:7bb7bd4f8b70a0a4765a396c6688891121c7cc35043a9d6da9517a16222e12dc` |
| Lineage identity (read-only) | `sha256:31389ac34722bf08fcacb82c560dd1a1179ee94dfcb1ff8e3900d89046f9db16` |
| Baseline fingerprints | Match `state.yaml` (no collision) |

## Spec Preparation (change-local)

| Domain | Action | Added | Modified | Removed |
|--------|--------|-------|----------|---------|
| `ambiguity-detection-boundaries` | Prepared merge | — | Intent Restatement (full briefing contract); Purpose (eligible new SDD, not vagueness-only) | — |
| `agents` | Prepared merge | REQ-agents-019, REQ-agents-020 | Orchestrator Intent Restatement in Change Classification | — |
| `orchestrator-evals` | Prepared merge | REQ-orchestrator-evals-006 | REQ-orchestrator-evals-001 (7→9 goldens), REQ-orchestrator-evals-003 (N/9 runner) | — |

Prepared bytes:

- `prepared-specs/ambiguity-detection-boundaries/spec.md` (`sha256:8b5c09cb4de752670ba2f3b8f3a84b78366395b6f9f9c9a357ef3887e8608f0d`)
- `prepared-specs/agents/spec.md` (`sha256:ea7e448378d1c2ac27e0c4e9c171e14f09a275e99d67ee3f8c21d199b8474692`)
- `prepared-specs/orchestrator-evals/spec.md` (`sha256:40fa1af5f7d2f4e5a9a8d4dba77bcf191ed8b63b8f0f30c364b64d5e59dce06a`)

Live `openspec/specs/**` writes are runtime-owned.

## ADR Promotions (planned)

| Source | Planned target |
|--------|----------------|
| `decisions/adr-001.md` | `docs/adr/adr-20260827-001-evolucionar-d2-como-briefing-core-acotado.md` |
| `decisions/adr-002.md` | `docs/adr/adr-20260827-002-persistir-aceptacion-antes-de-clasificar.md` |
| `decisions/adr-003.md` | `docs/adr/adr-20260827-003-especializar-approval-ledger-intent-briefing.md` |

Change-local copies under `decisions/` travel with the archive folder as audit trail.

## Accepted Risks / Follow-ups

| ID | Severity | Owner | Summary | Disposition |
|----|----------|-------|---------|-------------|
| F-4afce68492da82c9 | WARNING (4R) | reliability | Abort no-artifact assertion may be satisfied only by waiting landmark, not independently scoped to abort path | Follow-up: add contract assertion scoped to On abort requiring no change directory |
| F-93efe4f5072cd173 | WARNING (4R) | reliability | Correction path should require fresh synthesis landmark before `classifyChange` | Follow-up: add contract landmark for fresh synthesis after each correction |
| verify task 6.1 | WARNING (verify) | archive | Baseline Purpose promotion deferred from apply | Resolved in this archive phase |

User explicitly accepted archive with 4R WARNINGs recorded as non-blocking follow-up work.

## Archive Inventory

Origin paths preserved by the planned runtime move (excluding `archive-plan.json` from fingerprint):

- `apply-progress.md`
- `archive-report.md`
- `decisions/adr-001.md`, `decisions/adr-002.md`, `decisions/adr-003.md`
- `design.md`
- `prepared-specs/ambiguity-detection-boundaries/spec.md`
- `prepared-specs/agents/spec.md`
- `prepared-specs/orchestrator-evals/spec.md`
- `proposal.md`
- `specs/ambiguity-detection-boundaries/spec.md`
- `specs/agents/spec.md`
- `specs/orchestrator-evals/spec.md`
- `state.yaml`
- `tasks.md`
- `verify-report.md`

## Runtime Completion (pending)

- Live spec merge and ADR promotion: `node scripts/archive-transaction-run.js orchestrator-intent-briefing`
- Source directory `openspec/changes/orchestrator-intent-briefing/` still exists until runtime receipt confirms full match and delete-after-commit.

## Cost

No per-phase cost data was recorded for this change
(`.ospec/session/orchestrator-intent-briefing/phase-costs.jsonl` missing or empty).

**Total user questions asked**: 0
