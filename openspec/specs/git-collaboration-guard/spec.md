# git-collaboration-guard Specification

## Purpose

The `git-collaboration-guard` is an advisory-first safeguard that detects risky git states at the moment of committing and requests user confirmation before allowing potentially harmful operations. It targets two risky patterns: (1) executing `git commit` while on the default branch, and (2) executing `git commit` when the working tree already has uncommitted changes (even on a feature branch). File-write tools (Edit, Write, etc.) do NOT trigger the guard on their own — it behaves like a pre-commit check, evaluated only when a `git commit` command is about to run, rather than on every file edit. The guard always returns `ask`—never `deny`—and degrades gracefully when git is unavailable.

---

## Requirements

### Requirement: Default Branch Resolution

The guard MUST resolve the default branch, the current branch, and the working tree state before evaluating any action. Resolution MUST proceed as follows:

| Step | Command | On failure |
|------|---------|------------|
| Default branch | `git symbolic-ref refs/remotes/origin/HEAD --short` → strip `origin/` prefix | Fail open for this check only; dirty-tree check still runs |
| Current branch | `git branch --show-current` | Fail open for the default-branch check only; dirty-tree check still runs |
| Working tree state | `git status --porcelain` → non-empty output = dirty | Fail open: skip dirty-tree advisory, return `allow` for this check |

"Fail open" means the guard MUST NOT fire an advisory for a condition it cannot resolve — it returns `allow` for that specific condition and continues evaluating others.

A detached HEAD, a missing `origin` remote, or a git timeout on the default-branch commands MUST all be treated as "resolution unavailable" for the default-branch check only. The dirty-tree check is independent and MUST still run unless git is completely absent from PATH.

All git commands MUST complete within the remaining PreToolUse 5-second timeout budget. If any command times out, the guard MUST fail open for that specific check.

#### Scenario: Default branch resolved — comparison runs

- GIVEN `git symbolic-ref refs/remotes/origin/HEAD --short` returns `origin/main`
- WHEN the guard strips the prefix
- THEN the resolved default branch is `main`
- AND the guard compares the current branch against `main`

#### Scenario: origin/HEAD not configured — fail open

- GIVEN `git symbolic-ref refs/remotes/origin/HEAD` exits non-zero
- WHEN the guard attempts resolution
- THEN the guard MUST return `allow` without emitting an advisory
- AND no git command for current branch is issued

#### Scenario: git binary absent — fail open for all checks

- GIVEN `git` is not installed or not on PATH
- WHEN the guard attempts any git invocation
- THEN all git calls MUST be caught as errors
- AND the guard MUST return `allow` (fail open) for every check

#### Scenario: git status fails — dirty-tree check skipped, other checks unaffected

- GIVEN `git status --porcelain` exits non-zero
- WHEN the guard evaluates working tree state
- THEN the dirty-tree advisory MUST NOT fire
- AND the default-branch check MUST still run to completion

---

### Requirement: Working Tree State Detection

The guard MUST detect whether the working tree has uncommitted changes by running `git status --porcelain`. The output MUST be interpreted as follows:

| Output | Interpretation |
|--------|---------------|
| Non-empty (at least one line) | Working tree is dirty |
| Empty | Working tree is clean |
| Non-zero exit / timeout | Detection failed → fail open (treat as clean for guard purposes) |

"Uncommitted changes" includes any combination of: staged changes, unstaged modifications, and untracked files reported by `--porcelain`.

This check is INDEPENDENT of the default-branch check. A dirty working tree MAY trigger the advisory even when the current branch is a feature branch (not the default branch).

#### Scenario: Working tree is dirty — detection correct

- GIVEN `git status --porcelain` returns at least one output line (e.g., `M scripts/foo.js`)
- WHEN the guard evaluates working tree state
- THEN the working tree MUST be classified as dirty
- AND the dirty-tree condition is eligible to contribute to an advisory

#### Scenario: Working tree is clean — no dirty-tree advisory

- GIVEN `git status --porcelain` returns empty output
- WHEN the guard evaluates working tree state
- THEN the working tree is classified as clean
- AND the dirty-tree condition MUST NOT fire

---

### Requirement: Risky State Detection

The guard MUST fire when a risky action is detected AND at least one of the following risk conditions holds:

| Risk condition | Test |
|----------------|------|
| Default-branch risk | Current branch name equals the resolved default branch name (exact string match) |
| Dirty-tree risk | `git status --porcelain` returns non-empty output |

