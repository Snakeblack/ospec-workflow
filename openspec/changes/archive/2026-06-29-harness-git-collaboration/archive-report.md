# Archive Report: harness-git-collaboration

- **Change**: harness-git-collaboration
- **Date Archived**: 2026-06-29
- **Route**: standard
- **Final Status**: done
- **Verify Verdict**: PASS (0 CRITICAL / 0 WARNING; cosmetic SUGGESTIONs only)

## Summary

The change harness-git-collaboration introduces an advisory-first git collaboration guard that detects and warns about risky git states during development: editing or committing on the default branch, or editing with a dirty working tree. The guard is implemented at parity in Node.js and Go, integrated into the PreToolUse and SessionStart lifecycle hooks, and complemented by prompt recommendations in the branch-pr skill and SDD agents.

All implementation, testing, and verification phases completed successfully. The independent re-verify after 4R remediation confirmed:
- Node: 743 tests pass (exit 0)
- Go: 6 packages ok, 81 top-level PASS (hooks tests)
- All 7 remediation findings resolved and proven by tests
- Go/Node decision parity confirmed across full fixture set
- All MUST requirements met; residual items are cosmetic SUGGESTIONs only

## Completion Evidence

| Phase | Status | Evidence |
|-------|--------|----------|
| Propose | done | proposal.md: scope (in-scope: guards + recommendations; out-of-scope: hard blockers or git automation) |
| Spec | done | 4 delta specs created: git-collaboration-guard, hooks, skills, agents |
| Clarify | done | No material ambiguities; untracked-files scope settled by orchestrator directive (2026-06-28) |
| Design | done | design.md: advisory-first Step 5b placement, per-check fail-open, Spanish advisory language, 5s shared timeout, `*bool` omitempty for dirtyTree |
| Tasks | done | 8 phases with 18 coding tasks + 7 remediations; 30 spec/design reconciliation rows all covered-by-design |
| Apply | done | All 18 coding tasks + 7 remediations implemented; Node 740→743 tests, Go 6 packages ok (+3 tests) |
| Verify | done | PASS: Node 743/743, Go 81 PASS / 0 FAIL; all MUST scenarios runtime-proven; Go/Node parity confirmed; no CRITICAL / WARNING |
| Archive | pending→done | This report |

## Design Achievements

1. **Advisory-first guard** — returns `ask` (never `deny`), inserted at Step 5b after DENY, before ASK rules
2. **Per-check fail-open** — three independent probes (default branch, current branch, dirty tree); one failure never suppresses another
3. **Go/Node parity** — identical decision logic in both runtimes; mirrored fixture tables; parity proven by 19 shared scenario tests
4. **Shared 5s timeout** — all three git commands (symbolic-ref, branch --show-current, status --porcelain) share a single 5s deadline; pre-probe timeouts never falsely trigger next probes
5. **Combined advisory** — when both default-branch AND dirty-tree conditions hold, emits exactly one `ask` prompt (not two)
6. **Prompt sanitization** — hostile branch names stripped of control characters, truncated to 120 chars + ellipsis; parity in both runtimes
7. **Spanish user-facing text** — advisory messages in Spanish (matching existing hook prose); three message variants (default-only, dirty-only, combined)
8. **SessionStart integration** — new gitCollaboration field with dirtyTree omitted (not false) when status probe fails; message appended to systemMessage
9. **Env-var bypass** — DISABLE_GIT_COLLABORATION_GUARD=true skips all checks before any git call
10. **Skill + agent recommendations** — branch-pr skill documents multi-dev collaboration; orchestrator recommends branch before code; propose/apply include branch advisories

## 4R Remediation Summary

| Finding | Category | Severity | Remediation | Status |
|---------|----------|----------|-------------|--------|
| F1 | Node timeout budget | CRITICAL | Shared deadline across 3 probes, not per-probe (git-state.test.js:208 proves budget shrinking) | RESOLVED |
| F2 | Go git-commit test gap | WARNING | Added TestPreToolUse_GitGuard_GitCommitOnDefaultBranch | RESOLVED |
| F3 | Prompt injection via branch name | WARNING | sanitizeBranchName() in both runtimes (strips C0/DEL, collapses whitespace, truncates) | RESOLVED |
| F4 | Naming: _gitRunner underscore | WARNING | Renamed to injectedGitRunner (both refs in pre-tool-use.js) | RESOLVED |
| F5 | Zero-commands ordering undocumented | WARNING | Load-bearing comment added at guard position in both runtimes | RESOLVED |
| F6 | extractPaths nesting deep | WARNING | resolveExistingFile() helper extracted (pretooluse.go:149-159) | RESOLVED |
| F7 | Empty catch swallows errors | WARNING | Explanatory comments added to matchGitignorePattern catch blocks | RESOLVED |

