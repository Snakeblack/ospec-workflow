# ADR-001: Canonical validateExecutionGraphBinding Primitive

- Status: proposed
- Change: k4a-integrity-and-bindings-remediation
- Date: 2026-08-16

## Context
ExecutionGraph structures pass through multiple compilation and verification boundaries (compiler, clarify, work-order-compiler, replay-engine, and shadow-comparator). Without a centralized cryptographic validation gate, tampered graph properties or manipulated GraphId digests could proceed undetected across trust boundaries.

## Decision
Establish `validateExecutionGraphBinding(graph, options)` in `execution-identities` as a pure, non-mutating validation gate that verifies JSON schema conformance, validates snapshot ID formats, checks contextual PolicySnapshot and SourceSnapshot bindings, and recomputes `computeGraphId()` fail-closed on mismatch.

## Alternatives
- Ad-hoc checks in caller modules: rejected due to fragmented validation logic and high risk of graph tampering bypass.
- Trust graph properties without cryptographic recompute: rejected because declared `graph_id` could diverge from its content preimage.

## Consequences
- Easier: Uniform fail-closed tamper detection across all ExecutionGraph ingestion points.
- Harder: Every subsystem must supply complete, valid graph inputs and handle binding error codes.
- Reversibility: Low; foundational cryptographic gate for kernel execution safety.
