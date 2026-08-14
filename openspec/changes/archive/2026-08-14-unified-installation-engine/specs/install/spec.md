# Delta for install

## ADDED Requirements

### Requirement: Unified Installation Ownership Manifest & Convergence {#REQ-install-008}

All global target installers (Cursor, Copilot, OpenCode, Codex, VS Code, Antigravity) MUST persist an installation manifest (`.ospec-workflow-install.json`) recording the installed version, target, timestamp, and array of all files/roots owned by OSpec Workflow. On subsequent executions, the installer MUST compute `stale = previous_owned - current_owned` and delete stale files while strictly preserving all user-created or third-party files.

#### Scenario: Stale agent or script removed after version upgrade
- GIVEN a previous installation recorded `agents/old-agent.md` in its ownership manifest
- WHEN the new version of OSpec Workflow no longer includes `old-agent.md` and `npm run setup:<target>` is executed
- THEN `agents/old-agent.md` MUST be deleted from the target destination
- AND all files belonging to the new version MUST be present and updated
- AND the ownership manifest MUST be updated with the current file list

#### Scenario: User-created custom files are preserved
- GIVEN the target home contains a user-created file `agents/my-custom-agent.md` not present in `.ospec-workflow-install.json`
- WHEN `npm run setup:<target>` runs
- THEN `agents/my-custom-agent.md` MUST NOT be deleted or overwritten

---

### Requirement: Fail-Closed Zero-Write User Config Parsing {#REQ-install-009}

When modifying existing target configuration files (`opencode.json`, `mcp-config.json`, `settings.json`, `hooks.json`), the installer MUST parse the configuration safely. If the existing file is unparseable or malformed, the installer MUST abort immediately with a diagnostic error and MUST NOT write to the file (zero-write fail-closed guarantee).

#### Scenario: Corrupted JSON configuration prevents destructive overwrite
- GIVEN a target user configuration file exists with invalid syntax (e.g. truncated JSON)
- WHEN `npm run setup:<target>` runs
- THEN the installer MUST fail with exit code non-zero
- AND the target configuration file MUST remain completely unmodified

#### Scenario: Valid existing configuration is merged non-destructively
- GIVEN a valid user configuration file with custom MCP servers or hooks
- WHEN `npm run setup:<target>` runs
- THEN OSpec keys MUST be added or updated under OSpec namespace/groups
- AND existing non-OSpec user keys MUST be preserved intact

---

### Requirement: Antigravity Target Profile & Standard Compiler Pipeline {#REQ-install-010}

Antigravity MUST be a first-class compiler target defined in `scripts/lib/target-profiles/antigravity.js` and registered in `PROFILES` (`scripts/configure/cli.js`). `npm run build:antigravity` and `npm run setup:antigravity` MUST build into `dist/antigravity` and install into `~/.gemini/config` using the standard transformation, model mapping, runtime script closure, validator, and transactional installer. The legacy script `scripts/sync-antigravity.js` MUST be removed.

#### Scenario: Antigravity builds and validates through standard CLI
- GIVEN the canonical repository source
- WHEN `npm run build:antigravity` is executed
- THEN `dist/antigravity` MUST contain transformed agents, skills, rules, hooks, and runtime scripts
- AND validation MUST pass with 0 errors

#### Scenario: Antigravity global installation is transactional
- GIVEN `npm run setup:antigravity` is executed
- THEN files are deployed into `~/.gemini/config`
- AND `~/.gemini/config/.ospec-workflow-install.json` is recorded
- AND pre-existing user hooks in `hooks.json` are preserved

---

### Requirement: Cursor MCP Synchronization & Non-Destructive Hook Merging {#REQ-install-011}

`scripts/configure/install-cursor.js` and the Cursor target transformer MUST translate canonical `.mcp.json` into Cursor's configuration format, and MUST merge OSpec hooks into `~/.cursor/hooks.json` while preserving all user-defined hook events and commands.

#### Scenario: Canonical MCP servers configured in Cursor
- GIVEN canonical `.mcp.json` contains `context7` and `markitdown`
- WHEN `npm run setup:cursor` runs
- THEN Cursor configuration MUST include equivalent MCP definitions

#### Scenario: Existing Cursor hooks preserved
- GIVEN `~/.cursor/hooks.json` contains pre-existing user hooks under `beforeShellExecution`
- WHEN `npm run setup:cursor` runs
- THEN OSpec hook commands MUST be present
- AND the user's pre-existing hook commands MUST remain in `~/.cursor/hooks.json`

---

### Requirement: OpenCode Fail-Closed Security Policy & Binary Requirement {#REQ-install-012}

The OpenCode target plugin (`.opencode/plugins/ospec.js`) and installer (`install-global-opencode.js`) MUST enforce fail-closed security. The installer MUST require the `ospec-hooks` binary. If the binary is missing or `tool.execute.before` hook execution fails, the tool call MUST be blocked (deny) rather than silently permitted.

#### Scenario: Missing binary fails installation
- GIVEN `release/dist/ospec-hooks` is absent
- WHEN `npm run setup:opencode` runs
- THEN the installer MUST fail with exit code non-zero unless binary resolution succeeds

#### Scenario: Plugin denies tool execution when hook process returns non-zero error
- GIVEN OpenCode plugin intercepts `tool.execute.before`
- WHEN `spawnSync` to `ospec-hooks pre-tool-use` encounters a policy deny or critical execution failure
- THEN the plugin MUST throw an Error blocking tool execution

---

### Requirement: Codex MCP Canonical Parity & Environment Variable Support {#REQ-install-013}

Codex MCP installation in `scripts/configure/install-codex.js` MUST derive server definitions dynamically from canonical `.mcp.json` without hardcoded static tables, and MUST forward declared `env` variables to `codex mcp add` / configuration.

#### Scenario: MCP server with environment variables registered in Codex
- GIVEN `.mcp.json` defines `context7` with `env: { CONTEXT7_API_KEY: ... }`
- WHEN `npm run setup:codex` runs
- THEN the registered Codex MCP definition MUST preserve the environment variable mapping

---

### Requirement: Claude Setup Strict CLI Exit Code Verification {#REQ-install-014}

`scripts/configure/install-claude.js` MUST check the exit code of every invocation of `claude plugin marketplace` and `claude plugin install/update`. If any CLI sub-command returns a non-zero exit code, the installer MUST abort immediately and exit with non-zero code.

#### Scenario: Claude CLI failure aborts installation
- GIVEN `claude plugin install` fails with exit code 1
- WHEN `npm run setup:claude` is executed
- THEN the script MUST abort immediately and exit with code 1 without printing a false success message
