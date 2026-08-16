# ADR-007: Consolidated DAG Cycle Detection and Topological Sort Utility

- Status: proposed
- Change: k4a-integrity-and-bindings-remediation
- Date: 2026-08-16

## Context
Multiple modules in `scripts/lib/execution-graph/` (`compiler.js`, `clarify.js`, `work-order-compiler.js`, `replay-engine.js`) maintained duplicate or divergent implementations of cycle detection and topological sorting algorithms. This led to code bloat and risk of algorithmic divergence.

## Decision
Create `scripts/lib/execution-graph/dag.js` as the single canonical source of truth for graph algorithms, exporting `hasCycle(nodes)` (using 3-state DFS coloring) and `topologicalSort(nodes)` (using Kahn's algorithm), and refactor all subsystem modules to consume it.

## Alternatives
- Inlined private implementations in each module: rejected due to duplication and divergence risk.
- External NPM graph library: rejected to keep kernel dependencies minimal and zero-dependency.

## Consequences
- Easier: Single tested implementation for cycle detection and topological sorting across the entire graph subsystem.
- Harder: None.
- Reversibility: High; clean internal module consolidation.
