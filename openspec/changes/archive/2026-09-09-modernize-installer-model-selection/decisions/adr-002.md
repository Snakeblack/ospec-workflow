# ADR-002: Profile-owned selection and reasoning emission

- Status: proposed
- Change: modernize-installer-model-selection
- Date: 2026-09-07

## Context

GitHub Copilot currently lacks model injection; Antigravity has an injection profile despite inherited installer behavior. Reasoning support is split between Codex-specific Go logic and transform code.

## Decision

Declare selection, native field allowlists, and catalog/default aliases in target profiles. Give GitHub Copilot explicit VS Code catalog/default parity with target-scoped IDs. Disable Antigravity selection/injection. Validate selected metadata before writes and clear stale source reasoning fields before emitting supported values; OpenCode absence emits an empty variant.

## Alternatives

- Expand adapter target sets only: generator and installer can disagree.
- Infer support from a models.yaml column: informational Antigravity data could activate unsupported behavior.

## Consequences

Profile changes become the explicit support boundary. Transform tests must pin omission and stale-value behavior. The change is reversible through profiles and transform policy without changing installer transaction ownership.
