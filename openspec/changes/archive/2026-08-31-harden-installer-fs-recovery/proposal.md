# Proposal: Harden Installer Filesystem Recovery

## Intent

Host processes (IDEs, background tasks) frequently hold file locks during installation, triggering transient OS errors (`EPERM`, `EACCES`, `EBUSY`) on config and hook files (e.g., `hooks.json`). Installers currently fail immediately or fail during rollback because `createRollbackJournal` and target-specific recovery use non-resilient direct writes. This change centralizes transient filesystem retry handling, guarantees resilient rollback across all targets, and standardizes actionable diagnostic reporting.

## Scope

### In Scope
- Centralized `withTransientFsRetries` policy in `scripts/configure/install-engine.js` with bounded attempts and injectable sleep.
- Resilient atomic filesystem mutations (`write`, `copy`, `remove`, `mkdir`) across all targets: Antigravity, Cursor, Copilot, OpenCode, Codex, VS Code, and repository targets.
- Resilient rollback in `createRollbackJournal` and Codex's `createFilesystemTransaction.rollback()`.
- Target identification preservation during stale file pruning (`pruneStaleFiles`).
- Actionable error diagnostics on exhaustion (operation, path, target, attempt count, corrective action).
- Deterministic unit and integration test matrix covering transient codes, exhaustion, and permanent errors.

### Out of Scope
- External CLI commands (e.g. Claude marketplace `spawnSync`) and non-idempotent operations.
- Full staging-and-swap of user home directories.
- Modifications to target-specific configuration schemas (e.g. Codex TOML or VS Code JSONC).

## Capabilities

> This section is the CONTRACT between proposal and specs phases.
> The sdd-spec agent reads this to know exactly which spec files to create or update.
> Research `openspec/specs/` before filling this in.

### New Capabilities
None

### Modified Capabilities
- `install`: Requirement on transient error resilience, rollback tolerance, and diagnostic reporting across all targets including Codex and pruning.

## Approach

Extract and standardize the retry mechanism into `scripts/configure/install-engine.js` as a shared resilient mutation primitive. Only minimal, idempotent filesystem operations are wrapped. Read-modify-write merges and content generation execute once prior to retry loops. Rollback paths consume the same retry contract. When retries are exhausted, errors retain original `code` and `cause` while attaching structured diagnostic metadata.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `scripts/configure/install-engine.js` | Modified | Core transient retry primitive, rollback journal resilience, diagnostic enrichment |
| `scripts/configure/cli.js` | Modified | Re-export/delegate to shared transient retry policy |
| `scripts/configure/install-antigravity.js` | Modified | Resilient hook writes and target context in prune calls |
| `scripts/configure/install-cursor.js` | Modified | Unified journal usage and target context in prune calls |
| `scripts/configure/install-codex.js` | Modified | Shared retry primitive in mutations and transaction `restorePath` |
| `scripts/configure/install-vscode.js` | Modified | Resilient commit of `settings.json` |
| `scripts/configure/install-target.js` | Modified | Resilient repo sync copy, remove, and rollback |
| `scripts/configure/install-*.test.js` | Modified | Deterministic tests for transient codes, backoff, and rollback |
| `openspec/specs/install/spec.md` | Modified | Spec delta for transient resilience, rollback, and diagnostics |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Retrying non-idempotent operations | Low | Apply retry only to atomic leaf fs operations; keep merges outside. |
| Masking permanent permission errors | Low | Fail-closed immediately on non-transient codes; cap retries and backoff. |
| Incomplete rollback leaves dirty state | Medium | Apply resilient retries to rollback steps; report unrestored paths on failure. |

## Rollback Plan

Revert the commit or branch. The changes are internal to install scripts under `scripts/configure/` with no schema or persistent signature breaks; reverting cleanly restores previous single-attempt filesystem operations.

## Dependencies

- None (Node.js built-in `fs` and CommonJS modules).

## Success Criteria

- [ ] All installer targets recover automatically from transient `EPERM`, `EACCES`, and `EBUSY` errors.
- [ ] Non-transient errors (e.g. `ENOENT`, malformed JSON) fail immediately without retries.
- [ ] Rollback succeeds under transient locks or lists specific unrestored paths upon exhaustion.
- [ ] Stale file pruning and mutations report the exact target name and actionable remedy.
- [ ] 100% pass across all unit and integration test suites (`npm test`).

> **Branch advisory:** Before `sdd-apply` begins, a feature branch SHOULD be created following the `<tipo>/<descripción>` convention defined in the `branch-pr` skill (e.g. `git checkout -b feat/my-change main`). This note is SHOULD, not MUST — omit it from `status: blocked` envelopes.
