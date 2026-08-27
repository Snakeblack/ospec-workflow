# ADR-003: Derived Assurance Graph with selective invalidation

- Status: proposed
- Change: k6b-verifier-evidence-assurance-graph
- Date: 2026-08-27

## Context

K6b must connect requirements, graph nodes, Candidate, evidence, and verification reproducibly while preserving OpenSpec, Git, and Candidate as semantic authority. A successor should invalidate dependent evidence without discarding unrelated evidence.

## Decision

Materialize `assurance-graph/v1` as a read-only content-addressed projection. Canonicalize, sort, and deduplicate nodes and the four allowed edge relations before a domain-separated digest. Reconciliation recomputes from canonical inputs and fails closed on divergence.

Selective invalidation starts from changed Candidate/source subjects and traverses `derived-from`, `verified-by`, `satisfies`, and `invalidates` dependencies with cycle-safe closure. Reachable evidence becomes stale; unreachable evidence remains valid.

## Alternatives

- Mutable authoritative graph store: rejected because it creates split-brain lifecycle and approval state.
- Full re-verification for every successor: rejected because it discards independently valid evidence.
- Invalidate direct neighbors only: rejected because transitive stale evidence could be reused.

## Consequences

Equivalent inputs always reproduce the same graph and edge set, and successor cost is proportional to the affected closure. Edge direction and canonicalization become compatibility-sensitive. The graph cannot authorize lifecycle, approval, attestation, or delivery; K9 alone may later evaluate equivalence manifests.
