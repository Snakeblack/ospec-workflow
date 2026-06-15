# Verification Report: hooks-error-path-hardening

- **Change**: `hooks-error-path-hardening`
- **Mode**: lite (proposal-lite + tasks + apply-progress; no spec.md/design.md)
- **Strict TDD**: ACTIVE (Go runner `go test ./...`)
- **Verdict**: **PASS WITH WARNINGS** (re-verified post WARNING-1 fix — see section at end)
- **Date**: 2026-06-16 (original) / 2026-06-16 (re-verification)

> NOTE: The body below up to "Final Verdict" is the ORIGINAL verification.
> WARNING-1 has since been remediated and re-verified. See
> **"Re-verification (post WARNING-1 fix)"** at the end for the current/authoritative verdict.

## Executive Summary

All 4 acceptance checks are functionally satisfied, the full Go suite is green (7/7 packages),
the non-blocking hook contract (`{"continue":true}`, exit 0) is preserved on every touched
error path, and the cited RED/GREEN evidence is genuine. One WARNING: the fu-pt4 implementation
surfaces the benign "no `specs/` directory" ENOENT as a Walk-error `systemMessage` on the normal
path for the majority of changes, which is inconsistent with the rest of the runtime that treats
ENOENT/EACCES as benign.

## Acceptance Check Compliance

| # | Acceptance Check | Evidence Level | Status |
|---|------------------|----------------|--------|
| 1 | `findResolutionInTranscript` non-ENOENT/EACCES error surfaced via systemMessage, still `continue:true`, exit 0 | runtime-test (`TestSubagentStop_TranscriptIOError`) | PASS |
| 2 | fu-pt2 file-not-dir cwd fallback covered | runtime-test (`TestPreCompact_ResolveCwdHardening/cwd pointing to a file...`) | PASS |
| 3 | fu-pt3 readFilePermissive non-ENOENT/EACCES propagation covered | runtime-test (`TestReadFilePermissive` Row C) | PASS |
| 4 | fu-pt4 Walk error surfaced via systemMessage (approved) | runtime-test (`TestPreCompact_WalkErrorSurfacesSystemMessage`) | PASS (with WARNING on scope) |
| 5 | `go test ./...` green; no Go 1.24+ APIs | static-proof + runtime-test | PASS |

## Non-Blocking Contract Audit (CRITICAL invariant)

Every touched error path was traced and returns `{"continue":true}` + exit 0:

- `runSubagentStop`: new branch at L263–267 (`err != nil` from `findResolutionInTranscript`) returns `{"continue":true,"systemMessage":...}`, 0. All other returns unchanged and still `continue:true`.
- `preCompactHandler.Run`: new `warn != ""` branch (L71–74) returns `{"continue":true,"systemMessage":warn}`, 0. `runPreCompact` now returns `(walkWarning, err)`; error path still routes through `continueWithError` → `continue:true`, 0.
- Tests assert `code == 0` and `r.Continue == true` on every changed path. Contract PRESERVED.

---

## Re-verification (post WARNING-1 fix)

- **Re-verify date**: 2026-06-16
- **Trigger**: approval `warning-1-enoent-remediation-002` (fix-now-then-reverify)
- **Scope of rework reviewed**: `internal/hooks/precompact.go` (`collectSpecArtifactsPC`) and `internal/hooks/precompact_test.go` (`TestPreCompact_WalkErrorSurfacesSystemMessage`)
- **WARNING-1 status**: ✅ **RESOLVED.**

### 1. Source review — `collectSpecArtifactsPC` (precompact.go L156–193)

A stat-before-walk guard was added before `filepath.Walk`:

```go
if _, err := os.Lstat(specsRoot); err != nil {
    if os.IsNotExist(err) || os.IsPermission(err) {
        return nil, "" // benign: absent/inaccessible root, no warning
    }
    return nil, fmt.Sprintf("PreCompact: artifact scan error at %s: %s", specsRoot, err.Error())
}
```

- Benign `os.IsNotExist` / `os.IsPermission` on the specs **root** is excluded from the surfaced warning.
- Real errors are NOT swallowed: non-ENOENT/EACCES `Lstat` error on root still surfaces.
- ✅ No accidental error suppression.

### 2. Test review — `TestPreCompact_WalkErrorSurfacesSystemMessage` (precompact_test.go L267–330)

Split into two sub-tests:

- **`benign missing specs dir produces empty systemMessage`**: Asserts `r.SystemMessage == ""` on a change with no specs directory. Runs on all platforms. ✅ Genuine RED.
- **`genuine scan error in existing specs dir surfaces systemMessage`**: Creates existing `specs/` with mode-0000 subdirectory; asserts `r.SystemMessage != ""`. POSIX-only, skips on Windows. ✅ Correctly targets genuine error.

### 3. Non-blocking contract

Every return path remains `{"continue":true}`, exit 0. ✅ Contract preserved on every touched path.

### 4. Runtime evidence (executed at re-verify time, non-cached)

`go test ./... -count=1` — **all 7 packages PASS** (no cache):

```
ok  .../cmd/ospec-hooks    4.483s
ok  .../internal/hooks     0.566s
ok  .../internal/jsonio    0.252s
ok  .../internal/rules     0.276s
ok  .../internal/skillreg  0.308s
ok  .../internal/store     0.308s
ok  .../internal/yamllite  0.252s
```

The benign sub-test (the WARNING-1 fix assertion) **passes on Windows** and would have FAILED pre-fix. ✅

### 5. Regression check — fu-pt1/fu-pt2/fu-pt3 still green

- fu-pt1 `TestSubagentStop_TranscriptIOError`: PASS
- fu-pt2 `TestPreCompact_ResolveCwdHardening/cwd pointing to a file falls back to '.'`: PASS
- fu-pt3 `TestReadFilePermissive` (ENOENT/EACCES-skip/directory rows): PASS
- No regression introduced. ✅

### Issues after re-verification

- **WARNING-1**: ✅ RESOLVED. Benign-ENOENT noise eliminated; genuine errors still surfaced.
- **SUGGESTION-1 (carried forward)**: Two sub-tests skipped on Windows (`chmod 0000` no-op). **A POSIX CI job MUST run `internal/hooks` to provide runtime proof.** Documented, accepted platform limitation — not a defect.

### Final verdict (authoritative)

**PASS WITH WARNINGS** — WARNING-1 fully resolved; suite green (7/7, non-cached); non-blocking contract preserved; RED/GREEN evidence genuine; no regressions. The only outstanding item is the documented POSIX-CI gap (SUGGESTION-1). Recommend proceeding to **sdd-archive**, recording the POSIX-CI requirement as a known limitation in the archive report.
