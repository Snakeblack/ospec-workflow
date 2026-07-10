# Apply Progress: fix-codex-config-toml

## Batch 1 — 2026-07-09

Completed all planned tasks. The Codex generator and installer now manage the plugin bundle and agent TOML files only; user-owned `config.toml` files are never created or changed.

### Completed Tasks

- [x] 1.1–1.3 Regression contracts for omitted generated config, validator rejection, and agent-only installs.
- [x] 2.1–2.4 Removed the managed config payload and merge pipeline; added the validator guard.
- [x] 3.1–3.2 Aligned public documentation and the install baseline with manual stale-config cleanup.
- [x] 4.1–4.3 Ran focused and full verification, then checked for stale claims outside archived records.

### TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR | Notes / Rationale |
|------|-----------|-------|------------|-----|-------|-------------|----------|-------------------|
| 1.1 | `scripts/configure/cli.test.js` | Unit | ✅ 23/23 | ✅ Omitted-config assertion failed | ✅ 23/23 | ✅ Fixture + golden output | ➖ None needed | Removed the Codex-only source root and fixture payload. |
| 1.2 | `scripts/configure/real-repo.test.js`, `scripts/configure/validate-codex.test.js` | Integration | ✅ real-repo 27/27; validator 16/16 | ✅ Output and forbidden-path assertions failed | ✅ Focused suite passed | ✅ Valid output + forbidden artifact | ➖ None needed | Validator now rejects `.codex/config.toml`. |
| 1.3 | `scripts/configure/install-codex.test.js` | Integration | ✅ 27/27 | ✅ Agent-only installation scenarios failed | ✅ Focused suite passed | ✅ Global creation absence + repo preservation | ✅ Removed obsolete merge helpers | Marketplace registration, dry-run behavior, and agent safety checks remain covered. |
| 2.1–2.4 | `scripts/configure/{cli,validate-codex,real-repo,install-codex}.test.js` | Integration | Covered above | ✅ Existing RED contracts | ✅ 91/91 focused | ✅ Generator, validator, and installer paths | ✅ Removed dead config code | No replacement agent concurrency policy was introduced. |
| 3.1–3.2 | `scripts/configure/install-codex.test.js` | Unit | Covered above | ✅ Documentation/baseline assertions failed | ✅ 39/39 focused subset | ✅ README, guide, and baseline contract | ➖ None needed | Documents manual cleanup without touching user configuration. |
| 4.1–4.3 | `scripts/configure/{cli,validate-codex,real-repo,install-codex}.test.js` | Integration | Covered above | N/A — verification task | ✅ 91/91 focused; `npm test` passed | ✅ Focused suite + complete suite | ✅ Final stale-claim search | Archived historical records intentionally retained. |

### Verification Evidence

- `node --test scripts/configure/cli.test.js scripts/configure/validate-codex.test.js scripts/configure/real-repo.test.js scripts/configure/install-codex.test.js` — 91 passed, 0 failed.
- `npm test` — passed; all checks passed, including all target generation and Codex validation.
- Final stale-claim search found no active source, test, baseline, or documentation references to `skills.config`, `max_output_tokens`, `max_tool_calls`, or config merging. Matching archived artifacts were preserved unchanged.

### Deviations and Issues

- None — implementation follows the approved retirement approach from `exploration.md`.
- Pre-existing unrelated modification `models.yaml` was not changed by this apply batch.

## Batch 2 — 2026-07-09

Completed the approved `size:exception` release-marketplace scope. The release tree now retains Claude's marketplace while adding an independent root Codex marketplace and plugin payload; the workflow smoke-tests the remote `#release` URL after it pushes that tree.

### Completed Tasks

- [x] 5.1–5.2 Added release-artifact and workflow static contracts.
- [x] 6.1–6.4 Added the safe Codex release assembler, atomic workflow publication, real CLI smoke step, and remote-install documentation.
- [x] 7.1–7.3 Ran focused/full verification, inspected the staged layout, and preserved local installer semantics and `models.yaml`.

### TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR | Notes / Rationale |
|------|-----------|-------|------------|-----|-------|-------------|----------|-------------------|
| 5.1 | `scripts/configure/codex-marketplace.test.js` | Integration | N/A (new contract) | ✅ Module-missing failure | ✅ 1/1 | ✅ Claude payload preservation | ➖ None needed | Pins root `marketplace.json`, identifiers, isolated Codex payload, and coexistence with Claude. |
| 5.2 | `scripts/configure/codex-marketplace.test.js` | Static contract | ✅ 2/2 assembly cases | ✅ Missing workflow command failure | ✅ 4/4 | ✅ Preserved Claude paths | ➖ None needed | Verifies both target assemblers share the release tree without moving hook packaging. |
| 6.1 | `scripts/configure/codex-marketplace.test.js` | Integration | ✅ `claude-marketplace.test.js` 8/8 | ✅ Contract first | ✅ 7/7 | ✅ Source-root refusal and fresh staging acceptance | ✅ Extracted safe-output guard | The assembler uses the established marketplace/plugin identifiers and refuses dangerous output roots. |
| 6.2–6.3 | `scripts/configure/codex-marketplace.test.js` | Static contract | ✅ 7/7 | ✅ Workflow contracts first | ✅ 7/7 | ✅ Exact URL/ref plus ordered CLI commands | ➖ None needed | Post-push smoke uses `@openai/codex` in an isolated runner home; non-zero shell commands fail the workflow. |
| 6.4 | `scripts/configure/codex-marketplace.test.js` | Documentation contract | ✅ 7/7 | ✅ Missing remote-command assertion | ✅ 7/7 | ✅ README and guide both checked | ➖ None needed | Documents `#release` as the published remote marketplace branch, distinct from local setup. |
| 7.1–7.3 | `scripts/configure/{codex-marketplace,install-codex}.test.js` | Integration | ✅ 30/30 focused | N/A — verification tasks | ✅ 30/30 focused; `npm test` passed | ✅ Staged dual-marketplace layout | ✅ No duplicate constants/helpers required | `models.yaml` remains pre-existing and untouched; local installer tests still pass. |

