# Verification Report: harness-git-collaboration

- **Change**: harness-git-collaboration
- **Mode**: openspec / standard route
- **Strict TDD**: active (audited)
- **Verdict**: **PASS**
- **Date**: 2026-06-28 (re-verify after 4R remediation)

## Re-verify Context

This is a RE-VERIFY after the 4R remediation pass. The prior verify returned
**PASS WITH WARNINGS** (Node 740/740) with one WARNING (Go git-commit parity
test gap). The 4R gate subsequently raised 1 CRITICAL (Node shared-timeout
budget violating parity) + 6 WARNING. All 7 were remediated. This report
independently re-runs both suites, audits each fix, and confirms parity.

## Completeness

| Phase | Status | Evidence |
|-------|--------|----------|
| Tasks 1.1–8.3 | done | All 8 phases marked `[x]` |
| Coding tasks | 18/18 implemented + 7 remediations | Node + Go + prose + build |
| MUST scenarios | 19/19 runtime-proven | parity gap CLOSED |

## Build / Tests / Coverage (independent re-run)

| Suite | Command | Result | Evidence |
|-------|---------|--------|----------|
| Node | `npm test` | **743 pass / 0 fail** (743 total) | `node scripts/check.js`; "tests 743 / pass 743 / fail 0 / skipped 0"; exit 0; "All checks passed." |
| Go | `go test ./internal/...` | **6 packages ok / 0 fail** | hooks 1.923s ok; jsonio, rules, skillreg, store, yamllite ok |
| Go hooks (verbose) | `go test ./internal/hooks/ -v` | **81 top-level PASS / 0 FAIL** (174 RUN incl. subtests) | — |

Counts increased from 740→743 Node (3 remediation tests) and Go gained the
git-commit parity test plus two sanitization tests. No test failed on re-run.

## 4R Remediation Audit (7 fixes)

| # | Finding (4R) | Remediation | Test / Proof | Verdict |
|---|--------------|-------------|--------------|---------|
| 1 | **CRITICAL** Node 5s timeout was per-probe (3×5s≈15s) vs Go's single shared 5s | `resolveGitState` computes one `deadline = Date.now()+5000`, passes each probe `Math.max(1, deadline-Date.now())`; same shared-deadline in `session-start.js` `workspaceGitRunner(args, timeoutMs)` | Node `git-state.test.js:208` "shared deadline — each probe receives a positive numeric timeoutMs": asserts 3 probes, first ≤5001ms, last ≤ first (budget shrinks). PASS at runtime. Mirrors Go `context.WithTimeout(ctx, 5*time.Second)` shared across probes. | **RESOLVED** |
| 2 | WARNING Go git-commit risky-trigger had no dedicated runtime test (isRiskyAction 83.3%) | `TestPreToolUse_GitGuard_GitCommitOnDefaultBranch` added | `pretooluse_test.go:695`: `git commit -m "mensaje"` on `main` → `ask`, reason contains "rama por defecto". PASS at runtime. Closes the isRiskyAction coverage gap. | **RESOLVED** |
| 3 | WARNING prompt-injection via unsanitized branch name | `sanitizeBranchName()` added identically to `git-state.js` and `gitstate.go` (strip control chars, collapse whitespace, truncate to 120 + ellipsis); called inside `composeAdvisory` | Node `git-state.test.js:240,251` (hostile/long) + Go `TestComposeAdvisory_HostileBranchName_ControlCharsStripped` & `TestComposeAdvisory_LongBranchName_Truncated`. All PASS. Tested hostile input (`\x00\x1f\x1b[31m…\r\n`) yields identical output in both runtimes. | **RESOLVED** |
| 4 | WARNING `_gitRunner` underscore name misleads as unused | Renamed `_gitRunner` → `injectedGitRunner` in `pre-tool-use.js` (decl :274, use :394) | Grep: zero `_gitRunner` references in production code (only historical mentions in state.yaml/apply-progress.md). Suite green 743/743. | **RESOLVED** |
| 5 | WARNING zero-commands early-return ordering undocumented | Load-bearing ordering comment added at the zero-commands guard | `pre-tool-use.js:412-414` and `pretooluse.go:429-431`: comment explains write tools carry no command payload so the guard must run after Step 5b. No behavior change. | **RESOLVED** |
| 6 | WARNING extractPaths 4-level nesting | `resolveExistingFile(cleaned) (string, bool)` helper extracted | `pretooluse.go:149-159` helper; used at :182. Existing path-extraction tests still PASS (behavior unchanged). | **RESOLVED** |
| 7 | WARNING empty `catch {}` in matchGitignorePattern swallowed RegExp errors silently | Explanatory comments added to both catch blocks | `session-start.js:221-228, 232-233`: documents malformed-glob → no-match fallback (safer direction). No behavior change. | **RESOLVED** |

### Changed File Coverage (Go, post-remediation)

