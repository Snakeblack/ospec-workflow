# Design: Preparar el harness para colaboración git multi-desarrollador

## Technical Approach

Two layers, one change. (1) A new **advisory-first guard** runs inside the already-active runtime hooks: `PreToolUse` gains Step 5b (after DENY, before ASK) and `SessionStart` gains a git-collaboration advisory. The guard inspects three independent risky patterns — write/commit on the default branch, and write/commit with a dirty working tree (even on a feature branch) — and emits a single combined advisory when more than one holds. It is implemented at parity in Node (`scripts/hooks/*.js`) and Go (`internal/hooks/*.go`). (2) **Prompt recommendations** ("branch before code", multi-dev strategies) live in `skills/branch-pr/SKILL.md` and `agents/sdd-orchestrator.agent.md` and propagate to the four targets via the existing `scripts/configure` build. This maps directly to the proposal's "Approach" and is allocated against the four change-local specs (`git-collaboration-guard`, `hooks`, `skills`, `agents`).

Design mode: **design-after-spec** — all four delta specs exist and constrain the work below.

## Architecture Decisions

| Decision | Choice | Alternatives rejected | Rationale |
|----------|--------|-----------------------|-----------|
| Guard position in PreToolUse | New **Step 5b**, after DENY (Step 5), before ASK (Step 6) | Run first; merge into ASK rules | DENY must win ("git push --force" denies before any branch-ask); ASK rules are command-regex only and cannot express git-state. A dedicated step keeps the existing chain untouched. |
| Default decision | Always `ask`, **never** `deny` | `deny` on default branch | Editing `main` is legitimate for hotfixes/docs. `ask` surfaces risk without blocking; matches spec "Advisory-First Behavior". |
| Failure mode | **Per-check fail open** (return `allow` for the unresolved check, no advisory) | Single all-or-nothing fail-open; fail closed | The default-branch and dirty-tree checks are INDEPENDENT: a missing `origin/HEAD`, detached HEAD, or failed `git status` must fail open for THAT check only and MUST NOT suppress the other. Absent git binary fails open for all checks. |
| Bypass | Env var `DISABLE_GIT_COLLABORATION_GUARD=true`, checked **before any git call** | Config flag in `config.yaml` | Mirrors existing `DISABLE_AGENT_SHIELD` / `DISABLE_TOKEN_ADVISOR` pattern; zero-latency escape hatch usable mid-session per the rollback plan. |
| Git invocation | `git symbolic-ref refs/remotes/origin/HEAD --short` + `git branch --show-current` + `git status --porcelain`, sharing one 5 s deadline | Two-command default-branch-only set | Spec now scopes THREE risky patterns: default-branch write, default-branch commit, AND dirty-tree write/commit (even on a feature branch). `--porcelain` (non-empty = dirty) is the cheapest dirty-tree probe. |
| Combined advisory | When default-branch AND dirty-tree both hold, emit exactly ONE `ask` mentioning both | Two sequential `ask` prompts | Spec "Combined advisory rule" forbids double prompts; a single message keeps the UX a single decision. |
| Advisory language | User-facing text (PreToolUse reason + SessionStart message) in **Spanish** | English (per the spec's schema example) | Consistent with existing Spanish hook prose (`Advertencia de seguridad…`, `Acceso denegado…`). The spec's English `message` example is illustrative; the JSON shape is honored, the prose is Spanish. Resolves the earlier mixed-language note. |
| Go git access | New `internal/hooks/gitstate.go` using `os/exec` + `context.WithTimeout` | Add a git library dependency | No `os/exec` use exists in `internal/` today; the stdlib keeps the binary dependency-free and matches Node's `child_process` shape. |

## Data Flow

PreToolUse decision chain (additions in **bold**):

```
stdin(JSON) ─► evaluateToolUse
   1 BYPASS  (DISABLE_AGENT_SHIELD / TOKEN_ADVISOR / GIT_COLLABORATION_GUARD)
   2 AGENT SHIELD ─► deny|ask
   3 TOKEN ADVISOR ─► ask         4 SESSION TOKENS ─► ask
   5 DENY rules ─────────────────► deny  ◄─ "deny beats guard"
   5b GIT COLLABORATION GUARD ───► ask   ◄─ NEW
   6 ASK rules ──────────────────► ask
   7 ALLOW ──────────────────────► allow
        └─► hookSpecificOutput{ hookEventName, permissionDecision, permissionDecisionReason }
```

Step 5b internals (shared logic, both runtimes):

```
isRiskyAction(toolName, commands)?  ── no ─► allow (step continues to 6)
   │ yes  (file-write tool  OR  /\bgit\s+commit\b/)
resolveGitState()  (env-bypass already excluded; per-check fail open)
   onDefault = (defaultBranch resolved) AND currentBranch == defaultBranch
   dirty     = (status resolved)        AND porcelain output non-empty
   │ neither ─► allow (silent)
   │ onDefault && dirty  ─► ask + combinedReason(branch)      ◄─ single prompt
   │ onDefault only      ─► ask + defaultBranchReason(branch)
   │ dirty only          ─► ask + dirtyTreeReason
```

SessionStart (after security check, §2.1 Step 9):

```
runSessionStart ─► …registry/baseline/security…
   DISABLE_GIT_COLLABORATION_GUARD=true ? ─► skip entire check
   resolve default-branch  (fail open → currentBranch/defaultBranch = null)
   resolve dirty-tree      (status fails → dirtyTree field OMITTED)
   onDefault || dirty ?
      └─► result.gitCollaboration = {status:"warning", currentBranch, defaultBranch,
                                     dirtyTree?, message}   ◄─ single combined message
          result.systemMessage += "\n" + message
```

## Git State Resolution (parity contract)

Single helper, identical semantics in both runtimes. The three probes resolve
**independently** so one failure never suppresses another:

```
resolveGitState() -> { defaultBranch|null, currentBranch|null, dirty|null }
  defaultBranch: `git symbolic-ref refs/remotes/origin/HEAD --short` → strip "origin/"
  currentBranch: `git branch --show-current`   (empty = detached HEAD → null)
  dirty        : `git status --porcelain`       (non-empty = dirty; fail → null)
  each probe: any non-zero exit, error, or timeout -> null for THAT field only
  derived: onDefault = default!=null && current!=null && current==default
           dirty stays null only when status fails (never falsely "clean")
```

- **Node** (`scripts/hooks/lib/git-state.js`, new): each probe is a separate
  `child_process.execFileSync("git", [...], { timeout, stdio })` in its own
  try/catch; a thrown error sets that field to `null`. `dirty` distinguishes
  `false` (clean, command succeeded with empty output) from `null` (command failed).
- **Go** (`internal/hooks/gitstate.go`, new): `exec.CommandContext(ctx, "git", ...)`
  per probe under one shared `context.WithTimeout(5s)`; failure → that field is the
  zero/`nil` sentinel. `dirty` is `*bool` so `nil` (omit) is distinct from `false`.
- Parity is enforced by mirrored unit tests (same fixtures, same decisions). A divergence is a defect per the `git-collaboration-guard` spec.

Timeout budget: the 5 s is the PreToolUse ceiling shared across all three probes;
an exhausted deadline makes later probes fail open for their own field only.

## Interfaces / Contracts

PreToolUse Step 5b advisory (unchanged envelope, `ask` reason). Three Spanish
message variants, one per trigger combination:

| Trigger | `permissionDecisionReason` (Spanish, must contain) |
|---------|----------------------------------------------------|
| Default-branch only | branch name + "rama por defecto" + "rama de feature" — NOT "cambios sin commitear" |
| Dirty-tree only | "cambios sin commitear" + recommend commit/stash — NOT "rama por defecto" |
| Combined | branch name + "rama por defecto" + "cambios sin commitear" (single `ask`) |

```json
{ "hookSpecificOutput": { "hookEventName": "PreToolUse", "permissionDecision": "ask",
  "permissionDecisionReason": "Estás en la rama por defecto 'main' y el árbol de trabajo tiene cambios sin commitear. Crea una rama de feature (<type>/<description>) y haz commit o stash antes de continuar." } }
```

SessionStart new optional field (emitted only when ≥1 condition holds). `dirtyTree`
is `true`/`false` when `git status` resolves, and **omitted** when it fails (never
falsely reported clean); `currentBranch`/`defaultBranch` are `null` when unresolvable:
```json
{ "gitCollaboration": { "status": "warning", "currentBranch": "main",
  "defaultBranch": "main", "dirtyTree": true,
  "message": "La sesión inició en la rama por defecto 'main' y hay cambios sin commitear. Crea una rama de feature y haz commit o stash antes de editar código." } }
```
The Go `sessionStartOutput` struct gains `GitCollaboration *gitCollaboration` (`omitempty`),
whose `DirtyTree *bool` uses `omitempty` so a `nil` pointer drops the field.

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `scripts/hooks/lib/git-state.js` | Create | Node `resolveGitState()` (default + current + dirty probes, per-field fail-open), `isRiskyAction()`, `composeAdvisory()` message builder (3 Spanish variants) |
| `scripts/hooks/pre-tool-use.js` | Modify | Insert Step 5b after DENY loop, before ASK loop; bypass check; combined-advisory selection |
| `scripts/hooks/session-start.js` | Modify | Add `gitCollaboration` advisory (incl. `dirtyTree`) + `systemMessage` append after security block |
| `internal/hooks/gitstate.go` | Create | Go `resolveGitState()` via `exec.CommandContext` (3 probes, `*bool` dirty); shared `composeAdvisory` by both hooks |
| `internal/hooks/pretooluse.go` | Modify | Step 5b between deny-pass and ask-pass; `DISABLE_GIT_COLLABORATION_GUARD` gate |
| `internal/hooks/sessionstart.go` | Modify | Add `GitCollaboration` field + advisory composition |
| `skills/branch-pr/SKILL.md` | Modify | Workflow Step 0 "branch before code"; new `## Multi-Developer Collaboration`; Critical Rules entries |
| `agents/sdd-orchestrator.agent.md` | Modify | CORE-zone branch-before-code recommendation before `sdd-apply` dispatch |
| `agents/sdd-propose.agent.md` | Modify | Append branch advisory note to success envelope |
| `agents/sdd-apply.agent.md` | Modify | Emit non-blocking branch-status note in `executive_summary` |
| `scripts/hooks/pre-tool-use.test.js` | Modify | Step 5b cases (fires/silent/bypass/fail-open/deny-precedence) |
| `scripts/hooks/session-start.test.js` | Modify | Advisory present/absent/bypass/git-unavailable |
| `internal/hooks/pretooluse_test.go` | Modify | Mirror Node Step 5b corpus |
| `internal/hooks/sessionstart_test.go` | Modify | Mirror Node advisory corpus |
| `internal/hooks/gitstate_test.go` | Create | Resolution + timeout + fail-open unit tests |
| `dist/**` | Regenerate | `scripts/configure` propagates prompts to claude/vscode/github-copilot/opencode |

## Testing Strategy (strict_tdd: true — tests first)

| Layer | What to Test | Approach |
|-------|--------------|----------|
| Unit (Node) | `resolveGitState` per-field fail-open (default fails but dirty resolves and vice-versa); `dirty=false` vs `null`; `isRiskyAction` matrix | Injected git runner stubbing each probe independently |
| Unit (Go) | Same per-field matrix; timeout/non-zero exit → field-level sentinel; `*bool` nil vs false | `t.TempDir()` git repos + injected runner; `context` deadline assertions |
| Integration (Node) | Step 5b: default-branch advisory; **dirty-tree advisory on a feature branch**; **single combined advisory** (both conditions); silent on clean feature branch; bypass; **deny-precedence** (`git push --force` still denies) | `evaluateToolUse` against temp repos: `main`/clean, `feat/x`/dirtied, `main`/dirtied |
| Integration (Go) | Same corpus via `hooks.Dispatch(["pre-tool-use"]/["session-start"], …)` incl. dirty + combined + `dirtyTree` omitted when status fails | Mirror Node fixtures; assert identical `permissionDecision` + reason content |
| Parity | Go and Node agree on default/dirty/combined/bypass/degradation | Shared fixture table replicated in both suites |
| Prompt/build | Recommendation appears in all four `dist/` targets | Assert generated orchestrator contains branch text post-`configure` |

Both runtimes inject the git runner (Node: optional function param; Go: package-level
`var gitRunner`) so each probe is stubbed independently and decision logic is exercised
in isolation. A small set of **real-repo** cases (`t.TempDir()` in Go / temp-repo helper
in Node) genuinely dirties the tree — e.g. write an untracked file or modify a tracked
one, then assert `git status --porcelain` non-empty drives the dirty-tree advisory — plus
true-degradation cases (git off PATH, no `origin/HEAD`).

## Migration / Rollout

No data migration. Pure additive behavior behind a default-on guard with an env-var kill switch. Reverting the change restores prior hooks/prompts; `dist/` is regenerated by the build, not hand-edited.

## Open Questions

- [x] **Dirty-tree scope — RESOLVED**: `sdd-spec` amended the specs (2026-06-28) to make dirty-tree detection IN scope as an independent trigger via `git status --porcelain`, with a combined advisory when default-branch AND dirty hold. This design now implements all three risky patterns and per-check fail-open.
- [x] **Advisory language — RESOLVED**: user-facing text (PreToolUse `permissionDecisionReason` + SessionStart `message`) is **Spanish**, consistent with existing hook prose. The English `message` example in the spec is illustrative only; the JSON shape is honored.
