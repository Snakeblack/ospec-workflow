# ADR-002: Coverage-aware metric union and versioned formulas

- Status: proposed
- Change: cx0-context-measurement
- Date: 2026-09-01

## Context
Host capabilities differ and historical zero-filled values cannot distinguish measured zero from missing data. Derived context KPIs also need reproducible semantics.

## Decision
Define a closed `ospec-context-measurement/v1` record whose metric slots discriminate `available` from `unavailable`, carry source and coverage, and forbid payload content. Pin amplification to `amplification/v1 = (unique_context + duplicated_context) / unique_context` with strict complete-input and positive-denominator eligibility.

## Alternatives
- Nullable numeric fields: lose reason and source semantics.
- Flat zero defaults: turn absence into false evidence.
- Unversioned derived values: make later formula changes indistinguishable.

## Consequences
Aggregation can exclude missing observations honestly and future formulas require explicit versions. Producers are more verbose and must maintain stable reason codes, but the contract is additive and reversible by disabling emission.
