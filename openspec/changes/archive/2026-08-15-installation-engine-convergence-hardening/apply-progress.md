# Apply Progress: Installation Engine Convergence and Hardening

## Summary

All 8 tasks across 4 phases have been implemented and verified with TDD evidence.

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR | Notes / Rationale |
|---|---|---|---|---|---|---|---|---|
| 1.1 | `tests/integration/installation-convergence.test.js` | Integration | CI + check.js | PASS | PASS | PASS | PASS | `destRel` forwarded as `relPrefix` to `syncTargetTree` in OpenCode and Copilot |
| 1.2 | `scripts/configure/install-engine.test.js` | Unit | CI + check.js | PASS | PASS | PASS | PASS | `pruneStaleFiles` re-throws all non-ENOENT errors |
| 1.3 | `scripts/configure/install-vscode.test.js` | Unit | CI + check.js | PASS | PASS | PASS | PASS | Non-destructive JSONC comment-preserving update and non-zero exit on corrupt settings |
| 2.1 | `scripts/configure/install-target.js` | Unit | CI + check.js | PASS | PASS | PASS | PASS | `ensureRuntimeBinary` auto-builds Go binary if missing on fresh clone |
| 2.2 | `package.json` | Manifest | CI + check.js | PASS | PASS | PASS | PASS | Added `build:hooks` and `ensure:hooks` npm scripts |
| 2.3 | `scripts/configure/install-cursor.test.js` | Unit | CI + check.js | PASS | PASS | PASS | PASS | `sanitizeCursorMcpServers` resolves or strips `${input:...}` placeholders |
| 3.1 | `scripts/configure/install-codex.test.js` | Integration | CI + check.js | PASS | PASS | PASS | PASS | Codex persists `.ospec-workflow-install.json` and prunes stale agents/scripts |
| 4.1 | `tests/integration/installation-convergence.test.js` | Integration | CI + check.js | PASS | PASS | PASS | PASS | Multi-version upgrade tests for OpenCode, Copilot, VS Code, and Antigravity |
| 4.2 | `openspec/specs/install/spec.md` | Spec | CI + check.js | PASS | PASS | PASS | PASS | Fully updated baseline with all 7 targets and REQs 008-015 |
