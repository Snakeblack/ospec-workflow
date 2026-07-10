# Apply Progress: codex-target-phase-2

## Batch 1 — Work Unit 1 (PR 1 of 3): Generation + Validation

Scope: Phase 1 (Generation) tasks 1.1-1.5 and Phase 2 (Validation) tasks 2.1-2.4
per `tasks.md`. Delivery strategy: `exception-ok` (approval-002, pre-approved
`size:exception`). Phases 3-6 (hooks runtime, install channels, docs, smoke
test) are explicitly out of scope for this batch and left untouched.

### Completed Tasks

- [x] 1.1 Renamed MCP ids in `.mcp.json`: `io.github.upstash/context7` → `context7`, `microsoft/markitdown` → `markitdown`.
- [x] 1.2 Extended `profile.manifest.keepFields` in `scripts/lib/target-profiles/codex.js` to retain `name`/`version`/`description`; added `relativePathFields: ["skills", "mcpServers", "hooks"]`.
- [x] 1.3 Added `toSafeRelativePath()` in `scripts/lib/target-transform.js`, applied inside the `keepFields` branch of `reshapeManifest` to rewrite `skills`/`mcpServers`/`hooks` string values to `./`-relative form; throws on `..` traversal or absolute path.
- [x] 1.4 Verified TOML agent emission (`handleAgentToml`) already produces a relative, non-traversal path (`.codex/agents/<name>.toml` via `renameExtension` + `remapDir`, no code path can introduce `/` prefix or `..`); added a regression assertion rather than new production code (cosmetic-safe, no design deviation).
- [x] 1.5 Added unit tests in `scripts/lib/target-transform.test.js`: metadata retention, `./`-prefix rewriting, `..`-traversal rejection, absolute-path rejection, TOML output path safety.

- [x] 2.1 Extended `ALLOWED_BUNDLE_KEYS` in `scripts/configure/validate-codex.js` to admit `name`/`version`/`description`.
- [x] 2.2 Added `validateMcpIds()`: reads generated `.mcp.json`, fails on any `mcpServers` key not matching `^[a-zA-Z0-9_-]+$`.
- [x] 2.3 Added `isSafeRelativePath()` + a `RELATIVE_PATH_KEYS` check inside `validateBundle()`: fails when `skills`/`mcpServers`/`hooks` in the generated `.codex-plugin/plugin.json` is not `./`-relative, contains `..`, or is absolute.
- [x] 2.4 Added unit tests in `scripts/configure/validate-codex.test.js` covering: MCP id with `/`, MCP id with a space, conformant ids (no false positive), non-`./`-relative path, `..` traversal, absolute path, and metadata-key acceptance. Updated `makeValidCodexTree()` fixture helper to emit `./`-relative paths + metadata + a root `.mcp.json` so the "valid tree" baseline stays conformant under the new checks.

### Files Changed

| File | Action | What Was Done |
|------|--------|---------------|
| `.mcp.json` | Modified | Renamed MCP server ids to target-neutral short form (ADR-002). |
| `scripts/lib/target-profiles/codex.js` | Modified | `keepFields` += `name`/`version`/`description`; added `relativePathFields`. |
| `scripts/lib/target-transform.js` | Modified | Added `toSafeRelativePath()`; `reshapeManifest` keepFields branch now rewrites declared component paths and rejects unsafe ones. |
| `scripts/lib/target-transform.test.js` | Modified | New/updated codex manifest tests (metadata, `./`-prefix, traversal/absolute rejection, TOML path safety). |
| `scripts/configure/validate-codex.js` | Modified | `ALLOWED_BUNDLE_KEYS` += metadata keys; added `isSafeRelativePath()`, `RELATIVE_PATH_KEYS` check, `validateMcpIds()`. |
| `scripts/configure/validate-codex.test.js` | Modified | Fixture helper updated to conformant `./`-relative shape + root `.mcp.json`; new tests for MCP id regex and path-safety checks. |
| `scripts/configure/__fixtures__/golden/codex/.codex-plugin/plugin.json` | Modified | Golden snapshot updated to match the new manifest shape (metadata + `./`-relative paths) so `cli.test.js` golden comparison stays accurate. |

