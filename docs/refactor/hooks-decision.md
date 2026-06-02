# Agent Plugin Hooks Decision

Decision date: 2026-06-02

## Decision

Add a small Agent Plugin hook configuration for deterministic lifecycle automation only. The hooks are declared in `hooks.json` using the documented top-level `hooks` object and referenced from `.plugin/plugin.json` through:

```json
"hooks": "hooks.json"
```

This remains a VS Code Agent Plugin refactor. It does not add a VS Code extension, extension activation code, package manifest, or runtime dependency on extension APIs.

## Hook Events

| Event | Script | Purpose |
| --- | --- | --- |
| `UserPromptSubmit` | `scripts/hooks/persist-session-state.ps1` | Write a diagnostic-only local session marker when SDD or OpenSpec intent is detectable. |
| `PreToolUse` | `scripts/hooks/validate-tool-use.ps1` | Deny only clear unsafe tool uses, such as detectable writes outside the workspace or phase-specific forbidden edits. |
| `PostToolUse` | `scripts/hooks/validate-openspec-artifacts.ps1` | Cheaply validate touched `openspec/**/state.yaml` files exist and are non-empty. |
| `PreCompact` | `scripts/hooks/persist-session-state.ps1` | Refresh the same diagnostic-only local marker before context compaction when input is available. |

Only supported lifecycle events are used: `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, and `PreCompact`. The hook file does not rely on matcher filtering; filtering logic lives inside the scripts. Script paths use the OpenPlugin `${PLUGIN_ROOT}` token so installed plugins can resolve bundled hook scripts outside the current workspace.

## Safety Behavior

The hooks fail safely:

- Empty stdin is accepted.
- Non-JSON stdin is tolerated.
- Unknown input schemas default to allow or no-op.
- Script exceptions are caught and reported as concise diagnostics without breaking normal work.
- `PreToolUse` emits a JSON decision only when denying a detectable unsafe operation.
- No hook runs tests, package installs, repository scans, or other expensive checks on every edit.

The session marker is written under `.git/info/ospec-workflow-session.json`, which is local to the clone and ignored by Git. It is diagnostic only and is not required runtime state.

## Guardrails

`validate-tool-use.ps1` implements these cheap checks when both write intent and file paths are detectable:

- Deny obvious writes outside the workspace.
- Deny `sdd-verify` edits outside expected OpenSpec verification artifacts.
- Deny `sdd-apply` edits to OpenSpec spec files.

`validate-openspec-artifacts.ps1` checks only touched or known `openspec/**/state.yaml` paths. It verifies that each detected state file exists and is non-empty, then exits successfully.

## Non-Goals

This task intentionally does not introduce:

- A dependency on `.vscode/context-summary.json`.
- VS Code extension APIs such as `vscode.lm`, `registerTool`, `ChatParticipant`, or `contributes.languageModelTools`.
- New tests, package manifests, external packages, or long-running validation.
- Matcher-based hook filtering in the plugin host.

## Known Limits

The hook stdin schema may vary between hosts or future plugin versions. For that reason, all scripts use best-effort JSON parsing and conservative path discovery. If a risky operation cannot be detected with confidence, the hook allows normal work instead of blocking the agent workflow.
