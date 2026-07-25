# Delta for hooks-runtime

## ADDED Requirements

### Requirement: Cursor Hook Launcher Path Expansion {#REQ-hooks-runtime-001}

For the `cursor` target, generated `hooks.json` MUST reference
`ospec-hooks-launch.js` under the runtime placeholder `__OSPEC_CURSOR_ROOT__`
(generator REQ-generator-007). After `setup:cursor` / `install-cursor.js` completes,
every installed hook command MUST use an absolute path to that launcher (forward
slashes MAY be used on Windows). The JSON stdin/stdout contract of the Go binary
MUST remain identical to other targets. Cursor-specific hook env markers are out of
scope for this change.

#### Scenario: Installed Cursor hooks use absolute launcher paths

- GIVEN `dist/cursor/hooks.json` still contains `__OSPEC_CURSOR_ROOT__`
- WHEN `npm run setup:cursor` installs into `~/.cursor`
- THEN installed `hooks.json` commands MUST resolve the launcher via an absolute path
- AND MUST NOT retain the unresolved placeholder

#### Scenario: Cursor stdin/stdout contract unchanged

- GIVEN a Cursor host invokes a wired hook event
- WHEN the launcher runs the Go binary subcommand
- THEN the binary MUST read UTF-8 JSON stdin and write one UTF-8 JSON stdout line
  using the same contract as other targets

## MODIFIED Requirements

### Requirement: Per-Target Hook Invocation Wiring

All six targets MUST invoke the Go binary via their respective extension surface.
The JSON stdin/stdout contract MUST be identical across all targets.

| Target | Config file | Invocation surface | Hooks wired |
|---|---|---|---|
| claude | `hooks/hooks.json` | Shell command via `CLAUDE_PLUGIN_ROOT` | All 5 |
| vscode | inherits canonical `hooks/hooks.json` via identity transform | Shell command | All 5 |
| github-copilot | `.github/hooks/hooks.json` (`bash` + `powershell` keys, repo-relative) | Shell command | 2 (sessionStart, preToolUse) |
| opencode | `.opencode/plugins/ospec.js` (generated) | spawnSync — see Requirement: opencode SpawnSync | 2 (session.created → session-start, tool.execute.before → pre-tool-use) |
| codex | `hooks/hooks.json` (wrapper matcher + POSIX/Windows adapter) | Shell command via `$PLUGIN_ROOT` / `%PLUGIN_ROOT%` | All 5 |
| cursor | `hooks.json` (camelCase event map + `__OSPEC_CURSOR_ROOT__` placeholder expanded at install) | Shell command via absolute `ospec-hooks-launch.js` | Mapped Cursor events (beforeSubmitPrompt, beforeShellExecution, beforeReadFile, afterFileEdit, stop); `SubagentStop` dropped |

(Previously: table covered four targets and said “All four targets”; now includes codex and cursor as first-class wiring rows.)

#### Scenario: claude and vscode wiring covers all 5 hooks

- GIVEN the canonical `hooks/hooks.json` is updated with the Go binary command
- WHEN the vscode identity transform is applied
- THEN both targets MUST produce hook registrations for all 5 events pointing to the binary

#### Scenario: github-copilot wiring covers only its 2 hooks

- GIVEN `.github/hooks/hooks.json` currently declares only `sessionStart` and `preToolUse`
- WHEN the Go binary is substituted
- THEN the github-copilot config MUST NOT add additional hook events beyond those 2

#### Scenario: cursor wiring uses mapped camelCase events

- GIVEN the cursor profile emits `hooks.format: "cursor"`
- WHEN generation and install complete
- THEN installed Cursor hooks MUST register the mapped camelCase events from the table
- AND MUST NOT register an unmapped `SubagentStop` event
