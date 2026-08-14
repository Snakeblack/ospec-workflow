# Tasks: Installation Engine Convergence and Hardening

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: Low

## Tasks

### Phase 1: Engine Hardening & Subfolder Remappings
- [x] 1.1 Fix `destRel` forwarding in `scripts/configure/install-global-opencode.js` and `scripts/configure/install-global-copilot.js` [REQ-install-008]
- [x] 1.2 Make `pruneStaleFiles()` in `scripts/configure/install-engine.js` fail-closed on non-ENOENT errors and update unit tests [REQ-install-008]
- [x] 1.3 Implement comment-preserving VS Code settings updater in `scripts/configure/install-vscode.js` and enforce fail-closed exit code [REQ-install-009]

### Phase 2: Binary Provisioning & Cursor MCP Sanitization
- [x] 2.1 Implement `ensureRuntimeBinary()` in `scripts/configure/install-target.js` to compile Go binary when absent and Go is installed [REQ-install-015]
- [x] 2.2 Add `build:hooks` and `ensure:hooks` scripts in `package.json` [REQ-install-015]
- [x] 2.3 Sanitize `${input:...}` placeholders in `scripts/configure/install-cursor.js` [REQ-install-011]

### Phase 3: Codex Ownership Manifest Integration
- [x] 3.1 Integrate `.ospec-workflow-install.json` and stale pruning into `scripts/configure/install-codex.js` [REQ-install-008]
- [x] 3.2 Update `scripts/configure/install-codex.test.js` to assert ownership manifest persistence and stale pruning [REQ-install-008]

### Phase 4: Verification, Full Baseline Alignment & Integration Tests
- [x] 4.1 Create `tests/integration/installation-convergence.test.js` verifying two-version upgrade cycles and user file preservation across targets
- [x] 4.2 Update `openspec/specs/install/spec.md` domain baseline with all 7 targets, setup scripts, and convergence guarantees
- [x] 4.3 Run `node scripts/check.js` and ensure 100% passing tests
