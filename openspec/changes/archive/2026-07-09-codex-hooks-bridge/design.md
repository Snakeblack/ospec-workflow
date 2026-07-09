# Design: Codex Hooks Bridge

## Technical Approach

This change implements target hooks support for the `codex` target profile by translating the source hooks configuration to the Codex hooks format, verifying runtime compatibility with the existing Go/Node wrappers, and extending the contract linter (I3 budget checker) to cover the Codex target.

Specifically, the approach maps as follows:
- **Target Profile Update**: Declare `hooks` format and output parameters in `scripts/lib/target-profiles/codex.js`.
- **Transformation Logic**: Implement `codexHooks` in `scripts/lib/target-transform.js` to preserve the 5 PascalCase events while replacing the path variable `${CLAUDE_PLUGIN_ROOT}` with quoted `$PLUGIN_ROOT` paths in the command fields.
- **Contract Lint Extension**: Update `scripts/lib/contract-checkers/i3-budget-constant.js` to load the `codex` profile, locate its hooks configuration, and assert that the `SessionStart` timeout budget remains coherent with the lock module constants (`LOCK_STALE_MS`).
- **Validation Run**: Include the `codex` target in `scripts/check.js` to verify builds and validate generated outputs automatically.
- **Runtime Compatibility**: Review existing wrappers. Since Codex payloads use standard stdio JSON containing standard keys (e.g. `session_id`, `cwd`, `transcript_path`, `tool_name`, `tool_input`), the standard wrappers are fully compatible and handle them perfectly. No runtime wrapper modifications are needed.

## Architecture Decisions

### Decision: Codex hooks config resolution in I3 contract linter

**Choice**: Load `scripts/lib/target-profiles/codex.js` directly within the linter script `i3-budget-constant.js`.
**Alternatives considered**: Hardcode the Codex hooks source path ("hooks/hooks.json") within the linter, or read the generated file after build.
**Rationale**: Loading the profile directly allows the linter to dynamically resolve `hooks.source` without hardcoding paths or relying on generated files that are deleted immediately during target checks. This keeps configuration declarative and DRY.

### Decision: Go/Node wrapper compatibility

**Choice**: Use the existing Go hooks wrapper and Node scripts without change.
**Alternatives considered**: Introduce Codex-specific wrappers or paths.
**Rationale**: The existing Go wrapper and Node scripts parse standard JSON payloads on standard input and write to standard output. Because Codex utilizes standard stdio payloads that match this schema, they are already fully compatible, avoiding code duplication and keeping runtime execution identical across targets.

## Data Flow

```
Source hooks.json ──→ target-transform.js (codexHooks) ──→ dist/codex/hooks/hooks.json
                                                                    │
                                                                    ▼
                                                             Codex CLI Host
                                                                    │
                                                                    ▼
                                                          ospec-hooks-launch.js
                                                                    │
                                                                    ▼
                                                          Go wrapper / Node scripts
                                                                    │
                                                                    ▼
                                                    ospec-state.js / subagent-events.jsonl
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `scripts/lib/target-profiles/codex.js` | Modify | Add hooks format, source, and output locations to the codex target profile declaration. |
| `scripts/lib/target-transform.js` | Modify | Implement the `codexHooks` transform function to map command variables and route hooks transformation for `format === "codex"`. |
| `scripts/lib/contract-checkers/i3-budget-constant.js` | Modify | Load the `codex` target profile, extract the `SessionStart` timeout, and assert coherence with the lock constants. |
| `scripts/lib/contract-checkers/i3-budget-constant.test.js` | Modify | Add unit tests to cover the Codex budget constant checks, including budget violations. |
| `scripts/check.js` | Modify | Add the `codex` target to the active verification checklist with validation enabled. |

## Interfaces / Contracts

### 1. Codex Target Profile Configuration Schema (codex.js)
```javascript
module.exports = {
  // ...
  hooks: {
    format: "codex",
    source: "hooks/hooks.json",
    location: "hooks/hooks.json",
  },
  // ...
};
```

### 2. Transformed Codex hooks.json Schema
```json
{
  "hooks": {
    "SessionStart": [
      {
        "type": "command",
        "command": "node \"$PLUGIN_ROOT/scripts/hooks/ospec-hooks-launch.js\" session-start",
        "timeout": 5
      }
    ],
    "PreToolUse": [
      {
        "type": "command",
        "command": "node \"$PLUGIN_ROOT/scripts/hooks/ospec-hooks-launch.js\" pre-tool-use",
        "timeout": 5
      }
    ],
    "PreCompact": [
      {
        "type": "command",
        "command": "node \"$PLUGIN_ROOT/scripts/hooks/ospec-hooks-launch.js\" pre-compact",
        "timeout": 5
      }
    ],
    "SubagentStop": [
      {
        "type": "command",
        "command": "node \"$PLUGIN_ROOT/scripts/hooks/ospec-hooks-launch.js\" subagent-stop",
        "timeout": 5
      }
    ],
    "Stop": [
      {
        "type": "command",
        "command": "node \"$PLUGIN_ROOT/scripts/hooks/ospec-hooks-launch.js\" stop",
        "timeout": 5
      }
    ]
  }
}
```

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | `codexHooks` transform | Verify that `target-transform.js` correctly maps all 5 PascalCase lifecycle events and rewrites path variables to quoted `$PLUGIN_ROOT` paths in `target-transform.test.js`. |
| Unit | I3 Budget Checker | Test `i3-budget-constant.test.js` to ensure the checker correctly reports offenders for Codex targets when timeout budgets are violated or profile/file loading fails. |
| Integration | Generated output validation | Verify that `scripts/check.js` compiles the `codex` target and successfully runs `validate-codex.js` validation checks on the output tree. |

## Migration / Rollout

No migration required.

## Open Questions

None.
