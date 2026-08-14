# Apply Progress: Unified Installation Engine

## Work Breakdown Status

### Phase 1: Core Engine & Antigravity Target Profile
- [x] 1.1 Implement `scripts/configure/install-engine.js` with rollback journal, ownership manifest tracking (`.ospec-workflow-install.json`), stale file pruning (`pruneStaleFiles`), safe JSON & JSONC parsers, non-destructive config/hooks merging, and atomic tree sync [REQ-install-008, REQ-install-009]
- [x] 1.2 Create unit tests in `scripts/configure/install-engine.test.js` validating manifest operations, stale pruning, and rollback behavior
- [x] 1.3 Create declarative Antigravity target profile in `scripts/lib/target-profiles/antigravity.js` and register in `scripts/configure/cli.js` `PROFILES` [REQ-install-010]
- [x] 1.4 Implement Antigravity target validator in `scripts/configure/validate-antigravity.js` and unit tests in `validate-antigravity.test.js`
- [x] 1.5 Create `scripts/configure/install-antigravity.js`, delete legacy `scripts/sync-antigravity.js`, update `package.json` with `build:antigravity`, `setup:antigravity`, `reload:antigravity`, and verify with `install-antigravity.test.js`

### Phase 2: Target Hardening & Security Remediation
- [x] 2.1 Refactor `scripts/configure/install-cursor.js` to translate canonical `.mcp.json` into Cursor MCP format, non-destructively merge hooks into `~/.cursor/hooks.json`, integrate with `install-engine.js`, and verify with `install-cursor.test.js` [REQ-install-011]
- [x] 2.2 Refactor `scripts/lib/target-profiles/opencode-plugin.js` to fail-closed on verification errors; update `scripts/configure/install-global-opencode.js` to require binary (`required: true`) and use `install-engine.js` fail-closed config parsing; verify with `install-global-opencode.test.js` [REQ-install-012]
- [x] 2.3 Refactor `scripts/configure/install-global-copilot.js` to use `install-engine.js` fail-closed config parsing and ownership manifest; verify with `install-global-copilot.test.js` [REQ-install-008, REQ-install-009]
- [x] 2.4 Refactor `scripts/configure/install-codex.js` to dynamically extract MCP definitions from canonical `.mcp.json` with `env` support and remove duplicate static table; verify with `install-codex.test.js` [REQ-install-013]
- [x] 2.5 Refactor `scripts/configure/install-claude.js` to strictly verify CLI command return codes and fail-fast; verify with `claude-marketplace.test.js` [REQ-install-014]
- [x] 2.6 Refactor `scripts/configure/install-vscode.js` with safe JSONC parsing and strict status reporting; create `validate-vscode.js` and `install-vscode.test.js`

### Phase 3: Cleanup & Spec / Docs Alignment
- [x] 3.1 Remove vestigial constants (`ALLOWED_BUNDLE_KEYS`, `RELATIVE_PATH_KEYS`) in `scripts/configure/validate-codex.js`
- [x] 3.2 Update `openspec/specs/install/spec.md` with requirements `REQ-install-008` through `REQ-install-014`
- [x] 3.3 Execute full regression suite (`node scripts/check.js`) across all targets and verify zero errors

---

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR | Notes / Rationale |
|---|---|---|---|---|---|---|---|---|
| 1.1 / 1.2 | `scripts/configure/install-engine.test.js` | Integration / Unit | Yes | N/A (new module) | Pass | Pass | Pass | Covered manifest read/write, stale pruning, rollback journal, fail-closed JSONC parsing, and hook document merging. |
| 1.3 / 1.4 | `scripts/configure/validate-antigravity.test.js` | Validator / Unit | Yes | Pass | Pass | Pass | Pass | Verified build output conformance, prompt boundary validation, frontmatter stripping, and hooks layout. |
| 1.5 | `scripts/configure/install-antigravity.test.js` | Target Installer / Unit | Yes | Pass | Pass | Pass | Pass | Tested argument parsing, hook variable expansion, and verified standard target compiler integration. |
| 2.1 | `scripts/configure/install-cursor.test.js` | Target Installer / Integration | Yes | Pass | Pass | Pass | Pass | Tested 24/24 cases: MCP syncing, hook preservation, path safety, rollback, and idempotent re-runs. |
| 2.2 | `scripts/configure/install-global-opencode.test.js` | Target Installer / Unit | Yes | Pass | Pass | Pass | Pass | Tested argument parsing, fail-closed pre-tool-use policy in opencode plugin, and required binary enforcement. |
| 2.3 | `scripts/configure/install-global-copilot.test.js` | Target Installer / Unit | Yes | Pass | Pass | Pass | Pass | Tested argument parsing, fail-closed MCP config merging, and manifest persistence. |
| 2.4 | `scripts/configure/install-codex.test.js` | Target Installer / Integration | Yes | Pass | Pass | Pass | Pass | Tested 42/42 cases: dynamic MCP extraction with `env`, duplicate prevention, and journal rollback. |
| 2.5 | `scripts/configure/claude-marketplace.test.js` | Target Installer / Unit | Yes | Pass | Pass | Pass | Pass | Verified CLI exit code checks, marketplace registration, and fail-fast behavior. |
| 2.6 | `scripts/configure/install-vscode.test.js` | Target Installer / Unit | Yes | Pass | Pass | Pass | Pass | Tested platform-specific settings discovery, safe JSONC merging, and created `validate-vscode.js`. |
| 3.1 - 3.3 | `scripts/check.test.js` & `scripts/check.js` | Harness Full Suite | Yes | Pass | Pass | Pass | Pass | Full regression suite with 2,146 unit tests and 7 generated targets (Claude, VS Code, Copilot, OpenCode, Codex, Cursor, Antigravity) passed 100%. |

