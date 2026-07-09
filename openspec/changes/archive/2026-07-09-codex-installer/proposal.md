# Proposal: Codex installer (Block 5.3)

## Intent

Codex output is now generatable and hook-capable, but users still need a safe install path. This change adds commands that build `dist/codex`, install/register the Codex plugin, copy generated TOML agents outside the plugin bundle, and merge repo Codex config without clobbering user settings.

## Scope

### In Scope
- Add `npm run setup:codex` and `npm run install:codex -- <repo>` entry points.
- Build `dist/codex`, install the plugin through the available Codex marketplace mechanism, and copy `.codex/agents/*.toml` to global `~/.codex/agents/` or repo-local `.codex/agents/`.
- Non-destructively merge destination `.codex/config.toml` for `[agents]` limits and `skills.config`, preserving unrelated user config.
- Add release/marketplace metadata and update README target table plus `docs/plugin-installation.md`.

### Out of Scope
- Changing the Codex target transform or hook schema from Blocks 5.1/5.2.
- Adding the future `models.yaml` Codex column from Block 5.4.
- Destructive cleanup of existing user Codex agents or config.

## Capabilities

### New Capabilities
- None

### Modified Capabilities
- `install`: add Codex installation/distribution behavior, agent copy semantics, config TOML merge, npm aliases, docs, and tests.
- `codex-target`: clarify the operational install contract for the already-generated `.codex-plugin` bundle and separate TOML agents.

## Approach

Extend the existing install family rather than creating a second generator path. Reuse `runConfigure({ target: "codex", outDir: dist/codex, validate: true })` and safe destination checks, add Codex-aware install logic for marketplace registration, then copy generated agent TOML separately because Codex plugins do not package agents. Implement the `.codex/config.toml` merge as a targeted, non-destructive update that adds or updates only managed `[agents]` limits and `skills.config` keys, analogous to the Copilot MCP config merge policy.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `package.json` | Modified | Add `build:codex`, `setup:codex`, and `install:codex` scripts. |
| `scripts/configure/install-target.js` / new Codex installer module | Modified/New | Build, marketplace install, agent copy, dry-run/error handling. |
| `scripts/configure/*test.js` | Modified | Cover Codex install, TOML config merge, and non-destructive behavior. |
| `README.md` | Modified | Update target table and command examples. |
| `docs/plugin-installation.md` | Modified | Document Codex setup modes, agent-copy destination, and config merge. |
| release marketplace entry | New/Modified | Add Codex marketplace metadata on the release branch path. |
| `openspec/specs/install/spec.md` | Modified | Extend install requirements for Codex. |
| `openspec/specs/codex-target/spec.md` | Modified | Cross-reference installer responsibility for agents. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| TOML merge corrupts user config | Med | Narrow managed keys, fixture tests for preservation, dry-run preview. |
| Codex CLI marketplace command availability varies | Med | Detect/probe CLI and print actionable manual instructions when unavailable. |
| Global agent copy surprises users | Med | Prefer explicit scope/default documentation and support repo-local install for `install:codex -- <repo>`. |

## Rollback Plan

Revert installer scripts, package aliases, docs, and spec deltas. Generated `dist/codex` is disposable. For user machines, rollback is manual removal of the installed plugin entry and copied agent TOML files; merged `.codex/config.toml` changes are limited to managed keys so they can be removed without touching unrelated config.

## Dependencies

- Archived `codex-target-profile` and `codex-hooks-bridge` changes provide the generated plugin bundle, TOML agents, validator, and hooks bridge.
- Codex CLI is optional for build success but required for automatic marketplace registration.

## Success Criteria

- [ ] `npm run setup:codex` builds `dist/codex`, handles Codex CLI presence/absence, and installs or reports next steps.
- [ ] `npm run install:codex -- <repo>` builds, copies repo-local agents/config safely, and preserves unrelated files.
- [ ] `.codex/config.toml` merge updates only managed `[agents]` and `skills.config` values.
- [ ] README, plugin installation docs, and release marketplace metadata describe Codex installation accurately.
- [ ] `npm test` passes with Codex installer and merge coverage.
