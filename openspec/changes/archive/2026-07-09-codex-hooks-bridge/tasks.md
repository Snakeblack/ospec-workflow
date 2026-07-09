# Tasks: Codex Hooks Bridge

## Spec/Design Reconciliation

| Requirement / Scenario | Priority | Design Allocation | Status | Notes |
|------------------------|----------|-------------------|--------|-------|
| `REQ-hooks-003` / Happy path: Codex hooks matching PascalCase and variable rewrites | MUST | `scripts/lib/target-profiles/codex.js` (declaration), `scripts/lib/target-transform.js` (translation in `codexHooks`) | covered-by-design | Clear mapping implementation |
| `REQ-hooks-003` / Go hooks runtime execution: Go wrapper accepts Codex stdio | MUST | `cmd/ospec-hooks/` and `internal/hooks/` (Reuse existing wrappers with Codex payloads) | covered-by-design | Codex standard stdio JSON matches wrapper expectation |
| `REQ-contract-lint-004` / Existing lock/hook guard preserved | MUST | `scripts/lib/contract-checkers/i3-budget-constant.js` (Generalization of lock checks) | covered-by-design | Ensures existing Claude guards remain intact |
| `REQ-contract-lint-004` / Codex lock/hook guard verified | MUST | `scripts/lib/contract-checkers/i3-budget-constant.js` (Verify Codex SessionStart timeout) | covered-by-design | Extended linter validation check |
| `REQ-contract-lint-004` / New budget pair reusing the same checker shape | MUST | `scripts/lib/contract-checkers/i3-budget-constant.js` (Universal contract pattern) | covered-by-design | Generalized budget checker design |

### Reconciliation Verdict
- MUST coverage: complete
- SHOULD/MAY gaps: none
- Ambiguities to track: none

## Review Workload Forecast

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: Low

| Field | Value |
|-------|-------|
| Estimated changed lines | 150-250 lines |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Not needed (single PR) |
| Delivery strategy | ask-on-risk |
| Chain strategy | size-exception |

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Codex target hooks generator, contract linter extension, and check integration | PR 1 | Base branch; tests and validation included |

### Checklist Status Legend

- `[ ]` Not implemented yet
- `[~]` Implemented but not yet verified locally
- `[x]` Implemented and verified locally

## Phase 1: Generator & Profile Configuration

- [x] 1.1 RED: Write failing unit test in 'scripts/lib/target-transform.test.js' asserting `codex` target transforms `hooks/hooks.json` to replace `${CLAUDE_PLUGIN_ROOT}` with `$PLUGIN_ROOT` in command strings [REQ-hooks-003]
- [x] 1.2 GREEN: Add `hooks` declaration to 'scripts/lib/target-profiles/codex.js' and implement `codexHooks` transform function in 'scripts/lib/target-transform.js' wired to step 5 [REQ-hooks-003]
- [x] 1.3 REFACTOR: Refactor `target-transform.js` hooks handler for cleaner separation of concerns.

## Phase 2: Contract Linter Extension

- [x] 2.1 RED: Write failing unit test in 'scripts/lib/contract-checkers/i3-budget-constant.test.js' asserting that the linter fails when Codex `SessionStart` timeout budget is violated by `LOCK_STALE_MS` [REQ-contract-lint-004]
- [x] 2.2 GREEN: Modify 'scripts/lib/contract-checkers/i3-budget-constant.js' to load the `codex` profile, resolve its hooks config, and assert timeout budget coherence [REQ-contract-lint-004]
- [x] 2.3 REFACTOR: Refactor linter script config loader logic.

## Phase 3: Integration & Verification

- [x] 3.1 GREEN: Add the `codex` target (validate: true) to the target list in 'scripts/check.js'
- [x] 3.2 Verification: Run `node scripts/check.js` (or `npm test`) to confirm that all tests pass and codex target generates successfully.

## Phase 4: 4R Remediation Tasks

- [x] 4.1 RED: Write failing test in `scripts/lib/contract-checkers/i3-budget-constant.test.js` asserting that the checker handles null or non-object JSON values in hooks config without throwing TypeError.
- [x] 4.2 GREEN: Modify `scripts/lib/contract-checkers/i3-budget-constant.js` to assert `hooksConfig` is a non-null object.
- [x] 4.3 RED: Write failing test in `scripts/lib/target-transform.test.js` asserting that `parseJsonFile` throws a clean error when parsing JSON content that is `null` or a non-object.
- [x] 4.4 GREEN: Modify `parseJsonFile` in `scripts/lib/target-transform.js` to throw if the parsed value is null or not an object.
- [x] 4.5 GREEN: Refactor `scripts/check.js` `runStep` to throw Errors on failure rather than exit, and wrap `main` in a try/catch block to ensure temporary directory cleanup on failure.
- [x] 4.6 Verification: Run `node scripts/check.js` to ensure the entire suite (including target cleanups on synthetic failure) passes.

