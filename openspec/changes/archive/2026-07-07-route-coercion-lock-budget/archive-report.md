# Archive Report: route-coercion-lock-budget

**Date**: 2026-07-07  
**Change**: route-coercion-lock-budget (Lite)  
**Verdict**: Archived after successful verification (PASS WITH WARNINGS — accepted and corrected)

## Summary

Archived a small lite change (19/19 tasks, ~220–260 lines) addressing two Bloque 1.3 quick-wins:

- **I2 (routing coercion advisory)**: Added `detectResidualBooleanStrings(conditions)` pure export to warn on residual string `"true"`/`"false"` in routing conditions; extended JSDoc on `matchConditions` documenting strict-equality-only contract; added regression test against real `openspec/config.yaml` fixture matching native boolean contexts to `bugfix`/`refactor`/`hotfix` routes.

- **I3 (lock/hook budget coherence)**: Aligned `SessionStart` hook timeout to explicit 5-second declaration (matching `PreToolUse`, `PreCompact`, `SubagentStop`, `Stop`); lowered file-lock `staleMs` reclamation window from 10s to 5s across JS and Go; added cross-file coherence tests (JS + Go) verifying numeric parity and that the lock's stale window remains within the hook budget; exported named constants (`LOCK_STALE_MS`, `LOCK_RETRY_ATTEMPTS`, `LOCK_RETRY_DELAY_MS` in JS; `staleLockAge`, `lockRetryAttempts`, `lockRetryDelay` in Go) and cross-referenced them in comments.

## Verification Recap

**Verdict**: PASS WITH WARNINGS  
**Acceptance checks**: 6/6 satisfied (runtime-test level)  
**Tests**: 1038/1038 JS green, all Go packages green  
**TDD compliance**: 6/6 checks passed (RED/GREEN/TRIANGULATE-REFACTOR phases verified, mutation testing confirmed coherence tests are not smoke)

### Warning Handling

Single WARNING identified in verify-report:
- **Claim**: `openspec/config.yaml` is gitignored; Phase 3 unquote will not appear in PR diff.  
- **Reality**: `config.yaml` is tracked in HEAD (`git cat-file -t HEAD:openspec/config.yaml` → blob; `git ls-files -v` → H; `git check-ignore` → no match); the unquote DOES appear in `git diff` and will appear in PR diff.  
- **Status**: CORRECTED. apply-progress.md (lines 49–50) documents the post-verify correction; test comments in `scripts/configure/real-repo.test.js` (lines 334–335, 343, 402) have been updated to remove the false claim.  
- **Behavior impact**: None — the unquote is functionally equivalent; all tests pass.

## Baseline Specs Updated

This change touched the main specs directly (no delta specs written; lite route skips sdd-spec phase):

| Domain | File | Changes |
|--------|------|---------|
| `routing` | `openspec/specs/routing/spec.md` | §4.1: mirrored unquoting of `explicit_bugfix_intent`/`explicit_refactor_intent`/`explicit_hotfix_intent` from quoted to native boolean in illustrative table (rows 3/5/6) for doc parity |
| `hooks` | `openspec/specs/hooks/spec.md` | §9 Non-functional requirements: removed "SessionStart has no declared timeout"; corrected to state all five hooks (SessionStart, PreToolUse, PreCompact, SubagentStop, Stop) share the 5-second budget |
| `hooks-runtime` | `openspec/specs/hooks-runtime/spec.md` | Event-to-Subcommand Mapping table: SessionStart timeout column updated from "none" to "5 s"; NFR section aligned with hooks/spec.md |

**Baseline merge status**: Direct edits already reflected in the working tree. No delta specs to merge (lite mode, no sdd-spec phase).

## Files Archived

### Change Artifacts
- ✅ `proposal-lite.md` — proposal document (small change, 2-point scope: I2 + I3)
- ✅ `tasks.md` — 6 TDD phases, 19 tasks, acceptance checks
- ✅ `apply-progress.md` — implementation evidence, TDD cycle detail, deviation log (including post-verify config.yaml correction)
- ✅ `verify-report.md` — verification results (PASS WITH WARNINGS, 6/6 acceptance checks, mutation-tested coherence)
- ✅ `state.yaml` — workflow state (ready for archive)

### No ADRs
No architectural decision records were created (decisions were internal/reversible, not architectural per Bloque 1.3 analysis).

### No Delta Specs
No delta specs folder. Lite route bypasses sdd-spec; baseline edits applied directly.

## Cost

No per-phase cost data was recorded for this change (`.ospec/session/route-coercion-lock-budget/phase-costs.jsonl` missing or empty).

**Total user questions asked**: 0 (questions_asked field absent from state.yaml phases)

## Archive Checklist

- [x] Verification verdict is not FAIL  
- [x] PASS WITH WARNINGS acceptance documented (config.yaml tracking claim corrected post-verify)  
- [x] Baseline specs sync complete (direct edits, no delta specs)  
- [x] No ADRs to promote  
- [x] Archive report written  
- [x] Decision memory update skipped (no open_decisions in state.yaml)  
- [x] Change artifacts ready for copy to destination
