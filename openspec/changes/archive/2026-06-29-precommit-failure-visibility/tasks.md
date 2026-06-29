# Tasks: Precommit Failure Visibility

## Lite Change Contract

- Change class: small
- Behavioral contract: Capture `check.js` subprocess output via `stdio: "pipe"`; on failure dump captured output then emit a clear `===`-delimited banner citing the block reason; on success emit only a brief one-liner — no noise flooding.
- Acceptance checks:
  - On `check.js` failure: captured stdout/stderr appears verbatim before a `===` banner that names the blocking reason.
  - On `check.js` success: captured output is suppressed; only a short one-liner confirms validation passed.
  - `DISABLE_OSPEC_PRECOMMIT=true`, `DISABLE_OSPEC_ATTRIBUTION_CHECK=true`, and `git commit --no-verify` continue working identically.
  - `node scripts/check.js` (full suite) exits 0 with all tests green.
- Escalation trigger: If the change requires touching `check.js` validation logic or contracts, escalate to standard SDD.

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~75–95 (≈45 test lines + ≈40 hook lines) |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | exception-ok |
| Chain strategy | size-exception |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | All RED tests + GREEN impl + regression guards | PR 1 | Entirely within `scripts/hooks/`; self-contained; `exception-ok` already accepted |

### Checklist Status Legend

- `[ ]` Not implemented yet
- `[~]` Implemented but not yet verified locally
- `[x]` Implemented and verified locally

## Phase 1: RED Tests — Capture and Banner Behavior

Write tests that FAIL against the current code before touching production files.

- [x] 1.1 In `scripts/hooks/pre-commit-hook.test.js`, add test `"on check.js failure, emits === banner citing the reason"`: mock `console.error` via `t.mock.method(console, "error", ...)` to record all calls; mock `child_process.spawnSync` to return `{ status: 1, stdout: "TAP output\n", stderr: "" }` for `scripts/check.js`; run `runPreCommit()`; assert at least one recorded `console.error` argument contains `"==="`. Confirm the test FAILS on current code (current failure message has no `===`).
- [x] 1.2 In `scripts/hooks/pre-commit-hook.test.js`, add test `"on check.js failure, writes captured stdout before exit"`: mock `process.stdout.write` via `t.mock.method(process.stdout, "write", ...)` to record calls; mock `spawnSync` for `scripts/check.js` returning `{ status: 1, stdout: "captured-output-line\n", stderr: "" }`; run `runPreCommit()`; assert a recorded write contains `"captured-output-line"`. Confirm the test FAILS on current code (current code never writes `checkResult.stdout`).
- [x] 1.3 In the existing test `"blocks commit when check.js fails"`, update the `spawnSync` mock return to include `stdout: "TAP output\n", stderr: ""` — aligns mock contract with the pipe-mode output shape; the existing `assert.equal(exitCode, 1)` assertion stays unchanged.

## Phase 2: Core Implementation — pipe capture + banner

Make the Phase 1 RED tests go GREEN.

- [x] 2.1 In `scripts/hooks/pre-commit-hook.js`, add `console.log("OSPEC-PRECOMMIT: Ejecutando validación de OpenSpec...")` immediately before the `spawnSync` call for `scripts/check.js` (provides progress feedback while output is buffered).
- [x] 2.2 In `scripts/hooks/pre-commit-hook.js`, change the `spawnSync` options for `scripts/check.js` from `{ cwd: repoRoot, stdio: "inherit" }` to `{ cwd: repoRoot, stdio: "pipe", encoding: "utf8" }` — stdout and stderr are now captured strings on the result object.
- [x] 2.3 In `scripts/hooks/pre-commit-hook.js`, on the success path (after the `checkResult.status !== 0` block exits cleanly), add `console.log("OSPEC-PRECOMMIT: Validación completada. Commit permitido.")` — do NOT write the captured output.
- [x] 2.4 In `scripts/hooks/pre-commit-hook.js`, on the failure path (`checkResult.status !== 0`): (a) write `checkResult.stdout` to stdout if non-empty (`if (checkResult.stdout) process.stdout.write(checkResult.stdout)`); (b) write `checkResult.stderr` to stderr if non-empty (`if (checkResult.stderr) process.stderr.write(checkResult.stderr)`); (c) replace the current `console.error("\nOSPEC-PRECOMMIT: Error de validación...")` single-line with a `===`-delimited block that names `check.js` as the failure origin and reminds the user of the bypass options (`DISABLE_OSPEC_PRECOMMIT` / `--no-verify`).
- [x] 2.5 Re-run `node --test scripts/hooks/pre-commit-hook.test.js` — confirm tests 1.1 and 1.2 now pass GREEN. All pre-existing tests must remain GREEN.

## Phase 3: Regression Guards and Verification

- [x] 3.1 In `scripts/hooks/pre-commit-hook.test.js`, add test `"on check.js success, does not write captured stdout to process.stdout"`: mock `process.stdout.write` to record calls; mock `spawnSync` for `scripts/check.js` returning `{ status: 0, stdout: "lots-of-tap-output\n", stderr: "" }`; mock `fs.existsSync` returning `false`; run `runPreCommit()`; assert no recorded write contains `"lots-of-tap-output"`. This is a GREEN guard (regression protection for the success-path suppression).
- [x] 3.2 Read `scripts/hooks/commit-msg-hook.js` and confirm its existing failure path already emits `===`-delimited banners — no source changes required; record as verified, no task needed.
- [x] 3.3 Run `node --test scripts/**/*.test.js` locally; confirm zero `not ok` lines and exit code 0.
- [x] 3.4 Run `node scripts/check.js` end-to-end; confirm final line is `All checks passed.` and exit code is 0.