### Verification Evidence

- `node --test scripts/configure/claude-marketplace.test.js` — 8 passed, 0 failed (safety net).
- `node --test scripts/configure/codex-marketplace.test.js` — 7 passed, 0 failed.
- `node --test scripts/configure/codex-marketplace.test.js scripts/configure/install-codex.test.js` — 30 passed, 0 failed.
- `node scripts/configure/claude-marketplace.js --no-validate --out dist/claude-marketplace` then `node scripts/configure/codex-marketplace.js --out dist/claude-marketplace --no-validate` — staged layout verified: Claude manifest/plugin and Codex root manifest/plugin payload coexist.
- `npm test` — passed; output ended with `All checks passed.`

### Deviations and Issues

- None — the release workflow retains the Claude build location and limits hook-binary packaging to the Claude payload.
- The live remote CLI run is deliberately a GitHub Actions post-push smoke test; it cannot be truthfully executed locally before this branch is published.
- Pre-existing unrelated modification `models.yaml` remains untouched.

## Batch 3 — 2026-07-09

Completed the corrected documented marketplace implementation under the approved `size:exception`. The release artifact now places the Codex catalog at `.agents/plugins/marketplace.json`; published registration uses `--ref release` and sparse paths, while both release and local setup retain `/plugins` as the only installation step.

### Completed Tasks

- [x] 2.1–2.3 Replaced obsolete release, workflow, and documentation contracts with documented catalog, registration, and interactive-install assertions.
- [x] 3.1–3.3 Emitted the catalog payload, updated the post-push registration smoke, removed unsupported noninteractive installation, and aligned public guidance.
- [x] 4.1–4.2 Ran focused/full checks and inspected a staged dual-marketplace release tree.

### TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR | Notes / Rationale |
|------|-----------|-------|------------|-----|-------|-------------|----------|-------------------|
| 2.1–2.3 | `scripts/configure/codex-marketplace.test.js` | Integration/static contract | ✅ 7/7 | ✅ 3 failures: missing catalog, ref/sparse registration, and interactive docs | ✅ 7/7 | ✅ Catalog build and Claude-preservation cases | ✅ Scoped negative documentation assertion to Codex so Claude’s independent release guidance remains intact | Contracts require the object-shaped catalog entry, supported registration, and no noninteractive claim. |
| 3.1–3.3 | `scripts/configure/codex-marketplace.test.js` | Integration/static contract | Covered above | ✅ Existing RED contracts | ✅ 7/7 | ✅ Isolated Codex payload plus preserved Claude payload | ➖ None needed | Workflow now inspects registration rather than installing a plugin. |
| 4.1–4.2 | `scripts/configure/{codex-marketplace,claude-marketplace,install-codex}.test.js` | Integration | ✅ 15/15 marketplace safety net | ✅ Local installer test failed when it still invoked `codex plugin add` | ✅ 29/29 focused; `npm test` passed | ✅ CLI-present and CLI-absent local registration paths | ✅ Replaced plugin-registration loop with marketplace-only helper | Local setup now directs users to `/plugins`; no test asserts an undocumented automatic install. |

### Verification Evidence

- `node --test scripts/configure/codex-marketplace.test.js scripts/configure/claude-marketplace.test.js` — 15 passed, 0 failed.
- `node --test scripts/configure/install-codex.test.js scripts/configure/codex-marketplace.test.js` — 29 passed, 0 failed.
- Staged `dist/claude-marketplace/` with both assemblers: confirmed Claude manifest/payload plus `.agents/plugins/marketplace.json` and `plugins/codex/ospec-workflow/.codex-plugin/plugin.json`; obsolete release-root Codex manifest absent.
- `npm test` — passed; output ended with `All checks passed.`

### Remaining Acceptance Boundary

- [ ] 4.3 Publish the corrected release branch and retain the Actions run URL/logs proving isolated-home marketplace registration; capture manual `/plugins` installation evidence.
- [ ] 4.4 Update the install baseline only after task 4.3 has published acceptance evidence.

### Deviations and Issues

- The current Codex CLI has no documented noninteractive install path, so no such command is executed or asserted. The local setup flow was also corrected to register only the marketplace and instruct `/plugins` installation.
- `models.yaml` remains an unrelated pre-existing modification and was not changed.
