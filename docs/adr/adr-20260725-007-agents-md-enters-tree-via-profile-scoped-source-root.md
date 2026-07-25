# ADR-002: AGENTS.md enters the tree via a profile-scoped source root

- Status: accepted
- Change: cursor-native-target
- Date: 2026-07-25

## Context

`agents-protocol.mdc` must be generated from the repository `AGENTS.md`, but `AGENTS.md` is
not in the generator's `SOURCE_ROOTS`, so the transform never sees it. The `codex` profile
already *synthesizes* its own root `AGENTS.md` from the `to-agents-md` rules strategy.

## Decision

Add an optional `profile.sourceRoots` array; `runConfigure` loads
`[...SOURCE_ROOTS, ...(profile.sourceRoots || [])]`. Only the `cursor` profile declares
`["AGENTS.md"]`, and `handleFile` routes a path listed in `rules.synthesize` to the `to-mdc`
emitter before the generic `.md` passthrough branch.

## Alternatives

- Add `AGENTS.md` to the global `SOURCE_ROOTS` and `drop` it in the other five profiles —
  changes four committed goldens and risks colliding with the codex-synthesized `AGENTS.md`.
- Read `AGENTS.md` inside the transform — breaks the transform's purity contract (no IO).

## Consequences

New per-target source files become a one-line profile declaration with zero blast radius on
other targets. The generator gains one more profile field to document. Fully reversible:
removing the field falls back to the shared root list.
