# ADR-002: Fail-Closed Sandbox Infrastructure Error Classification and Runner Gating

- Status: proposed
- Change: k6c-budget-execution-failclosed
- Date: 2026-08-31

## Context
When running sandboxed workspace tests under `worker-sandbox.js`, process spawn errors and unhandled child exceptions were returned with generic `exit_code: 1` without `failure_class`. In `runner.js`, `runIsolatedMutation` evaluated non-zero exit codes as detected defects (`defects += 1`), incorrectly promoting infrastructure or tooling crashes to passed challenge outcomes.

## Decision
1. In `worker-sandbox.js`, ensure `child.on("error")` and synchronous spawn `catch` blocks set `failure_class: "spawn_error"`.
2. In `runner.js`, check `run.failure_class` and execution errors before evaluating exit codes:
   - `missing_tests` -> `outcome: "error"`, reason `MISSING_TESTS`
   - `timeout` -> `outcome: "error"`, reason `CHALLENGE_TIMEOUT`
   - `spawn_error`, `sandbox_rejection`, `cancel`, or tooling errors -> `outcome: "error"`, reason `CHALLENGE_EXECUTION_ERROR`
3. Never increment `defects_detected` unless tests fail strictly due to test assertions (`exit_code !== 0` with no infrastructure error) against an applied mutation/revert.

## Alternatives
- Rely on string parsing of `stderr`: rejected as fragile across different platforms and Node.js runtime versions.
- Map infrastructure crashes to `outcome: "failed"` with `COMPLACENT_TEST_DETECTED`: rejected because an infrastructure error is not evidence of test suite complacency.
- Coalesce all non-zero exit codes into defect detection: rejected because crashes do not prove assertion failure.

## Consequences
- Guaranteed fail-closed handling for spawn errors, timeouts, and sandbox violations.
- Eliminates false positive challenge passes caused by broken test runners or missing executables.
- Reversibility: high (localized within `worker-sandbox.js` and `runner.js`).
