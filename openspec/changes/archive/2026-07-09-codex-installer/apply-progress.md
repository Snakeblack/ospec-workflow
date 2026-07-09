# Apply Progress — codex-installer

## Batch 2026-07-09 — Size exception accepted

- Delivery mode: `exception-ok` / `size:exception`
- Work units completed:
  1. Generator + validator contract for `.codex/config.toml`
  2. Codex installer core (marketplace wrapper, agent copy, config merge)
  3. Script wiring + docs + full regression pass

### Completed Tasks

- [x] 1.1 RED — `scripts/configure/cli.test.js` and `scripts/configure/real-repo.test.js` now failed until codex emitted `.codex/config.toml`.
- [x] 1.2 GREEN — Added source/fixture/golden `.codex/config.toml` files and codex-only source-root loading in `scripts/configure/cli.js`.
- [x] 1.3 REFACTOR — `scripts/configure/validate-codex.js` now requires the generated config source while keeping `.codex-plugin/plugin.json` agent-free.
- [x] 2.1 RED — Added `scripts/configure/install-codex.test.js` for args, fallback, copy, merge, dry-run, scripts, and docs coverage.
- [x] 2.2 GREEN — Implemented `scripts/configure/install-codex.js` with `parseArgs`, `findCodexBin`, `buildCodexMarketplace`, and `main()`.
- [x] 2.3 GREEN — Implemented scoped `.codex/agents/*.toml` copy for global and repo-local installs using `assertSafeDest()`.
- [x] 2.4 GREEN — Implemented managed config extraction + non-destructive merge for `skills.config` and `[agents]` only.
- [x] 2.5 REFACTOR — Reused the existing minimal `assertSafeDest()` helper from `install-target.js`; no extra shared-surface expansion was needed.
- [x] 3.1 RED — Added script-level assertions for `setup:codex`, `install:codex`, and manual fallback commands.
- [x] 3.2 GREEN — Added `build:codex`, `setup:codex`, and `install:codex` scripts to `package.json`.
- [x] 3.3 GREEN — Added `dist/codex-marketplace` wrapper generation and CLI/manual marketplace install flow.
- [x] 3.4 REFACTOR — Kept stdout/stderr/exit-code paths deterministic via installer tests and dry-run coverage.
- [x] 4.1 RED — Added README/docs assertions for Codex commands, separate agent copy, and config merge semantics.
- [x] 4.2 GREEN — Updated `README.md` and `docs/plugin-installation.md` with Codex install guidance.
- [x] 4.3 GREEN — Marketplace wrapper metadata is now emitted by `buildCodexMarketplace()` and documented as a supported Codex install path.
- [x] 5.1 REFACTOR — Ran `npm test` and fixed all Codex regressions/golden expectations.
- [x] 5.2 REFACTOR — Verified repo-local install manages only `.codex/agents/*.toml` plus `.codex/config.toml`, never `.codex-plugin/plugin.json`.

### TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR | Notes / Rationale |
|------|-----------|-------|------------|-----|-------|-------------|----------|-------------------|
| 1.1 | `scripts/configure/cli.test.js`, `scripts/configure/real-repo.test.js` | Integration | ✅ targeted baseline via `npm test -- --test ...` | ✅ Written | ✅ `node --test scripts/configure/cli.test.js scripts/configure/real-repo.test.js` | ✅ fixture + real-repo cases | ✅ validator follow-up | Emission proved in fixture and full-repo codex generation. |
| 1.2 | `scripts/configure/cli.test.js`, golden snapshot | Integration | N/A (new source files) | ✅ Written | ✅ `node --test scripts/configure/cli.test.js scripts/configure/real-repo.test.js` | ✅ emitted file + golden tree | ✅ codex-only source roots | Avoided leaking `.codex/config.toml` to non-codex targets. |
| 1.3 | `scripts/configure/validate-codex.test.js` | Unit | ✅ targeted baseline via `npm test -- --test ...` | ✅ Written | ✅ `node --test scripts/configure/validate-codex.test.js` | ✅ missing-file + malformed-config cases | ✅ helper extraction | Validator now enforces merge-source presence. |
| 2.1 | `scripts/configure/install-codex.test.js` | Unit/Integration | N/A (new file) | ✅ Written | ✅ `node --test scripts/configure/install-codex.test.js` | ✅ parse/copy/merge/fallback/dry-run/script/docs cases | ✅ helper split in installer | Installer API designed directly from failing tests. |
| 2.2 | `scripts/configure/install-codex.test.js` | Unit/Integration | N/A (new file) | ✅ Written | ✅ `node --test scripts/configure/install-codex.test.js` | ✅ global + repo entry flows | ✅ deterministic command wrapper | `main()` now builds `dist/codex` through `runConfigure()`. |
| 2.3 | `scripts/configure/install-codex.test.js` | Integration | N/A (new file) | ✅ Written | ✅ `node --test scripts/configure/install-codex.test.js` | ✅ global and repo destinations | ✅ isolated copy helper | Confirms only TOML agents move. |
| 2.4 | `scripts/configure/install-codex.test.js` | Unit | N/A (new file) | ✅ Written | ✅ `node --test scripts/configure/install-codex.test.js` | ✅ replace-existing + append-missing paths | ✅ text patch helpers | Preserves unrelated config text while updating managed keys. |
| 2.5 | `scripts/configure/install-codex.test.js`, `scripts/configure/install-target.test.js` | Integration | ✅ targeted baseline via `npm test -- --test ...` | ✅ Written | ✅ `npm test` | ✅ codex + existing install flows | ✅ no extra export surface | Existing `assertSafeDest()` reuse was sufficient. |
| 3.1 | `scripts/configure/install-codex.test.js` | Unit | N/A (same new file) | ✅ Written | ✅ `node --test scripts/configure/install-codex.test.js` | ✅ script entries + fallback messaging | ✅ aligned docs snippets | Script wiring is covered by direct package/doc assertions. |
| 3.2 | `scripts/configure/install-codex.test.js` | Unit | ✅ targeted baseline via new installer test file | ✅ Written | ✅ `node --test scripts/configure/install-codex.test.js` | ✅ build/setup/install variants | ➖ None needed | `package.json` contract is explicit and stable. |
| 3.3 | `scripts/configure/install-codex.test.js` | Integration | ✅ targeted baseline via new installer test file | ✅ Written | ✅ `node --test scripts/configure/install-codex.test.js` | ✅ wrapper creation + manual commands | ✅ shared marketplace constants | Marketplace wrapper sits at `dist/codex-marketplace/`. |
| 3.4 | `scripts/configure/install-codex.test.js` | Integration | ✅ targeted baseline via new installer test file | ✅ Written | ✅ `node --test scripts/configure/install-codex.test.js` | ✅ CLI present/absent + dry-run | ✅ deterministic output wording | Stable text now supports docs snippets. |
| 4.1 | `scripts/configure/install-codex.test.js` | Contract | ✅ targeted baseline via new installer test file | ✅ Written | ✅ `node --test scripts/configure/install-codex.test.js` | ✅ README + install guide | ➖ None needed | Assertion scope matches the user-facing contract. |
| 4.2 | `scripts/configure/install-codex.test.js` | Contract | ✅ targeted baseline via new installer test file | ✅ Written | ✅ `node --test scripts/configure/install-codex.test.js` | ✅ commands + managed-file semantics | ➖ None needed | Docs now describe global/local Codex paths. |
| 4.3 | `scripts/configure/install-codex.test.js` | Contract | ✅ targeted baseline via new installer test file | ✅ Written | ✅ `node --test scripts/configure/install-codex.test.js` | ✅ metadata path + plugin id | ➖ None needed | Wrapper metadata and docs align on `ospec-workflow@ospec-tools`. |
| 5.1 | `npm test` | Full regression | ✅ prior targeted suites green | ✅ Existing focused failures fixed first | ✅ `npm test` | ✅ focused suites + full harness build/validate | ✅ final cleanup | Full harness suite passed after Codex changes. |
| 5.2 | `scripts/configure/install-codex.test.js` | Integration | ✅ targeted baseline via new installer test file | ✅ Written | ✅ `node --test scripts/configure/install-codex.test.js` | ✅ repo-local negative assertion for plugin bundle | ➖ None needed | Explicit negative assertion protects the installer handoff contract. |

### Test Summary

- **Total tests written**: 17 new/extended assertions across `cli.test.js`, `real-repo.test.js`, `validate-codex.test.js`, and `install-codex.test.js`
- **Total tests passing**: `npm test` → pass
- **Layers used**: Unit (installer/config helpers), Integration (generator + installer flows), E2E (none)
- **Approval tests** (refactoring): None — no pure behavior-preserving refactor batch without spec change
- **Pure functions created**: 4 (`parseArgs`, `extractManagedCodexConfig`, `mergeManagedCodexConfig`, `findCodexBin`)

### Files Changed

| File | Action | What Was Done |
|------|--------|---------------|
| `.codex/config.toml` | Created | Added the reviewable Codex managed-config source. |
| `scripts/configure/cli.js` | Modified | Added codex-only extra source roots so `dist/codex/.codex/config.toml` is emitted. |
| `scripts/configure/validate-codex.js` | Modified | Enforced `.codex/config.toml` presence and managed-key validation. |
| `scripts/configure/install-codex.js` | Created | Implemented Codex install, marketplace wrapper, agent copy, and config merge. |
| `scripts/configure/install-codex.test.js` | Created | Added installer, scripts, and docs contract coverage. |
| `README.md`, `docs/plugin-installation.md` | Modified | Documented Codex build/setup/install flows and merge semantics. |
| `package.json` | Modified | Added Codex build/install scripts. |

