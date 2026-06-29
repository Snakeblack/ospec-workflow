# Delta for hooks

## ADDED Requirements

### Requirement: Git Collaboration Guard Step in PreToolUse

The `PreToolUse` decision chain (§3.4 of the hooks spec) MUST include a new evaluation step for the git-collaboration-guard, inserted after DENY evaluation (Step 5) and before the existing ASK rules (Step 6). Full guard logic is specified in the `git-collaboration-guard` domain spec.

**Revised evaluation order** (additions in bold):

| Step | Name | Returns |
|------|------|---------|
| 1 | BYPASS — incl. **`DISABLE_GIT_COLLABORATION_GUARD`** | skip guard if true |
| 2 | AGENT SHIELD SECURITY | `deny` / `ask` |
| 3 | TOKEN BUDGET ADVISOR | `ask` |
| 4 | SESSION TOKENS | `ask` |
| 5 | DENY rules | `deny` |
| **5b** | **GIT COLLABORATION GUARD** | **`ask`** |
| 6 | ASK rules | `ask` |
| 7 | ALLOW | `allow` |

"Deny beats guard-ask": because Step 5 (DENY) executes before Step 5b, a matching DENY rule always takes precedence — the guard is never reached when a command is denied.

Step 1 BYPASS MUST recognize `DISABLE_GIT_COLLABORATION_GUARD=true` and skip Step 5b when active. Existing bypass variables (`DISABLE_AGENT_SHIELD`, `DISABLE_TOKEN_ADVISOR`) are unaffected.

#### Scenario: DENY fires — guard not evaluated

- GIVEN a tool call whose command matches a DENY rule (e.g., `git push --force`)
- AND the current branch is the default branch
- WHEN PreToolUse evaluates the call
- THEN the hook returns `deny` at Step 5
- AND the git collaboration guard (Step 5b) is never invoked

#### Scenario: DENY does not fire, guard fires on default branch

- GIVEN the tool call has no commands matching DENY rules
- AND the tool is a file-write tool AND the current branch equals the default branch
- WHEN PreToolUse evaluates the call
- THEN the hook returns `ask` from Step 5b
- AND the existing ASK rules (Step 6) are not evaluated

#### Scenario: DENY does not fire, guard fires on dirty working tree (feature branch)

- GIVEN the tool call has no commands matching DENY rules
- AND the tool is a file-write tool AND the working tree has uncommitted changes
- AND the current branch is NOT the default branch
- WHEN PreToolUse evaluates the call
- THEN the hook returns `ask` from Step 5b (dirty-tree advisory)
- AND the existing ASK rules (Step 6) are not evaluated

#### Scenario: Bypass active — guard skipped, evaluation continues

- GIVEN `DISABLE_GIT_COLLABORATION_GUARD=true`
- AND a tool call that would otherwise trigger the guard
- WHEN PreToolUse evaluates the call
- THEN Step 5b is skipped
- AND evaluation proceeds to Step 6 (ASK rules) and Step 7 (ALLOW) normally

#### Scenario: Guard fires but other steps unaffected

- GIVEN the guard fires and returns `ask` at Step 5b
- WHEN PreToolUse returns its response
- THEN `hookSpecificOutput.permissionDecision` MUST be `"ask"`
- AND `hookSpecificOutput.hookEventName` MUST still be `"PreToolUse"`

---

### Requirement: SessionStart Git Collaboration Advisory

The `SessionStart` hook MUST run a git collaboration check during its initialization sequence, after the security check (§2.1, Step 9). The check evaluates TWO independent conditions: (1) whether the current branch equals the default branch, and (2) whether the working tree is dirty (`git status --porcelain` returns non-empty output). When at least one condition holds, the hook MUST include a `gitCollaboration` entry in the response JSON.

**Response schema** (`status: "warning"` when at least one condition holds, omitted entirely when both are absent):

```json
{
  "gitCollaboration": {
    "status": "warning",
    "currentBranch": "<name>",
    "defaultBranch": "<name>",
    "dirtyTree": true,
    "message": "<human-readable advisory>"
  }
}
```

Field rules:
- `currentBranch`: always the resolved current branch name; `null` if unresolvable.
- `defaultBranch`: always the resolved default branch name; `null` if unresolvable.
- `dirtyTree`: `true` when `git status --porcelain` is non-empty; `false` when clean; omitted if `git status` fails.
- `message`: content follows the same rules as the PreToolUse advisory (single message, combined if both conditions).

The advisory MUST also be appended to the existing `systemMessage` string (newline-separated) so the Claude host surfaces it to the user at session start.

When `DISABLE_GIT_COLLABORATION_GUARD=true`, the entire check MUST be suppressed (no `gitCollaboration` key, no change to `systemMessage`).

When git is unavailable or any git command fails, the affected condition MUST be silently skipped; the remaining check MUST still run. The rest of SessionStart behavior (registry cache, baseline hint, security) MUST be unaffected.

#### Scenario: Session on default branch, clean tree — default-branch advisory

- GIVEN `origin/HEAD → refs/remotes/origin/main`, current branch `main`, clean working tree
- WHEN SessionStart runs
- THEN the response MUST include `gitCollaboration.status: "warning"` with `dirtyTree: false`
- AND `systemMessage` MUST mention "default branch" and "feature branch"

#### Scenario: Session on feature branch, dirty tree — dirty-tree advisory

- GIVEN the current branch is `feat/my-feature` (not the default branch)
- AND `git status --porcelain` returns non-empty output
- WHEN SessionStart runs
- THEN the response MUST include `gitCollaboration.status: "warning"` with `dirtyTree: true`
- AND `systemMessage` MUST mention "uncommitted changes"

#### Scenario: Session on default branch AND dirty tree — combined advisory

- GIVEN the current branch is `main` (default) AND the working tree is dirty
- WHEN SessionStart runs
- THEN the response MUST include exactly one `gitCollaboration` entry with `dirtyTree: true`
- AND `message` MUST mention both "default branch" and "uncommitted changes"

#### Scenario: Session on feature branch, clean tree — no advisory

- GIVEN the current branch is `feat/my-feature` AND the working tree is clean
- WHEN SessionStart runs
- THEN the response MUST NOT contain a `gitCollaboration` key
- AND `systemMessage` MUST NOT include any collaboration advisory text

#### Scenario: Bypass active — advisory suppressed

- GIVEN `DISABLE_GIT_COLLABORATION_GUARD=true`
- WHEN SessionStart runs, regardless of branch or working tree state
- THEN no `gitCollaboration` key is present in the response
- AND `systemMessage` is unaffected by this guard

#### Scenario: git unavailable — advisory silently omitted

- GIVEN git is not installed or not on PATH
- WHEN SessionStart runs
- THEN the entire collaboration check is silently skipped
- AND registry cache, baseline hint, and security check behavior MUST be unaffected

#### Scenario: git status fails, branch check succeeds — partial advisory

- GIVEN `git branch --show-current` returns `main` (= default branch)
- AND `git status --porcelain` exits non-zero
- WHEN SessionStart runs
- THEN the `gitCollaboration` entry MUST reflect the default-branch condition
- AND the `dirtyTree` field MUST be omitted (not falsely reported as clean)
