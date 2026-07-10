# Tasks: Codex Target Phase 2

## Spec/Design Reconciliation

| Requirement / Scenario | Priority | Design Allocation | Status | Notes |
|------------------------|----------|-------------------|--------|-------|
| REQ-generator-004 (safe `./` paths + MCP id regex) | MUST | `scripts/lib/target-transform.js` reshapeManifest codex branch; `scripts/configure/validate-codex.js` | covered-by-design | ADR-001, ADR-002 |
| REQ-generator-001 (TOML agent emission) | MUST | `scripts/lib/target-profiles/codex.js`, `target-transform.js` agent step | covered-by-design | Existing mechanism extended per design §Architecture |
| REQ-hooks-004 (wrapper matcher + POSIX/Windows adapter + PLUGIN_DATA) | MUST | `scripts/lib/target-transform.js` codexHooks; profile declares `commandWindows` | covered-by-design | Interface sample in design.md |
| REQ-hooks-005 (PreToolUse ask→allow) | MUST | `scripts/hooks/pre-tool-use.js`, `OSPEC_TARGET=codex` flag | covered-by-design | ADR-003, reuses §3.4.1 |
| REQ-hooks-006 (SubagentStop agent_transcript_path) | MUST | `scripts/hooks/subagent-stop.js` | covered-by-design | ADR-003 |
| REQ-hooks-007 (SessionStart contract unchanged) | MUST | no code change; regression-covered via smoke test | covered-by-design | Contract fixed as target-independent |
| REQ-install-001 (separate idempotent channels, config.toml untouched) | MUST | `scripts/configure/install-codex.js` | covered-by-design | Tighten existing behavior |
| REQ-install-002 (docs/codex/README.md 4 sections) | MUST | `docs/codex/README.md` | covered-by-design | Doc-only |
| REQ-install-003 (smoke test in npm test) | MUST | `scripts/configure/codex-smoke.test.js` (new) | covered-by-design | Runs against built+installed payload |
| REQ-agents-010 (TOML autodetectable, no manual config) | MUST | same TOML emission path (REQ-generator-001) + install channel (REQ-install-001) | covered-by-design | Verified via smoke test + TOML parse assertions |

### Reconciliation Verdict
- MUST coverage: complete
- SHOULD/MAY gaps: none
- Ambiguities to track: none (clarify gate recorded 0 open questions)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~700-950 (9 modified files across generator/validator/hooks/install + 1 new smoke test + docs + Go parity mirror) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 (generation+validation) → PR 2 (hooks runtime) → PR 3 (install+docs+smoke) |
| Delivery strategy | exception-ok |
| Chain strategy | size-exception |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: size-exception
400-line budget risk: High

`delivery-strategy=exception-ok` is already accepted in `state.yaml` (approval-002); maintainer
has pre-approved `size:exception`, so `sdd-apply` may proceed without an additional gate
question, but SHOULD still land as the three work units below to keep each diff reviewable.

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Generation + validation: `./`-relative paths, metadata keepFields, MCP id fix+regex, TOML agent path safety | PR 1 | `.mcp.json`, `target-profiles/codex.js`, `target-transform.js`, `validate-codex.js`; unit tests included |
| 2 | Hooks runtime: wrapper matcher/commandWindows emission, `OSPEC_TARGET=codex` ask-degradation, `agent_transcript_path` alias, Go parity mirror | PR 2 | `pre-tool-use.js`, `subagent-stop.js`, Go parity fixtures; depends on PR 1's generated wrapper shape |
| 3 | Install channels + docs + smoke test | PR 3 | `install-codex.js`, `docs/codex/README.md`, `codex-smoke.test.js`; depends on PR 1 + PR 2 output |

### Checklist Status Legend

- `[ ]` Not implemented yet
- `[~]` Implemented but not yet verified locally
- `[x]` Implemented and verified locally

## Phase 1: Generation — Manifest Metadata, Safe Paths, MCP Id Fix

- [x] 1.1 Rename MCP ids in `.mcp.json`: `io.github.upstash/context7` → `context7`, `microsoft/markitdown` → `markitdown` [REQ-generator-004]
- [x] 1.2 Extend `profile.manifest.keepFields` in `scripts/lib/target-profiles/codex.js` to retain `name`/`version`/`description` [REQ-generator-001]
- [x] 1.3 Add codex-only manifest post-step in `scripts/lib/target-transform.js` `reshapeManifest` that rewrites `skills`/`mcpServers`/`hooks` string values to `./`-relative form, rejecting any `..` traversal segment or absolute path [REQ-generator-004]
- [x] 1.4 Verify/extend TOML agent emission (`agentFile.format: "toml"` step) so the emitted `.codex/agents/*.toml` path and every path it references satisfy the `./`-relative safe-path contract [REQ-generator-001, REQ-generator-004]
- [x] 1.5 Write unit tests asserting `./`-prefix rewriting, no-`..` rejection, and TOML output path safety against a codex fixture [REQ-generator-004]

## Phase 2: Validation — MCP Regex and Path Contract Enforcement

