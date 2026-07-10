## Exploration: fix-codex-config-toml

### Current State
The checked-in source and Codex fixtures generate `.codex/config.toml` with `skills.config`, `agents.max_output_tokens`, and `agents.max_tool_calls`. The current Codex configuration reference does not list any of these keys: plugins provide skills through their bundle, while supported agent controls include `agents.max_threads` and `agents.max_depth`.

`runConfigure()` includes `.codex` only for Codex builds, and `install-codex.js` requires that generated config then non-destructively merges its `[agents]` assignments and `skills.config` into a user or project config. The local validator only verifies agent TOML files; it does not validate `.codex/config.toml`, so the full `npm test` suite passes despite the unsupported settings.

### Affected Areas
- `.codex/config.toml` — contains the unsupported managed configuration.
- `scripts/configure/cli.js` — selectively loads `.codex` so the unsupported config reaches `dist/codex`.
- `scripts/configure/install-codex.js` — requires and merges the invalid settings into destination configuration.
- `scripts/configure/validate-codex.js` — lacks validation for the generated configuration contract.
- `scripts/configure/{cli,install-codex,validate-codex,real-repo}.test.js` — encode the present config artifact and merge behavior.
- `scripts/configure/__fixtures__/{source,golden/codex}/.codex/config.toml` — fixture and snapshot copies of the invalid config.
- `README.md`, `docs/plugin-installation.md`, and `openspec/specs/install/spec.md` — document config copying/merging that should no longer be advertised if the managed config is retired.

### Release Marketplace Extension (2026-07-09)
The requested GitHub-release instruction is not a documentation-only change. The published `v2.23.0` release body contains only a narrative summary, while `.github/workflows/publish-marketplace.yml` publishes a Claude-only generated tree to the orphan `release` branch. Its root has Claude's `.claude-plugin/marketplace.json` and `plugins/ospec-workflow/`; it does not contain Codex's root `marketplace.json` or a Codex-generated plugin tree.

The existing Codex installer establishes the intended identifiers: `scripts/configure/install-codex.js` builds a marketplace named `ospec-tools`, with plugin `ospec-workflow`, and registers it using `codex plugin marketplace add <marketplaceDir>` followed by `codex plugin add ospec-workflow@ospec-tools`. Current Codex documentation supports adding a remote marketplace from an HTTP(S) Git URL, so the release-note command can follow Claude's remote-source pattern only after the release branch also publishes a Codex marketplace.

The release tree can carry both marketplaces without changing local installation: retain Claude at `plugins/ospec-workflow/`, add a root Codex `marketplace.json` whose plugin source points to a distinct path such as `./plugins/codex/ospec-workflow/`, and generate the Codex target there during release publishing. The candidate end-user commands are:

```powershell
codex plugin marketplace add https://github.com/snakeblack/ospec-workflow.git#release
codex plugin add ospec-workflow@ospec-tools
```

The exact branch-fragment behavior of the Codex CLI must be verified with a real CLI or a contract-level release test before publishing it as a supported command; the local installer currently covers only an absolute local marketplace path.

### Additional Affected Areas
- `.github/workflows/publish-marketplace.yml` — must build and publish a separate Codex marketplace alongside the existing Claude one; otherwise the remote command has no compatible marketplace manifest or plugin payload.
- `scripts/configure/install-codex.js` — its `buildCodexMarketplace()` format and shared marketplace/plugin identifiers are the source pattern for the release workflow, not a target for local-install behavior changes.
- `scripts/configure/install-codex.test.js` and a release-workflow/static contract test — should assert the remote marketplace layout, identifiers, and documented command so the release instruction cannot drift from the published artifact.
- GitHub release body/template mechanism — no versioned release-body template or automated release-note publisher exists; the command must be added through the release creation process or a newly defined, tested release-note source of truth.

### Approaches
1. **Retire generated and installed Codex config** — Remove the unsupported source config, its generator inclusion, installer extraction/merge path, fixtures, and documentation; continue installing the plugin and standalone agent TOML files.
   - Pros: Does not invent semantics for unsupported keys; avoids overwriting a user's valid Codex configuration; aligns with the current official reference and plugin-based skill discovery.
   - Cons: Removes the previously attempted output/concurrency tuning rather than replacing it.
   - Effort: Medium

2. **Replace with supported agent settings** — Keep the config pipeline but explicitly choose supported `[agents]` keys such as `max_threads` and/or `max_depth`, then update extraction, validation, fixtures, and docs.
   - Pros: Preserves a managed config capability and can set an intentional concurrency policy.
   - Cons: The old limits have no demonstrated semantic equivalent; choosing values changes observable Codex behavior and needs an explicit product decision.
   - Effort: Medium

### Recommendation
Use Approach 1. The generated plugin already carries skills, and the current documented configuration has no equivalent for the two token/tool-call limits. Retiring the invalid merge payload is safer than translating it into unrelated concurrency controls. If maintaining a concurrency policy is required, decide its supported keys and values first, then use Approach 2 as a follow-up.

### Risks
- Existing installations may retain stale unsupported keys because removing the installer merge must not destructively edit user-owned config; document manual cleanup if Codex reports them.
- Removing config support requires coordinated updates to generator, installer, fixtures, tests, docs, and the install baseline spec to avoid stale behavioral assertions.
- The current validator gives a false sense of coverage because it does not inspect config semantics; tests must assert the corrected artifact contract rather than only a successful generation run.
- Adding only the two Codex commands to a GitHub release would direct users to a Claude-only `release` branch and fail installation.
- Reusing `plugins/ospec-workflow/` for both generated targets would overwrite or mix incompatible Claude and Codex plugin layouts; the release artifact needs separate plugin paths.
- Publishing the `#release` URL without proving Codex CLI branch-ref handling risks documenting a command that resolves the default branch instead of the marketplace branch.

### Ready for Proposal
Yes — the original config-retirement work remains complete. For the accepted release-command extension, return to `sdd-tasks` to add the direct release-artifact dependency, remote-install contract evidence, and the GitHub release-content source/process. Local installation and non-Codex targets remain out of scope.
