# Delta for orchestrator-evals

## ADDED Requirements

### Requirement: Coverage-Aware CX0 Cohort Reporting {#REQ-orchestrator-evals-007}

The evaluation suite MUST read valid CX0 measurement records and publish
deterministic P50/P90 cohort reports by phase, classification, profile, and
host. It MUST validate the record version, metric source, coverage, metric
dimensions, formula version, and fallback reason before aggregation. It MUST
exclude unavailable values from a metric percentile while reporting their count
and coverage; it MUST NOT coerce unavailable values to zero. Invalid CX0
records MUST be reported as unavailable or rejected according to their contract
without changing benchmark scoring, quality gates, routing, or release policy.

#### Scenario: Mixed-coverage cohort reports percentiles honestly

- GIVEN a cohort with eligible and unavailable amplification measurements
- WHEN the evaluation suite creates its CX0 report
- THEN P50/P90 MUST use only eligible measurements
- AND the report MUST disclose cohort size, eligible count, unavailable count, and source composition

#### Scenario: Invalid record is not admitted as a zero measurement

- GIVEN a CX0 row with an unknown source or missing fallback reason
- WHEN the evaluation suite validates the row
- THEN it MUST reject or mark the row unavailable under the CX0 contract
- AND it MUST NOT contribute zero to a percentile or alter benchmark scoring

#### Scenario: CX0 findings are consumed as advisory diagnostics

- GIVEN a CX0 report that supports or contradicts a roadmap hypothesis
- WHEN the evaluation suite publishes the diagnostic
- THEN it MUST expose the hypothesis outcome and coverage basis
- AND it MUST NOT create a pass/fail gate or change routing, authority, or release policy
