# Apply Progress: Codex Hooks Bridge

**Change**: codex-hooks-bridge  
**Mode**: Strict TDD  

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR | Notes / Rationale |
|------|-----------|-------|------------|-----|-------|-------------|----------|-------------------|
| 1.1 | `scripts/lib/target-transform.test.js` | Unit | ✅ 71/71 | ✅ Written | ✅ Passed | ➖ Single | ✅ Clean | Tested `$PLUGIN_ROOT` substitution and PascalCase mapping. |
| 1.2 | `scripts/lib/target-transform.test.js` | Unit | ✅ 71/71 | ✅ Covered | ✅ Passed | ➖ Single | ➖ None | Added hooks configuration to `codex.js` target profile. |
| 1.3 | `scripts/lib/target-transform.test.js` | Unit | ✅ 72/72 | N/A | ✅ Passed | ➖ Single | ➖ None | Refactoring review confirmed clean concern separation. |
| 2.1 | `scripts/lib/contract-checkers/i3-budget-constant.test.js` | Unit | ✅ 7/7 | ✅ Written | ✅ Passed | ➖ Single | ✅ Clean | Mocked target profile to test budget violation detection. |
| 2.2 | `scripts/lib/contract-checkers/i3-budget-constant.test.js` | Unit | ✅ 7/7 | ✅ Covered | ✅ Passed | ➖ Single | ➖ None | Loaded Codex profile and resolved source hooks file path. |
| 2.3 | `scripts/lib/contract-checkers/i3-budget-constant.test.js` | Unit | ✅ 8/8 | N/A | ✅ Passed | ➖ Single | ➖ None | De-duplicated checked hook files using a Set. |
| 3.1 | `scripts/check.js` | Integration | ✅ 1139/1139 | N/A | ✅ Passed | ➖ Single | ➖ None | Added `codex` to active checklist in `check.js`. |
| 3.2 | `scripts/check.js` | Integration | ✅ 1139/1139 | N/A | ✅ Passed | ➖ Single | ➖ None | Verification runs execute correctly with no errors. |
| 4.1 | `scripts/lib/contract-checkers/i3-budget-constant.test.js` | Unit | ✅ 8/8 | ✅ Written | ✅ Passed | ➖ Single | ➖ None | Asserted `null` or non-object in hooks config doesn't throw TypeError. |
| 4.2 | `scripts/lib/contract-checkers/i3-budget-constant.js` | Unit | ✅ 8/8 | ✅ Covered | ✅ Passed | ➖ Single | ➖ None | Modified `i3-budget-constant.js` to assert non-null object. |
| 4.3 | `scripts/lib/target-transform.test.js` | Unit | ✅ 72/72 | ✅ Written | ✅ Passed | ➖ Single | ➖ None | Asserted `parseJsonFile` throws clean error on null/non-object. |
| 4.4 | `scripts/lib/target-transform.js` | Unit | ✅ 72/72 | ✅ Covered | ✅ Passed | ➖ Single | ➖ None | Modified `parseJsonFile` to throw on null or non-object. |
| 4.5 | `scripts/check.js` | Integration | ✅ 1139/1139 | N/A | ✅ Passed | ➖ Single | ➖ None | Refactored `runStep` to throw Errors on failure and `main` to catch them. |
| 4.6 | `scripts/check.js` | Integration | ✅ 1139/1139 | N/A | ✅ Passed | ➖ Single | ➖ None | Verification runs execute correctly with zero errors. |

## Test Summary
- **Total tests written**: 4
- **Total tests passing**: 1141 (all native test runner files + full `check.js` run)
- **Layers used**: Unit (4 new tests), Integration (1 new target integrated)
- **Approval tests** (refactoring): None — no pre-existing code refactored behaviorally
- **Pure functions created**: 1 (`codexHooks` in `scripts/lib/target-transform.js`)

## Files Changed

