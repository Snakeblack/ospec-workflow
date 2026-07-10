# Design: Codex Target Phase 2

## Technical Approach

Treat the **published payload** (`dist/codex/**` consumed by `install-codex.js` /
`codex-marketplace.js`) as the contractual boundary, exactly as the proposal states.
All four delta specs are satisfied by hardening three existing seams — never by adding
new capabilities:

1. **Generation** (`scripts/lib/target-profiles/codex.js`, `target-transform.js`) emits a
   host-conformant manifest, `matcher`+`hooks` wrapper, and pattern-valid MCP ids.
2. **Validation** (`scripts/configure/validate-codex.js`) enforces the new payload
   contracts (`./`-relative paths, no traversal, MCP id regex) against the *generated*
   tree, per the field report's "validate the published payload, not the source" rule.
3. **Runtime** (`scripts/hooks/**`) reuses the baseline `bypassPermissions` degradation
   and skill-resolution extraction, extended for two Codex wire-field differences.

Every MUST scenario in the four specs maps to a component below. Nothing here expands the
five events or touches `.codex/config.toml`.

## Architecture Decisions

### Decision: Retain manifest metadata and prefix component paths with `./` (ADR-001)

**Choice**: Extend `profile.manifest.keepFields` to keep `name`/`version`/`description`
and add a codex-only manifest post-step that rewrites `skills`, `mcpServers`, `hooks`
string values to a `./`-relative form (`skills/` → `./skills/`, `.mcp.json` →
`./.mcp.json`, `hooks/hooks.json` → `./hooks/hooks.json`). Extend the validator
`ALLOWED_BUNDLE_KEYS` to admit the three metadata keys.
**Alternatives considered**: (a) leave bare paths (rejected — Codex silently drops
`skills`/`mcpServers`/`hooks`, field report §2); (b) synthesize a separate codex
plugin.json by hand (rejected — duplicates the source manifest, drifts).
**Rationale**: The allowlist branch in `reshapeManifest` already exists; keeping three
more keys and normalizing three string values is the smallest change that makes Codex
load the components. Metadata (`name`/`version`/`description`) is required by the host.

### Decision: Fix MCP ids at the source and enforce the regex at validation (ADR-002)

**Choice**: Rename the two ids in the repo's `.mcp.json`
(`io.github.upstash/context7` → `context7`, `microsoft/markitdown` → `markitdown`) so the
generated payload is conformant, and add a validator check that fails when any generated
`.mcp.json` id violates `^[a-zA-Z0-9_-]+$`. No auto-rewrite in the transform.
**Alternatives considered**: codex-only id sanitization in `normalizeMcpPlaceholders`
(rejected — hides drift; the "invalid id fails validation" scenario wants a hard failure,
not a silent fix, and a sanitizer could collide two ids into one).
**Rationale**: Short ids are valid for every target (claude accepted the namespaced form
only incidentally), so a source fix is target-neutral and keeps the validator as a pure
regression gate over the published payload.

### Decision: Codex hook adaptation reuses baseline mechanisms, not a rewrite (ADR-003)

**Choice**: The wrapper emits per-event `{ "matcher": ".*", "hooks": [ { type,
command, commandWindows, timeout } ] }`. `command` keeps the POSIX `"$PLUGIN_ROOT/…"`
form; `commandWindows` is the backslash/`$env:PLUGIN_ROOT` variant. For behavior:
- **PreToolUse ask-degradation** reuses the existing `applyPermissionMode` path (§3.4.1).
  The codex wrapper signals bypass-equivalence via an env flag (`OSPEC_TARGET=codex`) that
  the hook reads to treat the session as `bypassPermissions`, so every `ask` branch
  (AgentShield Step 2, Token Budget 3-4, Git Guard 5b, Spec Drift 5c, ASK table Step 6)
  collapses to `allow` + `systemMessage`. DENY (Step 5) is untouched.
- **SubagentStop** accepts `input.agent_transcript_path` as an alias wherever
  `input.transcript_path` is read (§5.2 fallback + envelope fallback).
- **SessionStart** logic is unchanged (REQ-hooks-007 fixes the contract as
  target-independent); host-envelope wrapping stays a transport detail of the wrapper.
**Alternatives considered**: a standalone `codex-hook-adapter.js` translating the full
wire contract (rejected — reinvents `applyPermissionMode`, duplicates parity-tested logic,
and the specs push behavior into the hooks themselves).
**Rationale**: "Reuse, do not reinvent" (task + spec §3.4.1). Env-signalled target keeps
Go/JS parity fixtures assertable against the published payload.

