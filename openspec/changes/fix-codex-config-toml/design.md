# Design: Retire unsupported Codex config.toml and publish a documented Codex marketplace

## Technical Approach

This recovery design preserves the verified removal of generated or installed `.codex/config.toml`. It replaces the released Codex distribution contract, which currently uses a root `marketplace.json`, a Git URL fragment (`#release`), and `codex plugin add`. Current official documentation instead defines a Git marketplace with `--ref`, an `.agents/plugins/marketplace.json` catalog, and installation through the `/plugins` browser.

The release branch will continue to host the Claude marketplace unchanged, while a Codex catalog and its isolated payload are published in the layout documented by OpenAI. The local `npm run setup:codex` flow is not part of this recovery.

Official sources consulted on 2026-07-09:

- https://developers.openai.com/codex/build-plugins/
- https://developers.openai.com/codex/plugins/

## Architecture Decisions

### Decision: Use the documented Git marketplace source syntax

**Choice**: Register the release artifact with a GitHub shorthand, explicit `--ref release`, and sparse paths; install using Codex's `/plugins` browser. The supported end-user flow is:

```powershell
codex plugin marketplace add snakeblack/ospec-workflow --ref release --sparse .agents/plugins --sparse plugins/codex/ospec-workflow
codex
# then run /plugins, select ospec-tools, select ospec-workflow, and install it
```

**Alternatives considered**: `https://github.com/snakeblack/ospec-workflow.git#release` plus `codex plugin add ospec-workflow@ospec-tools`; a local-clone instruction.

**Rationale**: OpenAI documents `--ref` for pinning a Git source and `/plugins` as the CLI installation surface. It does not document Git ref fragments or a `codex plugin add` subcommand. Sparse checkout includes both the catalog and the payload it resolves relative to that catalog.

### Decision: Publish Codex catalog at `.agents/plugins/marketplace.json`

**Choice**: `codex-marketplace.js` writes the Codex catalog below the release-root `.agents/plugins/` directory and places the generated payload at `plugins/codex/ospec-workflow/`. Its entry uses the current object form, required policy fields, and category:

```json
{
  "name": "ospec-tools",
  "interface": { "displayName": "OSpec Tools" },
  "plugins": [{
    "name": "ospec-workflow",
    "source": { "source": "local", "path": "./plugins/codex/ospec-workflow" },
    "policy": { "installation": "AVAILABLE", "authentication": "ON_INSTALL" },
    "category": "Productivity"
  }]
}
```

**Alternatives considered**: a release-root `marketplace.json`; sharing Claude's `.claude-plugin/marketplace.json`; a Git-backed plugin entry pointing back to the same repository.

**Rationale**: Official guidance locates a repository marketplace at `$REPO_ROOT/.agents/plugins/marketplace.json`, requires relative `source.path` inside the marketplace root for local entries, and documents policy/category metadata. Separate paths keep target-specific manifest schemas from colliding.

### Decision: Leave user-owned Codex configuration untouched

**Choice**: Keep the completed deletion and validator ban for generated `.codex/config.toml`; do not reintroduce it while correcting the release marketplace.

**Alternatives considered**: restore config generation to store marketplace information; replace removed settings with other agent limits.

**Rationale**: Marketplace registration is managed by the documented CLI flow rather than by manually editing configuration, and the release-layout correction has no dependency on managed settings. This retains the verified user-config preservation contract.

## Data Flow

```text
source repo
  |-- claude-marketplace.js --> release/.claude-plugin/marketplace.json
  |                           --> release/plugins/ospec-workflow/
  |
  `-- codex-marketplace.js --> release/.agents/plugins/marketplace.json
                              --> release/plugins/codex/ospec-workflow/
                                       |
GitHub Actions force-push release ------+
                                       v
codex plugin marketplace add <owner/repo> --ref release --sparse ...
                                       |
                                       v
                                  codex /plugins --> install ospec-workflow
```

The workflow's post-push smoke must use the same supported registration command, then launch a noninteractive/automated Codex-compatible plugin-browser verification if available. If the CLI offers no documented noninteractive install command, it must only prove marketplace registration in CI and retain an explicit manual `/plugins` verification step for the published release; it must not reintroduce an undocumented `plugin add` command merely to automate the check.

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `scripts/configure/codex-marketplace.js` | Modify | Emit `.agents/plugins/marketplace.json` with documented metadata; retain isolated payload copy. |
| `scripts/configure/codex-marketplace.test.js` | Modify | Replace root-manifest and unsupported-command contracts with exact catalog, payload, sparse/ref, and docs contracts. |
| `.github/workflows/publish-marketplace.yml` | Modify | Publish the new release layout and use `--ref release` plus sparse paths in the post-push registration check; remove `codex plugin add`. |
| `README.md` | Modify | Replace the unsupported remote command with the documented add-plus-`/plugins` procedure. |
| `docs/plugin-installation.md` | Modify | Document the release layout, supported command, interactive installation, and distinction from local setup. |
| `openspec/specs/install/spec.md` | Modify | Add the archived baseline behavior for the published Codex marketplace after the corrected release flow is verified. |
| `openspec/changes/fix-codex-config-toml/tasks.md` | Modify | Replan completed release tasks against this corrected contract and add proof boundaries. |

## Interfaces / Contracts

Release-root Codex contract:

```text
.agents/plugins/marketplace.json
plugins/codex/ospec-workflow/.codex-plugin/plugin.json
```

The marketplace's `source.path` is `./plugins/codex/ospec-workflow`, resolved relative to the repository root. The branch is selected only by `--ref release`; no `#release` fragment is emitted in user guidance, tests, or workflow commands. Codex plugin installation is initiated through `/plugins`, not an undocumented CLI subcommand.

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit/integration | Generated catalog structure and isolated payload | Build into a temporary release tree; assert `.agents/plugins/marketplace.json`, full entry schema, path containment, and preserved Claude paths. |
| Static contract | Workflow and public guidance | Assert `--ref release`, both `--sparse` paths, absence of `#release` and `codex plugin add`, and `/plugins` instructions. |
| Published runtime | Git registration of the actual release branch | Trigger the workflow/release, retain run URL/logs, and inspect `codex plugin marketplace list` under an isolated home. Manual `/plugins` installation evidence is required unless OpenAI documents a noninteractive install command before apply. |

## Migration / Rollout

No data migration is required. Republish the `release` branch through the corrected workflow. Users who previously registered the broken marketplace should remove or upgrade its marketplace entry using documented Codex marketplace commands, re-add it with the new `--ref`/sparse command, then install through `/plugins`. The design intentionally leaves existing `.codex/config.toml` files untouched.

## Open Questions

- [ ] Confirm during apply whether the installed Codex version exposes a documented noninteractive plugin-install command. Until then, CI proves supported registration only; a manual `/plugins` install is the release acceptance step.
