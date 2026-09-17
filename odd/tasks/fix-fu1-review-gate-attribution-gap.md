# ODD Feature: fix-fu1-review-gate-attribution-gap

Source context: `openspec/changes/fix-fu1-review-gate-attribution-gap/` (proposal, design, 4 ADRs, specs, tasks.md).
Workflow: **ODD** (user explicitly opted out of SDD dispatch; artifacts apply-progress / verify-report / archive are produced by this session under ODD, mirroring the repo's SDD artifact formats).
Branch: `fix/fu1-review-gate-attribution-gap` (already checked out).
Delivery: single-pr with approved `size:exception` (change approvals `delivery-strategy-001`, `review-workload-001`).

## Resolved assumptions

- sdd-tasks-001 → override `scope` matching = literal prefix (`startsWith`) or `dir/**` recursive subtree, mirroring `SELF_REVIEW_PREFIXES` style.
- sdd-design-001 / sdd-tasks-002 → INSTALL-026 byte-equivalence applies to target-differentiated projections; shared `scripts/lib/**` bytes change in all targets by construction. Deviations flagged in verify.

## Constraints

- Uncommitted `global-instructions/AGENTS.md` / `CLAUDE.md` edits are unrelated user work: never staged, never committed by this feature.
- TDD RED→GREEN per phase; test runner `node --test` via `npm test` (`scripts/check.js`).
- Kernel libs stay pure; I/O adapter (`route-dispatch-run.js`) only loads/validates config.

## Tasks

| # | Task | Status | Evidence |
|---|------|--------|----------|
| 1 | Phase 1 — kernel lib: synthetic fact `kernel-contract-change`, per-capability runtime rule, replay fixture (tasks 1.1–1.6) | pending | |
| 2 | Phase 2 — `validateAttributionOverride`, router `resolution` contract, `planQualityReviewGate({attributionOverride})`, config adapter (tasks 2.1–2.6) | pending | |
| 3 | Phase 3 — `createSuccessor` v2 native + taxonomy fail-closed (tasks 3.1–3.3) | pending | |
| 4 | Phase 4 — config.yaml commented override block, gate-4r-review.md docs, roadmap FU1 done + 2 follow-ups (tasks 4.1–4.3) | pending | |
| 5 | Phase 5 — validate-* sentinels (4 targets), dist regen + validators, out-of-scope targets check (tasks 5.1–5.3) | pending | |
| 6 | Full suite `npm test` + REQ traceability matrix (task 5.4) | pending | |
| 7 | Write `apply-progress.md` (SDD-format artifact, produced under ODD) | pending | |
| 8 | Write `verify-report.md` from real verification runs | pending | |
| 9 | Archive change → `openspec/changes/archive/<date>-fix-fu1-review-gate-attribution-gap` + spec merge + archive plan/report + release flow (AGENTS.md post-archive) | pending | |

## Work-unit commits

(recorded after each task; feature branch only — push/PR/merge remain user decisions)