### Deviations from Design

- None — implementation matches the approved design. The codex config source root was applied as a codex-only extension instead of a global root to avoid leaking `.codex/config.toml` into non-codex targets.

### Issues Found

- None.

### Remaining Tasks

- None — all planned tasks are implemented and locally verified.

### Workload / PR Boundary

- Mode: `size:exception`
- Current work unit: full change
- Boundary: generator/validator contract → installer core → scripts/docs/regression
- Estimated review budget impact: above the default 400-line budget; traceability is preserved in one merged apply batch because `exception-ok` was pre-approved.

### Status

17/17 tasks complete. Ready for `sdd-verify`.

## Batch 2026-07-09 — Verification remediation for REQ-install-001

- Delivery mode: `exception-ok` / `size:exception`
- Scope: Task `5.3` only — add runtime-proof for the CLI-available `setup:codex` branch.

### Completed Tasks

- [x] 5.3 RED/GREEN/REFACTOR — Extended `scripts/configure/install-codex.test.js` with a runtime `main([])` test that injects an available `codex` binary and asserts `codex plugin marketplace add <marketplaceDir>` then `codex plugin add ospec-workflow@ospec-tools` are attempted in order.

### TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR | Notes / Rationale |
|------|-----------|-------|------------|-----|-------|-------------|----------|-------------------|
| 5.3 | `scripts/configure/install-codex.test.js` | Integration | ✅ `node --test scripts/configure/install-codex.test.js` (12/12) | ✅ Written | ✅ `node --test scripts/configure/install-codex.test.js` (13/13) | ✅ CLI-available path complements the existing CLI-missing fallback path | ➖ None needed | The missing proof was runtime evidence only; production behavior already matched the design, so no production edit was required after the new assertion was added. |

### Test Summary

- **Total tests written**: 1 new runtime assertion block in `scripts/configure/install-codex.test.js`
- **Total tests passing**: `node --test scripts/configure/install-codex.test.js` → 13/13 pass; `npm test` → pass
- **Layers used**: Integration (1 remediation case)
- **Approval tests** (refactoring): None — no refactor-only batch
- **Pure functions created**: 0

### Files Changed

| File | Action | What Was Done |
|------|--------|---------------|
| `scripts/configure/install-codex.test.js` | Modified | Added runtime coverage for the CLI-available global setup branch and command ordering. |
| `openspec/changes/codex-installer/tasks.md` | Modified | Marked remediation task `5.3` complete. |

### Deviations from Design

- None — remediation adds the exact runtime proof requested by verification.

### Issues Found

- None.

### Remaining Tasks

- None — apply remediation complete; ready to rerun `sdd-verify`.

### Workload / PR Boundary

- Mode: `size:exception`
- Current work unit: verification remediation
- Boundary: add missing runtime proof for CLI-available registration only
- Estimated review budget impact: minimal follow-up confined to one existing test file plus OpenSpec status artifacts.

### Status

18/18 tasks complete. Ready for `sdd-verify`.

## Batch 2026-07-09 — 4R remediation for safe failure ordering

- Delivery mode: `exception-ok` / `size:exception`
- Scope: Phase 6 tasks `6.1`-`6.8` only — fail before managed writes, validate CLI error paths, and block redirected Codex destinations.

### Completed Tasks

- [x] 6.1 RED — Extended `scripts/configure/install-codex.test.js` with missing/invalid generated `.codex/config.toml` cases that must abort before any agent/config writes.
- [x] 6.2 RED — Added failing coverage for incomplete `--source`, invalid repo destinations before `runConfigure()`, and both non-zero Codex CLI command branches.
- [x] 6.3 RED — Added symlink/canonical redirection tests for global and repo-local `.codex` managed destinations.
- [x] 6.4 GREEN — `parseArgs()` now rejects incomplete `--source` usage, and repo-local destination checks happen before `runConfigure()`.
- [x] 6.5 GREEN — `main()` now preflights generated `.codex/config.toml` via `extractManagedCodexConfig()` before any managed writes.
- [x] 6.6 GREEN — Global CLI registration now runs before copying agents/config, and command failures return actionable manual recovery text without partial global state.
- [x] 6.7 GREEN — Added canonical/symlink managed-destination guards so redirected global or repo-local `.codex` roots fail safely.
- [x] 6.8 REFACTOR — Ran focused configure suites plus `npm test`, then marked the remediation batch complete.

### TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR | Notes / Rationale |
|------|-----------|-------|------------|-----|-------|-------------|----------|-------------------|
| 6.1 | `scripts/configure/install-codex.test.js` | Integration | ✅ `npm test -- --test scripts/configure/install-codex.test.js scripts/configure/install-target.test.js` | ✅ Written | ✅ `node --test scripts/configure/install-codex.test.js` | ✅ missing + malformed source-config cases | ✅ shared `main()` error handling | Proves missing/invalid generated config aborts before any managed writes. |
| 6.2 | `scripts/configure/install-codex.test.js` | Integration | ✅ same targeted baseline | ✅ Written | ✅ `node --test scripts/configure/install-codex.test.js` | ✅ usage, invalid-dest, marketplace-fail, plugin-fail branches | ✅ usage helper extraction | Locks deterministic error semantics for user input and CLI failures. |
| 6.3 | `scripts/configure/install-codex.test.js` | Integration | ✅ same targeted baseline | ✅ Written | ✅ `node --test scripts/configure/install-codex.test.js` | ✅ global + repo redirected-root paths | ✅ canonical-path helper extraction | Symlink/junction redirects now fail before writes escape the approved `.codex` roots. |
| 6.4 | `scripts/configure/install-codex.test.js` | Unit/Integration | ✅ same targeted baseline | ✅ Written | ✅ `node --test scripts/configure/install-codex.test.js` | ✅ incomplete flag + repo path ordering | ✅ centralized usage output | Parsing and repo validation now happen before build side effects. |
| 6.5 | `scripts/configure/install-codex.test.js` | Integration | ✅ same targeted baseline | ✅ Written | ✅ `node --test scripts/configure/install-codex.test.js` | ✅ missing-file + malformed-file preflight | ✅ source-config preflight reuse | Generated config is now validated before copy/merge begins. |
| 6.6 | `scripts/configure/install-codex.test.js` | Integration | ✅ same targeted baseline | ✅ Written | ✅ `node --test scripts/configure/install-codex.test.js` | ✅ marketplace-add + plugin-add failures | ✅ reordered global flow | Registration failures no longer leave partial global agent/config installs behind. |
| 6.7 | `scripts/configure/install-codex.test.js` | Integration | ✅ same targeted baseline | ✅ Written | ✅ `node --test scripts/configure/install-codex.test.js` | ✅ global and repo-local redirect guards | ✅ small path-safe helpers | Minimal hardening stayed local to Codex-managed destinations. |
| 6.8 | `scripts/configure/install-codex.test.js`, `scripts/configure/install-target.test.js`, `scripts/configure/cli.test.js`, `scripts/configure/real-repo.test.js` | Regression | ✅ focused suites green first | ✅ Existing focused failures fixed first | ✅ `node --test scripts/configure/install-codex.test.js scripts/configure/install-target.test.js scripts/configure/cli.test.js scripts/configure/real-repo.test.js` and `npm test` | ✅ focused suites + full harness regression | ✅ final cleanup only | Confirms the remediation batch preserved generator and installer behavior across the repo. |

### Test Summary

- **Total tests written**: 8 new runtime assertions in `scripts/configure/install-codex.test.js`
- **Total tests passing**: `node --test scripts/configure/install-codex.test.js` → 21/21 pass; focused configure suite → 79/79 pass; `npm test` → pass
- **Layers used**: Unit (1), Integration (7), E2E (0)
- **Approval tests** (refactoring): None — behavior changed under new remediation requirements
- **Pure functions created**: 4 (`usage`, `lstatIfExists`, `realpathIfExists`, `assertManagedPathSafe`)

### Files Changed

| File | Action | What Was Done |
|------|--------|---------------|
| `scripts/configure/install-codex.test.js` | Modified | Added RED coverage for missing/invalid source config, CLI failures, argument validation, pre-build repo checks, and redirected `.codex` destinations. |
| `scripts/configure/install-codex.js` | Modified | Reordered installer flow to validate args/destinations first, preflight managed config, register before global writes, and reject symlink/canonical redirects. |
| `openspec/changes/codex-installer/tasks.md` | Modified | Marked Phase 6 remediation tasks complete. |

### Deviations from Design

- None — remediation follows the existing design failure modes and only tightens the ordering/guard rails the design already allocated.

### Issues Found

- None.

### Remaining Tasks

- None — apply remediation complete; ready to rerun `sdd-verify`.

### Workload / PR Boundary

- Mode: `size:exception`
- Current work unit: Phase 6 safe-failure remediation
- Boundary: failing safety coverage → installer ordering/guard fixes → focused/full regression
- Estimated review budget impact: within the remediation forecast; limited to one installer module, one test file, and OpenSpec status artifacts.

### Status

26/26 tasks complete. Ready for `sdd-verify`.