## Data Flow

    source templates ──▶ target-transform (codex profile) ──▶ dist/codex/**
        │  .mcp.json         manifest: keepFields+./ prefix        plugin.json
        │  hooks.json        hooks: matcher+commandWindows          hooks/hooks.json
        │  *.agent.md        agents: TOML (outside bundle)          .codex/agents/*.toml
        ▼
    validate-codex.js  (paths ./, no .., MCP regex, TOML keys) ──fail?──▶ non-zero
        ▼ ok
    install-codex.js
        ├─ plugin channel ── marketplace add / /plugins ──▶ ~/.codex/plugins/…
        └─ agent channel  ── copyCodexAgents ────────────▶ ~/.codex/agents/*.toml
                                                (never writes .codex/config.toml)
    new task ──▶ SessionStart (env OSPEC_TARGET=codex) ──▶ standard contract

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `.mcp.json` | Modify | Rename ids to `context7` / `markitdown` (ADR-002). |
| `scripts/lib/target-profiles/codex.js` | Modify | `keepFields` += name/version/description; declare `./`-prefix and `commandWindows` intent for hooks. |
| `scripts/lib/target-transform.js` | Modify | `reshapeManifest` codex branch prefixes component paths with `./`; `codexHooks` emits `matcher`+`hooks`+`commandWindows`. |
| `scripts/configure/validate-codex.js` | Modify | Allow metadata keys; add `./`-relative + no-`..` path check and MCP id regex check on generated `.mcp.json`/manifest. |
| `scripts/hooks/pre-tool-use.js` | Modify | Treat `OSPEC_TARGET=codex` as bypass-equivalent for ask-degradation. |
| `scripts/hooks/subagent-stop.js` | Modify | Read `input.agent_transcript_path` alias for transcript fallback. |
| `scripts/configure/install-codex.js` | Modify | Ensure both channels idempotent; assert config.toml untouched (tighten existing behavior). |
| `docs/codex/README.md` | Modify | Add install/update, `/hooks` trust, new-task flow, rollback sections. |
| `scripts/configure/codex-smoke.test.js` | Create | Build payload → temp install → skill→orchestrator→SessionStart assertion, in `npm test`. |
| Go hooks parity (`internal/…` if present) | Modify | Mirror JS field/env changes for parity fixtures (§8a). |

## Interfaces / Contracts

Generated `hooks/hooks.json` per event:

```json
{ "hooks": { "PreToolUse": [ { "matcher": ".*", "hooks": [ {
  "type": "command",
  "command": "node \"$PLUGIN_ROOT/scripts/hooks/ospec-hooks-launch.js\" pre-tool-use",
  "commandWindows": "node \"%PLUGIN_ROOT%\\scripts\\hooks\\ospec-hooks-launch.js\" pre-tool-use",
  "timeout": 10 } ] } ] } }
```

`PLUGIN_DATA` is inherited by the launched Node process unchanged (no re-encoding);
the wrapper never reads or rewrites it, satisfying "propagated intact".

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | manifest `./`-prefix, MCP regex, matcher/commandWindows emission | assert transform output for a codex fixture |
| Unit | validator: bad path / `..` / invalid MCP id → error, non-zero | drive `validate()` over a temp tree (self-generated, never gitignored `dist/`) |
| Unit | PreToolUse ask→allow+systemMessage under `OSPEC_TARGET=codex`; DENY unchanged | existing pre-tool-use test harness |
| Unit | SubagentStop resolves from `agent_transcript_path` | temp JSONL transcript |
| Integration | POSIX vs Windows command resolves (path-separator/quoting) | assert both command strings; parity fixtures §8a |
| E2E (smoke) | generated+installed payload: skill→orchestrator→SessionStart contract | `codex-smoke.test.js` in `npm test`, run against built payload (no live CLI) |

## Migration / Rollout

No data migration. Deliver as work-unit/PR slices (proposal Approach), reversible in
reverse order by republishing the last valid payload and restoring managed TOML agents.
`.codex/config.toml` is never written. `delivery-strategy=exception-ok` is approved in
`state.yaml`.

## Open Questions

- [ ] None blocking. The live-CLI smoke (`codex exec --ephemeral`) stays a manual field
  check; the `npm test` smoke asserts payload/contract correctness without the binary.
