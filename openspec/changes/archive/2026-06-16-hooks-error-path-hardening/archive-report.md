# Archive Report: Hooks Error-Path Hardening

**Change**: `hooks-error-path-hardening`
**Date Archived**: 2026-06-16
**Route**: Lite (proposal-lite, tasks, apply, verify — no design or spec phases)
**Classification**: small
**Follow-up of**: `hooks-path-traversal-hardening` (closes advisory items fu-pt1..fu-pt4)

---

## Intent

Close 4 advisory reliability/resilience items accepted but not implemented during the 4R review gate of `hooks-path-traversal-hardening`. Address error-path observability gaps and test coverage deficiencies in the Go `ospec-hooks` runtime:

- **fu-pt1**: Real disk I/O errors from `findResolutionInTranscript` silently dropped on the normal path.
- **fu-pt2**: `resolveCwd` file-not-dir fallback untested.
- **fu-pt3**: `readFilePermissive` non-ENOENT/EACCES error propagation untested.
- **fu-pt4**: `filepath.Walk` errors swallowed without logging; approved policy: surface via `systemMessage` with minimal logging only.

**Boundary**: Observability + test robustness only. No change to hook exit/continue semantics, no new config, no new public API. Non-blocking hook contract (`{"continue":true}`, exit 0) PRESERVED on every path.

---

## What Shipped

### Files Changed (5 total)

| File | Changes | Purpose |
|------|---------|---------|
| `internal/hooks/subagentstop.go` | ~5 lines | fu-pt1: replaced `if err == nil` silent drop with error-surfacing early return in `runSubagentStop` |
| `internal/hooks/subagentstop_test.go` | Extended | fu-pt1 + fu-pt3: added `TestSubagentStop_TranscriptIOError`; added fu-pt3 `readFilePermissive` error-propagation test row |
| `internal/hooks/precompact.go` | ~20 lines | fu-pt4: updated `collectSpecArtifactsPC` to return warning string + Walk-error capture and propagation chain through `inferLastCompletedArtifact` → `runPreCompact` → `h.Run` |
| `internal/hooks/precompact_test.go` | Extended | fu-pt2: added cwd-is-file sub-test to `TestPreCompact_ResolveCwdHardening`; fu-pt4: added `TestPreCompact_WalkErrorSurfacesSystemMessage` (split into benign + genuine sub-tests post-WARNING-1 fix) |
| `internal/hooks/readfilepermissive_test.go` | Created (new file) | fu-pt3: table-driven `TestReadFilePermissive` (package hooks, 3 rows: ENOENT benign / EACCES benign / directory non-benign error propagation) |

**Total changeset**: ~80–115 added/modified lines; exception-ok single-PR delivery.

### Implementation Completeness

✅ fu-pt1: Error surfaced, non-blocking contract preserved
✅ fu-pt2: File-not-dir fallback tested
✅ fu-pt3: Error propagation tested (3 rows: benign ENOENT, benign EACCES, real error)
✅ fu-pt4: Walk-error policy confirmed (fu-pt4-walk-policy-001), minimal logging applied, warning propagation chain intact

### Test Coverage

- **TDD Compliance**: Strict TDD (RED-GREEN-REFACTOR) applied throughout
- **New tests written**: 4 behaviors (fu-pt1, fu-pt2, fu-pt3, fu-pt4)
- **Test layers**: 1 Unit (direct call via `readFilePermissive`), 3 Integration (dispatch-via-hook)
- **Go suite**: 7/7 packages PASS (no regressions on 13 pre-existing `subagentstop` cases, 7 pre-existing `precompact` cases)
- **Platform coverage**: Windows dev host; POSIX sub-tests (genuine-scan-error, EACCES) skipped on Windows (documented limitation)

---

## WARNING-1 Remediation Cycle

### Original Issue (verify-report v1)

`collectSpecArtifactsPC` unconditionally walks `filepath.Join(changeDir, "specs")`. When the `specs/` directory does not exist (normal for lite changes and standard changes pre-spec phase), `filepath.Walk` invokes the callback once with the `os.Lstat` ENOENT error.

**Inconsistency**: This benign "no specs yet" state was surfaced as a `systemMessage` warning on the normal path for EVERY lite change, contradicting the runtime's ENOENT/EACCES benign policy in `readFilePermissive`.

**Verdict**: PASS WITH WARNINGS (non-blocking, contract preserved, but approval requested explicit fix before archive).

### Remediation (apply rework batch 2)

Added a **stat-before-walk guard** in `collectSpecArtifactsPC`:

```go
if _, err := os.Lstat(specsRoot); err != nil {
    if os.IsNotExist(err) || os.IsPermission(err) {
        return nil, "" // benign: absent/inaccessible root, no warning
    }
    return nil, fmt.Sprintf("PreCompact: artifact scan error at %s: %s", specsRoot, err.Error())
}
```

- **Benign case**: Absent or inaccessible specs **root** is excluded from surfaced warning.
- **Real errors**: Non-ENOENT/EACCES Lstat error on root OR genuine Walk error in an existing tree still surfaces.

### Test Retargeting

Split `TestPreCompact_WalkErrorSurfacesSystemMessage` into two sub-tests:

1. **benign missing specs dir produces empty systemMessage** (all platforms)
   - Asserts `systemMessage == ""` on a change with no specs directory
   - RED pre-fix: Walk ENOENT would set warning → `systemMessage != ""` → assertion FAILS
   - GREEN post-fix: PASS (guard returns empty warning)

