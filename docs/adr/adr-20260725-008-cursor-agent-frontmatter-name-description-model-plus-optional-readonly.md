# ADR-003: Cursor agent frontmatter is name/description/model plus optional readonly

- Status: accepted
- Change: cursor-native-target
- Date: 2026-07-25

## Context

Source agents declare `tools`, `target`, `user-invocable`, and `disable-model-invocation`
frontmatter. The verified live `~/.cursor/agents/*.md` files carry only `name`,
`description`, `model`, and `readonly`. REQ-generator-008 requires `readonly: true` on the six
`review-*` agents and forbids it on every other agent.

## Decision

The cursor profile strips `tools`, `target`, `user-invocable`, and
`disable-model-invocation`. `readonly: true` is emitted only for the ids listed in
`profile.agentReadonly.agents` (the six reviewers); the key is omitted for all other agents.
`model` comes from the `models.yaml` `cursor:` column via the existing `resolveModel`.

## Alternatives

- Keep a Cursor-mapped `tools:` array — unverified frontmatter key on this host; the abstract
  grants have no confirmed Cursor semantics.
- Emit `readonly: false` for non-reviewers, as `sync-cursor.js` did — noise, and the negative
  marker is not required by any requirement.
- Derive readonly from a `tools` grant lacking `edit` — an implicit heuristic that silently
  flips an agent's write capability when its grants change.

## Consequences

Emitted agents match the only layout observed working, and reviewer read-only status is
auditable from one explicit list. Tool grants are no longer expressed per agent on Cursor
(host defaults apply). Reversible: re-adding `tools` means removing one strip key, since
`mapToolsFrontmatter` already handles the mapping.