### TDD Cycle Evidence

| Task | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----|-------|-------------|----------|
| 1.2/1.3/1.5 (manifest metadata + `./`-prefix + traversal/absolute rejection) | Added failing assertions in `target-transform.test.js` (bundle key set incl. metadata; `./`-prefix values; `assert.throws` on `..` and absolute path) against pre-change `reshapeManifest` | Implemented `toSafeRelativePath()` + `relativePathFields` wiring; `node --test scripts/lib/target-transform.test.js` → 85/85 pass | Covered both traversal (`../skills/`) and absolute (`/etc/.mcp.json`) rejection as distinct cases, plus a positive `./`-prefix case, from a single codex fixture | No further extraction needed; helper kept local and small |
| 1.4 (TOML path safety) | Added assertion (no leading `/`, no `..` segment) against existing `handleAgentToml` output | Passed immediately — no production change needed (pre-existing code already relative-safe) | N/A — regression-only | N/A |
| 2.1/2.2/2.3/2.4 (validator: metadata keys, MCP id regex, path-safety) | Added failing tests in `validate-codex.test.js` (MCP id w/ `/`, w/ space, conformant ids, non-relative/traversal/absolute plugin.json fields) against pre-change `validate-codex.js`; confirmed RED via `node --test scripts/configure/validate-codex.test.js` (3 failures, all mismatched-expectation on out-of-schema-key path, confirming the new checks did not exist yet) | Implemented `ALLOWED_BUNDLE_KEYS` extension, `isSafeRelativePath()`, `RELATIVE_PATH_KEYS` loop in `validateBundle()`, and `validateMcpIds()`; `node --test scripts/configure/validate-codex.test.js` → 24/24 pass | Covered both id-shape violations (`/`, space) and both path violations (`..`, absolute) as independent cases, plus one conformant no-false-positive case per check | No further extraction needed |

### Deviations from Design

None — implementation matches design.md §Architecture Decisions (ADR-001, ADR-002). The `relativePathFields` list on the profile and the `isSafeRelativePath`/`toSafeRelativePath` helper names are internal implementation details not specified verbatim by the design; recorded as a low-materiality internal assumption (see below), not a deviation.

### Issues Found

None.

### Assumptions

- `sdd-apply-001`: Internal helper/field naming (`relativePathFields`, `toSafeRelativePath`, `isSafeRelativePath`, `RELATIVE_PATH_KEYS`) chosen to match existing profile/validator conventions (`keepFields`, `ALLOWED_BUNDLE_KEYS`, `FORBIDDEN_PATHS`) since ADR-001/ADR-002 specify behavior, not exact identifier names. Reversibility: high (pure rename, no external contract).
- `sdd-apply-002`: `validateMcpIds()` treats a missing `.mcp.json` as non-fatal (skips the check) since REQ-generator-004's scenarios are phrased "when a generated `.mcp.json` declares an id…" and the existing validator has no other requirement mandating `.mcp.json` presence at the bundle root (it's referenced indirectly via the manifest `mcpServers` field, not independently required). Reversibility: high (adding a `missing required file` error later is a small additive change).

### Remaining Tasks (next batches, per Suggested Work Units in tasks.md)

- [ ] Phase 4 (4.1-4.4): Install channels + docs (Work Unit 3 / PR 3)
- [ ] Phase 5 (5.1-5.2): Agents autodetection verification (Work Unit 3 / PR 3)
- [ ] Phase 6 (6.1-6.3): Smoke test + final integration (Work Unit 3 / PR 3)

### Workload / PR Boundary

- Mode: chained PR slice (`size:exception` pre-approved per `state.yaml` approval-002)
- Current work unit: Unit 1 of 3 — "Generation + validation" (PR 1) — complete.
- Boundary: starts from a clean baseline (no prior apply-progress); ends with all Phase 1 + Phase 2 tasks implemented, tested, and passing `npm test` in full. Phase 3 (hooks runtime) is the next batch's boundary per `tasks.md`'s suggested work-unit split, and depends on this batch's generated wrapper/manifest shape.
- Estimated review budget impact: touches 6 production/test files + 1 golden fixture; substantially smaller than the full ~700-950 line forecast for the whole change, consistent with the "generation + validation" slice of the three-way split.