| File | Action | What Was Done |
|------|--------|---------------|
| `scripts/lib/target-profiles/codex.js` | Modified | Added hooks schema configuration: format `"codex"`, source `"hooks/hooks.json"`, location `"hooks/hooks.json"`. |
| `scripts/lib/target-transform.js` | Modified | Implemented `codexHooks` transform and modified `parseJsonFile` to throw clean error on null/non-object. |
| `scripts/lib/target-transform.test.js` | Modified | Added unit tests for translation and `parseJsonFile` validation on null/non-object. |
| `scripts/lib/contract-checkers/i3-budget-constant.js` | Modified | Loaded Codex profile and resolved budget coherence; asserted `hooksConfig` is non-null object. |
| `scripts/lib/contract-checkers/i3-budget-constant.test.js` | Modified | Added unit tests for budget violations and handling of null/non-object. |
| `scripts/configure/__fixtures__/golden/codex/hooks/hooks.json` | Modified | Updated golden fixture file to reflect corrected command variables and trailing newline. |
| `scripts/check.js` | Modified | Added `codex` target to active checklist; refactored `runStep` to throw on failure and wrap `main` in try/catch. |

## Deviations from Design
None — implementation matches design.

## Issues Found
None.

## Remaining Tasks
None — all tasks completed.

## Workload / PR Boundary
- Mode: single PR
- Boundary: Tasks 1.1 to 4.6
- Estimated review budget impact: Low (~140 changed lines, well under 400-line budget risk limit)

## Status
14/14 tasks complete. Ready for verify.

---

## Remediation Batch 2026-07-09 — 4R zero-warning pass

### TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR | Notes / Rationale |
|------|-----------|-------|------------|-----|-------|-------------|----------|-------------------|
| 5.1 | `scripts/lib/target-transform.test.js` | Unit | ✅ 73/73 | ✅ Written | ✅ Passed | ✅ 4 cases | ✅ Clean | Added quoted `$PLUGIN_ROOT` expectations plus malformed `hooks`, event-array, and command validation cases. |
| 5.2 | `scripts/lib/target-transform.js` | Unit | ✅ 73/73 | ✅ Covered | ✅ Passed | ✅ 4 cases | ✅ Clean | Hardened Codex hook rewriting with path-aware validation and preserved command args while quoting the plugin-root path segment. |
| 5.3 | `scripts/lib/contract-checkers/i3-budget-constant.test.js`, `scripts/configure/validate-codex.test.js` | Unit | ✅ 9/9 (`i3-budget-constant`), N/A (new validator test file) | ✅ Written | ✅ Passed | ✅ 3 cases | ✅ Clean | Added fail-closed profile-loader coverage and validator tests for unreadable files and unquoted hook commands. |
| 5.4 | `scripts/lib/contract-checkers/i3-budget-constant.js`, `scripts/configure/validate-codex.js` | Unit | ✅ 9/9 (`i3-budget-constant`), ✅ 28/28 (`real-repo.test.js`) | ✅ Covered | ✅ Passed | ✅ 3 cases | ✅ Clean | Checker now reports Codex profile load errors explicitly; validator now records unreadable-file errors and rejects unquoted `$PLUGIN_ROOT` hook commands. |
| 5.5 | `scripts/check.test.js` | Unit | N/A (new dedicated test file) | ✅ Written | ✅ Passed | ✅ 4 cases | ✅ Clean | Added dedicated tests for codex inclusion, spawn failure propagation, and temp-dir cleanup on failure. |
| 5.6 | `scripts/check.js`, docs/fixtures | Unit + Integration | ✅ 21/21 (`cli.test.js`), ✅ 28/28 (`real-repo.test.js`) | ✅ Covered | ✅ Passed | ✅ 3 cases | ✅ Clean | Refactored `check.js` with dependency injection for tests, refreshed stale comments/spec text, and updated the committed Codex golden fixture. |
| 5.7 | `npm test` | Integration | ✅ targeted suites green | N/A | ✅ Passed | ➖ Single | ➖ None | Full repository suite passed after remediation, including generated-target validation for codex. |

