# Design: Unified Installation Engine & Target Convergence

## Technical Approach

Introduce a unified, declarative installation engine in `scripts/configure/install-engine.js` that abstracts path safety, transactional rollback, ownership tracking (`.ospec-workflow-install.json`), stale file pruning, fail-closed JSON/JSONC parsing, and hook merging. Refactor all 7 targets (`claude`, `vscode`, `github-copilot`, `opencode`, `codex`, `cursor`, `antigravity`) to use consistent lifecycle semantics.

## Architecture Decisions

### Decision: Dedicated Ownership Manifest for State Convergence
**Choice**: Store an `.ospec-workflow-install.json` in each target root recording `{ version, target, timestamp, files: [...] }`.
**Alternatives considered**:
1. Scan and delete everything in managed directories (e.g. `rm -rf ~/.copilot/agents`): Rejected because it destroys user-created custom agents and scripts.
2. In-memory diff only: Rejected because without a persistent manifest, the installer cannot know which files on disk were created by a previous OSpec version versus by the user.
**Rationale**: Explicit ownership manifests allow exact computation of `stale = previous - desired`, achieving true convergence without risking user data.

### Decision: Fail-Closed Configuration Merging
**Choice**: Strictly abort setup without modifying files if existing user configs (`opencode.json`, `mcp-config.json`, `settings.json`, `hooks.json`) cannot be parsed cleanly.
**Alternatives considered**:
1. Fallback to empty object `{}` on parse error: Rejected because it overwrites and destroys the user's pre-existing configuration.
2. Best-effort skip: Rejected because leaving a broken configuration in place can lead to subtle runtime failures.
**Rationale**: Fail-closed ensures zero data loss and alerts the developer immediately to syntax errors in their environment.

### Decision: First-Class Antigravity Compiler Profile
**Choice**: Create `scripts/lib/target-profiles/antigravity.js` and `scripts/configure/validate-antigravity.js`, register in `cli.js` `PROFILES`, and wire `npm run build:antigravity` and `npm run setup:antigravity`.
**Alternatives considered**:
1. Keep `scripts/sync-antigravity.js` as an out-of-band script: Rejected because it duplicates logic, bypasses transformations, drops validation, and accumulates stale files.
**Rationale**: Brings Antigravity to full architectural parity with the other 6 targets.

## Data Flow

```
Canonical Source (.mcp.json, agents/, skills/, hooks/, rules/)
       │
       ▼
Target Profile (scripts/lib/target-profiles/{target}.js)
       │
       ▼
Compiler CLI (scripts/configure/cli.js) ──► dist/{target}/
       │
       ▼
Target Validator (scripts/configure/validate-{target}.js)
       │
       ▼
Unified Install Engine (scripts/configure/install-engine.js)
 ├── Read previous manifest (~/.{target}/.ospec-workflow-install.json)
 ├── Safe Parse & Merge target configs (Fail-closed)
 ├── Reconcile & Prune stale files (previous - current)
 ├── Sync current files & Deploy hooks / MCP
 └── Write updated manifest & Validate installed state
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `scripts/configure/install-engine.js` | Create | Core engine: path safety, manifest tracking, transactional rollback, stale pruning, safe JSON/JSONC merge |
| `scripts/configure/install-engine.test.js` | Create | Unit tests for install engine (pruning, fail-closed, merging, rollback) |
| `scripts/lib/target-profiles/antigravity.js` | Create | Antigravity target profile |
| `scripts/configure/validate-antigravity.js` | Create | Generated and installed validator for Antigravity target |
| `scripts/configure/validate-antigravity.test.js` | Create | Tests for Antigravity validator |
| `scripts/configure/install-antigravity.js` | Create | Idempotent transactional installer for Antigravity |
| `scripts/configure/install-antigravity.test.js` | Create | Tests for Antigravity installer |
| `scripts/lib/target-profiles/cursor.js` | Modify | Update profile for MCP and hook compatibility |
| `scripts/configure/install-cursor.js` | Modify | Use install engine, non-destructive hooks merge, MCP configuration |
| `scripts/configure/install-cursor.test.js` | Modify | Update tests with hook merging and manifest expectations |
| `scripts/configure/install-global-copilot.js` | Modify | Use install engine, fail-closed config parsing, manifest tracking |
| `scripts/configure/install-global-opencode.js` | Modify | Use install engine, fail-closed config parsing, manifest tracking |
| `scripts/lib/target-profiles/opencode-plugin.js` | Modify | Make `tool.execute.before` fail-closed when hooks binary fails |
| `scripts/configure/install-codex.js` | Modify | Dynamic MCP extraction from `.mcp.json` with env support |
| `scripts/configure/install-claude.js` | Modify | Strict error checking on CLI executions |
| `scripts/configure/install-vscode.js` | Modify | Safe JSONC parsing and strict status |
| `scripts/configure/validate-codex.js` | Modify | Clean up unused constants |
| `scripts/configure/cli.js` | Modify | Register `antigravity` profile, fix comment count |
| `scripts/sync-antigravity.js` | Delete | Retired in favor of `install-antigravity.js` |
| `package.json` | Modify | Update build/setup scripts for antigravity |
| `openspec/specs/install/spec.md` | Modify | Document unified install engine and global target contracts |

## Interfaces / Contracts

```javascript
// Ownership Manifest Schema (.ospec-workflow-install.json)
{
  "version": "2.43.5",
  "target": "cursor", // "antigravity" | "opencode" | "github-copilot" | "codex" | "vscode"
  "installedAt": "2026-08-14T23:18:00.000Z",
  "files": [
    "agents/sdd-apply.md",
    "agents/sdd-verify.md",
    "skills/accessibility/SKILL.md",
    "scripts/hooks/ospec-hooks-launch.js"
  ],
  "hookIds": ["ospec-pre-tool-use", "ospec-session-start"],
  "mcpIds": ["context7", "markitdown"]
}

// install-engine API
module.exports = {
  assertPathSafe(root, destination, fsImpl),
  createRollbackJournal(targetRoot, fsImpl),
  readOwnershipManifest(targetRoot, fsImpl),
  writeOwnershipManifest(targetRoot, manifest, fsImpl),
  pruneStaleFiles(targetRoot, previousManifest, currentFiles, fsImpl, journal),
  safeParseJson(content, filename),
  safeParseJsonc(content, filename),
  mergeJsonFile(filePath, updateFn, fsImpl, journal),
  mergeHooksDoc(existingDoc, generatedDoc, target),
  syncTargetTree(sourceDir, targetDir, options)
};
```

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | `install-engine.js` (manifest, pruning, fail-closed, rollback) | Node native test runner with in-memory / fixture fs |
| Unit | `validate-antigravity.js` & target generation | Build output verification with fixture sources |
| Integration | Target setup scripts (`install-cursor`, `install-antigravity`, `install-global-*`) | Simulated home directories checking convergence, non-destructive merge, and stale deletion |
| Regression | `node scripts/check.js` | Full test suite execution across all 20+ test files |

## Migration / Rollout

No migration required. Running `npm run setup:<target>` will establish the first manifest and seamlessly manage subsequent updates.