A risky action is: the extracted command matches `\bgit\s+commit\b`. File-write tools (Edit, Write, etc.) are never risky on their own, regardless of their normalized tool name — only an actual `git commit` command triggers evaluation.

**Combined advisory rule**: when BOTH risk conditions hold simultaneously (on default branch AND dirty tree), the guard MUST emit exactly one combined advisory — never two separate `ask` responses.

If no risk condition holds, or if the action is not risky, the guard MUST NOT fire and MUST return `allow` for this evaluation step.

#### Scenario: File-write tool alone, any branch/tree state — guard silent

- GIVEN any combination of branch and working tree state, including the default branch with a dirty tree
- WHEN the tool invoked is a file-write tool (e.g., `Edit`, `Write`) with no `git commit` command in its payload
- THEN the guard MUST NOT fire
- AND the step returns `allow`, and evaluation continues to the next PreToolUse step

#### Scenario: On default branch, git commit command — default-branch advisory fires

- GIVEN the current branch is `main` AND the resolved default branch is `main`
- AND the working tree is clean
- WHEN a command matching `\bgit\s+commit\b` is extracted from the tool input
- THEN the guard MUST return `ask`
- AND `permissionDecisionReason` MUST mention "default branch" and "feature branch"
- AND MUST NOT mention "uncommitted changes"

#### Scenario: Dirty working tree on feature branch, git commit — dirty-tree advisory fires

- GIVEN the current branch is `feat/my-feature` (not the default branch)
- AND `git status --porcelain` returns non-empty output
- WHEN a command matching `\bgit\s+commit\b` is extracted
- THEN the guard MUST return `ask`
- AND `permissionDecisionReason` MUST mention "uncommitted changes"

#### Scenario: On default branch AND dirty tree — single combined advisory

- GIVEN the current branch is `main` AND the resolved default branch is `main`
- AND `git status --porcelain` returns non-empty output
- WHEN a command matching `\bgit\s+commit\b` is extracted
- THEN the guard MUST return exactly one `ask` response
- AND `permissionDecisionReason` MUST mention both "default branch" and "uncommitted changes"

#### Scenario: Clean tree on feature branch, git commit — guard silent

- GIVEN the current branch is `feat/my-feature` AND the working tree is clean
- WHEN the extracted command matches `\bgit\s+commit\b`
- THEN the guard MUST NOT fire
- AND evaluation continues to the next PreToolUse step

#### Scenario: Read-only tool — guard silent regardless of conditions

- GIVEN any combination of branch and working tree state
- WHEN the tool invoked is a read-only tool (e.g., `Read`, `Grep`, `Glob`) and issues no `git commit` command
- THEN the guard MUST NOT fire

---

### Requirement: Advisory-First Behavior

When the risky state is detected, the guard MUST:

- Return `permissionDecision: "ask"` — NEVER `"deny"`.
- Set `permissionDecisionReason` to a human-readable string whose content depends on which condition(s) triggered:

| Trigger | Required content in `permissionDecisionReason` |
|---------|------------------------------------------------|
| Default-branch only | Branch name, "default branch", recommendation to create a feature branch |
| Dirty-tree only | "uncommitted changes", recommendation to commit or stash before proceeding |
| Both (combined) | Branch name, "default branch", "uncommitted changes", recommendation to create a feature branch and commit/stash first |

- MUST NOT modify, block, or suppress the tool call payload.

#### Scenario: Default-branch-only advisory message

- GIVEN the guard fires on a `git commit` command with current branch `main` and clean working tree
- WHEN the advisory is composed
- THEN `permissionDecision` MUST be `"ask"`
- AND `permissionDecisionReason` MUST contain the current branch name, "default branch", and "feature branch"
- AND MUST NOT mention "uncommitted changes"

#### Scenario: Dirty-tree-only advisory message

- GIVEN the guard fires on a `git commit` command on `feat/my-feature` with a dirty working tree
- WHEN the advisory is composed
- THEN `permissionDecision` MUST be `"ask"`
- AND `permissionDecisionReason` MUST contain "uncommitted changes"
- AND MUST NOT mention "default branch"

#### Scenario: Combined advisory message

- GIVEN the guard fires with both conditions active (default branch AND dirty tree)
- WHEN the advisory is composed
- THEN `permissionDecision` MUST be `"ask"`
- AND `permissionDecisionReason` MUST mention both "default branch" and "uncommitted changes"
- AND exactly one `ask` response MUST be emitted

---

### Requirement: Env-Var Bypass

