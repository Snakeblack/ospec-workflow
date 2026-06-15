# Tasks: Hooks Error-Path Hardening

## Lite Change Contract

- Change class: small
- Behavioral contract: Surface dropped transcript I/O errors via `systemMessage` in `runSubagentStop`; add missing branch tests for `resolveCwd` (file-not-dir) and `readFilePermissive` (non-ENOENT/EACCES). No change to hook exit/continue semantics.
- Acceptance checks: fu-pt1 error surfaced (`systemMessage` set, `{"continue":true}`, exit 0); fu-pt2 and fu-pt3 table tests green; `go test ./...` green; no Go 1.24+ APIs introduced.
- Escalation trigger: Any scope that requires new config, public API change, or behavioral change to hook exit/continue contract.

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~80–115 lines: 1 prod file edit (~5 lines), 2 test files extended (~40 lines), 1 new internal test file (~40 lines) |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR (WU-1 mandatory); WU-2 only if fu-pt4 policy confirmed by user |
| Delivery strategy | exception-ok |
| Chain strategy | size-exception |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| WU-1 | fu-pt1 fix + fu-pt2/fu-pt3 tests | PR 1 → main | Mandatory; single commit |
| WU-2 | fu-pt4 Walk-error logging | PR 2 (optional) | Blocked on explicit user confirmation of Walk-error policy; do not start without it |

### Checklist Status Legend

- `[ ]` Not implemented yet
- `[~]` Implemented but not yet verified locally
- `[x]` Implemented and verified locally

---

## Phase 1: RED — Write Failing Test (fu-pt1)

- [x] 1.1 In `internal/hooks/subagentstop_test.go`, add `TestSubagentStop_TranscriptIOError`: build the stdin with `transcript_path` set to `t.TempDir()` (a valid absolute directory path that passes `validatePath` but causes `os.ReadFile` to return a non-ENOENT/EACCES error — EISDIR on POSIX, ERROR_INVALID_FUNCTION or similar on Windows). Assert `code == 0`, `r.Continue == true`, and `r.SystemMessage != ""`. If `os.ReadFile` on a directory returns EACCES on Windows (i.e., `os.IsPermission` fires), scope the test body with `//go:build !windows` and add a Windows variant using a different non-ENOENT error trigger.
- [x] 1.2 Run `go test ./internal/hooks/...` and confirm `TestSubagentStop_TranscriptIOError` **FAILS (RED)**: `r.SystemMessage` is empty because the `if err == nil` guard at ~L262 of `subagentstop.go` silently drops the error and falls through to the "healthy/unavailable" early return `{"continue":true}`.

## Phase 2: GREEN — Implement fu-pt1 Fix

- [x] 2.1 In `internal/hooks/subagentstop.go`, inside `runSubagentStop`, replace the silent-drop guard:
  ```go
  // Before (silent drop):
  if res, err := findResolutionInTranscript(tp); err == nil {
      resolution = res
  }
  ```
  with an error-surfacing early return (mirror the existing `AppendRuntimeEvent` error pattern):
  ```go
  res, err := findResolutionInTranscript(tp)
  if err != nil {
      msg := fmt.Sprintf("SubagentStop observability failed: %s", err.Error())
      b, _ := json.Marshal(map[string]any{"continue": true, "systemMessage": msg})
      return b, 0
  }
  resolution = res
  ```
  Non-blocking contract (`{"continue":true}`, exit 0) is preserved on every branch.
- [x] 2.2 Run `go test ./internal/hooks/...` and confirm `TestSubagentStop_TranscriptIOError` turns **GREEN**; all previously passing tests remain green.

## Phase 3: Coverage Tests (fu-pt2, fu-pt3)

