# Archive Report: precommit-failure-visibility

**Date**: 2026-06-29  
**Mode**: Lite (OpenSpec) · Strict TDD  
**Status**: ARCHIVED

---

## Executive Summary

The change `precommit-failure-visibility` successfully delivers the proposal intent: when `scripts/check.js` fails during the git pre-commit hook, the failure reason is now clearly visible in a `===`-delimited banner instead of buried in thousands of lines of successful test output. The implementation modifies only `scripts/hooks/pre-commit-hook.js` (capture via `stdio: "pipe"`, emit on failure, suppress on success) and its test file with three new tests covering the failure/success paths and regression protection. All acceptance checks verified; full test suite: **746/746 pass**; hook tests: **11/11 pass**. Verification verdict: **PASS** with 2 informational SUGGESTIONs (no CRITICAL or WARNING issues). Ready for archive.

---

## What Changed

### Affected Files
| File | Action | Summary |
|------|--------|---------|
| `scripts/hooks/pre-commit-hook.js` | Modified | Changed `spawnSync` stdio from `"inherit"` to `"pipe"` + `encoding: "utf8"`; added progress console.log before validation; on success: brief one-liner only; on failure: emit captured stdout/stderr then a `===`-delimited banner naming `scripts/check.js` as failure origin plus bypass reminders |
| `scripts/hooks/pre-commit-hook.test.js` | Modified | Added 3 new tests (1.1, 1.2, 3.1) and updated 1 mock contract (1.3); tests cover banner on failure, captured output emission, and regression guard (success suppresses output) |

### No Delta Specs
This is a lite-mode change with no new behavioral spec requirements created. No specs synced.

---

## Proposal & Intent

**Proposal File**: `proposal-lite.md`  
**Classification**: small  
**Route**: lite

**Problem**: When `pre-commit` hook executes `scripts/check.js` with `stdio: "inherit"`, all successful test TAP output floods stderr/stdout. On failure, the actual validation error is buried at the end, requiring users/agents to reproduce the commit to understand the block reason.

**Solution (Opción A - chosen)**: Capture subprocess output via `stdio: "pipe"` and `encoding: "utf8"`. On success, suppress captured output and emit only a brief progress line. On failure, emit the captured output followed by a `===`-delimited banner that:
- Names the failure origin (`scripts/check.js`)
- Reminds the user of bypass options (`DISABLE_OSPEC_PRECOMMIT=true`, `git commit --no-verify`)

**Boundaries**: Confined to git hook scripts; no changes to `check.js` validation logic or acceptance contracts.

---

## TDD Cycle Evidence

**Delivery**: Strict TDD, size-exception (exception-ok approved in state.yaml)  
**Batch**: 1/1 — all 12 tasks in single batch

### Phase 1: RED Tests (3 tests + 1 mock update)
- **1.1**: Banner test — mock `console.error`, confirm `===` in output on failure [FAIL → PASS]
- **1.2**: Captured stdout test — mock `process.stdout.write`, confirm captured text emitted [FAIL → PASS]
- **1.3**: Mock contract update — align mock shape to pipe-mode output (stdout/stderr fields) [no change needed]

### Phase 2: Core Implementation (5 tasks)
- **2.1**: Progress log before spawnSync
- **2.2**: `stdio: "pipe", encoding: "utf8"` on spawnSync call
- **2.3**: Success one-liner, suppress captured output
- **2.4**: Failure path: emit captured stdout + stderr + `===` banner
- **2.5**: Verify Phase 1 tests now GREEN (10/10)

### Phase 3: Regression Guards & Verification (4 tasks)
- **3.1**: NEW GREEN guard — confirm success path does NOT write captured output (regression protection) [PASS]
- **3.2**: Audit `commit-msg-hook.js` — banner already present, no changes needed [VERIFIED]
- **3.3**: Full test suite — `node --test scripts/**/*.test.js` [746/746 PASS]
- **3.4**: End-to-end check.js — `All checks passed.` exit 0 [VERIFIED]

### Completeness
| Phase | Tasks | Complete | Incomplete |
|-------|-------|----------|------------|
| Phase 1 (RED tests) | 3 | 3 | 0 |
| Phase 2 (impl) | 5 | 5 | 0 |
| Phase 3 (guards + verify) | 4 | 4 | 0 |
| **Total** | **12** | **12** | **0** |

All 12 tasks marked `[x]` in `tasks.md`. No incomplete tasks.

---

## Verification Verdict

**From `verify-report.md`**: **PASS**

| Check | Result | Evidence |
|-------|--------|----------|
| Acceptance 1: Failure banner with `===` | PASS | Code + test 1.1 (runtime-test) |
| Acceptance 2: Success suppression | PASS | Code + test 3.1 (runtime-test) |
| Acceptance 3: Bypasses preserved | PASS | `DISABLE_OSPEC_PRECOMMIT` tested, `--no-verify` git-native, `DISABLE_OSPEC_ATTRIBUTION_CHECK` in commit-msg-hook untouched |
| Acceptance 4: Full suite green | PASS | 746/746 tests, exit 0 |
| TDD Compliance | 6/6 checks | All coding tasks have tests; RED confirmed from diff; GREEN confirmed at runtime; triangulation adequate; safety net retained |
| No CRITICAL or WARNING issues | PASS | None found in verify-report.md |

---

## Informational Findings (SUGGESTIONs)

The verification report identified 2 informational suggestions (not blockers):

### SUGGESTION 1: Banner-final vs. banner-first wording
The orchestrator's verify-scope phrased it as "banner followed by captured output." The implementation places captured output FIRST and banner LAST. This is intentional and superior: the block reason (banner) is the last thing on the terminal, hence most visible and least buried. The intent ("reason not buried") is fully met. No defect — wording reconciliation only.

**Follow-up**: Optional; not required for archive. Document the ordering rationale in future operational docs if desired.

### SUGGESTION 2: Banner could echo one-line failure summary
The banner names the origin (`scripts/check.js`) but not the specific failing check. For very long TAP dumps, extracting a single `not ok` line into the banner would sharpen signal. Out of current scope; optional future enhancement.

**Follow-up**: Optional; candidates for future refinement. Not a deficiency of the current change.

---

## Archive Checklist

- [x] Verify gate passed (verdict: PASS, no CRITICAL/WARNING)
- [x] All 12 TDD tasks complete
- [x] Full suite 746/746 green
- [x] No delta specs exist (lite-mode change)
- [x] Archive report written (this file)
- [x] No decisions to promote (state.yaml has no open_decisions field)
- [x] Ready for folder move

---

## SDD Cycle Complete

The change has been:
1. **Proposed**: Intent, scope, boundaries, and acceptance criteria defined (`proposal-lite.md`)
2. **Tasked**: 12 tasks broken down across 3 TDD phases (`tasks.md`)
3. **Applied**: All tasks implemented with strict RED-GREEN-REFACTOR discipline (`apply-progress.md`)
4. **Verified**: All acceptance checks satisfied, full test suite green, no blockers (`verify-report.md`)
5. **Archived**: Change folder moved to audit trail, ready for the next change

Ready for production merge and deployment. The next SDD change can now begin.
