# Apply Progress: harness-git-collaboration

Branch: `feat/git-collaboration-guard`

## TDD Evidence Table

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR | Notes |
|---|---|---|---|---|---|---|---|---|
| 1.1 resolveGitState probes | `scripts/hooks/lib/git-state.test.js` | Node | npm test | FAIL (file absent) | PASS (git-state.js created) | Cases a-f cover fail-open per-probe | No | All 3 probes independent |
| 1.2 isRiskyAction | `scripts/hooks/lib/git-state.test.js` | Node | npm test | FAIL | PASS | write-tools + git-commit regex | No | 7 write-tool names normalized |
| 1.3 composeAdvisory | `scripts/hooks/lib/git-state.test.js` | Node | npm test | FAIL | PASS | 3 variants: default-only, dirty-only, combined | No | Spanish messages |
| 1.4 GREEN all Phase 1 | `scripts/hooks/lib/git-state.test.js` | Node | npm test | — | PASS all Phase 1 | — | No | |
| 2.1 Go gitstate RED | `internal/hooks/gitstate_test.go` | Go | go test | FAIL (file absent) | PASS (gitstate.go created) | Cases a-e: fail-open, untracked, deadline | No | |
| 2.2 Go gitstate GREEN | `internal/hooks/gitstate.go` | Go | go test | — | PASS TestGitState | — | No | per-probe CommandContext |
| 3.1 PreToolUse Step 5b RED (Node) | `scripts/hooks/pre-tool-use.test.js` | Node | npm test | FAIL cases a,b,c,h | PASS all 8 cases | deny-beats-guard (f), bypass (e), read-only (g) | No | makeGitStubRunner + gitGuardDecision helpers added |
| 3.2 PreToolUse Step 5b GREEN (Node) | `scripts/hooks/pre-tool-use.js` | Node | npm test | — | PASS 33 total | — | No | evaluateToolUse(input, opts) signature; no-cmds early-return moved after 5b |
| 4.1 SessionStart advisory RED (Node) | `scripts/hooks/session-start.test.js` | Node | npm test | FAIL cases a,b,c,g | PASS all 7 cases | bypass (e), git-absent (f), omitempty (g) | No | workspace-scoped gitRunner default fixes dirty-cwd contamination |
| 4.2 SessionStart advisory GREEN (Node) | `scripts/hooks/session-start.js` | Node | npm test | — | PASS 27 total | — | No | spread conditional for dirtyTree omission |
| 5.1 PreToolUse Step 5b RED (Go) | `internal/hooks/pretooluse_test.go` | Go | go test | FAIL cases a,b,c | PASS 7 cases | deny-beats-guard (f), bypass (e), read-only (g) | No | SetGitRunnerForTest injection via export_test.go |
| 5.2 PreToolUse Step 5b GREEN (Go) | `internal/hooks/pretooluse.go` | Go | go test | — | PASS TestPreToolUse | — | No | isRiskyAction uses writeToolNamesSet + gitCommitPatternRE |
| 6.1 SessionStart advisory RED (Go) | `internal/hooks/sessionstart_test.go` | Go | go test | FAIL 4 cases | PASS 7 cases | omitempty via DirtyTree nil (g), bypass (e) | No | GitCollaboration field added to sessionStartResult |
| 6.2 SessionStart advisory GREEN (Go) | `internal/hooks/sessionstart.go` | Go | go test | — | PASS TestSessionStart_GitCollab | — | No | gitCollaborationResult struct; omitempty on DirtyTree |
| 7.1 branch-pr SKILL.md | `scripts/configure.test.js` | prose | npm test (configure) | — | PASS 8/8 configure assertions | — | No | Step 0 + Multi-Developer Collaboration + Critical Rules 6-7 |
| 7.2 orchestrator branch advisory | `scripts/configure.test.js` | prose | npm test (configure) | FAIL (phrase absent) | PASS after regenerate | — | No | SHOULD/non-blocking advisory before sdd-apply dispatch |
| 7.3 sdd-propose branch advisory | dist/ content search | prose | npm test (configure) | — | PASS (phrase propagated) | — | No | Success-envelope only; omitted on blocked |
| 7.4 sdd-apply branch-status note | dist/ content search | prose | npm test (configure) | — | PASS (phrase propagated) | — | No | Non-blocking; never causes status:blocked |
| 8.1 configure.test.js RED | `scripts/configure.test.js` | build | npm test | FAIL 8/8 (dist/ stale) | — | — | No | findPhrase recursive MD/JSON/YAML searcher |
| 8.2 configure GREEN | all 4 dist/ targets | build | npm test | — | PASS 8/8 | — | No | 4 targets: claude-marketplace, vscode, github-copilot, opencode |
| 8.3 Final verification | full suite | both | npm test + go test | — | Node 740/740; Go 6/6 pkg ok | bypass: covered by test cases (e) in phases 3-6; untracked: covered by phase 1.1d, 3.1b, 5.1b | No | |

