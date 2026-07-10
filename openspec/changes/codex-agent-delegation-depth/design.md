# Design: Codex Agent Delegation Depth

## Technical Approach

Use the existing profile-to-transform flow. `codex.js` provides an
`agentSettings` object; `handleAgentToml` carries it with normal scalar fields;
`serializeAgentToml` serializes it after the multiline instruction value as an
`[agents]` TOML table. This allocates both MUST scenarios in
`REQ-codex-target-002` to the generator and its generated-output tests.

## Architecture Decisions

### Decision: Profile-owned, uniform depth

**Choice**: Set `{ max_depth: 1 }` once in the Codex target profile.
**Alternatives considered**: Add agent-frontmatter fields; rely on a user global default.
**Rationale**: The limit is target behavior, must apply uniformly, and must not be overridden by unrelated global workflow configuration.

### Decision: Serialize a typed TOML table

**Choice**: Serialize integer settings in `[agents]` after `developer_instructions`.
**Alternatives considered**: Encode depth inside prose; emit a scalar dotted key.
**Rationale**: This is native TOML, keeps instructions unchanged, and is directly inspectable by host tooling.

## Data Flow

    codex profile agentSettings
              -> handleAgentToml fields
              -> serializeAgentToml [agents]
              -> generated TOML / fixtures / smoke assertions

`models.yaml` independently selects the orchestrator's `default` model tier.
The TDD evidence is included as documentation only and has no flow into the
generator or MCP installer.

## File Changes

| File | Action | Description |
|---|---|---|
| `scripts/lib/target-profiles/codex.js` | Modify | Declare uniform max depth. |
| `scripts/lib/target-transform.js` | Modify | Preserve and serialize typed settings. |
| `scripts/lib/target-transform.test.js` | Modify | Assert generated table. |
| `scripts/configure/{codex-smoke,real-repo}.test.js` | Modify | Parse trailing TOML settings; assert depth in smoke. |
| `scripts/configure/__fixtures__/golden/codex/**` | Modify | Record expected generated output. |
| `models.yaml` | Modify | Use default tier for orchestrator. |
| `docs/testing/codex-mcp-idempotency.tdd.md` | Create | Retained non-normative historical evidence. |

## Interfaces / Contracts

```toml
developer_instructions = """..."""

[agents]
max_depth = 1
```

The serializer MUST reject non-integer or negative settings values. No public
MCP, marketplace, or user configuration interface changes.

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Unit | Profile setting and typed serialization | `target-transform.test.js` |
| Integration | Parser accepts trailing table | `real-repo.test.js` |
| Smoke | Installed orchestrator TOML contains depth | `codex-smoke.test.js` |
| Regression | Expected generated content | golden fixtures and `npm test` |

## Migration / Rollout

No migration required. Regenerate or reinstall the Codex output to receive the
setting. Existing user configs are untouched.

## Open Questions

- [ ] None; full-suite verification remains pending.