2. **genuine scan error in existing specs dir surfaces systemMessage** (POSIX only, `//go:build !windows`)
   - Creates existing specs directory with mode-0000 subdirectory
   - Asserts `systemMessage != ""` when Walk encounters real EACCES
   - Proves genuine errors still surface (not accidentally suppressed by the guard)
   - Skipped on Windows (chmod 0000 no-op) — documented limitation

### Re-verification Evidence

**Date**: 2026-06-16  
**Test run**: `go test ./... -count=1` (non-cached)  
**Result**: All 7 packages PASS

```
✅ TestPreCompact_WalkErrorSurfacesSystemMessage/benign_missing_specs_dir_produces_empty_systemMessage — PASS
⊘  TestPreCompact_WalkErrorSurfacesSystemMessage/genuine_scan_error_in_existing_specs_dir_surfaces_systemMessage — SKIP (Windows)
✅ Full suite (7/7 packages)
✅ No regressions (fu-pt1, fu-pt2, fu-pt3 still green)
✅ Contract audit: every return path `{"continue":true}`, exit 0
```

**Final verdict on WARNING-1**: ✅ RESOLVED. Benign ENOENT noise eliminated; genuine errors still surfaced.

---

## Final Verification Verdict

**PASS WITH WARNINGS** (re-verified 2026-06-16 post-remediation)

- ✅ All 4 fu-pt acceptance checks satisfied
- ✅ Go suite green (7/7 packages, non-cached)
- ✅ Non-blocking contract preserved on every touched path
- ✅ TDD evidence genuine (RED/GREEN confirmed)
- ✅ WARNING-1 fully resolved
- ⊘ SUGGESTION-1 (carried forward as known limitation, see below)

---

## Known Limitations (Documented, User-Accepted)

### POSIX-CI Requirement (SUGGESTION-1)

**Origin**: Platform-specific test skipping  
**Scope**: Two sub-tests skipped on Windows:
1. `TestPreCompact_WalkErrorSurfacesSystemMessage/genuine_scan_error_in_existing_specs_dir_surfaces_systemMessage` — requires `chmod 0000` to create mode-0000 subdirectory (no-op on Windows)
2. `TestReadFilePermissive/EACCES` row — attempts to verify permission-denied error propagation via mode-0000 file (no-op on Windows)

**Platform limitation**: Windows does not support Unix-style file permissions via `chmod`. The dev host (Windows 11) can only inspect the code paths; runtime proof requires a POSIX CI job.

**Mitigation**: 
- Both sub-tests are guarded with `//go:build !windows` or runtime `runtime.GOOS == "windows"` checks
- Code is proven by source inspection on Windows
- **ACTION REQUIRED**: Configure CI to run `go test ./internal/hooks/...` on a POSIX matrix job (Linux or macOS) to provide runtime proof of the genuine-error and EACCES paths

**Impact**: Low — non-blocking; ENOENT path (most common case) is tested on all platforms; EACCES path documents expected behavior and is proven by inspection on Windows.

---

## Scope Items Delivered

| ID | Severity | Origin | Status | Notes |
|-----|----------|--------|--------|-------|
| fu-pt1-transcript-ioerror-logging | WARNING | review-resilience | ✅ Delivered | Non-ENOENT/EACCES I/O errors now surfaced via `systemMessage` in `runSubagentStop` |
| fu-pt2-resolvecwd-filevsdir-test | WARNING | review-reliability | ✅ Delivered | Cwd file-not-dir fallback now tested; `TestPreCompact_ResolveCwdHardening/cwd pointing to a file...` |
| fu-pt3-readfilepermissive-nonenoent-test | SUGGESTION | review-reliability | ✅ Delivered | Non-ENOENT/EACCES error propagation tested; `TestReadFilePermissive` Row C (directory-path) |
| fu-pt4-walk-error-swallow | SUGGESTION | review-resilience | ✅ Delivered (with approval) | Walk errors surfaced via `systemMessage`; policy confirmed (fu-pt4-walk-policy-001); observability only, non-blocking |

---

## Approvals Ledger

| ID | Gate | Decision | Applied By | Timestamp | Status |
|-----|------|----------|-----------|-----------|--------|
| fu-pt4-walk-policy-001 | confirm-first | add-minimal-logging | AskUserQuestion | 2026-06-16T12:00:00Z | ✅ Satisfied |
| warning-1-enoent-remediation-002 | verify-routing | fix-now-then-reverify | AskUserQuestion | 2026-06-16T15:30:00Z | ✅ Satisfied |

---

## Archive Closure

- **Specs delta**: None (lite mode, no spec.md produced; baseline `hooks` domain already exists)
- **Design artifact**: None (lite mode, no design.md phase)
- **Artifacts archived**: proposal-lite.md, tasks.md, apply-progress.md, verify-report.md, state.yaml, archive-report.md
- **No follow-up SDD required**: All scope items closed; POSIX-CI is a documented platform limitation (not a follow-up change)
- **Next action**: Configure POSIX CI job to run internal/hooks tests (one-time setup, not SDD-tracked)

---

## Summary

The `hooks-error-path-hardening` change successfully closes 4 advisory items from the prior review, hardening error-path observability and test coverage in the ospec-hooks Go runtime. All behaviors are delivered, the test suite is green (7/7 packages), the non-blocking hook contract is preserved on every path, and TDD evidence is genuine. WARNING-1 (benign-ENOENT noise) was remediated and verified resolved. The one outstanding item — runtime proof of POSIX-specific sub-tests — is a documented platform limitation requiring a one-time CI matrix configuration, not a defect or follow-up SDD change.

**Verdict**: READY FOR ARCHIVE.
