# Design: Codex installer

## Technical Approach

Mode: `design-after-spec`. This design extends the existing CommonJS installer family rather than adding a second generator. `npm run setup:codex` and `npm run install:codex -- <destRepo>` will both call `runConfigure({ sourceDir, target: "codex", outDir: dist/codex, validate: true })`, then perform Codex-specific side effects around the generated tree: marketplace registration, separate TOML agent copy, and a constrained `.codex/config.toml` merge. The design allocates every scenario from `REQ-install-001` through `REQ-install-004` and the codex-target handoff in `REQ-codex-target-002`.

Codex CLI docs currently support `codex plugin marketplace add <path-to-marketplace-root>` for a non-default local marketplace and `codex plugin add <plugin-name>@<marketplace-name>` for plugin installation. The automatic path will use those commands when a `codex` binary is discoverable; absence of the CLI is a non-fatal setup fallback.

| Requirement / Scenario | Design allocation |
| --- | --- |
| REQ-install-001 setup builds/registers | `scripts/configure/install-codex.js` builds `dist/codex`, validates, wraps it as `dist/codex-marketplace`, probes `codex`, then runs marketplace + plugin commands. |
| REQ-install-001 CLI unavailable fallback | `findCodexBin()` returns `null`; installer exits 0 after printing manual commands and keeping build artifacts. |
| REQ-install-002 global/repo agent copy | `copyCodexAgents(outDir, agentsDir, { dryRun })` copies only `.codex/agents/*.toml` to `~/.codex/agents` or `<destRepo>/.codex/agents`. |
| REQ-install-002 preservation | Copy overwrites same filenames with `copyFileSync`; no directory deletion or broad `fs.cpSync` over the whole `.codex` tree. |
| REQ-install-003 config merge | `mergeManagedCodexConfig(sourceConfig, destConfig)` extracts only source `[agents]` and `skills.config`, patches/adds those keys, and preserves unrelated text. |
| REQ-install-004 docs/metadata/tests | Update scripts, README, `docs/plugin-installation.md`, marketplace metadata writer, and native Node tests. |
| REQ-codex-target-002 installer handoff | Installer consumes generated `.codex/agents/*.toml`; `.codex-plugin/plugin.json` remains agent-free and unchanged. |

## Architecture Decisions

### Decision: Add a dedicated Codex installer module, keep shared safety helpers

**Choice**: Create `scripts/configure/install-codex.js` for Codex-specific marketplace, agents, and TOML config behavior; reuse `assertSafeDest` and `runConfigure` from existing modules.
**Alternatives considered**: Extend `install-target.js` with a third target branch; create separate build logic bypassing `runConfigure`.
**Rationale**: `install-target.js` currently copies a whole generated tree for non-marketplace repo targets. Codex has mixed global/local destinations and must not copy the full `.codex-plugin` bundle into a repo root, so a dedicated IO shell keeps behavior explicit while retaining existing safe-destination checks.

### Decision: Marketplace wrapper for Codex plugin registration

**Choice**: Generate `dist/codex-marketplace` containing a marketplace manifest and `plugins/ospec-workflow/` copied from `dist/codex`; register it with `codex plugin marketplace add <absolute path>`, then install/update using `codex plugin add ospec-workflow@ospec-tools`.
**Alternatives considered**: Register `dist/codex` directly; edit `~/.codex/config.toml` marketplace tables directly; fail when Codex CLI is absent.
**Rationale**: Codex plugin commands expect marketplace semantics. Wrapping mirrors the existing Claude marketplace shape without mutating user config manually. CLI absence is explicitly non-fatal by spec, so fallback prints copy/paste commands.

### Decision: Text-preserving constrained TOML merge

**Choice**: Implement a small dependency-free TOML patcher that reads managed values from generated `dist/codex/.codex/config.toml`, then inserts or replaces only top-level `[agents]` key assignments and `skills.config` assignment while leaving all other lines byte-for-byte intact.
**Alternatives considered**: Add a TOML parser dependency; JSON-like rewrite of the whole TOML file; hand-author managed defaults in installer code.
**Rationale**: The project avoids external runtime dependencies. Whole-file serialization would destroy comments and formatting, violating the spec. Sourcing the payload from generated config avoids hidden installer defaults.

### Decision: Ship Codex config as a generator-managed source root

**Choice**: Add source `.codex/config.toml` and include it in `SOURCE_ROOTS` so `runConfigure` emits `dist/codex/.codex/config.toml`; update codex golden fixtures and validation coverage.
**Alternatives considered**: Generate config in `install-codex.js`; place config under `.codex-plugin`; infer keys from agent TOML files.
**Rationale**: The clarified spec says managed values come from the generated source-tree config only. Making it a source artifact keeps the payload reviewable and testable in the same generator pipeline as agents.

## Data Flow

```text
npm script
  ├─ setup:codex
  │    └─ install-codex --scope global
  └─ install:codex -- <destRepo>
       └─ install-codex --scope repo <destRepo>

install-codex
  ├─ runConfigure(target=codex, outDir=dist/codex, validate=true)
  ├─ buildCodexMarketplace(dist/codex -> dist/codex-marketplace/plugins/ospec-workflow)
  ├─ if codex CLI found: codex plugin marketplace add ...; codex plugin add ...
  │    else: print manual marketplace/plugin commands and continue success
  ├─ copy dist/codex/.codex/agents/*.toml -> destination agents directory
  └─ merge dist/codex/.codex/config.toml -> destination config.toml
```

