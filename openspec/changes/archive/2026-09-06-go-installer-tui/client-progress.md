# Client Slice Progress

## Task 1.5

- Status: `[x]` implemented and verified locally.
- Files: `internal/installer/client.go`, `internal/installer/client_test.go`.
- RED: `go test ./internal/installer` initially failed to compile because the client boundary was absent (`undefined: NewClient`, `Plan`, and `InstallRequest`).
- GREEN: `go test ./internal/installer` → `ok github.com/snakeblack/ospec-workflow/internal/installer 0.297s`.
- Scope evidence: Node adapter calls use an argument vector (`adapter.js`, `plan|install`) and an explicit repository working directory; install JSON is passed as stdin, native stdout/stderr are copied to caller streams, and non-zero exit codes are returned with errors.
- Test coverage: typed protocol values retain `json.RawMessage`; malformed protocol versions fail closed; install requests are JSON-decoded by the process seam and paths are never shell-interpolated.
- Deviations: None — implementation follows the process boundary in `design.md`.

## Integration correction

- Updated `ProcessRunner` to accept `io.Writer` streams. `Install` now passes caller stdout/stderr directly to the child process seam, so diagnostics are visible while the process runs.
- Process and writer failures are propagated; a runner failure with code 0 is normalized to `-1`, and spawn failures from the default runner also return `-1`.
- Added focused tests for live streaming and ensuring process failures cannot appear successful.
- GREEN: `go test ./internal/installer` → `ok github.com/snakeblack/ospec-workflow/internal/installer 0.254s`.