### Test Summary
- **Total tests written**: 11 (`scripts/check.test.js` 4, `scripts/configure/validate-codex.test.js` 3, `scripts/lib/target-transform.test.js` 3, `scripts/lib/contract-checkers/i3-budget-constant.test.js` 1)
- **Total tests passing**: `npm test` passed (`node --test scripts/**/*.test.js` via `scripts/check.js`, plus all target validation steps)
- **Layers used**: Unit (target-transform, i3 checker, validate-codex, check.js), Integration (`cli.test.js`, `real-repo.test.js`, full `npm test`)
- **Approval tests** (refactoring): None — behavior changes were specified by the 4R findings
- **Pure functions created**: 4 helper functions in `scripts/lib/target-transform.js` for Codex hook validation/rewrite

### Files Changed

| File | Action | What Was Done |
|------|--------|---------------|
| `scripts/lib/target-transform.js` | Modified | Added explicit Codex hook-shape validation and quoted `$PLUGIN_ROOT` path rewriting. |
| `scripts/lib/target-transform.test.js` | Modified | Added RED coverage for quoted commands plus malformed `hooks`/event/command inputs. |
| `scripts/lib/contract-checkers/i3-budget-constant.js` | Modified | Made Codex profile loading fail closed with an explicit offender. |
| `scripts/lib/contract-checkers/i3-budget-constant.test.js` | Modified | Added regression coverage for Codex profile loader failures. |
| `scripts/configure/validate-codex.js` | Modified | Validator now reports unreadable files and rejects unquoted hook commands; comments updated. |
| `scripts/configure/validate-codex.test.js` | Added | New unit suite covering unreadable-file and quoted-hook validation behavior. |
| `scripts/check.js` | Modified | Added dependency-injected seams for dedicated failure-path tests and refreshed target-matrix comments. |
| `scripts/check.test.js` | Added | New unit suite for codex inclusion, error propagation, and temp-dir cleanup. |
| `scripts/configure/__fixtures__/golden/codex/hooks/hooks.json` | Modified | Updated golden snapshot to quoted `$PLUGIN_ROOT` hook commands. |
| `scripts/lib/target-profiles/codex.js` | Modified | Updated stale hooks comment to match transformed Codex behavior. |
| `openspec/changes/codex-hooks-bridge/proposal.md` | Modified | Updated change narrative and success criteria to quote Codex hook paths. |
| `openspec/changes/codex-hooks-bridge/design.md` | Modified | Updated technical approach/examples to quote Codex hook paths and reflect new validator/checker hardening. |
| `openspec/changes/codex-hooks-bridge/tasks.md` | Modified | Added and completed Phase 5 remediation follow-up tasks. |
| `openspec/changes/codex-hooks-bridge/state.yaml` | Modified | Moved workflow back to `ready-for-verify` after this remediation batch. |

### Deviations from Design
None — remediation stays within the existing design and only tightens validation/error handling.

### Issues Found
None.

### Remaining Tasks
None in apply — next step is re-run verify/4R on the remediated tree.

### Workload / PR Boundary
- Mode: single PR
- Boundary: Tasks 5.1 to 5.7
- Estimated review budget impact: Low-to-medium (~230 changed lines across code/tests/OpenSpec, still under the 400-line budget)

### Status
21/21 tasks complete. Ready for verify.

---

## Remediation Batch 2026-07-08 — flaky lock warning root-cause fix

### TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR | Notes / Rationale |
|------|-----------|-------|------------|-----|-------|-------------|----------|-------------------|
| 6.1 | `scripts/lib/ospec-state.test.js` | Unit | ✅ 53/53 | ✅ Written | ✅ Failed first | ➖ Single | ➖ None | Added a deterministic regression that simulates the Windows `EPERM` raised while opening the sibling `.lock` file with `wx`. |
| 6.2 | `scripts/lib/ospec-state.js` | Unit | ✅ 53/53 | ✅ Covered | ✅ Passed | ✅ 2 cases | ➖ None | `withFileLock()` now treats Windows `EPERM`/`EACCES` during lock acquisition as bounded contention, preserving existing `EEXIST` retry behavior. |
| 6.3 | `scripts/lib/ospec-state.test.js`, `npm test` | Unit + Integration | ✅ targeted suite green | N/A | ✅ Passed | ✅ 4 repeated runs | ➖ None | Re-ran the lock suite three extra times and then full `npm test`; no `.ospec/runtime/subagent-events.jsonl.lock` EPERM warning reproduced. |

### Test Summary
- **Total tests written**: 1 (`scripts/lib/ospec-state.test.js`)
- **Total tests passing**: `scripts/lib/ospec-state.test.js` 54/54; repeated 3x green before final `npm test`; final `npm test` passed with 0 errors and 0 warnings.
- **Layers used**: Unit (`scripts/lib/ospec-state.test.js`), Integration (`npm test`)
- **Approval tests** (refactoring): None — behavior change is a targeted reliability fix for the lock path.
- **Pure functions created**: 1 (`isLockContentionError` in `scripts/lib/ospec-state.js`)

### Files Changed

| File | Action | What Was Done |
|------|--------|---------------|
| `scripts/lib/ospec-state.test.js` | Modified | Added a deterministic RED test for transient Windows `EPERM` during `.lock` acquisition. |
| `scripts/lib/ospec-state.js` | Modified | Added Windows lock-contention detection so `withFileLock()` retries `EPERM`/`EACCES` races instead of failing runtime-event appends. |
| `openspec/changes/codex-hooks-bridge/tasks.md` | Modified | Added and completed Phase 6 flaky-lock remediation tasks. |

### Deviations from Design
None — the fix stays within the existing hook/runtime locking design and only hardens the Windows contention path.

### Issues Found
Root cause is code-level, not purely environmental: Windows can surface a transient `EPERM`/`EACCES` while another writer is creating/removing the sibling lock file, and the previous implementation treated that as a fatal error instead of bounded contention.

### Remaining Tasks
None in apply — next step is verify so the stale warning can be cleared from `verify-report.md`.

### Workload / PR Boundary
- Mode: single PR
- Boundary: Tasks 6.1 to 6.3
- Estimated review budget impact: Low (~40 changed lines)

### Status
24/24 tasks complete. Ready for verify.

---

## Remediation Batch 2026-07-09 — direct EACCES retry coverage

### TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR | Notes / Rationale |
|------|-----------|-------|------------|-----|-------|-------------|----------|-------------------|
| 6.4 | `scripts/lib/ospec-state.test.js` | Unit | ✅ 54/54 | ✅ Written | ✅ Passed | ✅ 2 cases | ➖ None | Added direct `EACCES` lock-open race coverage alongside the existing `EPERM` regression so both Windows contention branches are exercised in `withFileLock()`. |
| 6.5 | `scripts/lib/ospec-state.test.js`, `npm test` | Unit + Integration | ✅ targeted suite green | N/A | ✅ Passed | ➖ Single | ➖ None | Re-ran the lock suite and the full repository test command after adding the direct `EACCES` regression. |

### Test Summary
- **Total tests written**: 1 (`scripts/lib/ospec-state.test.js`)
- **Total tests passing**: `scripts/lib/ospec-state.test.js` 55/55; `npm test` passed with all target validations green.
- **Layers used**: Unit (`scripts/lib/ospec-state.test.js`), Integration (`npm test`)
- **Approval tests** (refactoring): None — no production refactor was needed because the existing `EACCES` retry branch already behaved correctly.
- **Pure functions created**: 0

### Files Changed

