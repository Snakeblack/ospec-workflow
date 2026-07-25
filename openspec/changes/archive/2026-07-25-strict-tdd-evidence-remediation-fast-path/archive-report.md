# Archive Report: strict-tdd-evidence-remediation-fast-path

**Change**: strict-tdd-evidence-remediation-fast-path (O4.2)  
**Archive date**: 2026-07-25  
**Verification verdict**: PASS  
**4R gate**: approved — `terminal_reason: all-remediation-slices-passed`, `archive_allowed: true`

## Summary

This high-risk change ships a fail-closed Strict TDD evidence-format-gap fast path
with an independent pure reducer, canonical SDD model-tier migration (5/6/6 partition),
and bounded focal verify continuation. All 54 tasks completed; verify reported 25/25
scenarios passing and full regression green (1407 passed).

## Verification Close Gate

| Check | Result |
|-------|--------|
| verify-report verdict | PASS |
| CRITICAL findings | None |
| WARNING acceptance | N/A (none) |
| 4R lineage | Generation 4 approved; four remediation-v2 slices passed |
| Tasks complete | 54 / 54 |

## Spec Sync

| Domain | Action | Details |
|--------|--------|---------|
| agents | Updated | 1 added → `REQ-agents-016` (Strict TDD fast path; change-local delta used `REQ-agents-012`, renumbered at merge because `REQ-agents-012` already names 4R generalist review) |
| routing | Updated | 1 added → `REQ-routing-006` |
| skills | Updated | 1 added → `REQ-skills-008` |
| generator | Updated | 1 added → `REQ-generator-005` |
| sdd-document | Updated | 1 modified → `REQ-sdd-document-001` (`default` → `cheap` tier) |

Baseline fingerprints for `agents`, `routing`, and `skills` drifted since spec authoring
(intervening archives landed first). Merge applied ADDED/MODIFIED deltas only; no
destructive overlap detected.

## ADRs Promoted

| Source | Living copy |
|--------|-------------|
| `decisions/adr-001.md` | `docs/adr/adr-20260725-003-structured-strict-tdd-evidence-is-authoritative.md` |
| `decisions/adr-002.md` | `docs/adr/adr-20260725-004-freeze-evidence-remediation-in-independent-pure-reducer.md` |
| `decisions/adr-003.md` | `docs/adr/adr-20260725-005-treat-models-yaml-as-canonical-model-tier-policy.md` |

Change-local ADR copies remain in the archived folder for audit.

## Non-Blocking Follow-Ups

- **requireHistoricalAuth opt-in**: `requireHistoricalAuth` remains opt-in at
  apply/verify/orchestrator call sites; wiring it to fail closed by default for
  legacy working-tree provenance is deferred outside this change's scope.

## Deliverables Shipped

- Pure reducer: `scripts/lib/strict-tdd-evidence-remediation.js`
- Contract suites: `scripts/strict-tdd-evidence-remediation.test.js`, `scripts/strict-tdd-evidence-parity.test.js`
- Model-tier policy enforcement in `scripts/configure/cli.js` and `models.yaml`
- Agent/skill/rule contract updates across five generated targets
- Authoritative 54-cycle Strict TDD evidence in `apply-progress.md`

## Cost

Estimated token cost per phase, aggregated from
`.ospec/session/strict-tdd-evidence-remediation-fast-path/phase-costs.jsonl`. Figures are heuristic estimates
(~4 bytes/token), not exact metering.

| Phase | Invocations | Re-launches | Duration | Model Tiers | Statuses | Estimated Prompt Tokens | Estimated Artifact Tokens | Estimated Tool Output Tokens | Estimated Output Tokens |
|-------|-------------|-------------|----------|-------------|----------|-------------------------|---------------------------|------------------------------|-------------------------|
| propose | 1 | 0 | 0ms | unknown | unknown | 65223 (estimated) | 0 (estimated) | 0 (estimated) | 79 (estimated) |
| spec | 2 | 1 | 0ms | unknown | success, blocked | 218082 (estimated) | 0 (estimated) | 0 (estimated) | 51 (estimated) |
| design | 2 | 1 | 0ms | unknown | success | 229955 (estimated) | 0 (estimated) | 0 (estimated) | 42 (estimated) |
| tasks | 4 | 3 | 0ms | unknown | success | 490807 (estimated) | 0 (estimated) | 0 (estimated) | 252 (estimated) |
| apply | 18 | 17 | 0ms | unknown | success, partial, unknown | 2369098 (estimated) | 0 (estimated) | 0 (estimated) | 1617 (estimated) |
| verify | 5 | 4 | 0ms | unknown | success | 742149 (estimated) | 0 (estimated) | 0 (estimated) | 113 (estimated) |

**Total user questions asked**: 0

## Move Completion

Copy destination: `openspec/changes/archive/2026-07-25-strict-tdd-evidence-remediation-fast-path/`

Source directory `openspec/changes/strict-tdd-evidence-remediation-fast-path/` still exists pending orchestrator inventory verification and source deletion.
