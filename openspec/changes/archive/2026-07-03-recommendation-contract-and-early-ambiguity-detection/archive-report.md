# Archive Report: recommendation-contract-and-early-ambiguity-detection

**Change**: recommendation-contract-and-early-ambiguity-detection  
**Classification**: normal  
**Route**: standard  
**Archived**: 2026-07-03  

## Executive Summary

Archiving completed SDD change A2 + A3 (Horizon-1 grouping per scope-granularity-001):
- Formalized the Recommendation Contract for `question_gate` payloads across all phase agents
- Implemented Intent Restatement (pre-classification) and design-mismatch detection boundary in orchestrator
- Established `blocker_type` enum field across envelope tables with design-mismatch routing to `sdd-design`
- All prose-invariant contract tests green (48/48); 4 dist targets regenerated with 0 errors

4R review gate follow-up (5 WARNING + 1 SUGGESTION) applied as fix batch; all fixes verified post-apply.

## Verification Status

**Verdict**: PASS WITH WARNINGS  
**Baseline post-verify**: All MUST scenarios proven (runtime-test + static-proof)  
**4R Gate Outcome**: 0 BLOCKER / 0 CRITICAL / 5 WARNING / 1 SUGGESTION  
**Fix Batch Status**: Done — all 5 findings fixed + 1 suggestion addressed, 48/48 tests pass  

### Warning Disposition

1. **Naming convention note added** — embedded `question_gate` reason example in orchestrator was non-conformant; fixed and naming-convention note added to both `sdd-phase-common.md` §D and baseline `agents/spec.md` §6.1 to document that existing enum values predate a convention (mixed snake_case/kebab-case for historical reasons; new values SHOULD use kebab-case).

2. **Verify-vs-apply clarification added** — added sentence to orchestrator `### Failure & Blocker Routing` distinguishing verify-time post-hoc origin tags (`design-gap`/`spec-gap`) from apply-time live blockers (`blocker_type: design-mismatch`).

3. **Partial-progress persistence clause added** — both `spec-change-required` and `design-mismatch` blocker patterns now require "persist partial progress on already-completed tasks in this batch" before STOP, mirroring existing `workload-escalation` pattern (4 locations in `sdd-apply/SKILL.md`).

4. **Additional sweep coverage** — 4 previously-uncovered embedded examples now guarded by tests (dispatch-lifecycle-hooks.md, gate-archive-quality.md, route-brownfield.md, sdd-clarify/SKILL.md).

5. **Test scope refinement** — reversibility assertion in test 1.3 scoped to the `#### Recommended Option Description Contract` section, preventing false passes if prose is reordered (Finding 5).

**Suggestion addressed**: Split combined design-mismatch-presence test (old 1.5) into two independent Step-4/Rules assertions for better failure specificity.

## Assumption Ledger Status

**Entry**: `sdd-design-001` (test file naming convention)  
**Statement**: "El test de contrato nuevo se nombra scripts/recommendation-ambiguity-contract.test.js siguiendo el sufijo *-contract.test.js."  
**Reversibility**: high  
**Basis**: "Patrón existente en scripts/assumption-ledger-contract.test.js y federation-baseline-contract.test.js."  

**Status**: CONFIRMED — the test file exists at exactly the named path and passes all assertions. Assumption fully realized as stated in design.

## Specs Synced to Baseline

Three new domain specs created and three new requirements added to baseline agents spec (per design D3/D4):

| Spec | Action | Details |
|------|--------|---------|
| `openspec/specs/recommendation-contract/spec.md` | Created (new domain) | 3 core requirements: Recommended Option Description Contract, Gate Reason Cost, Multiple Recommended Options independent compliance |
| `openspec/specs/ambiguity-detection-boundaries/spec.md` | Created (new domain) | 2 core requirements: Intent Restatement Before Classification, sdd-apply design-mismatch Blocker |
| `openspec/specs/agents/spec.md` | Modified (merged delta) | 4 ADDED requirements: question_gate Recommendation Contract Compliance, Orchestrator Intent Restatement in Change Classification, sdd-apply design-mismatch Blocker Type, blocker_type Enum Field Formalization (§6.1 envelope already updated in apply; 3 requirements synced as new sections §6.7, §6.8, §6.9) |

### Baseline Sync Details

**Total requirements added to baseline**: 9 (3 in recommendation-contract + 2 in ambiguity-detection-boundaries + 4 in agents delta)

**agents/spec.md modifications**:
- §6.1 blocker_type field already documented in apply batch (updated during implementation to match testing)
- Added §6.7: Requirement: question_gate Recommendation Contract Compliance (2 scenarios)
- Added §6.8: Requirement: Orchestrator Intent Restatement in Change Classification (2 scenarios)
- Added §6.9: Requirement: sdd-apply design-mismatch Blocker Type (3 scenarios)
- Added §6.10: Requirement: blocker_type Enum Field Formalization (2 scenarios)

Note: Envelope field table (§6.1) already carries the `blocker_type` row and naming-convention note as applied in this change.

## Files Persisted

| File | Status | Notes |
|------|--------|-------|
| `openspec/specs/recommendation-contract/spec.md` | Created | New 3-requirement spec for question_gate content shape |
| `openspec/specs/ambiguity-detection-boundaries/spec.md` | Created | New 2-requirement spec for early/late ambiguity detection |
| `openspec/specs/agents/spec.md` | Updated | Added 4 ADDED requirements from delta, syncing §6.7–§6.10 |
| `archive-report.md` | Persisted (this file) | Completion artifact |

## Apply Artifacts

The following apply-phase artifacts remain in the change folder and are preserved:
- `proposal.md` — original intent and capabilities
- `specs/recommendation-contract/spec.md` — full spec (now synced to baseline)
- `specs/ambiguity-detection-boundaries/spec.md` — full spec (now synced to baseline)
- `specs/agents/spec.md` — delta with 4 ADDED requirements (merged into baseline)
- `design.md` — technical approach and architecture decisions
- `tasks.md` — task breakdown (all tasks complete)
- `apply-progress.md` — apply phase + 4R fix-batch evidence (48/48 tests, all 5 findings fixed)
- `verify-report.md` — verification verdict and TDD compliance matrix

## SDD Cycle Complete

- ✅ **Proposal**: Scope defined, approach established, rollback plan documented
- ✅ **Spec**: Three domain specs created and verified
- ✅ **Clarify**: 2 questions asked and resolved (session 2026-07-02)
- ✅ **Design**: Technical approach and architecture decisions documented
- ✅ **Tasks**: 6 task phases defined; strict TDD + 4R review follow-up
- ✅ **Apply**: All tasks completed, 48/48 contract tests pass, 4 dist targets regenerated
- ✅ **Verify**: PASS WITH WARNINGS; 5 findings fixed in follow-up batch, re-verified passing
- ✅ **Archive**: Specs synced to baseline, change folder relocated to archive

## Risks Flagged (Out of Scope)

Pre-existing, unrelated `npm test` single-command failure (17 assertions in `scripts/hooks/session-start.test.js` / `pre-tool-use.test.js` — git collaboration hooks) confirmed via git stash to reproduce identically without any edit from this change. Not addressed by this change, not caused by this change, and not escalated as a blocker to archive.

## Rollback Plan

All changes are editable text in markdown sources plus regenerated `dist/`. Rollback = `git revert` the commits and regenerate `dist/` via the four `npm run build:*` scripts. New requirements and fields are all additive (no breaking changes); any code or prose created pre-change remains valid without the new fields/rules.

---

**Archive completed**: 2026-07-03T19:15:00Z  
**Prepared by**: sdd-archive sub-agent  
**Mode**: openspec  
