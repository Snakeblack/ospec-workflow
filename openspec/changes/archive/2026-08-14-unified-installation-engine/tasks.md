# Tasks: Unified Installation Engine & Target Convergence

## Spec/Design Reconciliation

| Requirement / Scenario | Priority | Design Allocation | Status | Notes |
|------------------------|----------|-------------------|--------|-------|
| REQ-install-008 (Ownership Manifest & Convergence) | MUST | `scripts/configure/install-engine.js` (`readOwnershipManifest`, `pruneStaleFiles`) | covered-by-design | Full lifecycle manifest management |
| REQ-install-009 (Fail-Closed Zero-Write Config) | MUST | `scripts/configure/install-engine.js` (`safeParseJson`, `mergeJsonFile`) | covered-by-design | Aborts without writes on parse errors |
| REQ-install-010 (Antigravity Target Profile) | MUST | `scripts/lib/target-profiles/antigravity.js`, `scripts/configure/validate-antigravity.js`, `scripts/configure/install-antigravity.js` | covered-by-design | First-class target in PROFILES and CLI |
| REQ-install-011 (Cursor MCP & Hook Merging) | MUST | `scripts/configure/install-cursor.js`, `scripts/configure/install-engine.js` | covered-by-design | MCP configuration and non-destructive hook merge |
| REQ-install-012 (OpenCode Fail-Closed & Binary) | MUST | `scripts/lib/target-profiles/opencode-plugin.js`, `scripts/configure/install-global-opencode.js` | covered-by-design | Fail-closed tool interceptor and required binary |
| REQ-install-013 (Codex MCP Parity & Env) | MUST | `scripts/configure/install-codex.js` | covered-by-design | Dynamic MCP extraction from `.mcp.json` with env vars |
| REQ-install-014 (Claude Strict Exit Codes) | MUST | `scripts/configure/install-claude.js` | covered-by-design | Aborts if any CLI invocation returns non-zero |

### Reconciliation Verdict
- MUST coverage: complete
- SHOULD/MAY gaps: none
- Ambiguities to track: none

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 600 - 800 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | Single PR via accepted size-exception |
| Delivery strategy | exception-ok |
| Chain strategy | size-exception |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: size-exception
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Core Install Engine & Antigravity Profile | Single PR | Foundation for all targets |
| 2 | Target Refactors (Cursor, OpenCode, Copilot, Codex, Claude, VS Code) | Single PR | Uses install engine with tests |

### Checklist Status Legend

- `[ ]` Not implemented yet
- `[~]` Implemented but not yet verified locally
- `[x]` Implemented and verified locally

## Phase 1: Core Install Engine & Antigravity Profile Foundation

- [ ] 1.1 Create `scripts/configure/install-engine.js` with path safety, manifest read/write, stale file pruning, safe JSON/JSONC parsing, and rollback journal [REQ-install-008, REQ-install-009]
- [ ] 1.2 Create `scripts/configure/install-engine.test.js` verifying ownership tracking, stale file pruning, fail-closed JSON parsing, and hook merging [REQ-install-008, REQ-install-009]
- [ ] 1.3 Create `scripts/lib/target-profiles/antigravity.js` and register `antigravity` in `scripts/configure/cli.js` `PROFILES` [REQ-install-010]
- [ ] 1.4 Create `scripts/configure/validate-antigravity.js` and `scripts/configure/validate-antigravity.test.js` [REQ-install-010]
- [ ] 1.5 Create `scripts/configure/install-antigravity.js` and `scripts/configure/install-antigravity.test.js`, retire `scripts/sync-antigravity.js`, update `package.json` [REQ-install-010]

## Phase 2: Target Hardening & Security Remediation

- [ ] 2.1 Refactor `scripts/configure/install-cursor.js` to preserve foreign hooks and configure MCP from canonical `.mcp.json` [REQ-install-011]
- [ ] 2.2 Update `scripts/lib/target-profiles/opencode-plugin.js` to fail-closed on hook error; update `scripts/configure/install-global-opencode.js` to require binary and use install engine [REQ-install-012, REQ-install-008, REQ-install-009]
- [ ] 2.3 Refactor `scripts/configure/install-global-copilot.js` to use install engine with fail-closed config parsing and ownership tracking [REQ-install-008, REQ-install-009]
- [ ] 2.4 Refactor `scripts/configure/install-codex.js` to extract MCP dynamically from `.mcp.json` with env support and remove static duplicates [REQ-install-013]
- [ ] 2.5 Refactor `scripts/configure/install-claude.js` to strictly check CLI return codes and fail-fast [REQ-install-014]
- [ ] 2.6 Refactor `scripts/configure/install-vscode.js` with safe JSONC parsing and clean status reporting [REQ-install-009]

## Phase 3: Cleanup & Spec Update

- [ ] 3.1 Clean up dead constants in `scripts/configure/validate-codex.js` and fix comment count in `scripts/configure/cli.js`
- [ ] 3.2 Update `openspec/specs/install/spec.md` with requirements REQ-install-008 through REQ-install-014
- [ ] 3.3 Run `node scripts/check.js` and verify 100% test passing across the repository
