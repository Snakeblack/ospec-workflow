# ADR-006: Hardened Multi-Dimensional Shadow Comparison Baseline

- Status: proposed
- Change: k4a-remediation-v2-45-1
- Date: 2026-08-15

## Context
Shadow execution comparison only evaluated steps and allowed paths between compiled graphs and the baseline route, allowing divergences in invariants, obligations, dependencies, or ownership to go undetected.

## Decision
Harden `compareShadowExecution` / `compareShadowDecisions` to perform deep comparison across invariants, obligations, dependencies, ownership, steps, and allowed paths. Maintain strict observer isolation via `structuredClone()` to ensure zero active state or journal mutation.

## Alternatives
- Comparing steps and paths only: rejected because semantic changes in invariants and ownership were not flagged in shadow telemetry.
- Inline state tracking: rejected because shadow comparison must never mutate active workflow state.

## Consequences
- Easier: Exhaustive telemetry diffs detect any subtle routing divergence between baseline and graph compiler.
- Harder: Baseline mocks and fixtures must define expected invariants and ownership structures when evaluating multi-dimensional equivalence.
- Reversibility: Easily reversible within shadow comparator module.
