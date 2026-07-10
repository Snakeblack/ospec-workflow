# Delta for hooks

## ADDED Requirements

### Requirement: Codex Wrapper Matcher and Hooks Generation With Cross-Platform Adapter {#REQ-hooks-004}

The generator MUST emit, for the `codex` target's published payload, a wrapper `matcher`
+ `hooks` structure in `hooks/hooks.json` covering exactly the five current Codex hook
events (`SessionStart`, `PreToolUse`, `PreCompact`, `SubagentStop`, `Stop` — see hooks
Requirement REQ-hooks-003 for the base event/command-translation mapping). The wrapper
MUST include a POSIX/Windows adapter so the same generated command string resolves and
executes correctly under `sh`/`bash` and under `cmd.exe`/PowerShell, and MUST propagate
the `PLUGIN_DATA` variable (the Codex analogue of `CLAUDE_PLUGIN_ROOT`-resolved payload
data) to each invoked hook script without loss or corruption. No event beyond the five
listed MUST be added by this requirement.

#### Scenario: Wrapper matcher generated for all five Codex events

- GIVEN the codex target payload is generated
- WHEN `hooks/hooks.json` is produced
- THEN each of the five events MUST carry a wrapper entry with a `matcher` and a
  `hooks` array, and no additional (sixth) event MUST be present

#### Scenario: POSIX adapter resolves and runs the wrapper

- GIVEN the generated wrapper command is invoked under a POSIX shell (`sh`/`bash`)
- WHEN the hook fires
- THEN the wrapper MUST resolve the script path and execute it without a shell-quoting
  or path-separator failure

#### Scenario: Windows adapter resolves and runs the wrapper

- GIVEN the generated wrapper command is invoked under `cmd.exe` or PowerShell
- WHEN the hook fires
- THEN the wrapper MUST resolve the script path (backslash-safe) and execute it without
  a shell-quoting or path-separator failure

#### Scenario: PLUGIN_DATA propagated intact

- GIVEN the Codex host sets `PLUGIN_DATA` before invoking a wrapped hook
- WHEN the wrapper launches the underlying hook script
- THEN the script MUST receive `PLUGIN_DATA` unmodified (no truncation, re-encoding, or
  loss of the value)

### Requirement: Codex PreToolUse Deny/Allow/Advisory Without ASK {#REQ-hooks-005}

On the `codex` target, `PreToolUse` MUST resolve every decision to exactly `deny` or
`allow`; the `ask` permission decision (baseline §3.1, §3.4) is unsupported by the
Codex host and MUST NOT be emitted. Every baseline `ask`-producing branch (AgentShield
Step 2 advisory class, Token Budget Advisor Steps 3-4, Git Collaboration Guard Step 5b,
Spec Drift Advisory Step 5c, and the ASK rule table Step 6) MUST degrade to `allow` with
the original advisory text surfaced via `systemMessage` (mirroring the existing
`bypassPermissions` degradation defined in §3.4.1), rather than being omitted. DENY
(Step 5, AgentShield deny-class) MUST remain undegraded, exactly as on other targets.

#### Scenario: ASK-class rule degrades to allow with advisory

- GIVEN a command matches an ASK-class rule (e.g. dependency installation) on the codex
  target
- WHEN `PreToolUse` evaluates the call
- THEN it MUST return `allow` with the advisory text present in `systemMessage`, and
  MUST NOT return `ask`

#### Scenario: DENY still blocks on codex

- GIVEN a command matches a DENY rule (Step 5)
- WHEN `PreToolUse` evaluates the call on the codex target
- THEN it MUST return `deny`, unaffected by the ASK-removal degradation

### Requirement: Codex SubagentStop Reads agent_transcript_path {#REQ-hooks-006}

On the `codex` target, `SubagentStop`'s existing skill-resolution extraction (baseline
§5.2) MUST additionally accept `input.agent_transcript_path` as a source for the
transcript-file fallback step, in place of (or alongside) `input.transcript_path`, since
the Codex host names this field differently. Resolution priority and JSONL-parsing
behavior (§5.2 step 3) are otherwise unchanged.

#### Scenario: Codex transcript field resolves skill_resolution

- GIVEN the subagent result payload has no direct `skill_resolution` field and no
  matching known result field, but `input.agent_transcript_path` points to a valid
  transcript JSONL file
- WHEN `SubagentStop` runs on the codex target
- THEN it MUST read and parse that file using the existing §5.2 step-3 logic

### Requirement: Codex SessionStart Context Contract {#REQ-hooks-007}

On the `codex` target, `SessionStart` MUST return the same response contract already
defined for other targets (baseline §2.1: `status`, `ospecDetected`, `registry`, and,
when applicable, `baseline.hint`, `security`, `gitCollaboration`, `specDrift`), unmodified
by target. This requirement fixes the observable contract as target-independent; it does
not introduce a codex-specific response shape.

#### Scenario: SessionStart on codex returns the standard contract

- GIVEN openspec is detected in the workspace
- WHEN `SessionStart` runs via the codex wrapper
- THEN the response MUST contain `status`, `ospecDetected: true`, and `registry`, using
  the same field names and semantics as the claude/vscode/opencode targets

## Test Contracts (Non-Normative Coverage Note)

Fixtures for REQ-hooks-005..007 MUST assert against the published codex payload (not a
hand-authored fixture), consistent with the Go/JS parity fixture pattern (baseline §8a).
