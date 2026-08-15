# ADR-003: Typed ClarifyEvent with Descendant-Scoped Transitive Invalidation

- Status: proposed
- Change: k4a-execution-graph-compiler-replay
- Date: 2026-08-15

## Context
Clarification answers received mid-workflow require adjusting execution plans without throwing away valid work or leaving dependent descendant states stale.

## Decision
Process typed `ClarifyEvent` records by computing the transitive closure of affected descendant nodes along DAG dependency edges, strictly invalidating only those nodes while preserving valid ancestor and sibling results.

## Alternatives
- Full graph recompilation: rejected because it wastes execution effort and unnecessarily resets completed, unaffected work.
- Ad-hoc node patch: rejected because it risks leaving dependent downstream nodes un-invalidated and inconsistent.

## Consequences
- Easier: Minimizes wasted work during clarifications while guaranteeing causal dependency correctness.
- Harder: Requires strict topological graph traversal and cycle detection algorithms.
- Reversibility: Easily modifiable in graph traversal algorithms.