## Run Counts

| Suite | Pass | Fail | Command |
|---|---|---|---|
| Node (final) | 740 | 0 | `npm test` |
| Go (final) | 6 packages ok | 0 | `go test ./internal/...` |
| Node (remediation) | 743 | 0 | `npm test` |
| Go (remediation) | 6 packages ok (hooks: 81 pass) | 0 | `go test ./internal/...` |

## Remediation Pass — 4R Review Gate (2026-06-28)

| Finding | ID | Layer | Test File | RED | GREEN | Notes |
|---|---|---|---|---|---|---|
| F1 CRITICAL shared timeout Node (git-state.js) | `resolveGitState: shared deadline spy` | Node | `scripts/hooks/lib/git-state.test.js` | FAIL: `capturedBudgets[0]` was `undefined` (no 2nd arg passed) | PASS: runner called as `runner(args, remaining())` with shrinking budget | `deadline = Date.now() + TIMEOUT_MS` computed once; all 3 probes share it |
| F1 CRITICAL shared timeout Node (session-start.js) | `workspaceGitRunner deadline` | Node | covered by F1 git-state.test | — | PASS: `workspaceGitRunner(args, timeoutMs)` uses timeout from `resolveGitState` | No separate test needed; budget is managed inside `resolveGitState` |
| F2 WARNING Go git-commit parity | `TestPreToolUse_GitGuard_GitCommitOnDefaultBranch` | Go | `internal/hooks/pretooluse_test.go` | GREEN immediately (behavior already existed, test gap only) | PASS: `git commit -m "mensaje"` on `main` → ask, reason contains "rama por defecto" | Closes isRiskyAction 83.3% coverage gap |
| F3 WARNING prompt-injection Node | `composeAdvisory: hostile branch / long branch` | Node | `scripts/hooks/lib/git-state.test.js` | FAIL: raw control chars passed through | PASS: `sanitizeBranchName` strips C0/DEL, collapses whitespace, truncates at 120 chars | `sanitizeBranchName()` added to `git-state.js`; parity with Go |
| F3 WARNING prompt-injection Go | `TestComposeAdvisory_HostileBranchName_ControlCharsStripped` + `TestComposeAdvisory_LongBranchName_Truncated` | Go | `internal/hooks/gitstate_test.go` | FAIL: control chars not stripped | PASS: `sanitizeBranchName()` strips via `unicode.IsControl`, collapses, truncates | `sanitizeBranchName()` added to `gitstate.go`; `unicode` import added |
| F4 WARNING readability `_gitRunner` rename | prose/naming only | Node | — | — | PASS: renamed `_gitRunner` → `injectedGitRunner` at declaration and use site in `pre-tool-use.js` | No behavior change; suite re-ran green (743/743) |
| F5 WARNING readability zero-commands ordering comment | prose/naming only | Node+Go | — | — | PASS: load-bearing ordering comment added at `commands.length === 0` (pre-tool-use.js) and `len(cmds) == 0` (pretooluse.go) | No behavior change |
| F6 WARNING readability extractPaths nesting | prose/naming only | Go | — | — | PASS: extracted `resolveExistingFile(cleaned string) (string, bool)` helper; traverse switch case reduced from 4-level nesting to 2 lines | Existing tests confirm behavior unchanged |
| F7 WARNING resilience empty catch | prose/naming only | Node | — | — | PASS: added explanatory comments to both `catch {}` blocks in `matchGitignorePattern` (session-start.js) | No behavior change; rationale documented |

## Key Design Decisions Recorded

- **Workspace-scoped default git runner** (session-start.js): default runner uses `cwd: workspace` (temp-dir fixture in tests) so existing tests whose workspace is not a git repo see all probes fail and no advisory fires — prevents cwd contamination from the repo's own dirty state during test runs.
- **No-commands early-return moved after Step 5b**: write tools (Edit, Write, etc.) carry no shell commands; the early-return was blocking Step 5b from ever reaching them. Moving it after 5b allows the guard to intercept them while preserving DENY-pass position.
- **DENY rules wrapped in `if commands.length > 0`**: ensures DENY pass only evaluates shell-command patterns (not tool-name matches) and is still ordered before Step 5b.
- **`dirty === null` vs `dirty === false`**: null means the porcelain probe threw; false means it returned empty output. The `dirtyTree` field is omitted entirely (not set to false) when the probe failed, so the system never falsely reports a clean tree.
- **`SetGitRunnerForTest` from `export_test.go`**: Go external test package cannot access unexported package vars; export_test.go (package hooks, not package hooks_test) bridges the gap with a setter visible only to tests.