All remediations confirmed present in code; behavioral fixes (F1-F3) covered by new/updated tests; readability/resilience fixes (F4-F7) confirmed by visual inspection.

## Files Created / Modified

### New spec domains
- `openspec/specs/git-collaboration-guard/spec.md` — new domain spec (see sync section below)

### Delta specs merged into existing domains
- `openspec/specs/hooks/spec.md` — merged Step 5b and SessionStart advisory requirements (see sync section below)
- `openspec/specs/skills/spec.md` — merged branch-before-code requirement
- `openspec/specs/agents/spec.md` — merged orchestrator/propose/apply branch advisory requirements

### Implementation files changed
| File | Layer | Change |
|------|-------|--------|
| `scripts/hooks/lib/git-state.js` | Node | New: resolveGitState, isRiskyAction, composeAdvisory, sanitizeBranchName |
| `scripts/hooks/pre-tool-use.js` | Node | Modified: Step 5b insertion, DISABLE_GIT_COLLABORATION_GUARD bypass |
| `scripts/hooks/session-start.js` | Node | Modified: gitCollaboration advisory (dirtyTree omitempty) + systemMessage append |
| `internal/hooks/gitstate.go` | Go | New: resolveGitState, composeAdvisory, sanitizeBranchName, gitStateResult struct |
| `internal/hooks/pretooluse.go` | Go | Modified: Step 5b, isRiskyAction, DISABLE_GIT_COLLABORATION_GUARD bypass |
| `internal/hooks/sessionstart.go` | Go | Modified: GitCollaboration field, advisory composition, dirtyTree nil handling |
| `internal/hooks/export_test.go` | Go | New: SetGitRunnerForTest bridge for injecting test runner |
| `internal/hooks/gitstate_test.go` | Go | New: Test suite for git state resolution, fail-open, timeout, parity scenarios |
| `internal/hooks/pretooluse_test.go` | Go | Modified: Step 5b test cases (8 scenarios mirroring Node) |
| `internal/hooks/sessionstart_test.go` | Go | Modified: gitCollaboration advisory test cases (7 scenarios) |
| `scripts/hooks/pre-tool-use.test.js` | Node | Modified: Step 5b integration cases (8 scenarios) |
| `scripts/hooks/session-start.test.js` | Node | Modified: gitCollaboration advisory cases (7 scenarios) |
| `scripts/hooks/lib/git-state.test.js` | Node | New: resolveGitState, isRiskyAction, composeAdvisory, sanitizeBranchName tests |
| `skills/branch-pr/SKILL.md` | Prose | Modified: Step 0 branch-creation instruction, Multi-Developer Collaboration section, Critical Rules entries 6-7 |
| `agents/sdd-orchestrator.agent.md` | Prose | Modified: CORE zone branch-before-code recommendation before sdd-apply dispatch |
| `agents/sdd-propose.agent.md` | Prose | Modified: success-envelope branch advisory note |
| `agents/sdd-apply.agent.md` | Prose | Modified: executive_summary branch-status note (non-blocking) |
| `scripts/configure.test.js` | Build | New: 8 assertions verifying branch-before-code propagation to 4 dist/ targets |
| `dist/**` | Build output | Regenerated: all 4 targets (claude, vscode, github-copilot, opencode) include branch recommendations |

## Spec Sync

All four delta specs have been synced into the canonical openspec/specs/ tree:

1. **`openspec/specs/git-collaboration-guard/spec.md`** — NEW domain spec file created
   - Full specification with 6 MUST requirement groups + clarifications
   - Covers default-branch resolution, working-tree detection, risky-state detection, advisory-first behavior, env-var bypass, Go/Node parity

2. **`openspec/specs/hooks/spec.md`** — MERGED new sections before the final "## 10. Scenarios"
   - Added "### 3.4a Git Collaboration Guard Step in PreToolUse" (after ASK rules before ALLOW)
   - Added "### 3.5 SessionStart Git Collaboration Advisory" (after security check, Step 9)
   - Both sections inserted with full requirement text, scenarios, and schema examples
   - Existing baseline content (registration, behavior, command extraction, shell tool recognition, DENY/ASK rules) preserved

