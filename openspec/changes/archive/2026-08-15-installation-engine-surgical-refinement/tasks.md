# Tasks: Installation Engine Surgical Refinement

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: Low

## Tasks

### Phase 1: Core Engine & Codex Skills Ownership
- [x] 1.1 Implement character-level state-machine scanner in `safeParseJsonc` in `scripts/configure/install-engine.js` and add unit tests [REQ-install-009]
- [x] 1.2 Implement ownership manifest and stale file pruning for `~/.agents/skills` in `scripts/configure/install-codex.js` [REQ-install-008]
- [x] 1.3 Add Codex stale skill pruning test in `scripts/configure/install-codex.test.js` [REQ-install-008]

### Phase 2: VS Code Installer Refinements & Hooks Script
- [x] 2.1 Support converting scalar `chat.pluginLocations` in `updateSettingsJsoncPreservingComments` in `scripts/configure/install-vscode.js` [REQ-install-009]
- [x] 2.2 Create `settings.json` when settings directory exists and return non-zero exit code when no VS Code directories exist in `scripts/configure/install-vscode.js` [REQ-install-009]
- [x] 2.3 Update `build:hooks` script in `package.json` to fail with exit code 1 if compilation fails [REQ-install-015]

### Phase 3: Spec Alignment & Complete Integration Testing
- [x] 3.1 Align `openspec/specs/install/spec.md` with correct Copilot paths (`~/.copilot/`) and script names (`install:global:copilot`)
- [x] 3.2 Add Codex skills upgrade test and VS Code scalar conversion test in `tests/integration/installation-convergence.test.js`
- [x] 3.3 Run `node scripts/check.js` and verify 100% passing tests
