# Archive Report

**Change**: k5-usage-accounting-integrity
**Archive destination**: `openspec/changes/archive/2026-08-23-k5-usage-accounting-integrity/` (runtime transaction pending)
**Verification**: PASS WITH WARNINGS; 37/37 scenarios and full-composition evidence pass. Full suite: 2408 passed, 0 failed, 2 expected environment skips. Baseline fingerprints: 4/4 exact.

## Closure evidence

- Successor 4R lineage is approved with all remediation slices passed; no CRITICAL findings remain.
- Resolved corrections are covered: durable carry-over across runtime recreation, no failed-effect re-debit, and fail-closed handling for undefined/null executor results.
- `quality_gates` is absent, so no additional archive gate applies.
- The unrelated `docs/analysis/2026-08-22-openwiki-sdd-document-analysis.md` remains outside the archive inventory.

## Accepted warnings and follow-ups

Approval `approval-archive-advisories-001` accepts K5-W-001, two WARNING advisories concerning lock-release error visibility and the absorbent `completed` rationale, and one readability suggestion concerning zero-delta branching. These remain follow-up debt and are not erased by archiving.

## Planned synchronization

Four change-local delta specs are prepared with merged content and hashes for runtime synchronization into corresponding live baseline domains. Two change-local ADRs are proposed for promotion. The runtime must perform stale-baseline validation, atomic staging rename, live spec/ADR writes, and post-match source move.

## Cost

Estimated token cost per phase, aggregated from `.ospec/session/k5-usage-accounting-integrity/phase-costs.jsonl`. Figures are heuristic estimates (~4 bytes/token), not exact metering.

| Phase | Invocations | Re-launches | Duration | Model Tiers | Statuses | Estimated Prompt Tokens | Estimated Artifact Tokens | Estimated Tool Output Tokens | Estimated Output Tokens |
|---|---:|---:|---:|---|---|---:|---:|---:|---:|
| propose | 1 | 0 | 0ms | unknown | unknown | 49354 (estimated) | 0 (estimated) | 0 (estimated) | 859 (estimated) |
| spec | 1 | 0 | 0ms | unknown | blocked | 52792 (estimated) | 0 (estimated) | 0 (estimated) | 697 (estimated) |
| design | 1 | 0 | 0ms | unknown | success | 60174 (estimated) | 0 (estimated) | 0 (estimated) | 29 (estimated) |
| tasks | 2 | 1 | 0ms | unknown | success | 166770 (estimated) | 0 (estimated) | 0 (estimated) | 1438 (estimated) |
| apply | 3 | 2 | 0ms | unknown,success | 259073 (estimated) | 0 (estimated) | 0 (estimated) | 249 (estimated) |
| verify | 6 | 5 | 0ms | unknown | success,partial,blocked | 459812 (estimated) | 0 (estimated) | 0 (estimated) | 241 (estimated) |
| review-change/risk/reliability/resilience/readability | 5 | 0 | 0ms | unknown | success | 794519 (estimated) | 0 (estimated) | 0 (estimated) | 2341 (estimated) |
| review-correction | 3 | 2 | 0ms | unknown | success | 571968 (estimated) | 0 (estimated) | 0 (estimated) | 2232 (estimated) |

**Total user questions asked**: 7

## Runtime boundary

This report and plan are ready for the archive transaction. The source directory remains in place; completion is pending `node scripts/archive-transaction-run.js k5-usage-accounting-integrity`.
