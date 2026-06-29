# Apply Progress: precommit-failure-visibility

**Mode**: Strict TDD
**Delivery**: size-exception (exception-ok, single PR, ~75–95 lines — within Low budget)
**Batch**: 1/1 — all tasks

---

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR | Notes |
|------|-----------|-------|------------|-----|-------|-------------|----------|-------|
| 1.1 | `scripts/hooks/pre-commit-hook.test.js` | Unit | ✅ 8/8 | ✅ Written | ✅ Passed (10/10) | ✅ Task 1.2 covers different axis (stdout write); task 3.1 covers success-path inverse | ➖ None needed | Test asserts `===` in at least one `console.error` call |
| 1.2 | `scripts/hooks/pre-commit-hook.test.js` | Unit | ✅ 8/8 | ✅ Written | ✅ Passed (10/10) | ✅ Task 3.1 is explicit inverse triangulation (success suppresses output) | ➖ None needed | Test asserts `process.stdout.write` received captured text |
| 1.3 | `scripts/hooks/pre-commit-hook.test.js` | Unit | ✅ 8/8 | N/A (mock update only) | ✅ Passed (stayed green) | ➖ Structural update — aligns mock shape with pipe-mode contract | ➖ None needed | Added `console.error` silence mock; exitCode=1 assertion unchanged |
| 2.1 | N/A (production only) | — | ✅ 8/8 | ✅ Covered by 1.1/1.2 | ✅ Passed | — | ➖ None needed | `console.log` progress line before spawnSync |
| 2.2 | N/A (production only) | — | ✅ 8/8 | ✅ Covered by 1.1/1.2 | ✅ Passed | — | ➖ None needed | `stdio: "pipe", encoding: "utf8"` |
| 2.3 | N/A (production only) | — | ✅ 8/8 | ✅ Covered by 3.1 | ✅ Passed | — | ➖ None needed | `console.log` success one-liner; suppresses captured output |
| 2.4 | N/A (production only) | — | ✅ 8/8 | ✅ Covered by 1.1/1.2 | ✅ Passed | — | ➖ None needed | stdout write + stderr write + `===` banner with origin and bypass |
| 2.5 | `scripts/hooks/pre-commit-hook.test.js` | — | — | — | ✅ 10/10 green | — | — | Verification gate passed after implementing 2.1–2.4 |
| 3.1 | `scripts/hooks/pre-commit-hook.test.js` | Unit | N/A (new test) | GREEN guard written | ✅ Passed (11/11) | ✅ Triangulates 1.2 (inverse: success path suppresses output) | ➖ None needed | Confirms captured stdout NOT leaked on success |
| 3.2 | `scripts/hooks/commit-msg-hook.js` | — | — | — | ✅ Verified | — | — | `======================================================================` banner already present; no changes needed |
| 3.3 | `scripts/**/*.test.js` | — | — | — | ✅ 746/746 | — | — | Zero `not ok` lines, exit 0 |
| 3.4 | `node scripts/check.js` | — | — | — | ✅ `All checks passed.` exit 0 | — | — | End-to-end confirmed |

---

## Test Summary

- **Total tests written**: 3 new (1.1, 1.2, 3.1); 1 updated (1.3)
- **Total tests passing**: 746/746 (full suite, `npm test`)
- **Layers used**: Unit (3 new tests in `scripts/hooks/pre-commit-hook.test.js`)
- **Approval tests** (refactoring): None — no refactoring tasks
- **Pure functions created**: 0 (behavior is side-effect by nature — process IO)

---

## Local Verification Results

| Run | Command | Result |
|-----|---------|--------|
| Safety net | `node --test scripts/hooks/pre-commit-hook.test.js` | 8/8 pass |
| RED confirmation | `node --test scripts/hooks/pre-commit-hook.test.js` | 8 pass, 2 FAIL (1.1, 1.2 as expected) |
| GREEN confirmation | `node --test scripts/hooks/pre-commit-hook.test.js` | 10/10 pass |
| After guard 3.1 | `node --test scripts/hooks/pre-commit-hook.test.js` | 11/11 pass |
| Full suite (3.3) | `node --test scripts/**/*.test.js` | 746/746 pass |
| npm test | `npm test` | 746/746 pass, exit 0 |
| End-to-end (3.4) | `node scripts/check.js` | `All checks passed.` exit 0 |

---

## Files Changed

| File | Action | What Was Done |
|------|--------|---------------|
| `scripts/hooks/pre-commit-hook.js` | Modified | Switched `spawnSync` from `stdio:"inherit"` to `stdio:"pipe",encoding:"utf8"`; added progress log before call; added captured stdout/stderr emit + `===` banner on failure; added success one-liner |
| `scripts/hooks/pre-commit-hook.test.js` | Modified | Added tests 1.1, 1.2, 3.1; updated test 1.3 mock shape to include stdout/stderr; added `console.error` silence in "blocks commit" test |

---

## Deviations from Proposal

None — implementation matches proposal-lite.md exactly (Opción A: pipe capture, suppress on success, emit + banner on failure).

## Issues Found

None.
