# ADR-008: Hardened Multi-Dimensional Shadow Comparison Baseline

- Status: proposed
- Change: k4a-integrity-and-bindings-remediation
- Date: 2026-08-16

## Context
`compareShadowExecution` evaluated shadow compiled graphs against the fixed baseline without prior cryptographic binding validation, and lacked clear discrimination between complete matches and partial matches across all semantic graph dimensions.

## Decision
Enforce `validateExecutionGraphBinding(compiledGraph)` fail-closed at the entry of `compareShadowExecution()`, and evaluate side-by-side equivalence across six dimensions: steps, allowed_paths, invariants, obligations, dependencies, and ownership, returning `match: true` with `telemetryDiff: null` for complete matches and structured divergence telemetry for partial matches.

## Alternatives
- Unvalidated shadow evaluation: rejected because evaluating invalid graphs against baseline yields invalid telemetry.
- Step-only comparison: rejected because invariant or obligation divergences must be detected during shadow execution.

## Consequences
- Easier: Guarantees that shadow comparison observes only valid graphs and provides rich multi-dimensional divergence telemetry.
- Harder: Inputs to shadow comparison must pass strict binding validation.
- Reversibility: Medium; enhances observability without mutating active execution state.
