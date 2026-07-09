# Delta for hooks

## ADDED Requirements

### Requirement: Codex hooks registration format and command translation {#REQ-hooks-003}

When generating the codex target, the generator MUST emit `hooks/hooks.json` mapping all 5 lifecycle events (`SessionStart`, `PreToolUse`, `PreCompact`, `SubagentStop`, `Stop`) to type `"command"` with the command string replacing `${CLAUDE_PLUGIN_ROOT}` with `$PLUGIN_ROOT` (e.g., `node "$PLUGIN_ROOT/scripts/hooks/<name>.js"`).

#### Scenario: Happy path: Codex hooks are generated matching PascalCase events and variable rewrites

- GIVEN the codex target generation is triggered
- WHEN the hooks configuration is generated
- THEN the output file `hooks/hooks.json` MUST contain all 5 lifecycle events
- AND each command string MUST have `${CLAUDE_PLUGIN_ROOT}` replaced with `$PLUGIN_ROOT`

#### Scenario: Go hooks runtime execution: The Go wrapper accepts Codex stdio payload shape and maps it safely

- GIVEN the Go hooks wrapper receives a Codex stdio payload containing standard fields (e.g., `session_id`, `cwd`, `transcript_path`, `tool_name`, `tool_input`)
- WHEN the wrapper is invoked for a Codex target lifecycle event
- THEN it MUST parse the payload successfully and pass it safely to the underlying hook script
- AND the wrapper MUST output a valid JSON response to stdout without blocking or crashing

## MODIFIED Requirements

None