When `DISABLE_GIT_COLLABORATION_GUARD` equals the string `"true"` (case-sensitive), the guard MUST:
- Skip ALL git invocations.
- Return `allow` for this evaluation step immediately.
- NOT emit any advisory or log entry.

The bypass MUST be checked before any git command is issued.

#### Scenario: Bypass active — guard skipped entirely (default-branch case)

- GIVEN `DISABLE_GIT_COLLABORATION_GUARD=true` is set in the process environment
- WHEN PreToolUse fires for a `git commit` command on the default branch
- THEN the guard MUST NOT invoke any git command
- AND the step returns `allow` (other steps continue normally)

#### Scenario: Bypass active — dirty-tree advisory also suppressed

- GIVEN `DISABLE_GIT_COLLABORATION_GUARD=true` is set in the process environment
- AND the working tree is dirty (uncommitted changes present)
- WHEN PreToolUse fires for a `git commit` command on any branch
- THEN the guard MUST NOT run `git status --porcelain`
- AND no advisory is emitted for the dirty-tree condition

#### Scenario: Bypass variable absent — guard runs both checks

- GIVEN `DISABLE_GIT_COLLABORATION_GUARD` is not set
- WHEN PreToolUse fires for a `git commit` command
- THEN the guard executes both the default-branch check and the dirty-tree check
- AND fires advisories for whichever conditions are detected

---

### Requirement: Go/Node Implementation Parity

The guard MUST be implemented in both runtimes with identical decision logic:

| Runtime | File |
|---------|------|
| Node.js | `scripts/hooks/pre-tool-use.js` |
| Go | `internal/hooks/pretooluse.go` |

Both implementations MUST produce identical `permissionDecision` values and equivalent `permissionDecisionReason` templates for the same inputs. Both MUST be covered by dedicated unit tests. A decision discrepancy between Go and Node for the same input MUST be treated as a defect.

#### Scenario: Go and Node agree on default-branch risky state

- GIVEN identical inputs: current branch = default branch, clean working tree, command = `git commit`
- WHEN both Go and Node implementations evaluate the guard
- THEN both MUST return `permissionDecision: "ask"`
- AND the `permissionDecisionReason` templates MUST match (modulo dynamic values such as branch name)

#### Scenario: Go and Node agree on dirty-tree risky state

- GIVEN identical inputs: feature branch, dirty working tree, command = `git commit`
- WHEN both implementations evaluate the guard
- THEN both MUST return `permissionDecision: "ask"`
- AND the `permissionDecisionReason` templates MUST both mention "uncommitted changes"

#### Scenario: Go and Node agree on combined advisory

- GIVEN identical inputs: current branch = default branch, dirty working tree, command = `git commit`
- WHEN both implementations evaluate the guard
- THEN both MUST return exactly one `permissionDecision: "ask"` response
- AND both `permissionDecisionReason` strings MUST mention both "default branch" and "uncommitted changes"

#### Scenario: Go and Node agree on bypass

- GIVEN `DISABLE_GIT_COLLABORATION_GUARD=true` and identical inputs
- WHEN both implementations evaluate
- THEN both MUST return `allow` without invoking any git command

#### Scenario: Go and Node agree on graceful degradation

- GIVEN git is absent from PATH
- WHEN both implementations attempt any git invocation
- THEN both MUST return `allow` (fail open) without propagating errors to the Claude host

---

## Clarifications

### Session 2026-07-02

- Q: File-write tools (Edit, Write, etc.) triggered an `ask` advisory on every edit while on the default branch or with a dirty tree, which was too noisy for normal development. Should the guard keep firing on every file-write action, or only at commit time? → A: Only at commit time. The guard now fires exclusively when the extracted command matches `git commit` — file-write tools alone never trigger it. This turns the guard into a pre-commit check instead of a per-edit nag, while still catching the risky moment (committing directly to the default branch, or committing with other uncommitted changes already present). (Source: user request, 2026-07-02.)

### Session 2026-06-28

- Q: Is dirty working-tree detection in scope, and does it fire on feature branches (not only on the default branch)? → A: Yes, dirty-tree detection IS in scope. The guard fires when the working tree has uncommitted changes (`git status --porcelain` returns non-empty output) AND a risky action is about to run, even when the current branch is a feature branch. The original task listed "dirty working tree without a feature branch" as a risky state; the canonical interpretation is that both the default-branch condition and the dirty-tree condition are independent guard triggers, each sufficient on its own. When both hold simultaneously, the guard emits a single combined advisory. (Source: orchestrator scope reconciliation directive, 2026-06-28.)