| File | Action | What Was Done |
|------|--------|---------------|
| `scripts/lib/ospec-state.test.js` | Modified | Added direct regression coverage for transient Windows `EACCES` during sibling `.lock` acquisition in `withFileLock()`. |
| `openspec/changes/codex-hooks-bridge/tasks.md` | Modified | Completed Phase 6 follow-up tasks 6.4 and 6.5. |
| `openspec/changes/codex-hooks-bridge/apply-progress.md` | Modified | Appended the new direct `EACCES` evidence without overwriting prior remediation history. |
| `openspec/changes/codex-hooks-bridge/state.yaml` | Modified | Cleared the apply blocker and moved the change back to `ready-for-verify` pending a fresh verify pass. |

### Deviations from Design
None — the follow-up only adds the missing direct regression proof for the already-designed Windows contention handling.

### Issues Found
None.

### Remaining Tasks
None in apply — next step is to re-run verify so the stale coverage blocker can be removed from `verify-report.md`.

### Workload / PR Boundary
- Mode: single PR
- Boundary: Tasks 6.4 to 6.5
- Estimated review budget impact: Low (~20 changed lines)

### Status
26/26 tasks complete. Ready for verify.

---

## Remediation Batch 2026-07-08 — remaining final 4R warnings closed

### TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR | Notes / Rationale |
|------|-----------|-------|------------|-----|-------|-------------|----------|-------------------|
| 7.1 | `scripts/lib/contract-checkers/i3-budget-constant.test.js` | Unit | ✅ 10/10 | ✅ Written | ✅ Passed | ✅ 2 cases | ➖ None | Added direct empty-string and non-string `hooks.source` regressions so `loadCodexProfileSource()` proves the explicit offender path. |
| 7.2 | `scripts/check.test.js` | Unit | ✅ 4/4 | ✅ Written | ✅ Passed | ✅ 2 cases | ➖ None | Added the missing non-zero exit-status branch test for `runStep()` with stdout/stderr assertions. |
| 7.3 | `scripts/configure/validate-codex.test.js` | Unit | ✅ 3/3 | ✅ Written | ✅ Passed | ✅ 2 cases | ✅ Clean | Added second-read fault injection so unreadable `.codex/agents/*.toml` and `skills/**/SKILL.md` are proven to degrade into validation errors outside the forbidden-text scan. |
| 7.4 | `scripts/lib/ospec-state.test.js` | Unit | ✅ 55/55 | ✅ Written | ✅ Passed | ✅ 2 cases | ✅ Clean | Added direct stale-reclaim `EPERM` and final-cleanup `EACCES` regressions for Windows lock removal races. |
| 7.5 | `scripts/configure/validate-codex.js`, `scripts/lib/ospec-state.js` | Unit | ✅ targeted suites green | ✅ Covered | ✅ Passed | ✅ 4 cases | ✅ Clean | Introduced `safeReadUtf8()` plus resilient `removeLockFile()` retries so unreadable required files and transient lock-removal errors no longer abort validation/apply cleanup. |
| 7.6 | `npm test` | Integration | ✅ targeted suites green | N/A | ✅ Passed | ➖ Single | ➖ None | Re-ran the targeted suites and the full repository test command; all targets validated cleanly. |

### Test Summary
- **Total tests written**: 6 (`scripts/lib/contract-checkers/i3-budget-constant.test.js` 1, `scripts/check.test.js` 1, `scripts/configure/validate-codex.test.js` 2, `scripts/lib/ospec-state.test.js` 2)
- **Total tests passing**: targeted suites green (`11 + 5 + 5 + 57`) and full `npm test` passed with all target validations green
- **Layers used**: Unit (all new regression tests), Integration (`npm test`)
- **Approval tests** (refactoring): None — all changes are behavior-hardening fixes driven by the 4R warnings
- **Pure functions created**: 2 (`safeReadUtf8` in `scripts/configure/validate-codex.js`, `isWindowsLockRemovalError` in `scripts/lib/ospec-state.js`)

### Files Changed

