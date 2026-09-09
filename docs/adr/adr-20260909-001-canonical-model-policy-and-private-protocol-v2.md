# ADR-001: Canonical model policy and private protocol v2

- Status: proposed
- Change: modernize-installer-model-selection
- Date: 2026-09-07

## Context

The adapter currently accepts decoded custom IDs, while Go fabricates Codex effort choices. The approved finite-choice and fresh-plan requirements need one policy owner across planning and generation.

## Decision

Normalize and validate static catalogs, capabilities, groups, and presets in the existing Node model resolver. Extend the private Go/Node protocol to v2 with opaque target-scoped IDs and explicit mode/control selections. Preserve legacy catalog inputs and native model representations.

## Alternatives

- Retain Go native-value construction: duplicates capability policy and allows unsupported selections.
- Encode the hierarchy without a version change: old binaries can silently ignore required state.

## Consequences

Go/Node updates must ship together; mismatches fail explicitly. Both planning and configure share validation. Reversal requires restoring both wire endpoints, while legacy source configuration remains readable.
