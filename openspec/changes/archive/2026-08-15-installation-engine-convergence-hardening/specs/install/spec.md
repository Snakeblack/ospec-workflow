# Delta for install

## MODIFIED Requirements

### Requirement: Unified Installation Ownership Manifest & Convergence {#REQ-install-008}

All global target installers (Cursor, Copilot, OpenCode, Codex, VS Code, Antigravity) MUST persist an installation manifest (`.ospec-workflow-install.json`) recording the installed version, target, timestamp, and array of all relative files/roots owned by OSpec Workflow. When syncing mapped subfolders (`agents/`, `commands/`, `skills/`), the relative path prefix MUST be preserved in the manifest. On subsequent executions, the installer MUST compute `stale = previous_owned - current_owned` and delete stale files while strictly preserving all user-created or third-party files. Pruning MUST be fail-closed for any deletion or path error other than `ENOENT`.

#### Scenario: Stale agent or script removed after version upgrade
- GIVEN a previous installation recorded `agents/old-agent.md` in its ownership manifest
- WHEN the new version of OSpec Workflow no longer includes `old-agent.md` and `npm run setup:<target>` is executed
- THEN `agents/old-agent.md` MUST be deleted from the target destination
- AND all files belonging to the new version MUST be present and updated
- AND the ownership manifest MUST be updated with the current file list

#### Scenario: Pruning fails closed on permissions or safety violations
- GIVEN a stale owned file cannot be deleted due to permissions or path safety failure
- WHEN `pruneStaleFiles` runs
- THEN it MUST throw and abort the installation without writing an updated manifest

---

### Requirement: Fail-Closed Zero-Write User Config Parsing & Comment Preservation {#REQ-install-009}

When modifying existing target configuration files (`opencode.json`, `mcp-config.json`, `settings.json`, `hooks.json`), the installer MUST parse the configuration safely. If the existing file is unparseable or malformed, the installer MUST abort immediately with a diagnostic error and MUST NOT write to the file (zero-write fail-closed guarantee), exiting with non-zero status. Updating VS Code `settings.json` MUST preserve existing comments and structure.

#### Scenario: Corrupted JSON/JSONC configuration aborts setup
- GIVEN a target user configuration file exists with invalid syntax
- WHEN `npm run setup:<target>` runs
- THEN the installer MUST exit non-zero without modifying the configuration file

#### Scenario: VS Code settings comments preserved
- GIVEN a `settings.json` containing user comments
- WHEN `npm run setup:vscode` runs
- THEN `chat.pluginLocations` MUST be updated without removing existing comments

---

### Requirement: Fresh-Clone Automated Binary Provisioning {#REQ-install-015}

`npm run setup:*` and `copyBinaryToTree` MUST ensure the required `ospec-hooks` executable is provisioned. If the target platform binary is absent under `release/dist/`, the provisioning logic MUST attempt to build it using the host's `go` compiler (`go build -o release/dist/ospec-hooks-... ./cmd/ospec-hooks`). If `go` is unavailable and the pre-built binary is absent, it MUST fail-closed when `required: true`.

#### Scenario: Fresh clone builds binary when Go is installed
- GIVEN a fresh repository clone where `release/dist/` has no pre-compiled binaries
- AND `go` is available on PATH
- WHEN `npm run setup:opencode` (or any setup requiring binary) is executed
- THEN `ospec-hooks` binary MUST be automatically compiled to `release/dist/` and copied to the target tree
