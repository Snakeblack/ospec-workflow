# ADR-001: Rules emitted as a synthesized AGENTS.md, not injected per-agent

- Status: accepted
- Change: codex-target-profile
- Date: 2026-07-08

## Context

`rules/*.instructions.md` are always-on cross-cutting guidance. `specs/codex-target/spec.md`
REQ-codex-target-006 deliberately defers, to this ADR, whether that content is folded into an
emitted `AGENTS.md` or injected into each agent TOML's `developer_instructions`. Codex has no
native "instructions" array (unlike VS Code `applyTo` or opencode `instructions`), but it does
read `AGENTS.md` in layers automatically.

## Decision

Add a new `rules.strategy: "to-agents-md"` value to the generator's existing rules dispatch. The
codex profile uses it: all `rules/*.instructions.md` bodies (after tool-name and agent-name
substitution) are concatenated into a single synthesized `AGENTS.md` at the output root, built
via the existing `collectRules` accumulation pattern. No codex-only branch outside the
`rules.strategy` dispatch (REQ-codex-target-006 compliance).

## Alternatives

- Inject concatenated rules into every agent TOML `developer_instructions`: duplicates the rules
  text across ~21 agents, bloats each file, must be re-synced on every rules edit, and leaves the
  commands→skills outputs with no rules coverage.
- Reuse `inline-into-orchestrator`: for codex the orchestrator is emitted as an agent TOML (not a
  skill), so there is no single orchestrator skill to inline into, and it would not cover the main
  thread or spawned subagents.

## Consequences

Easier: one DRY source of truth; Codex auto-loads it for the main thread and every spawned
subagent with zero config; matches Codex's native layered-instructions model. Harder: `AGENTS.md`
is repo-level, so the installer (5.3) must place it in the target repo (the generator emits it to
`dist/codex/AGENTS.md`, ready). Reversible: switching to per-agent injection later is a localized
profile + emitter change; the `rules.strategy` seam already isolates it.