| File | Action | What Was Done |
|------|--------|---------------|
| `scripts/lib/contract-checkers/i3-budget-constant.test.js` | Modified | Added direct regression coverage for empty-string and non-string Codex `hooks.source` exports. |
| `scripts/check.test.js` | Modified | Added explicit `runStep()` non-zero exit branch coverage with stderr assertions. |
| `scripts/configure/validate-codex.test.js` | Modified | Added second-read unreadable-file regressions for agent TOML and skill markdown validation paths. |
| `scripts/configure/validate-codex.js` | Modified | Wrapped required-file reads in `safeReadUtf8()` and threaded injected readers through the agent/skill validators. |
| `scripts/lib/ospec-state.test.js` | Modified | Added direct stale-lock reclaim and final cleanup Windows removal-race regressions. |
| `scripts/lib/ospec-state.js` | Modified | Added resilient lock-file removal retries for `reclaimStaleLock()` and `withFileLock()` cleanup. |
| `openspec/changes/codex-hooks-bridge/tasks.md` | Modified | Added and completed Phase 7 final-warning remediation tasks. |
| `openspec/changes/codex-hooks-bridge/state.yaml` | Modified | Re-opened the change for verify after the final apply remediation batch. |

### Deviations from Design
None — the batch only adds missing regression proof and resilience hardening within the existing design.

### Issues Found
None.

### Remaining Tasks
None in apply — next step is a fresh verify/4R pass against this remediated tree.

### Workload / PR Boundary
- Mode: single PR
- Boundary: Tasks 7.1 to 7.6
- Estimated review budget impact: Low (~120 changed lines)

### Status
32/32 tasks complete. Ready for verify.

---

## Remediation Batch 2026-07-09 — direct malformed-hook validator coverage

### TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR | Notes / Rationale |
|------|-----------|-------|------------|-----|-------|-------------|----------|-------------------|
| 8.1 | `scripts/configure/validate-codex.test.js` | Unit | ✅ 5/5 | ✅ Written | ✅ Passed | ✅ 4 cases | ➖ None | Added direct `validate()` regressions for non-object `hooks`, non-array event payloads, malformed entries, and non-string commands; existing production validation already satisfied the contract so no code change was needed. |
| 8.2 | `scripts/configure/validate-codex.test.js`, `npm test` | Unit + Integration | ✅ targeted suite green | N/A | ✅ Passed | ➖ Single | ➖ None | Re-ran the validator suite and the full repository test command after adding the direct malformed-shape coverage. |

### Test Summary
- **Total tests written**: 4 (`scripts/configure/validate-codex.test.js`)
- **Total tests passing**: `scripts/configure/validate-codex.test.js` 9/9; `npm test` passed with all target validations green.
- **Layers used**: Unit (`scripts/configure/validate-codex.test.js`), Integration (`npm test`)
- **Approval tests** (refactoring): None — production code was unchanged because the validator already handled these malformed shapes correctly.
- **Pure functions created**: 0

### Files Changed

| File | Action | What Was Done |
|------|--------|---------------|
| `scripts/configure/validate-codex.test.js` | Modified | Added direct malformed `hooks/hooks.json` coverage for non-object `hooks`, non-array event values, malformed hook entries, and non-string commands. |
| `openspec/changes/codex-hooks-bridge/tasks.md` | Modified | Added and completed Phase 8 tasks for the last reliability-warning closure. |
| `openspec/changes/codex-hooks-bridge/apply-progress.md` | Modified | Appended the Phase 8 TDD evidence without overwriting prior remediation history. |
| `openspec/changes/codex-hooks-bridge/state.yaml` | Modified | Re-opened the change for verify after adding the missing direct validator coverage. |

### Deviations from Design
None — this batch only adds the missing direct regression proof for behavior already specified and implemented.

### Issues Found
None.

### Remaining Tasks
None in apply — next step is a fresh verify pass so the stale final reliability warning can be cleared.

### Workload / PR Boundary
- Mode: single PR
- Boundary: Tasks 8.1 to 8.2
- Estimated review budget impact: Low (~35 changed lines)

### Status
34/34 tasks complete. Ready for verify.

---

## Remediation Batch 2026-07-08 — directed resilience warning closure

### TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR | Notes / Rationale |
|------|-----------|-------|------------|-----|-------|-------------|----------|-------------------|
| 9.1 | `scripts/configure/validate-codex.test.js` | Unit | ✅ 9/9 | ✅ Written | ✅ Passed | ✅ 2 cases | ➖ None | Added direct regressions for unreadable `.codex/agents/` and `skills/` directory enumeration so validator failures degrade into explicit errors instead of throwing. |
| 9.2 | `scripts/configure/validate-codex.js` | Unit | ✅ 9/9 | ✅ Covered | ✅ Passed | ✅ 2 cases | ✅ Clean | `walkFiles()` / `walkPaths()` now trap traversal faults, preserve successful discoveries, and append path-aware validation errors. |
| 9.3 | `scripts/lib/ospec-state.test.js` | Unit | ✅ 57/57 | ✅ Written | ✅ Passed | ✅ 2 cases | ➖ None | Added direct regressions for persistent final-cleanup failure and retry exhaustion so the lock path no longer falls back to unlocked execution. |
| 9.4 | `scripts/lib/ospec-state.js` | Unit | ✅ 57/57 | ✅ Covered | ✅ Passed | ✅ 2 cases | ✅ Clean | Persistent Windows lock-removal failures now throw, and `withFileLock()` aborts after retry exhaustion instead of running unlocked. |
| 9.5 | `scripts/configure/validate-codex.test.js`, `scripts/lib/ospec-state.test.js`, `npm test` | Unit + Integration | ✅ targeted suites green | N/A | ✅ Passed | ➖ Single | ➖ None | Re-ran targeted suites, observed one transient unrelated parity failure on the first full-suite attempt, confirmed the isolated parity test, then re-ran `npm test` successfully. |

### Test Summary
- **Total tests written**: 4 (`scripts/configure/validate-codex.test.js` 2, `scripts/lib/ospec-state.test.js` 2)
- **Total tests passing**: `scripts/configure/validate-codex.test.js` 11/11; `scripts/lib/ospec-state.test.js` 59/59; final `npm test` passed with all checks green.
- **Layers used**: Unit (`validate-codex`, `ospec-state`), Integration (`npm test`)
- **Approval tests** (refactoring): None — behavior changes were required by the resilience warnings.
- **Pure functions created**: 1 (`addTraversalError` in `scripts/configure/validate-codex.js`)

### Files Changed

| File | Action | What Was Done |
|------|--------|---------------|
| `scripts/configure/validate-codex.test.js` | Modified | Added direct traversal-failure regressions for unreadable `.codex/agents/` and `skills/` directories. |
| `scripts/configure/validate-codex.js` | Modified | Hardened recursive walkers to convert enumeration failures into explicit validation errors. |
| `scripts/lib/ospec-state.test.js` | Modified | Added direct regressions for persistent lock-cleanup failure and retry exhaustion without unlocked fallback. |
| `scripts/lib/ospec-state.js` | Modified | Made persistent lock-removal failures throw and removed unlocked fallback after lock-acquisition retry exhaustion. |
| `openspec/changes/codex-hooks-bridge/tasks.md` | Modified | Added and completed Phase 9 directed resilience-remediation tasks. |
| `openspec/changes/codex-hooks-bridge/state.yaml` | Modified | Moved the change back to `ready-for-verify` after the final resilience remediation batch. |

### Deviations from Design
None — the batch only hardens error handling around the existing validator and lock lifecycle design.

### Issues Found
The first `npm test` pass surfaced a transient unrelated parity failure in `scripts/hooks/parity-contract.test.js`; rerunning that test in isolation and the full suite both passed without further changes.

### Remaining Tasks
None in apply — next step is a fresh verify pass focused on the resilience warnings.

### Workload / PR Boundary
- Mode: single PR
- Boundary: Tasks 9.1 to 9.5
- Estimated review budget impact: Low (~80 changed lines)

### Status
39/39 tasks complete. Ready for verify.