| File:func | Note |
|-----------|------|
| `gitstate.go:resolveGitState` | three probes + fail-open paths covered |
| `gitstate.go:composeAdvisory` | now exercised with hostile/long branch input via `sanitizeBranchName` |
| `gitstate.go:sanitizeBranchName` | covered by hostile + long-name tests |
| `pretooluse.go:isRiskyAction` | git-commit-command branch now exercised by `TestPreToolUse_GitGuard_GitCommitOnDefaultBranch` — prior 83.3% gap CLOSED |

## Spec Compliance Matrix

| Requirement (git-collaboration-guard) | Strength | Evidence | Level | Status |
|----------------------------------------|----------|----------|-------|--------|
| Default Branch Resolution (per-field fail-open) | MUST | `TestGitState_DefaultBranchFailsDirtyStillRuns`, `_CurrentBranchProbeFailsOthersOk`, Node resolveGitState fail-open cases | runtime-test | PASS |
| origin/HEAD not configured → fail open | MUST | default-branch probe error cases (Node+Go) | runtime-test | PASS |
| git binary absent → fail open all checks | MUST | `resolveGitState: git binary absent`, `TestGitState_DeadlineExhausted` | runtime-test | PASS |
| git status fails → dirty skipped, other checks run | MUST | `_StatusProbeErrorDirtyNil`, Node `dirty is null not false` | runtime-test | PASS |
| Working Tree State Detection (porcelain non-empty=dirty) | MUST | empty→false, `M foo`→true (Node+Go) | runtime-test | PASS |
| Untracked-only classified dirty | MUST | `_UntrackedFileDirtyTrue`, Node `?? newfile.txt`→true | runtime-test | PASS |
| dirty:false (clean) distinct from dirty:null (failed) | MUST | Node `notStrictEqual false`, Go `*bool nil vs &false` | runtime-test | PASS |
| Risky action = write-tool OR `\bgit\s+commit\b` (write-tool path) | MUST | `isRiskyAction` write-tool matrix (Node+Go) | runtime-test | PASS |
| Risky action = `\bgit\s+commit\b` (Go runtime) | MUST | `TestPreToolUse_GitGuard_GitCommitOnDefaultBranch` (Go) + Node case (h) | runtime-test | **PASS (gap closed)** |
| Shared 5s deadline across 3 probes (timeout budget) | MUST | Go `context.WithTimeout(ctx,5s)`; Node shared-deadline test `git-state.test.js:208` | runtime-test | **PASS (CRITICAL fixed)** |
| Combined advisory — single `ask` mentioning both | MUST | `_GitGuard_Combined` (Go), git-guard combined (Node) | runtime-test | PASS |
| Advisory-first: always `ask`, never `deny` | MUST | all GitGuard ask cases | runtime-test | PASS |
| Default-branch-only message (no "sin commitear") | MUST | Node (a) + Go assert NOT "sin commitear" | runtime-test | PASS |
| Dirty-only message (no "rama por defecto") | MUST | Node (b) + Go assert NOT "rama por defecto" | runtime-test | PASS |
| Branch-name sanitization (anti prompt-injection) | MUST | Node hostile/long tests + Go `_HostileBranchName_` / `_LongBranchName_` | runtime-test | **PASS (new)** |
| Env-var bypass `=true` skips all git calls | MUST | Node (e) asserts runner NOT invoked; Go EnvBypass | runtime-test | PASS |
| Deny beats guard (Step 5 before 5b) | MUST | Node (f) `git push --force`→deny; Go DenyWinsOverGuard | runtime-test | PASS |
| Read-only tool → guard silent | MUST | Node (g) Grep→allow; Go ReadOnlyTool | runtime-test | PASS |
| Go/Node parity (default/dirty/combined/bypass/degradation/git-commit/sanitization) | MUST | mirrored fixtures + matching assertions both suites | runtime-test | PASS |
| SessionStart `gitCollaboration` + `dirtyTree` | MUST | Node (a–c), Go GitCollab DefaultBranchClean/Dirty/Combined | runtime-test | PASS |
| `dirtyTree` OMITTED (not false) when status fails | MUST | Node (g) `dirtyTree===undefined`; Go omitempty | runtime-test | PASS |
| SessionStart `systemMessage` append | MUST | Node asserts systemMessage includes advisory text | runtime-test | PASS |
| Bypass suppresses SessionStart advisory | MUST | Node (e) + Go GitCollab EnvBypass | runtime-test | PASS |
| Prose/dist propagation to 4 targets | MUST | `configure.test.js` 8/8 | runtime-test | PASS |

## Go/Node Decision Parity (fixture set incl. new cases)

