# Proposal: Unified Installation Engine & Target Convergence

## Intent

Resolve architectural fragmentation, security fail-open conditions, destructive configuration overwrites, missing MCP features, stale artifact accumulation, and target parity gaps across all distribution targets (`claude`, `vscode`, `github-copilot`, `opencode`, `codex`, `cursor`, `antigravity`). Replace bespoke, divergent installation scripts with a declarative, transactional installation engine backed by an ownership manifest and fail-closed safety contracts.

## Scope

### In Scope
- **Antigravity Compiler Target**: Promote Antigravity to a first-class compiler target profile (`scripts/lib/target-profiles/antigravity.js`), validator, runtime script closure, and retired `sync-antigravity.js`.
- **Cursor MCP & Hook Merging**: Translate canonical `.mcp.json` into Cursor configuration; preserve pre-existing user hooks non-destructively in `~/.cursor/hooks.json`.
- **OpenCode Fail-Closed Security & Binary Requirement**: Require binary presence with fail-closed enforcement, eliminate silent fail-open permissions in plugin.
- **Config Safety (Copilot & OpenCode)**: Ensure fail-closed zero-write behavior on invalid/unparseable user configuration files instead of destructive overwrites.
- **Ownership Manifest & Convergence**: Introduce `.ospec-workflow-install.json` across global target installers to track owned assets and prune stale files deterministically while preserving user assets.
- **Codex MCP Parity**: Single source of truth for MCP extracted from `.mcp.json` with full environment variable support; remove hardcoded duplicate tables.
- **Claude Setup CLI Code Checking**: Fail immediately on CLI errors during marketplace/plugin add or update.
- **VS Code Settings Hardening**: Safe non-destructive JSONC updates preserving comments, format, and explicit success reporting.
- **Fresh Clone Binary Provisioning**: Provide clean, automated binary resolution and build fallback for developers running setups on fresh checkouts.
- **Dead Code Cleanup & Spec Update**: Remove dead validator constants, vestigial layout keys, fix comment drift, and update `openspec/specs/install/spec.md`.

### Out of Scope
- Rewriting the core compiler pipeline (`source` -> `profile` -> `transform` -> `validator` -> `dist/`), which remains solid and unchanged.
- Adding unrelated new LLM integrations or third-party IDE targets beyond the supported 7.

## Capabilities

### New Capabilities
None

### Modified Capabilities
- `install`: Extend install domain to define the unified transactional installation engine, ownership manifest (`.ospec-workflow-install.json`), global target convergence, fail-closed config parsing, Antigravity compiler target, and Cursor/Codex MCP synchronization.

## Approach

1. Create `scripts/lib/target-profiles/antigravity.js` matching Antigravity IDE layout (`~/.gemini/config/`) with proper model mappings, rules, and runtime closures.
2. Build a shared installation engine module (`scripts/configure/install-engine.js`) providing:
   - Atomic rollback journals.
   - Ownership manifest tracking (`.ospec-workflow-install.json`) with stale file pruning.
   - Safe JSON/JSONC merge with zero-write fail-closed guarantees.
   - Non-destructive hook group merge.
3. Refactor `install-cursor.js`, `install-global-copilot.js`, `install-global-opencode.js`, `install-codex.js`, `install-vscode.js`, `install-claude.js`, and `setup:antigravity` to leverage the engine.
4. Refactor OpenCode plugin template to enforce fail-closed security.
5. Create comprehensive unit and integration tests verifying idempotency, convergence, stale file pruning, and non-destructive merges.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `scripts/lib/target-profiles/antigravity.js` | New | Profile definition for Antigravity target |
| `scripts/configure/cli.js` | Modified | Register antigravity in PROFILES, fix comment count |
| `scripts/configure/install-engine.js` | New | Shared transactional engine with ownership manifest & convergence |
| `scripts/configure/install-cursor.js` | Modified | Cursor MCP integration, non-destructive hooks merge |
| `scripts/configure/install-global-copilot.js` | Modified | Fail-closed config parsing, ownership tracking |
| `scripts/configure/install-global-opencode.js` | Modified | Fail-closed config parsing, ownership tracking |
| `scripts/configure/install-codex.js` | Modified | Eliminate hardcoded MCPs, forward `env` |
| `scripts/configure/install-claude.js` | Modified | Enforce CLI error checks |
| `scripts/configure/install-vscode.js` | Modified | Safe JSONC parsing and strict status |
| `scripts/configure/validate-codex.js` | Modified | Remove unused constants |
| `scripts/sync-antigravity.js` | Removed | Replaced by standard compiler + installer |
| `package.json` | Modified | Update scripts to use standard build/setup/reload commands |
| `openspec/specs/install/spec.md` | Modified | Document global targets, manifest, and engine contracts |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Pruning user-created files in target folders | Low | Ownership manifest only prunes paths explicitly recorded in previous install manifest |
| Broken user configs causing install aborts | Low | Fail-closed reports clear diagnostic error message so user can fix their malformed JSON |
| Target CLI absence | Low | Clear preflight checks and actionable guidance |

## Rollback Plan

Revert git commit; reinstall previous version using npm scripts or run previous commit's setup.

## Dependencies

- Node.js >= 22 (already required)

## Success Criteria

- [ ] All 7 targets (`claude`, `vscode`, `github-copilot`, `opencode`, `codex`, `cursor`, `antigravity`) build cleanly through `scripts/configure/cli.js`.
- [ ] Antigravity installs via standard pipeline with validator and proper runtime closure.
- [ ] Cursor installs MCP definitions and preserves foreign user hooks in `hooks.json`.
- [ ] OpenCode and Copilot fail-closed on corrupt user configs with zero writes.
- [ ] OpenCode plugin enforces fail-closed execution.
- [ ] Deleting/renaming an agent cleans up stale installed files upon re-running setup.
- [ ] `npm test` runs with 0 errors and 0 warnings.