3. **`openspec/specs/skills/spec.md`** — MERGED branch-before-code requirement
   - Added "### 3.2a Branch-Before-Code Recommendation in branch-pr" under the Utility tier section
   - Added "### 3.2b Multi-Developer Collaboration Strategies in branch-pr" requirement
   - Full text of strategies (branch hygiene, default-branch protection, sync coordination, parallel work, commit conventions) included
   - Existing skill taxonomy, frontmatter contract, and other tiers preserved

4. **`openspec/specs/agents/spec.md`** — MERGED branch advisory requirements
   - Added "### 1.2a Orchestrator Branch-Before-Code Recommendation" (Orchestrator section)
   - Added "### 1.2b sdd-propose Branch Advisory in Output" (phase executors guidance)
   - Added "### 1.2c sdd-apply Branch-Status Note" (phase executors guidance)
   - All existing agent catalog, frontmatter contract, and tool expansion preserved

## Key Design Decisions

1. **Step 5b placement** — After DENY (Step 5) ensures "deny beats guard"; before ASK (Step 6) allows guard to override ASK rules for urgent branch/tree conditions.
2. **Per-check fail-open** — Each probe (default-branch via origin/HEAD, current branch, dirty-tree via status) fails independently; missing git does not silence all checks, just the ones whose commands fail.
3. **5s shared deadline** — All three probes consume from a single 5s budget (Go: `context.WithTimeout`; Node: one `deadline = Date.now()+5000` computed once, each probe receives remaining budget). Ensures fairness and respects PreToolUse timeout ceiling.
4. **Spanish advisories** — Consistent with existing hook prose (Advertencia, Acceso denegado patterns); three variants (default-only, dirty-only, combined) composed by `composeAdvisory`.
5. **dirtyTree nil/omitempty** — When `git status` fails, the field is omitted entirely (not set to false), preventing false reports of clean trees.
6. **No deny in guard** — Advisory-first philosophy; editing main is legitimate (hotfixes, docs); guard asks for confirmation, does not block.
7. **Env-var bypass before git** — DISABLE_GIT_COLLABORATION_GUARD checked first in both hooks before any git invocation, providing zero-latency escape hatch.
8. **Prompt sanitization** — Hostile branch names (control chars, long names) sanitized before interpolation into user-visible advisory text; identical sanitization logic in both runtimes.

## Quality Metrics

- **Test Coverage**: Node 743 (up from 740), Go hooks 81 top-level PASS (up from existing baseline)
- **Parity**: 19 mirrored scenarios covering default-branch, dirty-tree, combined, bypass, deny-precedence, degradation, git-commit, sanitization
- **Time Budget**: All 3 git probes share single 5s PreToolUse ceiling; independent probe failures do not timeout siblings
- **Failure Modes**: Per-check fail-open; missing git binary fails open for all checks; single probe timeout fails open for that check only
- **Regression**: Full Node suite (740→743) and full Go suite (6 packages) re-run clean after all remediation; no existing tests degraded

## Known Issues (deferred, non-blocking)

All residual items are cosmetic SUGGESTIONs (noted in verify-report.md §Suggestion):
- Go lint modernization opportunities (`interface{}`→`any`, `slices.ContainsFunc`, `strings.CutPrefix`)
- `ctx5b` step naming clarity
- SessionStart bypass E2E assertion (function-level proof present; full JSON stdin/stdout missing)
- Minor parity observation: JS regex `[\x00-\x1f\x7f]` (C0+DEL) vs Go `unicode.IsControl` (C0+C1) — both produce identical output for all tested hostile inputs; git itself rejects control chars so divergence unreachable in practice

## Rollback Plan

Reverting the commit restores prior hooks and prompts. As immediate mitigation without full revert: set `DISABLE_GIT_COLLABORATION_GUARD=true` to bypass the guard entirely while keeping other workflow intact.

## Delivered Capabilities

- **git-collaboration-guard**: advisory-first guard in PreToolUse + SessionStart with go/node parity
- **hooks**: extended PreToolUse (Step 5b) and SessionStart (git advisory) contracts
- **skills**: branch-pr skill now includes branch-before-code step 0 and multi-dev collaboration strategies
- **agents**: orchestrator, propose, apply include branch-before-code recommendations

## Archive Metadata

- **Previous Status**: verified
- **Next Status**: done
- **Archive Path**: openspec/changes/archive/2026-06-29-harness-git-collaboration/
- **Spec Domains Synced**: 4 (1 new, 3 merged)
- **Implementation Files**: 24 files created or modified (scripts, internal/hooks, skills, agents, dist/)
- **Test Suite**: Node 743/743 PASS, Go 6 packages ok (81 hooks PASS / 0 FAIL)

Archive completed on 2026-06-29 at ISO-8601 UTC.
