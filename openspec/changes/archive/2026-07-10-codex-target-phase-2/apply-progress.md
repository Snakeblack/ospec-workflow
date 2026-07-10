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

---

## Batch 3 — Work Unit 3 (PR 3 of 3, FINAL): Install Channels, Docs, Smoke Test

Scope: Phase 4 (Install) tasks 4.1-4.4, Phase 5 (Agents autodetection) tasks
5.1-5.2, Phase 6 (Smoke test + final integration) tasks 6.1-6.3 per
`tasks.md`. **This is the last work unit of `codex-target-phase-2`** — all 6
phases / all tasks in `tasks.md` are now complete.

### Completed Tasks

- [x] 4.1/4.2 Verified by inspection + regression test that `install-codex.js`'s two channels (plugin/marketplace via `buildCodexMarketplace`/`registerCodexMarketplace`, and agent-TOML via `copyCodexAgents`) already write to disjoint target locations (`dist/codex-marketplace/**` + codex CLI marketplace registration vs. `<codexRoot>/agents/*.toml`) and are both idempotent (marketplace rebuild is a full `rmSync`+recreate from the same source each run; agent copy is a plain overwrite via `copyFileSync`, no accumulation). No production code change was required — Batch 1/2's `assertManagedPathSafe` + the pre-existing channel separation already satisfy REQ-install-001 in full; recorded as a regression-only outcome (`sdd-apply-005` below), the same pattern as tasks 1.4 and 3.2.
- [x] 4.3 Added two regression tests in `install-codex.test.js`: repo-local install re-run twice converges (same TOML listing/content, `.codex/config.toml` byte-for-byte unchanged, no `.codex-plugin/plugin.json` leaked into the repo); global install re-run twice converges (same agent listing, same `marketplace.json` content, no `.codex/config.toml` ever created). Both passed immediately against the unmodified `install-codex.js` (see Issues Found).
- [x] 4.4 Extended `docs/codex/README.md` (pre-existing maintenance/roadmap doc from an earlier out-of-SDD session) with the four required sections per REQ-install-002: install/update flow (global `setup:codex`/`install:codex` two-channel walkthrough + local repo-only agent sync), `/hooks` review-and-trust flow (five-event listing, command/commandWindows inspection, explicit trust step, re-trust-after-update note), new-task flow (SessionStart → `sdd-orchestrator` TOML agent autodetection → phase-agent delegation → `OSPEC_TARGET=codex` ask-degradation → `agent_transcript_path` resolution, cross-linked to the smoke test), and rollback (republish prior payload, re-run both idempotent channels, `/plugins` reinstall if needed, explicit "`.codex/config.toml` needs no action" close). Preserved all pre-existing content (field-report reading order, confirmed-state bullets, verification protocol, "qué no repetir") unchanged; only appended new sections.
- [x] 5.1/5.2 Added two regression tests in `real-repo.test.js` driving a minimal in-repo TOML parser (`parseAgentToml`, mirrors `serializeAgentToml`'s constrained scalar+multiline subset) over every generated `.codex/agents/*.toml` file from the real repo source: (a) every file parses without throwing and carries non-empty `name`/`description`/`developer_instructions`/`sandbox_mode`; (b) the orchestrator TOML specifically has `name === "sdd-orchestrator"`, a description, `developer_instructions` retaining a reference to `sdd-propose` (the delegation target an entry flow reaches), and the full payload validates with zero errors via `validateCodex()` (no manifest/MCP/hooks warnings). Both passed immediately against the unmodified Batch-1 TOML emission path — regression-only, no production change (`sdd-apply-005`).
- [x] 6.1 Created `scripts/configure/codex-smoke.test.js`: builds the codex payload via `runConfigure` (never reads gitignored `dist/`), validates it with `validateCodex`, installs it into a temp destination repo via the real `install-codex.js` `main()` (repo-local agent channel), asserts the installed `sdd-orchestrator.toml` is present/autodetectable-shaped and retains its `sdd-propose` delegation reference (skill entry → orchestrator TOML agent), then invokes `runSessionStart()` directly against the generated plugin bundle (the same Node entry point the generated wrapper's `command`/`commandWindows` target — no `codex` CLI binary spawned, per design.md's Open Questions note and the "dist tests self-generate" convention) and asserts the response is well-formed (`status: "ok"`, `ospecDetected: true`, `registry.status` matches `generated|reused`).
- [x] 6.2 The smoke test needed no separate wiring: `scripts/check.js`'s existing `node --test scripts/**/*.test.js` glob picks up `codex-smoke.test.js` automatically (same mechanism already covering every other `*.test.js` in the repo).
- [x] 6.3 Ran the full `npm test` (`node scripts/check.js`) after all Batch 3 changes: exit 0, all checks passed (generator/validator/hooks/install/agents/smoke tests all green together). `docs/codex/README.md` cross-links already reference the exact command names used (`npm test`, `scripts/configure/codex-smoke.test.js`); no rename occurred during implementation, so no further cross-link update was needed.

### Files Changed (Batch 3)

| File | Action | What Was Done |
|------|--------|---------------|
| `scripts/configure/install-codex.test.js` | Modified | Added two idempotency regression tests (repo-local install re-run, global install re-run) per task 4.3. |
| `scripts/configure/real-repo.test.js` | Modified | Added `parseAgentToml()` helper + two regression tests: TOML-parse/required-keys over every generated agent file, and orchestrator-specific dispatch/no-warnings assertion, per tasks 5.1/5.2. |
| `scripts/configure/codex-smoke.test.js` | Created | New smoke test per REQ-install-003 / task 6.1: build → validate → install → orchestrator-TOML autodetection assertion → `SessionStart` well-formedness assertion. |
| `docs/codex/README.md` | Modified | Appended four new sections (install/update, `/hooks` trust, new-task flow, rollback) per REQ-install-002 / task 4.4; all pre-existing content preserved unchanged. |
| `openspec/changes/codex-target-phase-2/tasks.md` | Modified | Marked all Phase 4/5/6 tasks `[x]`. |

### TDD Cycle Evidence (Batch 3)

| Task | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----|-------|-------------|----------|
| 4.1/4.2/4.3 (install channel isolation + idempotency) | Wrote both idempotency regression tests against the unmodified `install-codex.js`; ran `node --test scripts/configure/install-codex.test.js` expecting a possible RED to reveal a gap — result was GREEN on first run (24/24 pass), confirming Batch-1/2's `assertManagedPathSafe` + pre-existing channel separation already satisfy REQ-install-001 with no code change needed | N/A — no production change required; tests serve as the permanent regression gate for behavior that was already correct | Covered both install modes (repo-local agent-only channel, global plugin+agent channels) as independent re-run cases | No further extraction needed |
| 4.4 (docs) | N/A — documentation task, no test-first cycle; verified content coverage manually against the four REQ-install-002 scenarios (install/update, `/hooks` trust, new-task flow, rollback) after writing | Confirmed via re-read of the appended sections against each of the four required topics; `npm test`'s existing `real-repo.test.js`/`install-codex.test.js` doc-content assertions (README.md, plugin-installation.md) remained green, confirming no regression in the doc surfaces they already check | N/A | N/A |
| 5.1/5.2 (TOML autodetection regression) | Wrote both regression tests (generic TOML-parse/required-keys sweep + orchestrator-specific dispatch/no-warnings) against the unmodified generator; `node --test scripts/configure/real-repo.test.js` → GREEN on first run (30/30 pass), confirming Batch-1's `handleAgentToml`/`serializeAgentToml` already satisfy REQ-agents-010 | N/A — no production change required | Covered the generic all-files sweep and the orchestrator-specific case (name/description/delegation-reference/zero-validator-errors) as two distinct assertions | No further extraction needed |
| 6.1/6.2/6.3 (smoke test) | Wrote `codex-smoke.test.js` from scratch (new file, no prior test to be RED against — task is additive per REQ-install-003); first run caught nothing to fix, GREEN immediately (1/1 pass), confirming the full build→validate→install→orchestrator-TOML→SessionStart chain already works end-to-end against the published payload | `node --test scripts/configure/codex-smoke.test.js` → 1/1 pass; full `npm test` → exit 0, all checks green | Single smoke scenario per design's narrower-than-E2E scope (skill→orchestrator→SessionStart only, no live CLI) — no additional triangulation case needed for a smoke test by design | No further extraction needed; `parseAgentToml` duplicated (not shared) between `real-repo.test.js` and `codex-smoke.test.js` deliberately — see Issues Found |

### Deviations from Design

None — implementation matches design.md's File Changes table (`install-codex.js` "tighten existing behavior", `docs/codex/README.md` add four sections, `codex-smoke.test.js` create) and Testing Strategy's "E2E (smoke)" row (run against built payload, no live CLI).

### Issues Found

- Every Phase 4 and Phase 5 task in this batch turned out to require **zero production code changes** — only new regression tests. This is consistent with Batches 1-2 already having hardened the generation/validation/hooks seams that Phase 4/5's behavior depends on (`assertManagedPathSafe`'s pre-existing channel isolation, `handleAgentToml`'s pre-existing safe-path TOML emission). Recorded as `sdd-apply-005` below rather than treated as a gap, since each test was written first and genuinely could have failed (they exercise real re-run/parse/dispatch behavior, not tautologies) — the design's "tighten existing" framing for `install-codex.js` and "verified via smoke test + TOML parse assertions" framing for REQ-agents-010 anticipated exactly this outcome.
- `parseAgentToml()` (the constrained-subset TOML parser used to assert required keys) is duplicated between `scripts/configure/real-repo.test.js` and `scripts/configure/codex-smoke.test.js` rather than extracted to a shared test helper. Left duplicated because each file already follows this repo's existing convention of self-contained test-local helpers (e.g., `writeGeneratedCodexTree` in `install-codex.test.js`, `tmpOut`/`walk` in `real-repo.test.js`), and the ~20-line helper is small enough that extraction would add an import-graph edge between two otherwise-independent test files for marginal benefit. Reversibility: high (pure extract-function refactor if a third caller appears).

### Assumptions

- `sdd-apply-005`: Tasks 4.1, 4.2, 5.1, 5.2 are treated as "add regression coverage confirming existing behavior already satisfies the requirement" rather than requiring new production code, following the same pattern already established and accepted in Batch 1 (task 1.4) and Batch 2 (task 3.2) — both of which the design/spec anticipated might already be satisfied by prior work ("Verified via smoke test + TOML parse assertions" in the Spec/Design Reconciliation table for REQ-agents-010; "Tighten existing behavior" in the File Changes table for `install-codex.js`). Reversibility: high (if a future audit finds a real gap, the added regression tests will fail and point directly at the missing behavior).
- `sdd-apply-006`: The smoke test (task 6.1) drives `runSessionStart()` directly against the generated plugin bundle rather than shelling out to `ospec-hooks-launch.js` as a subprocess, per the orchestrator's explicit instruction ("Follow the existing 'dist tests self-generate' pattern... do NOT require the actual CLI binary") and design.md's Open Questions note that live-CLI smoke stays a manual field check. Reversibility: high (swapping to a subprocess invocation of the same entry point is a local change if a future requirement demands process-boundary fidelity).

### Remaining Tasks

None. All Phase 1-6 tasks in `tasks.md` are `[x]` complete.

### Workload / PR Boundary (Batch 3)

- Mode: chained PR slice (`size:exception` pre-approved per `state.yaml` approval-002)
- Current work unit: Unit 3 of 3 — "Install channels + docs + smoke test" (PR 3) — complete. **This was the final work unit of `codex-target-phase-2`.**
- Boundary: starts from Batch 2's hooks-runtime baseline; ends with all Phase 4/5/6 tasks implemented (as regression tests + one new smoke-test file + docs), full `npm test` green, and every task in `tasks.md` marked `[x]`.
- Estimated review budget impact: touches 2 existing test files (small additive diffs) + 1 new smoke-test file + 1 docs file (additive-only) + `tasks.md` checkbox updates. Substantially smaller than the full ~700-950 line forecast, consistent with the "install+docs+smoke" slice of the three-way split — the smallest of the three batches by production-code delta (zero production code touched this batch).

### Status (Batch 3 — FINAL)

12/12 assigned tasks (Phase 4: 4.1-4.4, Phase 5: 5.1-5.2, Phase 6: 6.1-6.3) complete and locally verified: full `npm test` (`node scripts/check.js`) passes, exit 0, all checks green across generator/validator/hooks/install/agents/smoke suites together.

**ALL 6 PHASES / ALL TASKS IN `tasks.md` FOR `codex-target-phase-2` ARE NOW COMPLETE.** This change is ready for `sdd-verify`. No commits were made during this batch — all changes are staged in the working tree for the orchestrator to review/commit as it sees fit (per the instruction that leaving commits to the orchestrator is acceptable).

---

## Batch 4 — 4R Review Gate Remediation (approval-003: remediate-both-critical)

Scope: remediate the 2 CRITICAL findings from the post-verify 4R review gate
(0 BLOCKER, 2 CRITICAL, 5 WARNING, 1 SUGGESTION per `verify-report.md`). Not
new scope — targeted fixes + regression tests over the already-verified
implementation from Batches 1-3.

### CRITICAL 1 — ASK→allow degradation was env-var-only, not host-verified

Finding: `applyPermissionMode` in both `scripts/hooks/pre-tool-use.js` and
`internal/hooks/pretooluse.go` gated the ASK→allow degradation purely on
`process.env.OSPEC_TARGET === "codex"` — a process-wide env var that could
leak into an unrelated (non-Codex) session via a leftover shell export, a CI
env var, or a repo `.env` auto-load, silently degrading every ASK-class
decision there too.

Fix: added a second, per-invocation marker — `OSPEC_CODEX_WRAPPER=1` — that
`codexHooks` (`scripts/lib/target-transform.js`) now inlines directly onto the
generated `command`/`commandWindows` command line itself (`OSPEC_CODEX_WRAPPER=1
node ...` / `set OSPEC_CODEX_WRAPPER=1&& node ...`), for every one of the five
wrapped hook events. Because this marker is set fresh by the wrapper's own
generated command string for that single invocation (not inherited ambient
session state), it cannot accidentally leak the way a lone `OSPEC_TARGET`
export can. Both `applyPermissionMode` (JS) and `applyPermissionMode` (Go)
now require **both** `OSPEC_TARGET=codex` **and** `OSPEC_CODEX_WRAPPER=1`
before degrading `ask` → `allow`; DENY stays untouched either way (unchanged
from Batch 2). `ADR-003` and `design.md` were amended with a short addendum
documenting the dual-signal gate; `docs/codex/README.md`'s "PreToolUse"
paragraph in the new-task-flow section was updated to describe both signals.

### CRITICAL 2 — Go hook omitted the AI-attribution commit-message guard entirely

Finding: `scripts/hooks/pre-tool-use.js` runs `checkCommitAttribution()` as a
DENY check on `git commit -m/--message` commands matching
`FORBIDDEN_ATTRIBUTION_RE`; `internal/hooks/pretooluse.go` had no equivalent —
a `git commit` with `Co-Authored-By:`/model-name attribution dispatched via
the Go hook binary was not blocked, defeating the PreToolUse
defense-in-depth layer (the `commit-msg` git hook still caught it, but only
after the commit already ran).

Fix: ported `FORBIDDEN_ATTRIBUTION_RE` and `checkCommitAttribution()` to
`internal/hooks/pretooluse.go` byte-for-byte equivalent to the JS regex
(vendor names word-boundary-anchored; `co-authored-by`/`generated
with|by`/model names/`🤖`, case-insensitive), wired into `run()`'s Step 5 DENY
path immediately after the existing `rules.Evaluate` DENY loop — same
ordering as the JS `evaluateToolUseCore`.

### Files Changed (Batch 4)

| File | Action | What Was Done |
|------|--------|---------------|
| `scripts/hooks/pre-tool-use.js` | Modified | `applyPermissionMode` requires `OSPEC_TARGET=codex` AND `OSPEC_CODEX_WRAPPER=1` (both) before degrading `ask`→`allow`. |
| `scripts/hooks/pre-tool-use.test.js` | Modified | Updated the two existing codex-degradation tests to set both env vars; added two new tests (env-alone / marker-alone → no degradation). |
| `internal/hooks/pretooluse.go` | Modified | Mirrored the dual env-var gate; added `forbiddenAttributionRE`, `commitMessageArgRE`, `checkCommitAttribution()`; wired into `run()`'s DENY step. |
| `internal/hooks/pretooluse_test.go` | Modified | Updated the two existing Go codex-degradation tests to set both env vars; added env-alone/marker-alone tests; added 5 new attribution tests (clean pass, Co-Authored-By deny, model-name deny, word-boundary false-positive avoidance, non-commit-command pass). |
| `scripts/lib/target-transform.js` | Modified | Added `withCodexWrapperMarker()` / `withCodexWrapperMarkerWindows()`; `codexHooks` inlines `OSPEC_CODEX_WRAPPER=1` onto every wrapped hook's `command`/`commandWindows`. |
| `scripts/lib/target-transform.test.js` | Modified | Updated the existing wrapper-shape assertions to expect the inlined marker; added a dedicated marker-presence test across all five events (POSIX + Windows). |
| `scripts/configure/__fixtures__/golden/codex/hooks/hooks.json` | Modified | Regenerated golden snapshot to include the inlined marker (`cli.test.js` golden-tree comparison). |
| `openspec/changes/codex-target-phase-2/decisions/adr-003.md` | Modified | Added an addendum documenting the dual env-var gate (4R remediation). |
| `openspec/changes/codex-target-phase-2/design.md` | Modified | Updated the ADR-003 prose, flow diagram, and File Changes table row to reflect the dual-signal gate and the Go attribution port. |
| `docs/codex/README.md` | Modified | Updated the "PreToolUse" paragraph in the new-task-flow section to describe both required env signals. |

### TDD Cycle Evidence (Batch 4)

| Task | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----|-------|-------------|----------|
| CRITICAL-1 JS (dual env-var gate) | Updated `pre-tool-use.test.js`'s two existing codex tests to also require the marker (would fail against pre-change single-var check if reverted) and added an explicit "env alone does not degrade" test against the pre-change `applyPermissionMode`; `node --test scripts/hooks/pre-tool-use.test.js` → 1 new failure (env-alone test expected `ask`, got `allow`) | Widened `applyPermissionMode`'s `codexWrapper` check to require both vars; `node --test scripts/hooks/pre-tool-use.test.js` → 52/52 pass | Covered env-alone, marker-alone, both-present-ASK, both-present-DENY as four independent cases | No further extraction needed |
| CRITICAL-1 Go (dual env-var gate parity) | Updated the two existing Go codex tests (`t.Setenv` both vars) and added `TestPreToolUse_OspecTargetCodexAlone_DoesNotDegradeAsk` against pre-change `applyPermissionMode`; `go test ./internal/hooks/...` → 1 failure (env-alone test expected `ask`, got `allow`) | Mirrored the JS dual-var check via `os.Getenv`; `go build ./...` clean, `go test ./internal/hooks/...` → pass | Env-alone, marker-alone, both-present-ASK, both-present-DENY covered identically to JS | No further extraction needed |
| CRITICAL-1 generator (`codexHooks` marker injection) | Updated the existing wrapper-shape test's exact-string command assertions to expect the marker prefix (would fail against pre-change `codexHooks`) and added a dedicated marker-presence regex test across all 5 events × 2 command variants; `node --test scripts/lib/target-transform.test.js` → 11 assertion failures (marker missing) | Added `withCodexWrapperMarker`/`withCodexWrapperMarkerWindows`, wired into the `wrappedHooks.map()` construction; `node --test scripts/lib/target-transform.test.js` → 88/88 pass | Covered all five events' POSIX+Windows marker presence from one fixture, plus the exact-string session-start/pre-tool-use/pre-compact/subagent-stop/stop assertions in the pre-existing test as a second independent check | No further extraction needed |
| CRITICAL-2 Go (`checkCommitAttribution` port) | Added `TestPreToolUse_CommitAttribution_*` (clean-pass, Co-Authored-By-deny, model-name-deny, word-boundary-avoidance, non-commit-pass) against pre-change `pretooluse.go` (no attribution check existed); `go test ./internal/hooks/...` → 2 failures (Co-Authored-By and model-name commands expected `deny`, got `allow`) | Ported `FORBIDDEN_ATTRIBUTION_RE`/`commitMessageArgRE`/`checkCommitAttribution()` byte-for-byte equivalent to the JS regex; wired into `run()`'s Step-5 DENY path; `go test ./internal/hooks/...` → pass | Clean-message, Co-Authored-By, 3 distinct model names, 3 word-boundary false-positive candidates (coherente/bombardeo/llaman), and 4 non-commit commands covered as independent cases | No further extraction needed; regex kept byte-identical to the JS source per the task's explicit instruction (verified via side-by-side comparison, not paraphrased) |

### Test Summary (Batch 4)
- **Total tests written**: 13 (4 JS: 2 updated + 2 new; 9 Go: 2 updated + 2 new dual-gate + 5 new attribution)
- **Total tests passing**: 13/13 (plus the full pre-existing suite unaffected: `npm test` 1240/1240 pass excluding 1 pre-existing unrelated skip; `go test ./...` all packages pass)
- **Layers used**: Unit (13)
- **Approval tests**: None — no refactoring tasks
- **Pure functions created**: `withCodexWrapperMarker`, `withCodexWrapperMarkerWindows` (JS); `checkCommitAttribution` (Go)

### Deviations from Design

`ADR-003` originally specified a single env flag (`OSPEC_TARGET=codex`) as the
Codex signal. This batch amends that decision with a documented addendum
(dual env-var gate) rather than a silent deviation — the amendment is the
explicit, user-approved remediation for CRITICAL-1 (`approval-003:
remediate-both-critical`), not a freelance design change. `ADR-003.md` and
`design.md` were updated in the same batch so the design artifacts stay
consistent with the implementation.

### Issues Found

None beyond the two CRITICAL findings themselves.

### Assumptions

- `sdd-apply-007`: `OSPEC_CODEX_WRAPPER=1` was chosen as the second marker's
  name/value (rather than e.g. a random per-build token) because a fixed,
  internal, unlikely-to-collide name inlined directly on the command line is
  sufficient to close the "ambient env leak" gap described in the finding —
  the marker's trust comes from being freshly set by the wrapper's own
  generated command string per invocation, not from being unguessable.
  Reversibility: high (the exact var name is an internal implementation
  detail; renaming it is a mechanical find/replace across 5 files with no
  external contract impact — `docs/codex/README.md`'s `/hooks` review step
  already tells users to inspect the raw `command`/`commandWindows` strings,
  so the marker's presence is visible/auditable there regardless of its name).
- `sdd-apply-008`: The Windows marker syntax uses `set OSPEC_CODEX_WRAPPER=1&&
  <command>` (cmd.exe sequential-command env assignment) rather than a
  PowerShell-specific form, consistent with the pre-existing `%PLUGIN_ROOT%`
  cmd.exe-style expansion already used by `commandWindows` (no change to that
  established convention). Reversibility: high (isolated to
  `withCodexWrapperMarkerWindows`).

### Remaining Tasks

None. Both CRITICAL findings from the 4R review gate are remediated,
regression-tested (JS + Go), and the full `npm test` + `go test ./...` suites
pass. Ready for the orchestrator to re-run `sdd-verify` (or a targeted
re-check of just these two findings) before archive.

### Workload / PR Boundary (Batch 4)

- Mode: remediation batch under `exception-ok` (approval-002), scoped by
  `approval-003` (remediate-both-critical) — not a new chained/stacked PR
  slice of the original 3-unit split.
- Current work unit: 4R remediation (post-verify), both CRITICALs.
- Boundary: starts from Batch 3's fully-verified baseline; ends with both
  CRITICAL findings fixed, regression-tested, docs/ADR/design updated to
  match, and the full test suite green.
- Estimated review budget impact: ~10 files touched, small/targeted diffs per
  file (env-var gate widening + one ported Go function + doc/fixture
  updates); well under the 400-line review budget on its own.

### Status (Batch 4)

2/2 assigned CRITICAL remediations complete and locally verified: `npm test`
(`node scripts/check.js`) passes, exit 0 (1240 tests pass, 1 pre-existing
unrelated skip, 0 fail); `go build ./...` and `go test ./...` pass, exit 0.
No commits were made during this batch — all changes are left staged in the
working tree for the orchestrator to review/commit, per the task's explicit
instruction to state this clearly.
