# ADR-003: Canonical advisory cohort reporting

- Status: proposed
- Change: cx0-context-measurement
- Date: 2026-09-01

## Context
CX0 must produce reproducible P50/P90 by four dimensions and test roadmap hypotheses without becoming a gate or policy input.

## Decision
Sort cohort identities and eligible values canonically, use nearest-rank P50/P90, emit coverage and source composition, and evaluate the machine-readable CX0 hypothesis registry as supported, contradicted, or insufficient evidence. Pin report-only duplication-share and fallback-rate formulas; require compatible reference cohorts for reduction claims. Keep report APIs disconnected from benchmark scoring, routing, authority, and release policy.

## Alternatives
- Runtime iteration order: not portable or byte-reproducible.
- Interpolated percentiles: adds fractional semantics to bounded counters.
- Pass/fail assertions: prematurely converts hypotheses into gates.

## Consequences
Repeated inputs yield byte-equivalent reports and diagnostic boundaries are mechanically testable. Changing percentile semantics requires a new aggregation version; policy adoption remains a separate future decision.
