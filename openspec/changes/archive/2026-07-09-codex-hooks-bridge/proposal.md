# Proposal: Codex hooks bridge (Bloque 5.2)

## Intent

OpenAI Codex CLI plugins require a dedicated lifecycle hooks mechanism to intercept session startup, tool execution, context compaction, and teardown. This change implements target hooks support for the `codex` target profile by transforming `hooks/hooks.json` to the Codex hooks format (mapping events ~1:1 PascalCase, `${CLAUDE_PLUGIN_ROOT}` -> quoted `$PLUGIN_ROOT` paths), adapting the runtime JS/Go wrappers to support Codex's stdio payload shape, and extending the contract linter (I3 timeout budget coherence check) to the Codex target.

This change is Block 5.2 of the Codex target roadmap, enabling hooks execution parity with Claude Code and other platforms.

## Scope

### In Scope
- **Hooks Configuration Transform**: Implement the hooks transformation in `scripts/lib/target-transform.js` for `profile.hooks.format === "codex"`, including quoted `$PLUGIN_ROOT/...` command paths.
- **Target Profile Update**: Update `scripts/lib/target-profiles/codex.js` to declare its hooks format configuration, output path (`hooks/hooks.json`), and path-variable mapping (`${CLAUDE_PLUGIN_ROOT}` -> quoted `$PLUGIN_ROOT` paths).
- **Runtime Compatibility**: Review and adapt Node scripts (`scripts/hooks/`) and the Go binary hooks wrapper (`cmd/ospec-hooks/` and `internal/hooks/`) to handle the stdio payload shape of Codex (e.g. `session_id`, `cwd`, `transcript_path`, `tool_name`, `tool_input`), ensuring non-blocking execution and correct exit codes.
- **Contract Lint Extension**: Extend the unified linter checker `i3-budget-constant` (`scripts/lib/contract-checkers/i3-budget-constant.js`) to validate Codex hooks timeouts against runtime constants.
- **Check Integration**: Update `scripts/check.js` to include the `codex` target in the verification run.
- **Parity Tests**: Verify JS/Go parity behavior on Codex hooks payloads using existing or new unit and integration tests.

### Out of Scope
- **Marketplace installer**: local/remote installation commands (covered by 5.3).
- **Configuration merge**: merge of user-global or repo-level `.codex/config.toml` (covered by 5.3).
- **Models column**: `models.yaml` updates for GPT-5.6 family (covered by 5.4).

## Capabilities

### New Capabilities
- None

### Modified Capabilities
- **hooks**: Reshaping hooks.json, translating event names, and resolving path variables (`$PLUGIN_ROOT`).
- **contract-lint**: Enforce timeout boundaries on the Codex target hooks file.

## Approach

1. **Target Profile hooks declaration**: Define the hooks config in `scripts/lib/target-profiles/codex.js` pointing `source: "hooks/hooks.json"`, `location: "hooks/hooks.json"`, and `format: "codex"`.
2. **Hooks Transform**: Implement the `codexHooks` transform function in `scripts/lib/target-transform.js` to map events ~1:1 PascalCase, replace `${CLAUDE_PLUGIN_ROOT}` with quoted `$PLUGIN_ROOT` paths in the command string, and write to `hooks/hooks.json` in the codex output tree.
3. **Runtime & Wrapper Check**: Ensure JS hook scripts (`scripts/hooks/*.js`) and the Go binary (`cmd/ospec-hooks/main.go`, `internal/hooks/*.go`) read stdin correctly. Since Codex sends standard fields (`cwd`, `tool_name`, `tool_input`, `session_id`, `transcript_path`), they are already highly compatible, but we must verify that they handle them without errors and produce compliant stdout JSON outputs.
4. **Extend Contract Lint**: Update `i3-budget-constant.js` to assert that the timeout limits (specifically `SessionStart`) defined in Codex hooks config do not violate the `LOCK_STALE_MS` boundaries.
5. **Verify Check Integration**: Wire the `codex` target into `scripts/check.js` for continuous verification.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `scripts/lib/target-profiles/codex.js` | Modified | Declare hooks format and location for the codex profile. |
| `scripts/lib/target-transform.js` | Modified | Support `codex` format in hooks transformation. |
| `scripts/lib/contract-checkers/i3-budget-constant.js` | Modified | Extend I3 coherence check to Codex target configuration. |
| `scripts/check.js` | Modified | Add `codex` target to the validation and build verification steps. |
| `cmd/ospec-hooks/` / `internal/hooks/` | Reviewed/Modified | Validate compatibility with Codex stdio payload shape and exit codes. |
| `scripts/hooks/*.js` | Reviewed/Modified | Validate Node fallback compatibility with Codex stdio payload shape. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Path resolution failures due to $PLUGIN_ROOT vs ${CLAUDE_PLUGIN_ROOT} | Low | Standard environment variable translation ensures correct expansion in both JS and Go wrapper environments. |
| Stdio pipe blocking or hang on empty stdin payloads under Codex | Low | The Go and Node hook runners are designed to fall back to empty JSON (`{}`) and read stdin asynchronously or safely check EOF. |
| Coherent budget linter fails on missing build directories | Med | Linter will verify using the target profile definitions directly rather than relying on generated output files in the build tree. |

## Rollback Plan

Reversion is achieved by standard Git rollback of the affected files:
1. Revert target profile hooks declaration in `codex.js`.
2. Revert `target-transform.js` modifications.
3. Revert linter modifications in `i3-budget-constant.js`.
Since all changes are pure code adjustments, a rollback restores the previous state without data loss or residual artifact pollution.

## Success Criteria

- [ ] Codex target generates a valid `hooks/hooks.json` mapping all 5 lifecycle events to quoted `$PLUGIN_ROOT` paths.
- [ ] Output verification validator `validate-codex.js` passes without errors on generated hook configurations.
- [ ] Contract lint check (I3 budget constant) passes successfully for all target profiles.
- [ ] All pre-existing target checks pass.
- [ ] JS/Go parity tests execute successfully, confirming identical behavior on Codex event payloads.
