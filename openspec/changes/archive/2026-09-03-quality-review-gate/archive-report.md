# Archive Report: quality-review-gate

**Archive destination (planned)**: `openspec/changes/archive/2026-09-03-quality-review-gate/`
**Verified**: 2026-09-03
**Verify verdict**: PASS WITH WARNINGS (`verify-warnings-001` accepted)
**Working branch**: `feat/k6d-cx0-parallel`
**Quality Review lineage**: approved (`terminal_reason: all-frozen-findings-resolved`; `current_candidate_id: `sha256:15ba963708aee6a87ef4b16d214a3d0d2ccf5dae8fd533c5051ce568388a5724`)

## Summary

Replaces the selective 4R review gate with a Quality Review Gate over four domains — Trust, Runtime, Evolution, Efficiency — with deterministic-first routing, residual-only `review-change`, union domain selection, dual-schema lineage migration, CX0 KPI sidecar, and atomic contract coherence across classifier, lineage, hooks, generator targets, and eval fixtures.

Primary deliverables:
1. Four quality specialists plus residual router and correction validator (agents, skills, models, hooks).
2. Deterministic classifier with closed-world ambiguity, per-capability attribution, and high-risk full review without semantic router.
3. `scripts/lib/quality-review-kpis.js` sidecar reusing CX0 and phase-cost inputs (no parallel telemetry pipeline).
4. Seven domain spec deltas prepared for live merge under Plan-and-Report.

This report is emitted under **Plan-and-Report**: live writes to `openspec/specs/**`, ADR promotions to `docs/adr/**`, and the archive folder move belong to `node scripts/archive-transaction-run.js quality-review-gate`.

## Verification Gate

| Check | Result |
|-------|--------|
| Verify verdict | PASS WITH WARNINGS |
| CRITICAL issues (verify) | None (V001–V003 resolved at targeted recheck) |
| Approval | `verify-warnings-001` accepts remaining WARNINGs and advisory quality-review findings as follow-ups |
| Apply tasks complete | 40/40 substantively complete |
| Quality Review gate | Approved (`terminal_reason: all-frozen-findings-resolved`) |
| Blocking findings | None (2 CRITICALs corrected in gate remediation; 1 advisory WARNING retained) |
| Baseline fingerprints | All seven domains match live `openspec/specs/**` bytes at archive prep |
| `quality_gates` config | Undeclared (noop) |
| Destructive delta | No dropped `{#REQ-...}` IDs in prepared merges |
| Archive identity check | Read-only; lineage not reopened |

## Spec Preparation (change-local)

| Domain | Action | Added | Modified | Removed |
|--------|--------|-------|----------|---------|
| `agents` | Prepared merge | 4 (REQ-agents-021..024) | 4 (012–015) | 0 |
| `skills` | Prepared merge | 2 (REQ-skills-011..012) | 5 (004–007, 009) | 0 |
| `routing` | Prepared merge | 4 (REQ-routing-008..011) | 7 (001–007) + constants | 0 |
| `generator` | Prepared merge | 1 (REQ-generator-014) | 2 (008, 011) + runtime inventory | 0 |
| `hooks` | Prepared merge | 0 | 1 (REQ-hooks-001) | 0 |
| `orchestrator-evals` | Prepared merge | 1 (REQ-orchestrator-evals-008) | 2 (001, 005) | 0 |
| `context-measurement` | Prepared merge | 1 (REQ-context-measurement-006) | 1 (005) | 0 |

Prepared files:
- `prepared-specs/agents/spec.md`
- `prepared-specs/skills/spec.md`
- `prepared-specs/routing/spec.md`
- `prepared-specs/generator/spec.md`
- `prepared-specs/hooks/spec.md`
- `prepared-specs/orchestrator-evals/spec.md`
- `prepared-specs/context-measurement/spec.md`

Delta specs under `specs/{domain}/spec.md` remain the audit trail. Live `openspec/specs/**` writes are runtime-owned.

## ADR Promotions (planned)

| Source | Planned target |
|--------|----------------|
| `decisions/adr-001-versioned-canonical-gate-identity.md` | `docs/adr/adr-20260903-001-versioned-canonical-gate-identity.md` |
| `decisions/adr-002-deterministic-first-residual-router.md` | `docs/adr/adr-20260903-002-deterministic-first-residual-router.md` |
| `decisions/adr-003-dual-schema-lineage-migration.md` | `docs/adr/adr-20260903-003-dual-schema-lineage-migration.md` |
| `decisions/adr-004-per-capability-attribution.md` | `docs/adr/adr-20260903-004-per-capability-attribution.md` |
| `decisions/adr-005-cx0-sidecar-kpis.md` | `docs/adr/adr-20260903-005-cx0-sidecar-kpis.md` |

Change-local copies under `decisions/` travel with the archived folder. No ADR was invalidated during verify.

## Accepted Risks / Follow-ups

Documented in `accepted_warnings[]` and accepted via `verify-warnings-001`:

| ID / source | Severity | Summary | Disposition |
|-------------|----------|---------|-------------|
| verify-discovery-005 | WARNING | REQ-orchestrator-evals-005 publication/adaptive scenarios not re-executed as live extended runs; evidence remains inspection | follow-up |
| verify-discovery-phase-cost | WARNING | REQ-context-measurement-005 legacy phase-cost readability SHOULD-strength evidence only | follow-up |
| verify-discovery-live-extended | WARNING | Live extended benchmark not re-run at targeted recheck | follow-up |
| `F-6d5ee4e9cc36b68c` | WARNING (runtime) | KPI sidecar treats real phase-cost rows missing tokens as host-observed 0 instead of unavailable | advisory follow-up |
| L001 | follow-up | `four_r_defects` leftover in `scripts/evals/lib/benchmark.test.js`, `scripts/evals/live-driver.test.js`, and `scripts/evals/README.md` | non-blocking follow-up |

Additional verify discovery WARNINGs (harness-evolution note, uncommitted sufficiency-matrix tests) remain advisory and do not block archive.

`open_decisions` absent in `state.yaml` — `openspec/memory/decisions.md` not updated.

## Cost

No per-phase cost data was recorded for this change
(`.ospec/session/quality-review-gate/phase-costs.jsonl` missing or empty).

**Total user questions asked**: 2

## Archive Inventory

Runtime will preserve every origin path listed in `archive-plan.json` `archive_inventory[]` (30 entries, excluding self-referential `archive-plan.json`). Canonical `source_fingerprint` is recorded in `archive-plan.json`.

## Post-Archive Release

Approval `post-archive-version-001` records **minor** bump intent for orchestrator-owned release after runtime commit. Version files were not modified by this executor.