- [x] 2.1 Extend `scripts/configure/validate-codex.js` `ALLOWED_BUNDLE_KEYS` to admit `name`/`version`/`description` [REQ-generator-004]
- [x] 2.2 Add validator check: every generated `.mcp.json` id MUST match `^[a-zA-Z0-9_-]+$`, else emit error + non-zero exit (respecting existing `--no-validate` bypass) [REQ-generator-004]
- [x] 2.3 Add validator check: every manifest/config path MUST be `./`-relative, no `..`, no absolute path [REQ-generator-004]
- [x] 2.4 Write unit tests driving `validate()` over a self-generated temp tree covering: bad path, `..` traversal, invalid MCP id, and a conformant payload (no false positive) [REQ-generator-004]

## Phase 3: Hooks Runtime — Wrapper, Ask-Degradation, Transcript Alias

- [x] 3.1 Implement `codexHooks` wrapper emission in `scripts/lib/target-transform.js`: per-event `{matcher: ".*", hooks: [{type, command, commandWindows, timeout}]}` for exactly the five events (`SessionStart`, `PreToolUse`, `PreCompact`, `SubagentStop`, `Stop`), `command` POSIX form + `commandWindows` backslash/`%PLUGIN_ROOT%` form [REQ-hooks-004]
- [x] 3.2 Confirm `PLUGIN_DATA` is inherited by the launched Node process unchanged (no wrapper-side read/rewrite) [REQ-hooks-004]
- [x] 3.3 Modify `scripts/hooks/pre-tool-use.js` to treat `OSPEC_TARGET=codex` as bypass-equivalent, degrading every ask-producing branch (AgentShield Step 2, Token Budget Steps 3-4, Git Collaboration Guard Step 5b, Spec Drift Advisory Step 5c, ASK table Step 6) to `allow` + `systemMessage`, leaving DENY (Step 5) untouched [REQ-hooks-005]
- [x] 3.4 Modify `scripts/hooks/subagent-stop.js` to accept `input.agent_transcript_path` as an alias/fallback source alongside `input.transcript_path`, preserving existing §5.2 step-3 JSONL-parsing logic [REQ-hooks-006]
- [x] 3.5 Mirror the `OSPEC_TARGET` and `agent_transcript_path` changes in the Go parity implementation (if present under `internal/…`) to keep Go/JS parity fixtures assertable [REQ-hooks-005, REQ-hooks-006]
- [x] 3.6 Write/extend unit tests: wrapper matcher covers exactly five events, no sixth event; POSIX and Windows command strings both resolve without quoting/path-separator failure; PreToolUse ask→allow+systemMessage under `OSPEC_TARGET=codex` with DENY unaffected; SubagentStop resolves `skill_resolution` from a temp `agent_transcript_path` JSONL fixture [REQ-hooks-004, REQ-hooks-005, REQ-hooks-006]
- [x] 3.7 Assert `SessionStart` on the codex wrapper still returns the standard contract (`status`, `ospecDetected`, `registry`) unmodified, against the published codex payload per the Go/JS parity fixture pattern [REQ-hooks-007]

## Phase 4: Install — Idempotent Channels and Documentation

- [x] 4.1 Modify `scripts/configure/install-codex.js` so the plugin-payload channel and the `.codex/agents/*.toml` channel never write to, merge into, or otherwise touch the other's target location [REQ-install-001]
- [x] 4.2 Ensure both channels are idempotent (re-run converges to identical state, no duplicate TOML entries or drift) and neither channel creates or modifies `.codex/config.toml` [REQ-install-001]
- [x] 4.3 Write unit tests: first install writes both channels correctly, re-run is idempotent, existing `.codex/config.toml` stays byte-for-byte unchanged across both channels [REQ-install-001]
- [x] 4.4 Write `docs/codex/README.md` sections: (a) install/update flow (`setup:codex`/`install:codex`), (b) reviewing/trusting `/hooks` cache entries, (c) new-task flow (skill → orchestrator TOML agent → `SessionStart`), (d) rollback procedure without touching `.codex/config.toml` [REQ-install-002]

## Phase 5: Agents — Autodetection Verification

- [x] 5.1 Add TOML-parse assertions for each generated `.codex/agents/*.toml` file: valid syntax, required `name`/`description`/`developer_instructions` keys present, `model`/`sandbox_mode` populated when resolvable [REQ-agents-010]
- [x] 5.2 Assert the orchestrator TOML agent specifically dispatches through to `SessionStart` with no manifest/MCP/hooks warnings when installed per REQ-install-001 [REQ-agents-010]

## Phase 6: Smoke Test and Final Integration

- [x] 6.1 Create `scripts/configure/codex-smoke.test.js`: build the codex payload, install to a temp destination, invoke the entry skill, follow orchestrator dispatch via the TOML agent, assert the `SessionStart` response is well-formed per REQ-hooks-007, exit 0 [REQ-install-003]
- [x] 6.2 Wire the smoke test into the standard `npm test` suite (no separate invocation required) [REQ-install-003]
- [x] 6.3 Run full `npm test` locally, confirm generator/validator/hooks/install/smoke tests all pass together, and update `docs/codex/README.md` cross-links if the smoke command name changed during implementation
