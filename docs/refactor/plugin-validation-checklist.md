# Plugin Validation Checklist

Purpose: give future AI agents a deterministic checklist before and after modifying this VS Code Agent Plugin. This repository must remain an Agent Plugin / Agent Customization package, not a VS Code extension.

Scope: run these checks from the repository root. Treat any `BLOCK` result as a hard stop until the plugin shape is corrected or a maintainer explicitly documents an exception in the same change.

Result format for agents:

```yaml
validation:
  plugin_shape: pass|fail
  extension_migration_blocked: pass|fail
  checks:
    - id: PV-001
      result: pass|fail|not_applicable
      evidence: "short path, command, or observation"
      action: "none or required fix"
```

## Required Commands

Use these commands when available. Equivalent tooling is acceptable if it returns the same evidence.

```powershell
$ErrorActionPreference = 'Stop'
$Root = (Get-Location).Path
Get-ChildItem -Force
Get-ChildItem -Recurse -Force -File agents,skills,commands,rules -ErrorAction SilentlyContinue | Select-Object FullName
```

## Checklist

| ID | Check | How to Run | PASS | BLOCK |
| --- | --- | --- | --- | --- |
| PV-001 | Plugin manifest exists in a recognized location. | Check `.plugin/plugin.json` first, then root `plugin.json` only if the repository intentionally uses that location. Command: `Test-Path .plugin/plugin.json; Test-Path plugin.json`. | Exactly one recognized plugin manifest is found, or both are present with clear documentation that one mirrors the other. Current expected path: `.plugin/plugin.json`. | No recognized plugin manifest exists, or a root manifest appears to replace `.plugin/plugin.json` without an explicit migration decision. |
| PV-002 | Plugin name is kebab-case. | Parse the manifest JSON and inspect `name`. Command: `(Get-Content .plugin/plugin.json -Raw | ConvertFrom-Json).name`. | `name` matches `^[a-z0-9]+(-[a-z0-9]+)*$`. Current expected value: `ospec-workflow`. | Name contains spaces, uppercase letters, underscores, dots, extension publisher syntax, or any non-kebab-case value. |
| PV-003 | Manifest points to an existing agents path. | Read `agents` from the manifest and test that path. Command: `$m = Get-Content .plugin/plugin.json -Raw | ConvertFrom-Json; Test-Path $m.agents`. | Manifest has `agents`, and the referenced directory exists. Current expected path: `agents/`. | Missing `agents`, path does not exist, or agents are moved into an extension `contributes` section. |
| PV-004 | Manifest points to an existing skills path. | Read `skills` from the manifest and test that path. Command: `$m = Get-Content .plugin/plugin.json -Raw | ConvertFrom-Json; Test-Path $m.skills`. | Manifest has `skills`, and the referenced directory exists. Current expected path: `skills/`. | Missing `skills`, path does not exist, or skills are replaced with extension activation code. |
| PV-005 | Every agent file has valid frontmatter. | For each `agents/*.agent.md`, verify the file starts with `---`, has a closing `---`, and the YAML between them parses. Required keys: `name`, `description`, `user-invocable`. | Every `*.agent.md` has parseable YAML frontmatter with required keys, and the frontmatter closes before body content. | Any agent lacks frontmatter, has malformed YAML, omits required keys, or stores agent metadata only in prose. |
| PV-006 | Exactly one SDD agent is user-invocable. | Parse `agents/sdd-*.agent.md` frontmatter and count `user-invocable: true`. | Count is exactly `1`, and the agent is `sdd-orchestrator`. | Count is `0`, count is greater than `1`, or a phase agent is directly user-invocable. |
| PV-007 | Phase agents are not user-invocable. | Inspect all SDD phase agents except `sdd-orchestrator`. Phase agents include `sdd-init`, `sdd-foundation`, `sdd-explore`, `sdd-propose`, `sdd-spec`, `sdd-design`, `sdd-tasks`, `sdd-apply`, `sdd-verify`, `sdd-archive`, and `sdd-onboard`. | Each phase agent has `user-invocable: false`. | Any phase agent has `user-invocable: true`, omits the field, or instructs users to call it directly. |
| PV-008 | Every skill directory has `SKILL.md`. | For each direct child directory under `skills/`, test for `SKILL.md`. Command: `Get-ChildItem skills -Directory | Where-Object { -not (Test-Path (Join-Path $_.FullName 'SKILL.md')) }`. | No skill directory is missing `SKILL.md`. | Any skill directory lacks `SKILL.md`, including support packages such as `_shared`. |
| PV-009 | Skill folder name matches skill name. | For each `skills/*/SKILL.md`, parse frontmatter `name` and compare it to the directory name. `_shared` may use `_shared` or an explicitly documented support-package name if a maintainer justifies it. | Directory basename equals frontmatter `name`, or the only mismatch is a documented support-package exception. | A skill directory and frontmatter name diverge without documented justification. |
| PV-010 | MCP configuration shape is valid when present. | If `.mcp.json` exists, parse JSON and inspect top-level keys. Command: `if (Test-Path .mcp.json) { (Get-Content .mcp.json -Raw | ConvertFrom-Json).mcpServers }`. | `.mcp.json` is absent, or it exists and has top-level `mcpServers`. | `.mcp.json` exists but is invalid JSON, lacks top-level `mcpServers`, or embeds MCP server setup in extension code. |
| PV-011 | Hooks use supported lifecycle events when present. | If `hooks.json` exists, parse `.hooks` keys. Supported events are `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `PreCompact`, `SubagentStart`, `SubagentStop`, and `Stop`. | Every hook event is in the supported set and every hook is deterministic automation, such as a command hook. | Any unknown event appears, such as `PrePromptHook`, or hooks depend on extension activation, UI APIs, or non-deterministic agent reasoning. |
| PV-012 | Command files are thin orchestrator wrappers. | If `commands/` exists, inspect every `commands/*.md` file. Required frontmatter: `name`, `description`, `agent: sdd-orchestrator`. Body should route to the orchestrator and not duplicate phase implementation rules. | Commands are short wrappers that delegate to `sdd-orchestrator`, preserve phase-agent boundaries, and avoid runtime logic. | A command invokes a phase agent directly, contains large implementation instructions, mutates files itself, or bypasses orchestrator readiness checks. |
| PV-013 | Manifest command reference resolves to an existing path. | If manifest has `commands`, test the referenced path. Command: `$m = Get-Content .plugin/plugin.json -Raw | ConvertFrom-Json; if ($m.commands) { Test-Path $m.commands }`. | `commands` is absent, or it points to an existing directory/file. Current expected path: `commands/`. | Manifest references a missing command path or a generated VS Code extension command contribution instead of plugin command files. |
| PV-014 | Plugin-bundled instructions stay in sync with workspace mirrors. | If both `rules/` and `.github/instructions/` exist, compare same-named `*.instructions.md` files byte-for-byte or with an explicitly documented allowed-difference note. Command: `Compare-Object (Get-Content rules/<file>) (Get-Content .github/instructions/<file>)`. | For every mirrored instruction file, contents match exactly or the difference is documented in the validation result. | A mirrored instruction differs silently, or one side has a same-purpose instruction without an intentional sync decision. |
| PV-015 | No VS Code extension APIs are present. | Search for extension entrypoints and APIs. Command: `rg "vscode\.|activate\(|deactivate\(|ExtensionContext|contributes|activationEvents|engines\s*:\s*\{\s*\"vscode\"" -g "!*node_modules*"`. | No extension API usage or extension contribution metadata is found. Documentation may mention VS Code Agent Plugin concepts, but must not introduce extension runtime code. | Any runtime code imports or calls VS Code extension APIs, defines `activate`/`deactivate`, uses `ExtensionContext`, or adds extension `contributes`/`activationEvents`. |
| PV-016 | No generated extension `package.json` manifest exists unless explicitly justified. | Search for `package.json`. If present, inspect whether it is an extension manifest. Command: `Get-ChildItem -Recurse -Force -Filter package.json`. | No `package.json` exists, or a non-extension package file is explicitly justified for tooling and does not include extension fields. Current expected state: no `package.json`. | A generated extension `package.json` appears with `activationEvents`, `contributes`, `engines.vscode`, `main`, or `devDependencies` for extension packaging without a maintainer-approved exception. |
| PV-017 | Plugin architecture has not migrated to extension architecture. | Combine PV-001 through PV-016 and inspect changed files. | Changes keep `.plugin/plugin.json`, `agents/`, `skills/`, `rules/`, `.mcp.json`, `hooks.json`, and `commands/` as declarative plugin assets. | Any change converts the repository into an extension scaffold, adds extension activation code, replaces agent/skill metadata with extension contributions, or moves plugin behavior behind a compiled extension runtime. |

## Agent Execution Notes

1. Run PV-001 through PV-017 in order.
2. Stop at the first `BLOCK` if the change would alter architecture or invocation topology.
3. For documentation-only changes, still run the architecture guard checks PV-015 through PV-017.
4. Do not fix unrelated failures unless the task explicitly asks for validation repair.
5. Report missing `.atl/skill-registry.md` as `skill_resolution: none`; do not create it during this checklist validation unless a separate task requests registry generation.

## Extension Architecture Block

This repository must not be migrated into a VS Code extension as part of normal plugin maintenance. The following files or patterns are blocking unless the task explicitly says the maintainer approved an extension migration:

- Generated extension `package.json` with `activationEvents`, `contributes`, `engines.vscode`, or `main`.
- Source code importing `vscode` or defining `activate(context)` / `deactivate()`.
- Compiled extension output directories such as `out/`, `dist/`, or `extension/` that replace declarative agent assets.
- A manifest that removes `agents` or `skills` in favor of extension contribution points.
- Command implementations that bypass `sdd-orchestrator` and directly run phase logic.

If any of these patterns appears, return `plugin_shape: fail` and `extension_migration_blocked: fail` until the change is reverted or an explicit architecture decision is added.