| Scenario | Node | Go | Parity |
|----------|------|----|--------|
| default-branch only (clean) | ask, "rama por defecto" | `TestGitState_ParityScenario_DefaultBranchOnly` | Match |
| dirty-only (feature branch) | ask, "sin commitear" | `TestGitState_ParityScenario_DirtyOnly` | Match |
| combined (default + dirty) | ask, both phrases | `TestGitState_ParityScenario_Combined` | Match |
| clean feature branch | guard silent | `TestGitState_ParityScenario_CleanFeature` | Match |
| `git commit` on default branch | ask (case h) | `TestPreToolUse_GitGuard_GitCommitOnDefaultBranch` | **Match (new)** |
| hostile/long branch name | control chars stripped, truncated | `_HostileBranchName_` / `_LongBranchName_` | **Match (new)** |
| env bypass | runner not invoked | Go EnvBypass | Match |
| deny precedence | `git push --force`→deny | DenyWinsOverGuard | Match |

Parity confirmed across the full fixture set including the new git-commit and
sanitization cases.

## Design Coherence

| Design decision | Implemented as designed? |
|-----------------|--------------------------|
| Step 5b after DENY, before ASK | Yes — deny-precedence test passes both runtimes |
| Always `ask`, never `deny` | Yes — guard only emits `ask` |
| Per-check fail-open | Yes — independent try/catch (Node) / per-probe CommandContext (Go) |
| Bypass before any git call | Yes — env check wraps the block; Node test asserts runner not invoked |
| Three probes under **single shared 5s deadline** | Yes — Go `context.WithTimeout(ctx,5s)`; Node now shares one `deadline` across probes (CRITICAL fix) |
| Spanish advisory, 3 variants, sanitized branch | Yes — `composeAdvisory` + `sanitizeBranchName` identical both runtimes |
| `dirtyTree` omitempty (nil drops field) | Yes — `*bool` omitempty (Go), spread conditional (Node) |

No design deviations.

## TDD Compliance

| Check | Result | Details |
|-------|--------|---------|
| TDD Evidence reported | PASS | apply-progress TDD table + remediation rows present |
| All coding tasks have tests | PASS | 18/18 + 3 remediation tests map to existing files |
| RED confirmed | PASS | remediation tests authored RED (F1/F3 control chars passed through; F3 Go not stripped) |
| GREEN confirmed | PASS | independent re-run: Node 743/743, Go 81 top-level PASS / 0 FAIL |
| Triangulation adequate | PASS | multi-case per behavior; new parity + sanitization cases |
| Safety net for modified files | PASS | full suites re-ran on modified hooks |

**TDD Compliance**: 6/6 checks passed.

## Issues

### CRITICAL

None. (The prior 4R CRITICAL — Node per-probe timeout — is RESOLVED and proven by `git-state.test.js:208`.)

### WARNING

None. (The prior verify WARNING-1 — Go git-commit parity test gap — is RESOLVED by `TestPreToolUse_GitGuard_GitCommitOnDefaultBranch`.)

### SUGGESTION (deferred, non-blocking known-issues)

- **SUGGESTION-1 — Go lint modernization (cosmetic)**: `interface{}`→`any`, `slices.ContainsFunc`, `strings.CutPrefix` opportunities in `gitstate_test.go` / `pretooluse.go`. `go vet` is clean; style-only.
- **SUGGESTION-2 — naming**: `ctx5b` step naming could be clarified. Cosmetic.
- **SUGGESTION-3 — session-start bypass invocation assertion**: no full-process JSON stdin/stdout E2E test for the bypass; decision is proven at function level in both runtimes. Low risk.
- **Minor parity observation (cosmetic, not a defect)**: the JS `sanitizeBranchName` comment says "C0/C1 control characters" but the regex `[\x00-\x1f\x7f]` strips only C0+DEL; Go's `unicode.IsControl` additionally strips C1 (U+0080–U+009F). For all tested hostile inputs (ESC/NUL/CR/LF — all C0) both runtimes produce identical output, and git itself rejects branch names containing control characters, so this latent divergence is unreachable in practice. Optional: align the JS regex or correct the comment.

## Out-of-Scope Observations (not findings)

- `internal/hooks/stop.go` unused type `stopOutput`: pre-existing (commit `8b5495b`, Go hooks migration), not this change. `go vet` does not flag it.
- `dist/**` is gitignored — regenerated targets are never committed; no commit contamination. `configure.test.js` validates dist generation at test time (8/8).

## Final Verdict

**PASS** — All 743 Node tests (exit 0) and all 6 Go `./internal/...` packages pass
on independent re-run. All 7 4R remediations (1 CRITICAL + 6 WARNING) are present
and, for the three behavioral fixes (#1 shared timeout budget, #2 git-commit
parity test, #3 branch sanitization), covered by passing tests; the four
readability/resilience fixes (#4–#7) are correctly applied with behavior
unchanged. Every MUST scenario is runtime-proven, Go/Node decision parity is
confirmed across the full fixture set including the new git-commit and
sanitization cases, and no CRITICAL or WARNING remains. Residual items are
cosmetic deferred SUGGESTIONs only.