Global destination:

```text
dist/codex/.codex/agents/*.toml ──→ ~/.codex/agents/*.toml
dist/codex/.codex/config.toml   ──→ ~/.codex/config.toml
```

Repo-local destination:

```text
dist/codex/.codex/agents/*.toml ──→ <destRepo>/.codex/agents/*.toml
dist/codex/.codex/config.toml   ──→ <destRepo>/.codex/config.toml
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `package.json` | Modify | Add `build:codex`, `setup:codex`, `install:codex`, and optionally `reload:codex` aliases. |
| `.codex/config.toml` | Create | Reviewable source of managed `[agents]` limits and `skills.config` values. |
| `scripts/configure/cli.js` | Modify | Include `.codex/config.toml` in `SOURCE_ROOTS` so codex dist carries the merge source. |
| `scripts/configure/install-codex.js` | Create | Codex build, marketplace wrapper, CLI registration fallback, agent copy, and TOML merge IO shell. |
| `scripts/configure/install-target.js` | Modify | Export or reuse safety helpers only if needed; keep non-Codex behavior unchanged. |
| `scripts/configure/validate-codex.js` | Modify | Require/read generated `.codex/config.toml` enough to prove the merge source exists and is constrained. |
| `scripts/configure/__fixtures__/source/.codex/config.toml` | Create | Fixture source config for golden tests. |
| `scripts/configure/__fixtures__/golden/codex/.codex/config.toml` | Create | Expected generated config artifact. |
| `scripts/configure/install-codex.test.js` | Create | Unit/integration tests for CLI fallback, agent copy, config merge, and dry-run/error paths. |
| `scripts/configure/cli.test.js` / `real-repo.test.js` | Modify | Assert codex generated tree includes `.codex/config.toml` and validates. |
| `README.md` | Modify | Add Codex target row and commands. |
| `docs/plugin-installation.md` | Modify | Document Codex marketplace setup, global/local agents, config merge, fallback commands. |

## Interfaces / Contracts

```js
// scripts/configure/install-codex.js exports for tests
module.exports = {
  parseArgs,                 // --dry-run, --no-validate, --source, optional destRepo
  findCodexBin,              // probes codex/codex.cmd/codex.exe without shell
  buildCodexMarketplace,     // dist/codex -> dist/codex-marketplace
  copyCodexAgents,           // copies only *.toml, no delete
  extractManagedCodexConfig, // returns { agentsLines, skillsConfigLine }
  mergeManagedCodexConfig,   // text-preserving patch
  main,
};
```

CLI contract:

- `npm run setup:codex`: no destination argument; writes to `~/.codex/agents` and `~/.codex/config.toml`; attempts CLI registration.
- `npm run install:codex -- <destRepo>`: destination MUST exist and pass `assertSafeDest`; writes only `<destRepo>/.codex/agents/*.toml` and `<destRepo>/.codex/config.toml`; still builds/validates `dist/codex`.
- `--dry-run`: prints marketplace, copy, and merge actions without writing destination files or invoking `codex`.
- `--no-validate`: preserves existing generator convention for local inspection, but default validation remains enabled.

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | `parseArgs`, `findCodexBin`, marketplace command construction, managed TOML extraction, text-preserving merge insert/update paths | Native `node:test` in `scripts/configure/install-codex.test.js` with temp dirs and injected `spawnSync`/filesystem seams. |
| Integration | `setup:codex` fallback when `codex` binary is unavailable; repo-local `install:codex` copies TOML agents and config without deleting unrelated files | Run installer functions against generated fixture dist/temp repos; assert exit code 0 for missing CLI fallback and no unrelated file changes. |
| Generator regression | `.codex/config.toml` is emitted by codex target and golden snapshot includes it | Extend `cli.test.js` golden and `real-repo.test.js` codex validation. |
| Docs/metadata | README and plugin installation docs mention Codex commands, separate agent copy, and non-destructive merge | Existing docs lint plus targeted assertions if current docs tests already scan target tables. |
| E2E | Real Codex CLI registration | Keep optional/self-skipping if `codex` exists, matching current `e2e.test.js` pattern; mandatory CI remains CLI-free. |

Strict TDD applies in `sdd-apply`: write failing tests for merge preservation and CLI fallback before production code.

## Failure Modes

- Build or validation failure: abort before any destination copy/merge and return the generator exit code.
- Destination missing/unsafe for `install:codex`: return usage/safety error before build-side effects beyond argument parsing.
- Codex CLI missing: success with clear manual `codex plugin marketplace add ...` and `codex plugin add ...` commands.
- Codex CLI command fails: preserve build and copied local artifacts, return non-zero unless `--dry-run`; stderr includes the failed command and manual recovery.
- Source `.codex/config.toml` missing or lacks managed keys: fail before destination merge because proceeding would violate the clarified source-of-truth contract.
- Existing destination config has malformed managed sections: patch only recognizable assignment lines; if the target managed table cannot be located safely, append a managed block rather than rewrite unrelated content.

## Migration / Rollout

No data migration required. Rollout is additive: new scripts and generated config source do not alter existing targets. Existing user machines are changed only when the new Codex install commands are executed. Rollback is code revert plus manual removal of the Codex plugin registration, copied `~/.codex/agents/<managed>.toml` or repo-local agent files, and the managed `[agents]`/`skills.config` lines added to `.codex/config.toml`.

## Open Questions

- None.