---

## Changed Files Summary

| File | Status | Description |
|---|---|---|
| `scripts/configure/install-engine.js` | Created | Unified installation engine with rollback journal, manifest tracking, stale pruning, and fail-closed JSON/JSONC mergers. |
| `scripts/configure/install-engine.test.js` | Created | Unit test suite for install-engine.js. |
| `scripts/lib/target-profiles/antigravity.js` | Created | Declarative compiler target profile for Antigravity IDE. |
| `scripts/configure/validate-antigravity.js` | Created | Validator for Antigravity build artifacts and installed tree. |
| `scripts/configure/validate-antigravity.test.js` | Created | Test suite for Antigravity validator. |
| `scripts/configure/install-antigravity.js` | Created | Transactional installer for Antigravity target (`~/.gemini/config`). |
| `scripts/configure/install-antigravity.test.js` | Created | Test suite for Antigravity installer. |
| `scripts/configure/validate-vscode.js` | Created | Validator for VS Code target output. |
| `scripts/configure/install-vscode.test.js` | Created | Test suite for VS Code installer. |
| `scripts/configure/install-global-copilot.test.js` | Created | Test suite for Copilot global installer. |
| `scripts/configure/install-global-opencode.test.js` | Created | Test suite for OpenCode global installer. |
| `scripts/sync-antigravity.js` | Deleted | Retired ad-hoc copy script in favor of unified compiler target. |
| `scripts/configure/cli.js` | Modified | Registered `antigravity` profile in `PROFILES`. |
| `scripts/lib/target-transform.js` | Modified | Added Antigravity hooks transformer dispatch. |
| `scripts/lib/target-profiles/opencode-plugin.js` | Modified | Made `tool.execute.before` fail-closed on security errors. |
| `scripts/lib/target-profiles/vscode.js` | Modified | Registered `validate-vscode.js` validator. |
| `scripts/configure/install-cursor.js` | Modified | Added MCP syncing, non-destructive hooks merge, and ownership manifest. |
| `scripts/configure/install-cursor.test.js` | Modified | Updated test fixtures for non-destructive JSON hooks. |
| `scripts/configure/install-global-opencode.js` | Modified | Rewritten with install-engine, fail-closed config parsing, and required binary. |
| `scripts/configure/install-global-copilot.js` | Modified | Rewritten with install-engine, fail-closed config parsing, and manifest tracking. |
| `scripts/configure/install-codex.js` | Modified | Dynamic MCP server extraction from `.mcp.json` with `env` support; removed static duplicate table. |
| `scripts/configure/install-codex.test.js` | Modified | Updated MCP definition tests for dynamic structure and env support. |
| `scripts/configure/install-claude.js` | Modified | Added strict CLI exit code verification and fail-fast handling. |
| `scripts/configure/install-vscode.js` | Modified | Rewritten with safe JSONC parsing from install-engine. |
| `scripts/configure/validate-codex.js` | Modified | Removed dead constants `ALLOWED_BUNDLE_KEYS` and `RELATIVE_PATH_KEYS`. |
| `scripts/configure/__fixtures__/golden/opencode/.opencode/plugins/ospec.js` | Modified | Updated golden snapshot for fail-closed plugin. |
| `scripts/lib/k1-scope-guard.test.js` | Modified | Added `scripts/lib/target-profiles/` to successor prefixes. |
| `scripts/check.js` | Modified | Added `antigravity` and enabled `vscode` in targets validation matrix. |
| `scripts/check.test.js` | Modified | Updated expected targets array in check suite test. |
| `package.json` | Modified | Added `build:antigravity`, updated `setup:antigravity` and `reload:antigravity`. |
| `openspec/specs/install/spec.md` | Modified | Appended `REQ-install-008` through `REQ-install-014`. |
