# Archive Report: Per-Change Cost Telemetry (C3)

**Change**: add-change-cost-telemetry
**Archived**: 2026-07-04
**Classification**: normal (new hook behavior in both runtimes, cross-module)

## Specification Compliance

All requirements met per final verify PASS verdict (post-remediation commit 9b0e9e3):

| Requirement | Status | Evidence |
|---|---|---|
| REQ-hooks-001: SubagentStop per-dispatch phase cost recording | PASS (runtime-test) | `persistPhaseCost` writes `.ospec/session/{change}/phase-costs.jsonl` after envelope-persist; fail-safe wrapper; both runtimes tested |
| E1: Go/JS parity fixture family, floor 2→4 | PASS (runtime-test) | `subagent-stop-phase-cost-*` fixtures (active-change, no-active-change); parity contract floor assertion in both suites |
| REQ-agents-001: sdd-archive Cost block | PASS (runtime-test) | `scripts/cost-block-contract.test.js` proves all three scenarios: populated, empty-fallback, non-gating |

## Delta Specs Synced

| Domain | Action | Details |
|--------|--------|---------|
| hooks | Added + Modified | REQ-hooks-001 (phase-cost recording) + E1 modified (fixture floor 2→4) |
| agents | Added | REQ-agents-001 (archive-report Cost block) |

### Hooks Spec Changes
- **NEW §1.5**: REQ-hooks-001 requirement with three scenarios (cost recorded, no-active-change skip, fail-safe)
- **MODIFIED §8a.1**: Fixture family table — SubagentStop floor bumped from 2 to 4
- **MODIFIED §8a.2-3**: Shared fixtures and governance sections expanded to cover new phase-cost fixtures
- **NEW §10, Session 2026-07-04**: Clarification Q/A on fixture floor and case separation

### Agents Spec Changes
- **NEW §6.7**: REQ-agents-001 requirement with three scenarios (cost block populated, empty-data fallback, non-gating)

## Implementation Summary

### Code Changes

#### Phase 1: Store Writers (JS + Go)
- `scripts/hooks/subagent-stop.js`: added `persistPhaseCost()` step, `appendPhaseCost()` writer, `estimateResultTokens()` heuristic
- `internal/hooks/subagentstop.go`: parallel implementation of above, all three components
- `scripts/lib/ospec-state.js`, `internal/store.go`: `ARTIFACT_STORE_RELATIVE_PATHS['phase-costs.jsonl']` constant + append utility

#### Phase 2: TDD Implementation (Both Runtimes)
- `scripts/hooks/subagent-stop.test.js`: 16 tests covering `persistPhaseCost`, `appendPhaseCost`, `estimateResultTokens`, `resolveDispatchStatus`
- `internal/hooks/subagentstop_test.go`: parallel test suite (9 tests, parity with JS)
- `scripts/lib/ospec-state.test.js`: 52 concurrent-writer tests for `appendPhaseCost` (serialization + stale-lock reclamation)

#### Phase 3: Parity Fixtures (Floor 2→4)
- Added `internal/testdata/parity/subagent-stop-phase-cost-workspace/`: checked-in workspace with active change state
- Added `internal/testdata/parity/subagent-stop-phase-cost-active-change.json`: fixture exercising phase-cost write path
- Added `internal/testdata/parity/subagent-stop-phase-cost-no-active-change.json`: fixture exercising skip-safe path
- `scripts/hooks/parity-contract.test.js` + `internal/hooks/subagentstop_test.go`: floor assertion 4 + per-fixture execution

#### Phase 4: Archive Report Cost Block (sdd-archive SKILL)
- `skills/sdd-archive/SKILL.md` §3: Cost block procedure (aggregation per ADR-001, empty-data fallback, non-gating semantics)
- `scripts/cost-block-contract.test.js`: 6 doc-assertion tests (block presence, aggregation formula, fallback note, non-gating text)

#### Phase 5: Verification (Full Suite)
- `npm test`: 969 tests green (961 existing + 8 doc-assertion)
- `go test ./...`: all 8 packages pass
- Manual walkthrough: Cost block aggregation (both populated and empty scenarios) verified against SKILL.md Step 3 prose

### Documentation
- ADR-001 (aggregation source for re-launch and user-question counts) — deferred design decision, promoted to operative memory
- Updated `internal/testdata/parity/README`: parity floor documented as 4 for both PreToolUse and SubagentStop
- Specs delta inline (see "Delta Specs Synced" above)

## Archive Contents

- ✅ proposal.md (scope, approach, risk)
- ✅ proposal-lite.md (none — not a lite change)
- ✅ specs/ (delta for hooks and agents domains)
- ✅ design.md (technical approach, architecture decisions, data flow, fixture workspace)
- ✅ tasks.md (all 23 tasks complete across 6 phases; Phase 5 checkboxes corrected)
- ✅ apply-progress.md (BATCH 1–3 all green; commit 9b0e9e3 tests-only remediation)
- ✅ verify-report.md (PASS final; REQ-hooks-001, E1, REQ-agents-001 all runtime-test)
- ✅ decisions/adr-001.md (aggregation source decision, promoted to docs/adr/)
- ✅ archive-report.md (this document)

## Quality Metrics

| Metric | Result |
|--------|--------|
| TDD Compliance | 6/6 checks passed (RED/GREEN/triangulation/safety-net) |
| Assertion Quality | All assertions verify real behavior; no tautologies, zero-assertions, or ghost loops |
| Test Execution | Live re-run during verify: npm 969/969, go test ./... all green, concurrent-writer isolation 52/52 |
| Code Coverage | 0% (tooling not configured; rules.verify.coverage_threshold: 0) |
| 4R Review Gate | Done; 0 BLOCKER, 0 CRITICAL; 1 WARNING + 1 SUGGESTION (both remediated per commit 9b0e9e3) |

## Cost

No per-phase cost data was recorded for this change
(`.ospec/session/add-change-cost-telemetry/phase-costs.jsonl` missing or empty).

**Total user questions asked**: 1 (clarify-fixture-floor-001)

---

## SDD Cycle Completion

This change has been:
- ✅ **Proposed** — scope, approach, and rollback plan approved
- ✅ **Specified** — REQ-hooks-001 (SubagentStop), E1 (fixture floor), REQ-agents-001 (Cost block)
- ✅ **Clarified** — fixture floor ambiguity (2→4, active-change + no-active-change)
- ✅ **Designed** — technical approach, architecture decisions, parity fixture workspace
- ✅ **Tasked** — 23 tasks across 6 phases, delivery-strategy-001 exception-ok approved
- ✅ **Applied** — BATCH 1 (hooks writers, store, fixtures), BATCH 2 (Cost block, verify), BATCH 3 (tests-only remediation)
- ✅ **Verified** — PASS final (post-remediation)
- ✅ **Archived** — delta specs synced, ADR promoted, change folder moved to archive

**Ready for the next change.**