### Status

9/9 assigned tasks (Phase 1 + Phase 2) complete and locally verified (`npm test` full suite passes, exit 0). Ready for the next `sdd-apply` batch (Phase 3: hooks runtime) or for `sdd-verify` to review this slice if the orchestrator chooses to verify per work unit.

---

## Batch 2 — Work Unit 2 (PR 2 of 3): Hooks Runtime

Scope: Phase 3 (Hooks Runtime) tasks 3.1-3.7 per `tasks.md`, per ADR-003 (reuse
baseline mechanisms, no new adapter). Install channels/docs (Phase 4), agent
autodetection (Phase 5), and the smoke test (Phase 6) remain out of scope for
this batch (Work Unit 3 / PR 3), as instructed.

### Completed Tasks

- [x] 3.1 Rewrote `codexHooks` in `scripts/lib/target-transform.js`: emits per-event `{matcher: ".*", hooks: [{type, command, commandWindows, timeout: 10}]}` for exactly the five events (`SessionStart`, `PreToolUse`, `PreCompact`, `SubagentStop`, `Stop`, via a `CODEX_WRAPPER_EVENTS` allowlist that silently drops any other source event — "no sixth event" per REQ-hooks-004 scenario). `command` keeps the existing quoted POSIX `$PLUGIN_ROOT/...` form; `commandWindows` is derived from it via `toCodexWindowsCommand()` (backslash + `%PLUGIN_ROOT%` form, matching the design.md Interfaces/Contracts sample verbatim).
- [x] 3.2 Confirmed by inspection: `codexHooks`/the wrapper never reads or rewrites `PLUGIN_DATA`; it is a pure Node subprocess env inheritance (no wrapper script layer exists between the Codex host and `ospec-hooks-launch.js`), so `PLUGIN_DATA` passes through unmodified by construction. No production code change was needed; documented as a design/verification note rather than an implementation task.
- [x] 3.3 Modified `applyPermissionMode()` in `scripts/hooks/pre-tool-use.js`: the bypass-equivalence check is now `permissionMode === "bypassPermissions" || process.env.OSPEC_TARGET === "codex"`, degrading every ask branch (AgentShield Step 2, Token Budget 3-4, Git Guard 5b, Spec Drift 5c, ASK table Step 6 — all funnel through this single shared function) to `allow` + `systemMessage` under `OSPEC_TARGET=codex`, leaving DENY (Step 5) untouched (DENY never reaches `applyPermissionMode`'s ask-only branch).
- [x] 3.4 Added `resolveTranscriptPath(input)` helper in `scripts/hooks/subagent-stop.js`: returns `input.transcript_path || input.agent_transcript_path`. Wired into all three call sites (`persistResultEnvelope`, `resolveDispatchStatus`, `runSubagentStop`'s skill_resolution fallback), preserving the existing §5.2 step-3 JSONL-parsing logic unchanged.
- [x] 3.5 Mirrored both changes in the Go parity implementation: `internal/hooks/pretooluse.go`'s `applyPermissionMode(out, permissionMode)` now also checks `os.Getenv("OSPEC_TARGET") == "codex"`; `internal/hooks/subagentstop.go` gained a `resolveTranscriptPath(input map[string]any) (string, bool)` helper wired into the same three call sites as the JS side (`persistResultEnvelope`, `resolveDispatchStatus`, the `runSubagentStop` resolution fallback).
- [x] 3.6 Added/extended unit tests: `scripts/lib/target-transform.test.js` (wrapper shape for all five events + POSIX/Windows command pair + fixed timeout, plus a dedicated "no sixth event" test with a `SomeFutureEvent` source entry); `scripts/hooks/pre-tool-use.test.js` (ASK→allow+systemMessage under `OSPEC_TARGET=codex` with no `permission_mode` set, and DENY-unaffected under the same env); `scripts/hooks/subagent-stop.test.js` (`agent_transcript_path`-only fixture resolves `skill_resolution` via the existing JSONL path); Go-side mirrors in `internal/hooks/pretooluse_test.go` and `internal/hooks/subagentstop_test.go` (`t.Setenv("OSPEC_TARGET", "codex")` / `agent_transcript_path`-keyed stdin) to keep Go/JS parity fixtures assertable per ADR-003's "Env-signalled target keeps Go/JS parity fixtures assertable against the published payload."
- [x] 3.7 `SessionStart` behavior itself has zero code path touched by this batch (REQ-hooks-007 fixes the contract as target-independent; `scripts/hooks/session-start.js` has no `OSPEC_TARGET`/target branching at all), so the existing extensive `session-start.test.js` contract suite (status/ospecDetected/registry assertions) continues to cover it unconditionally, including under the codex wrapper. Additionally, the new wrapper test in 3.6 asserts the codex-generated `hooks/hooks.json` `SessionStart` group's command routes to the exact same `ospec-hooks-launch.js session-start` entrypoint every other target uses — i.e. no codex-specific dispatch divergence exists at the wrapper level. The heavier "published payload → installed → invoked via CLI" end-to-end form of this assertion is the Phase 6 smoke test's job (`codex-smoke.test.js`, explicitly deferred to Work Unit 3 per the batch scope), consistent with the Test Contracts note in `specs/hooks/spec.md` ("Fixtures for REQ-hooks-005..007 MUST assert against the published codex payload... consistent with the Go/JS parity fixture pattern").

### Files Changed (Batch 2)

| File | Action | What Was Done |
|------|--------|---------------|
| `scripts/lib/target-transform.js` | Modified | `codexHooks` rewritten to emit `{matcher, hooks:[{type,command,commandWindows,timeout:10}]}` wrapper groups per event, filtered to the five `CODEX_WRAPPER_EVENTS`; added `toCodexWindowsCommand()`. |
| `scripts/lib/target-transform.test.js` | Modified | Rewrote the flat-shape hook test into the wrapper-shape assertion; added a "no sixth event" test. |
| `scripts/hooks/pre-tool-use.js` | Modified | `applyPermissionMode` treats `OSPEC_TARGET=codex` as bypass-equivalent. |
| `scripts/hooks/pre-tool-use.test.js` | Modified | Added ASK→allow and DENY-unaffected tests under `OSPEC_TARGET=codex`. |
| `scripts/hooks/subagent-stop.js` | Modified | Added `resolveTranscriptPath()`; wired into all three `input.transcript_path` read sites. |
| `scripts/hooks/subagent-stop.test.js` | Modified | Added an `agent_transcript_path`-only resolution test. |
| `internal/hooks/pretooluse.go` | Modified | `applyPermissionMode` mirrors the `OSPEC_TARGET=codex` check via `os.Getenv`. |
| `internal/hooks/pretooluse_test.go` | Modified | Added Go-side `OSPEC_TARGET=codex` ASK/DENY parity tests. |
| `internal/hooks/subagentstop.go` | Modified | Added `resolveTranscriptPath()` helper; wired into the same three call sites as the JS mirror. |
| `internal/hooks/subagentstop_test.go` | Modified | Added a Go-side `agent_transcript_path` alias parity test. |
| `scripts/configure/validate-codex.js` | Modified | `validateHooks()` updated to validate the new nested wrapper shape (`event[i]` is now a `{matcher, hooks:[...]}` group; command/type checks moved one level deeper to `event[i].hooks[j]`). Required so the codex-generated payload continues to pass its own validator (task 3.1 changed the shape the validator must accept — same file, no new REQ, tracked here since it was load-bearing for `npm test` green). |
| `scripts/configure/validate-codex.test.js` | Modified | `makeValidCodexTree()` fixture updated to the wrapper shape; existing malformed-entry tests re-targeted one level deeper (`event[i].hooks[j]`); added two new tests for the group-level `hooks` array check. |
| `scripts/configure/__fixtures__/golden/codex/hooks/hooks.json` | Modified | Regenerated golden snapshot to match the new wrapper shape (`cli.test.js` golden-tree comparison). |

### TDD Cycle Evidence (Batch 2)

| Task | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----|-------|-------------|----------|
| 3.1/3.2/3.6 (wrapper matcher/commandWindows/timeout, 5-event cap) | Rewrote the flat-shape assertion into a wrapper-shape assertion (`group.matcher === ".*"`, `group.hooks` array, POSIX+Windows command pair, `timeout:10`) plus a new `SomeFutureEvent`-dropped test, against the pre-change flat `codexHooks`; `node --test scripts/lib/target-transform.test.js` → 2 failures (missing `matcher`; `SomeFutureEvent` leaking through) | Implemented `CODEX_WRAPPER_EVENTS` allowlist + `toCodexWindowsCommand()` + wrapper-group construction; `node --test scripts/lib/target-transform.test.js` → 89/89 pass | Covered all five events' command/commandWindows pairs individually, plus the sixth-event-dropped case, from two distinct fixtures | No further extraction needed; `toCodexWindowsCommand` kept adjacent to `rewriteCodexCommand`/`quotePluginRootPath` |
| 3.3 (`OSPEC_TARGET=codex` ask-degradation, JS) | Added ASK/DENY tests under `OSPEC_TARGET=codex` (no `permission_mode`) against pre-change `applyPermissionMode`; `node --test scripts/hooks/pre-tool-use.test.js` → 1 failure (`ask` !== `allow`), DENY test passed trivially (pre-existing DENY-never-degraded behavior) | Widened the bypass-equivalence check to `permissionMode === "bypassPermissions" \|\| process.env.OSPEC_TARGET === "codex"`; `node --test scripts/hooks/pre-tool-use.test.js` → 50/50 pass | ASK-class and DENY-class covered as independent cases under the same env flag | No further extraction needed |
| 3.4 (`agent_transcript_path` alias, JS) | Added a test using only `agent_transcript_path` (no `transcript_path`) against pre-change subagent-stop.js; `node --test scripts/hooks/subagent-stop.test.js` → 1 failure (`status: 'skipped'` instead of `'warning-recorded'`) | Added `resolveTranscriptPath()`, wired into all three read sites; `node --test scripts/hooks/subagent-stop.test.js` → 28/28 pass | Reused the existing `transcript_path`-based test as the sibling case (both field names now covered) | Extracted the OR-fallback into one named helper rather than inlining `\|\|` three times |
| 3.5 (Go parity mirror) | Added `TestPreToolUse_OspecTargetCodex_*` (`t.Setenv`) and `TestSubagentStop_AgentTranscriptPathAlias` against pre-change Go sources; `go test ./internal/hooks/...` → 3 failures (ask not degraded; events file missing because resolution never wrote) | Mirrored both JS changes (`os.Getenv("OSPEC_TARGET")` check; `resolveTranscriptPath` Go helper); `go build ./...` clean, `go test ./internal/hooks/...` → pass, full `go test ./...` → pass | ASK/DENY covered on the Go side identically to JS; alias-only transcript resolution covered on the Go side identically to JS | No further extraction needed |
| load-bearing validator update (not a separate REQ; required by 3.1's shape change) | Ran full `npm test` after 3.1-3.5 GREEN; `cli.test.js` golden mismatch + `real-repo.test.js` codex-validator failure (validator still expected the old flat shape) confirmed the RED-equivalent regression | Updated `validateHooks()` in `validate-codex.js` to walk the new `event[i].hooks[j]` nesting; regenerated the golden `hooks/hooks.json` fixture from the actual fixture-source CLI output; `node --test scripts/configure/validate-codex.test.js` → 26/26 pass, full `npm test` → exit 0 | Added two new validator tests (group-not-object, group.hooks-not-array) alongside the re-targeted existing ones (malformed-entry, non-string-command) | No further extraction needed |

### Deviations from Design

None — implementation matches design.md's Interfaces/Contracts sample verbatim (`commandWindows` uses `%PLUGIN_ROOT%\...`, `timeout: 10`) and ADR-003 (reuse `applyPermissionMode`/`bypassPermissions`, no new adapter; `agent_transcript_path` as an alias, not a replacement).

### Issues Found

- The `timeout` field design.md's sample shows `10` for a source entry whose fixture declared `timeout: 5` — i.e. the wrapper normalizes to a fixed Codex-side timeout regardless of the source event's declared value, rather than passing the source timeout through. This is implemented as a hard-coded `10` per event entry, matching the literal sample in design.md §Interfaces/Contracts. Recorded as `sdd-apply-003` below since the design text doesn't say explicitly "always 10, ignoring source" in prose — only the sample shows it.
- The validator (`validate-codex.js`) required a structural update to accept the new wrapper shape; this was not called out as a separate task in `tasks.md`'s Phase 3 list, but was necessary for `npm test` to stay green after 3.1 (the validator is exercised by `real-repo.test.js`'s "codex output passes its own validator" test against the actual repo payload). Treated as in-scope maintenance of the same file already listed in the design's File Changes table for Phase 1-2, not a new requirement.

### Assumptions

- `sdd-apply-003`: `codexHooks` emits a fixed `timeout: 10` on every wrapped hook entry, overriding whatever `timeout` the source `hooks/hooks.json` event declared (source fixtures use `5`). Based on design.md's literal Interfaces/Contracts sample (`"timeout": 10` for a `PreToolUse` source entry that in the same design's own hooks fixture shape would otherwise be `5`), read as an intentional Codex-side normalization (Codex may need a larger default timeout than the 5s baseline) rather than a pass-through. Reversibility: high (single-line change to derive from `entry.timeout` instead, if a future clarification says otherwise).
- `sdd-apply-004`: task 3.2 ("Confirm `PLUGIN_DATA` is inherited... no wrapper-side read/rewrite") is treated as a verification/documentation task rather than requiring new production code, since no wrapper script layer exists between the Codex host and the launched Node hook process — `codexHooks` only rewrites the `command`/`commandWindows` string values in the generated JSON; it never touches process env at generation time or runtime. Reversibility: n/a (no code introduced to reverse).

### Remaining Tasks (next batches, per Suggested Work Units in tasks.md)

- [ ] Phase 4 (4.1-4.4): Install channels + docs (Work Unit 3 / PR 3)
- [ ] Phase 5 (5.1-5.2): Agents autodetection verification (Work Unit 3 / PR 3)
- [ ] Phase 6 (6.1-6.3): Smoke test + final integration (Work Unit 3 / PR 3)

### Workload / PR Boundary (Batch 2)

- Mode: chained PR slice (`size:exception` pre-approved per `state.yaml` approval-002)
- Current work unit: Unit 2 of 3 — "Hooks runtime" (PR 2) — complete.
- Boundary: starts from Batch 1's generated wrapper/manifest shape; ends with all Phase 3 tasks implemented, tested (JS + Go), and passing the full `npm test` suite plus `go test ./...`. Phase 4 (install channels + docs) is the next batch's boundary, per `tasks.md`'s suggested work-unit split.
- Estimated review budget impact: touches 4 hook-runtime production files (2 JS + 2 Go) + their test files, plus 1 generator file + 1 validator file + fixtures already tracked from Batch 1's slice (validator/golden update was load-bearing follow-through from 3.1, not new surface area). Smaller than the full ~700-950 line forecast, consistent with the "hooks runtime" slice of the three-way split.

### Status (Batch 2)

7/7 assigned tasks (Phase 3: 3.1-3.7) complete and locally verified: full `npm test` (node scripts/check.js) passes, exit 0; `go build ./...` and `go test ./...` (including `internal/hooks`) pass, exit 0. Ready for the next `sdd-apply` batch (Phase 4-6: install channels, docs, smoke test — Work Unit 3 / PR 3) or for `sdd-verify` to review this slice if the orchestrator chooses to verify per work unit.
