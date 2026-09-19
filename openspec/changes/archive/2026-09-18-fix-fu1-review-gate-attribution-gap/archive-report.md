# Archive Report: fix-fu1-review-gate-attribution-gap

**Change**: `fix-fu1-review-gate-attribution-gap`
**Route**: standard (high-risk)
**Archive date**: 2026-09-18
**Workflow note**: apply/verify executed under ODD (user-directed; SDD dispatcher intentionally unused). Phase artifacts (proposal, specs, design, ADRs, tasks) produced by the earlier planning phases of this change were consumed as-is; apply-progress.md and verify-report.md were produced under ODD mirroring the SDD artifact formats.

## Close Gate

- Verification verdict: **PASS** (no CRITICAL/BLOCKER/WARNING findings) — `verify-report.md`.
- Accepted warnings: none. Follow-ups FU1a (phase reducer registers reviewers as fases) and FU1b (archive-transaction journal failed blocking re-runs) are registered in `docs/roadmaps/harness-evolution.md` with explicit size criteria — they are out-of-scope by design (proposal Out of Scope), not accepted risks.

## Specs Prepared (change-local)

| Domain | Action | Details |
|--------|--------|---------|
| routing | Prepared | REQ-routing-012 ADDED; REQ-routing-003 MODIFIED (resolution audit record); REQ-routing-008 MODIFIED (kernel scope attribution, per-capability coverage) |
| install | Prepared | REQ-install-026 ADDED (attribution build propagation, 4 in-scope targets) |
| quality-review-attribution-resolution | Prepared | New capability: 4 requirements, 11 scenarios (full spec) |

Prepared content lives at `specs/<domain>/spec-prepared.md` inside the change folder; live `openspec/specs/**` writes are applied only by the archive transaction runtime.

## ADR Promotions (proposed)

| Source | Target |
|--------|--------|
| `decisions/adr-001.md` | `docs/adr/adr-20260918-001-fact-sintetico-kernel-contract-change-en-el-normalizer.md` |
| `decisions/adr-002.md` | `docs/adr/adr-20260918-002-override-de-atribucion-como-politica-pura-validada-consumida-por-el-gate-planner.md` |
| `decisions/adr-003.md` | `docs/adr/adr-20260918-003-compatibilidad-de-fingerprint-por-autoconsistencia-de-snapshot-sin-version-bump.md` |
| `decisions/adr-004.md` | `docs/adr/adr-20260918-004-createsuccessor-ramifica-por-schema-version-del-predecesor.md` |

Change-local `decisions/` copies travel with the archive (audit trail).

## Resolution Summary

FU1 closed: clean kernel-contract changes classified `normal` now resolve deterministically via the synthetic fact `kernel-contract-change` (trust+evolution, fingerprinted, audited) emitted from validated `capability_scopes`; the bounded declarative `quality_review.attribution_override` (fail-closed, justification+scope+applies_to) provides the auditable escape hatch; the router contract accepts structured `resolution`; the runtime attribution rule is per-capability and cannot mask other ambiguity codes; `createSuccessor` produces v2 successors natively. Build propagation validated for the four in-scope targets with fail-closed sentinels; out-of-scope targets untouched in their differentiated projections.

## Verification Evidence Summary

- `npm test` full suite: **All checks passed** (per-suite counts in `verify-report.md`).
- Build + validators for github-copilot/opencode/vscode: 0 errors; claude marketplace builder: exitCode 0 with clean sentinels.
- Out-of-scope byte-equivalence: codex/cursor/antigravity differ only in the shared runtime set (by construction).

## Cost

No per-phase cost data was recorded for this change
(`.ospec/session/fix-fu1-review-gate-attribution-gap/phase-costs.jsonl` missing or empty —
execution ran under ODD in a single parent session without phase-agent dispatch).

**Total user questions asked**: 0

## Open Decisions Promoted to Memory

`state.yaml` has no `open_decisions` block (it records `assumptions` instead, all resolved during apply/verify) — nothing to promote; `openspec/memory/decisions.md` untouched.

## Archive Inventory

Full inventory emitted in `archive-plan.json` (`archive_inventory[]`); includes proposal, design, 4 ADRs, 3 delta specs + 3 prepared specs, tasks.md (22/22 closed), apply-progress.md, verify-report.md, archive-report.md, state.yaml.

## Move Completion

Live spec/ADR writes and the archive move are owned by the archive transaction runtime (`node scripts/archive-transaction-run.js fix-fu1-review-gate-attribution-gap`); the runtime success receipt is the sole close authority.
