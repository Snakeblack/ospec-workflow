# ADR-001: Canonical Structural Inventory Boundary

- Status: proposed
- Change: k6d-complexity-architecture-delta
- Date: 2026-08-31

## Context

K6d must compare nine structural dimensions reproducibly across hosts. Live
filesystem or language-specific analysis would make report identity depend on the
collector environment, while numeric totals would lose reviewable facts.

## Decision

K6d consumes closed, pre-digested `{ id, digest }` inventories for base and
Candidate. Every dimension is explicitly `observed` or `unavailable`; the core
sorts and validates inventories before hashing and computes additions, removals,
and changed digests without reading live repository state.

## Alternatives

- Scan the repository inside K6d: rejected because tool and host versions enter identity.
- Accept raw ASTs: rejected because they are language-specific and unstable.
- Accept totals only: rejected because they cannot explain the delta.

## Consequences

Core reports are reproducible and collectors can evolve independently. Producers
must resolve and digest facts before K6d; changing this boundary later changes the
canonical input contract and is costly.