## Phase 5: 4R Remediation Follow-up

- [x] 5.1 RED: Add failing tests for quoted Codex hook commands plus malformed Codex hook input validation in `scripts/lib/target-transform.test.js`.
- [x] 5.2 GREEN: Harden `scripts/lib/target-transform.js` to validate `hooks`, per-event entry arrays, and `entry.command`, and emit quoted `$PLUGIN_ROOT` command paths.
- [x] 5.3 RED: Add failing tests for Codex profile load failures in `scripts/lib/contract-checkers/i3-budget-constant.test.js` and unreadable/unsafe Codex validation cases in `scripts/configure/validate-codex.test.js`.
- [x] 5.4 GREEN: Make `scripts/lib/contract-checkers/i3-budget-constant.js` fail closed on Codex profile load errors and make `scripts/configure/validate-codex.js` report unreadable files plus unquoted hook commands.
- [x] 5.5 RED: Add dedicated `scripts/check.test.js` coverage for codex inclusion, error propagation, and temp-dir cleanup.
- [x] 5.6 GREEN: Refactor `scripts/check.js` for dependency-injected tests without changing runtime behavior; update stale comments/docs/fixtures.
- [x] 5.7 Verification: Run `npm test` after remediation and record the evidence in `apply-progress.md`.

## Phase 6: Flaky Lock Warning Remediation

- [x] 6.1 RED: Add a failing unit test in `scripts/lib/ospec-state.test.js` covering transient Windows `EPERM` lock-open races while acquiring `.lock` files for runtime event writes.
- [x] 6.2 GREEN: Modify `scripts/lib/ospec-state.js` so `withFileLock()` retries Windows `EPERM`/`EACCES` lock-open races as contention instead of failing the append path immediately.
- [x] 6.3 Verification: Run repeated `node --test scripts/lib/ospec-state.test.js` executions plus full `npm test` and record the evidence in `apply-progress.md`.
- [x] 6.4 RED: Add a direct unit test in `scripts/lib/ospec-state.test.js` covering transient Windows `EACCES` lock-open races while acquiring `.lock` files for runtime event writes.
- [x] 6.5 Verification: Re-run `node --test scripts/lib/ospec-state.test.js` plus full `npm test`, then append the direct `EACCES` evidence to `apply-progress.md`.

## Phase 7: Final 4R Warning Remediation

- [x] 7.1 RED: Add direct regression coverage in `scripts/lib/contract-checkers/i3-budget-constant.test.js` for invalid Codex `hooks.source` exports (empty and non-string) producing an explicit offender.
- [x] 7.2 RED: Add direct `scripts/check.test.js` coverage for `runStep()` when the child exits with a non-zero status.
- [x] 7.3 RED: Add unreadable-file regression coverage in `scripts/configure/validate-codex.test.js` for `.codex/agents/*.toml` and `skills/**/SKILL.md` reads failing with validation errors.
- [x] 7.4 RED: Add direct `scripts/lib/ospec-state.test.js` coverage for stale-lock reclaim and final cleanup surviving transient Windows `EPERM`/`EACCES` lock-removal failures.
- [x] 7.5 GREEN: Harden `scripts/configure/validate-codex.js` and `scripts/lib/ospec-state.js` so unreadable required files and Windows lock-removal races report/continue safely without hiding data-integrity issues.
- [x] 7.6 Verification: Re-run targeted suites plus full `npm test`, then append the merged TDD evidence to `apply-progress.md` and update `state.yaml`.

## Phase 8: Final reliability warning closure

- [x] 8.1 RED: Add direct `scripts/configure/validate-codex.test.js` coverage proving `validate()` reports malformed `hooks/hooks.json` shapes for non-object `hooks`, non-array event entries, malformed hook entries, and non-string commands.
- [x] 8.2 Verification: Re-run `node --test scripts/configure/validate-codex.test.js` plus full `npm test`, then append the merged TDD evidence to `apply-progress.md` and update `state.yaml`.

## Phase 9: Directed resilience warning closure

- [x] 9.1 RED: Add direct `scripts/configure/validate-codex.test.js` coverage proving unreadable `.codex/agents/` and `skills/` directory traversal degrades into validation errors instead of throwing.
- [x] 9.2 GREEN: Harden `scripts/configure/validate-codex.js` so `walkFiles()` / `walkPaths()` convert traversal failures into explicit validation errors.
- [x] 9.3 RED: Add direct `scripts/lib/ospec-state.test.js` coverage proving persistent lock cleanup/reacquire failures reject instead of silently falling back to unlocked execution.
- [x] 9.4 GREEN: Harden `scripts/lib/ospec-state.js` so persistent `EPERM`/`EACCES` lock cleanup failures surface errors and `withFileLock()` does not run unlocked after retry exhaustion.
- [x] 9.5 Verification: Re-run targeted suites plus full `npm test`, then append merged TDD evidence to `apply-progress.md` and update `state.yaml`.
