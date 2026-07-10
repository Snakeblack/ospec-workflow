# Proposal: Codex Agent Delegation Depth

## Intent

Make the generated Codex agent configuration enforce the intended single
coordinator-to-worker delegation boundary, while routing the Codex orchestrator
through the default model tier. The worktree also contains retained TDD evidence
from earlier MCP idempotency work; it is bundled delivery documentation, not a
new MCP behavior contract.

## Scope

### In Scope
- Emit `[agents] max_depth = 1` in every generated Codex agent TOML.
- Validate TOML serialization through unit, real-repository, smoke, and golden
  fixture coverage.
- Route `sdd-orchestrator` to the `default` model tier in `models.yaml`.
- Include `docs/testing/codex-mcp-idempotency.tdd.md` as non-normative delivery
  evidence, preserving its historical RED/GREEN record without changing MCP code.

### Out of Scope
- Changing MCP payloads, marketplace installation, or user-level Codex config.
- Raising or making the depth configurable per user, agent, or runtime.
- Reworking other target profiles or model routing.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `codex-target`: generated agent TOML constrains delegation depth.

## Approach

Declare profile-owned agent settings, pass them through the existing TOML
serializer, and append a TOML table after `developer_instructions`. Keep parser
fixtures tolerant of trailing tables. Treat the model routing and TDD note as
bounded delivery files rather than additional behavioral domains.

## Affected Areas

| Area | Impact | Description |
|---|---|---|
| `scripts/lib/target-profiles/codex.js` | Modified | Codex depth setting. |
| `scripts/lib/target-transform.js` | Modified | TOML settings-table serialization. |
| `scripts/configure/**`, fixtures | Modified | Regression assertions and golden TOML. |
| `models.yaml`, `docs/testing/**` | Modified/New | Delivery routing and non-normative evidence. |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| TOML consumers assume instructions are last | Medium | Make local parsers stop at the closing delimiter and cover generated output. |
| Depth prevents required nested delegation | Low | Set `1`, allowing coordinator to dispatch one worker; revert profile setting if incompatible. |

## Rollback Plan

Revert the profile setting, serializer block, fixtures/tests, model mapping, and
bundled evidence in one commit; generated agents return to host defaults.

## Dependencies

- The archived Codex target and MCP changes remain the baseline; this change does not reopen them.

## Success Criteria

- [ ] Generated Codex agents contain valid `[agents]` TOML with `max_depth = 1`.
- [ ] The full test suite passes before commit/PR.
- [ ] Delivery documentation is included without asserting new MCP requirements.
