# Tasks: Route Coercion Advisory + Lock/Hook Budget Coherence

## Lite Change Contract

- Change class: small
- Behavioral contract: (I2) `matchConditions`/`validateRouteTable` gain a documented, testable advisory path for residual string `"true"`/`"false"` conditions, plus an end-to-end regression lock against the real `openspec/config.yaml` routing table; (I3) `SessionStart` declares an explicit hook timeout, and the file-lock `staleMs` reclamation window becomes coherent with that budget, verified by a cross-file test and kept numerically identical between JS and Go.
- Acceptance checks: the 6 bullets in `proposal-lite.md` §Acceptance Checks; `npm test` and `go test ./...` green.
- Escalation trigger: if closing the gap requires changing `validateRouteTable`'s documented `{valid, errors}` return contract (`openspec/specs/routing/spec.md` §8.1) or redesigning the lock mechanism — neither is needed per the investigation below.

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~220–260 (I2 ~80–90, I3 ~140–170) |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR, two internal commits (I2, I3) for reviewability |
| Delivery strategy | exception-ok |
| Chain strategy | pending |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | I2 — routing coercion advisory + regression test | PR 1 (single PR) | Self-contained: `route-dispatcher.js`, its test, `real-repo.test.js`, `config.yaml`, `routing/spec.md` doc parity |
| 2 | I3 — lock/hook budget coherence, JS+Go parity | PR 1 (single PR) | Self-contained: `hooks.json`, `ospec-state.js`, `store.go`, both coherence tests, `hooks/spec.md` + `hooks-runtime/spec.md` |

### Checklist Status Legend

- `[ ]` Not implemented yet
- `[~]` Implemented but not yet verified locally
- `[x]` Implemented and verified locally

## Phase 1: I2 — RED (routing coercion advisory)

- [x] 1.1 Add `route-dispatcher.test.js` test: `detectResidualBooleanStrings(conditions)` (new pure export) returns the offending key(s) for a conditions map holding string `"true"`/`"false"`, and `[]` for an already-coerced/native-boolean map. Expected to fail (function does not exist yet).
- [x] 1.2 Add `real-repo.test.js` test: parse the real `openspec/config.yaml` via `parseRoutingTable`, build a ctx with native `true` for `explicit_bugfix_intent`/`explicit_refactor_intent`/`explicit_hotfix_intent`, assert `matchConditions` returns `true` for the `bugfix`, `refactor`, and `hotfix` rows. Regression-lock test: expected to pass immediately (coercion already works since the W2 fix) — still written test-first per TDD discipline.

## Phase 2: I2 — GREEN

- [x] 2.1 In `scripts/lib/route-dispatcher.js`, add `detectResidualBooleanStrings(conditions)`: pure helper returning `Object.keys` of the map (excluding `match`) whose value is the literal string `"true"`/`"false"`. Export it alongside `matchConditions`.
- [x] 2.2 Add JSDoc to `matchConditions` documenting the intentional strict-equality contract: coercion of `"true"`/`"false"` happens upstream in `applySubfieldLine`/`coerceBoolean` during parsing (route-dispatcher.js:401-405); `matchConditions` itself never coerces, so a hand-built (non-parsed) conditions map with string booleans will silently fail to match — use `detectResidualBooleanStrings` as an advisory pre-check.
- [x] 2.3 Add a doc-comment pointer on `validateRouteTable` referencing `detectResidualBooleanStrings` for residual-string linting, without adding a field to its return shape (keeps `{valid, errors}` per `openspec/specs/routing/spec.md` §8.1 — see assumption below).
- [x] 2.4 Run `node --test scripts/lib/route-dispatcher.test.js scripts/configure/real-repo.test.js`; confirm 1.1 and 1.2 are GREEN.

## Phase 3: I2 — TRIANGULATE / cosmetic cleanup