- [x] 3.1 **(fu-pt2)** In `internal/hooks/precompact_test.go`, add sub-test `"cwd pointing to a file falls back to '.'"` inside or adjacent to `TestPreCompact_ResolveCwdHardening`: create a regular file with `os.WriteFile` inside `t.TempDir()`, pass its absolute path as `cwd`; assert `code == 0` and `r.Continue == true`. Run `go test ./internal/hooks/...` — **PASSES immediately** (the `!info.IsDir()` branch in `resolveCwd` already returns `"."`, this is coverage-only).
- [x] 3.2 **(fu-pt3)** Create `internal/hooks/readfilepermissive_test.go` with `package hooks` (internal package, same pattern as `pathsafe_posix_test.go`). Add table-driven `TestReadFilePermissive` with three rows:
  - Row A — ENOENT: delete a temp file, pass its path → expect `(nil, nil)`.
  - Row B — EACCES (POSIX only): create a temp file with mode `0000`, pass its path → expect `(nil, nil)`; add `//go:build !windows` on the file or skip if `os.Getuid() == 0`.
  - Row C — directory path (non-ENOENT/EACCES): pass `t.TempDir()` → expect `(nil, err)` with `err != nil` (error propagated, not swallowed).
  Run `go test ./internal/hooks/...` — **PASSES immediately** (`readFilePermissive` already propagates non-ENOENT/EACCES errors; this is coverage-only).

## Phase 4: Triangulate and Final Verification

- [x] 4.1 Run `go test ./...` (full suite) and confirm all tests pass with no regressions.
- [x] 4.2 Trace every return path through the updated `runSubagentStop` and confirm **all paths** return `{"continue":true}` with exit 0 — including the new error-surfacing branch added in 2.1.
- [x] 4.3 Confirm no Go 1.24+ standard library APIs were introduced (module declares Go 1.23 minimum; `t.TempDir`, `os.WriteFile`, etc. are all pre-1.23).
- [ ] 4.4 Commit as WU-1 with Conventional Commit, Spanish imperative: `fix(hooks): surfacea error de I/O en transcript y añade cobertura de ramas de error`.
- [x] W1.1 WARNING-1 remediation: retarget `TestPreCompact_WalkErrorSurfacesSystemMessage` — benign sub-test asserts empty systemMessage (RED confirmed), genuine-scan-error sub-test skips on Windows/root.
- [x] W1.2 Apply stat-before-walk guard in `collectSpecArtifactsPC`: `os.Lstat(specsRoot)` ENOENT/EACCES → return `nil, ""` (benign); non-benign or Walk errors in existing tree still surfaced.
- [x] W1.3 GREEN confirmed: `TestPreCompact_WalkErrorSurfacesSystemMessage/benign_missing_specs_dir_produces_empty_systemMessage` PASSES; full `go test ./...` 7/7 packages green.

---

## Phase 5: OPTIONAL — fu-pt4 Walk-error Logging (CONFIRM-FIRST, do not start)

> **GATE: Do NOT modify any code in this phase until the user explicitly confirms the desired Walk-error logging policy. If the user does not confirm, skip this phase entirely. Any change here must remain additive and within the `small` budget.**

- [x] 5.1 **(Gate)** Policy confirmed: add-minimal-logging (see approval fu-pt4-walk-policy-001 in state.yaml).
- [x] 5.2 **(Blocked on 5.1)** If confirmed: in `collectSpecArtifactsPC`, update the Walk callback to emit a minimal log line when `err != nil`; return `nil` to continue walking (non-fatal). Keep `{"continue":true}`, exit 0 on every path.
- [x] 5.3 **(Blocked on 5.1)** Add a test for the Walk-error logging path in `internal/hooks/precompact_test.go`; use `t.TempDir()` and simulate an unreadable specs subdirectory.
- [x] 5.4 **(Blocked on 5.1)** Run `go test ./internal/hooks/...` — GREEN.
- [ ] 5.5 **(Blocked on 5.1)** Commit as WU-2: `observability(hooks): registra errores de filepath.Walk en collectSpecArtifactsPC`.
