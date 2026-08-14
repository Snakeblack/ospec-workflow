# Delta for install

## MODIFIED Requirements

### Requirement: Unified Installation Ownership Manifest & Convergence {#REQ-install-008}

All global target installers (Cursor, Copilot, OpenCode, Codex, Antigravity) MUST persist an installation manifest (`.ospec-workflow-install.json` in their managed global root, and `.ospec-workflow-codex-install.json` in `~/.agents/skills/` for Codex skills) recording the installed version, target, timestamp, and array of all relative files owned by OSpec Workflow. On subsequent executions, the installer MUST compute `stale = previous_owned - current_owned` and delete stale files while strictly preserving all user-created or third-party files. VS Code manages registration via `settings.json` `chat.pluginLocations` array.

#### Scenario: Stale Codex skill removed after version upgrade
- GIVEN a previous Codex installation deployed `~/.agents/skills/obsolete-skill/SKILL.md`
- WHEN the new version of OSpec Workflow no longer includes `obsolete-skill` and `npm run setup:codex` is executed
- THEN `~/.agents/skills/obsolete-skill/` MUST be deleted from the filesystem
- AND user-created custom skills in `~/.agents/skills/` MUST be preserved

---

### Requirement: Fail-Closed Zero-Write User Config Parsing & Comment Preservation {#REQ-install-009}

When modifying existing target configuration files (`opencode.json`, `mcp-config.json`, `settings.json`, `hooks.json`), the installer MUST parse the configuration safely using character-level scanning. String values containing `//` or `/* ... */` MUST NOT be stripped or corrupted. Updating VS Code `settings.json` MUST convert scalar `chat.pluginLocations` into arrays without key duplication, create `settings.json` if the user settings directory exists, and return non-zero exit code if no valid VS Code installation directory is found.

#### Scenario: Scalar chat.pluginLocations converted to array
- GIVEN a `settings.json` containing `"chat.pluginLocations": "C:/other-plugin"`
- WHEN `npm run setup:vscode` runs
- THEN `chat.pluginLocations` MUST be replaced with an array containing both `"C:/other-plugin"` and the OSpec plugin path
- AND no duplicate `chat.pluginLocations` keys MUST be created

#### Scenario: No VS Code settings directory found fails with non-zero exit
- GIVEN neither VS Code nor VS Code Insiders configuration directories exist
- WHEN `npm run setup:vscode` runs
- THEN the installer MUST exit non-zero with an actionable error message