- [x] 3.1 In `openspec/config.yaml`, unquote `explicit_bugfix_intent: "true"` → `explicit_bugfix_intent: true` (and the `refactor`/`hotfix` siblings). Verified no functional effect: `parseScalar` strips quotes either way before `coerceBoolean` runs.
- [x] 3.2 Re-run 1.2's real-repo test after 3.1 to confirm the unquoted form still matches (guards against silent parser regressions on unquoted booleans).
- [x] 3.3 Mirror the unquoting in the illustrative table rows (`openspec/specs/routing/spec.md` §4.1, rows 3/5/6) so the baseline doc no longer shows a stale quoted example.

## Phase 4: I3 — RED (lock/hook budget coherence)

- [x] 4.1 Add test in `scripts/lib/ospec-state.test.js`: read `hooks/hooks.json`, assert `hooks.SessionStart[0].timeout` is defined, and assert `LOCK_STALE_MS <= SessionStart_timeout_ms` and `LOCK_STALE_MS >= LOCK_RETRY_ATTEMPTS * LOCK_RETRY_DELAY_MS`. Expected to fail (no `timeout` on `SessionStart` yet; constants not yet exported).
- [x] 4.2 Add test for the same hooks.json-driven invariant against the Go `staleLockAge` constant, plus a text-scan cross-check that regex-extracts `LOCK_STALE_MS` from `scripts/lib/ospec-state.js` and asserts numeric equality with `staleLockAge.Milliseconds()`. Deviation: placed in a NEW file `internal/store/lock_coherence_test.go` (package `store`, white-box) instead of the existing `internal/store/store_test.go` (package `store_test`, black-box) — required because the test asserts against unexported constants directly (`staleLockAge.Milliseconds()`), which only an in-package test file can reach. This is Go's standard dual black-box/white-box test-file coexistence pattern; both files live in the same directory. Expected to fail (constant not yet named/exported, hooks.json unchanged).

## Phase 5: I3 — GREEN

- [x] 5.1 In `hooks/hooks.json`, add `"timeout": 5` to the `SessionStart` entry (aligns with `PreToolUse`/`PreCompact`/`SubagentStop`/`Stop`).
- [x] 5.2 In `scripts/lib/ospec-state.js`, extract `LOCK_RETRY_ATTEMPTS = 100`, `LOCK_RETRY_DELAY_MS = 15`, `LOCK_STALE_MS = 5000` as named module-level constants; use them as `withFileLock`'s defaults; add all three to `module.exports`.
- [x] 5.3 In `internal/store/store.go`, extract `lockRetryAttempts = 100`, `lockRetryDelay = 15 * time.Millisecond`, `staleLockAge = 5 * time.Second` as package constants; replace the inline `100`, `15*time.Millisecond`, `10*time.Second` literals in `withLock`/`tryLock` with them.
- [x] 5.4 Run `npm test` and `go test ./internal/store/...`; confirm 4.1 and 4.2 are GREEN.

## Phase 6: I3 — REFACTOR / spec parity

- [x] 6.1 Update `openspec/specs/hooks/spec.md` §9 (Non-functional requirements): remove "SessionStart has no declared timeout"; state all five hooks share the 5s budget.
- [x] 6.2 Update `openspec/specs/hooks-runtime/spec.md` §Non-Functional Requirements (Go binary NFR) with the same correction, keeping JS/Go doc parity. Also updated the Event-to-Subcommand Mapping table's `SessionStart` timeout column from "none" to "5 s" for consistency.
- [x] 6.3 Add a code comment in both `ospec-state.js` (near `LOCK_STALE_MS`) and `store.go` (near `staleLockAge`) cross-referencing the sibling file/line, so future edits to one side surface the other in review.
- [x] 6.4 Full run: `npm test` and `go test ./...`; confirm no regressions.

## Discovered During Investigation

- `validateRouteTable`'s return shape (`{valid, errors}`) is a documented contract in `openspec/specs/routing/spec.md` §8.1; the advisory for residual boolean strings is delivered as a separate exported pure function instead of a new `warnings` field, to avoid an unreviewed public-contract change in a lite change. Recorded as `assumption` (see envelope).
- `staleMs`/lock-retry values are internal-only (no spec references them) — treated as an internal decision per the Assumption Materiality Rule, not a blocking gate.
