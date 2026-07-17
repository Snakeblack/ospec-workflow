# ADR-001: Deterministic classifier owns specialist selection

- Status: accepted
- Change: selective-4r-generalist-review
- Date: 2026-07-16

## Context
O4 requires identical, auditable reviewer selection across five targets while preserving target-native orchestration.

## Decision
Use one dependency-free pure CommonJS module to normalize evidence, validate the generalist decision, derive four dimension decisions, apply classification caps, and validate the final contract. Candidate strength is the best numeric evidence precedence; equal-precedence candidates use canonical dimension order `risk,reliability,resilience,readability`. Reason source/code/detail ordering applies only within a dimension. Agents do not reinterpret selection.

## Alternatives
- Generalist-only selection: non-deterministic and gives the agent excessive authority.
- Gate prose in each target: duplicates policy and invites target drift.
- Unconditional fallback 4R: violates normal caps and fail-closed behavior.

## Consequences
Selection becomes reproducible and cheaply unit-testable, including equal-precedence ties. The signal catalog and schema become a cross-cutting contract that must evolve deliberately. Reversal is straightforward by restoring unconditional dispatch, but historical audit entries remain readable.
