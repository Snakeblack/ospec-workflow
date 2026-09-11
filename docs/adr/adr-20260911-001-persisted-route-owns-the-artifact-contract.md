# ADR-001: Persisted Route Owns the Artifact Contract

- Status: proposed
- Change: compact-lite-contract-and-consumer-compatibility
- Date: 2026-09-10

## Context

Lite intentionally omits spec and design, but its five producers, consumers, recovery path, archive runtime, and generated targets must agree on which artifacts exist. Launch-mode prose is not durable across restart.

## Decision

Use `state.yaml.route.actual_route` plus the configured phase list as the authority for artifact prerequisites. `lite` requires `proposal-lite.md`, tasks, accumulated apply progress, and independent verification as phases advance; routes declaring spec/design retain them. Archive schema v1 remains unchanged and validates route minimums before its existing exact-byte checks.

## Alternatives

- Trust launch parameters: rejected because they can conflict with persisted continuation state.
- Emit empty spec/design artifacts: rejected because they fabricate work and measurement.
- Add a new state or plan schema: rejected because the existing route and inventory already carry the needed authority.

## Consequences

Recovery and archive fail closed on missing route artifacts, while legitimate lite absence no longer fails. Source and six generated targets need parity tests. The decision is reversible by restoring coordinated producer/consumer rules without migrating stored data.
