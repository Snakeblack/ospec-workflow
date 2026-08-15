# ADR-001: Obligation Manifest as an Embedded View in Execution Graph

- Status: proposed
- Change: k4a-execution-graph-compiler-replay
- Date: 2026-08-15

## Context
Contract obligations must be strictly implemented and verified by semantic execution steps. Decoupled or external obligation stores risk divergence between active execution nodes and required contract verifications.

## Decision
Embed the Obligation Manifest directly as an internal view inside the Execution Graph schema (`graph.obligations[]`), enforcing 100% MUST coverage by graph nodes and required evidence at compile time.

## Alternatives
- Standalone external obligation registry: rejected because it introduces synchronization lag and multi-file divergence during invalidation.
- Implicit obligation matching at verification time: rejected because it allows incomplete graphs to compile and execute without advance proof guarantees.

## Consequences
- Easier: Atomic validation and cryptographic integrity of nodes and obligations under a single `GraphId`.
- Harder: Graph compilation fails closed immediately if any contract MUST obligation lacks an implementing node or approved deferral.
- Reversibility: Easily reversible within the schema definitions before downstream slices consume the graph.
