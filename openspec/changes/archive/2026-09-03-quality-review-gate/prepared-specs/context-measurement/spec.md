# Context Measurement Specification

## Requirements

### Requirement: Versioned Coverage-Aware Context Measurement Records {#REQ-context-measurement-001}

The system MUST persist a versioned CX0 measurement record for each supported
phase dispatch. A record MUST identify phase, classification, profile, host, and
observed time, and MAY bind an observable Candidate. Each reported metric MUST
include its value, source (`host-observed`, `runtime-derived`, or `estimated`),
and field coverage. It MUST distinguish input/cached/uncached/output tokens,
artifact reads/writes, tool output, unique/duplicated context, amplification,
and reason-coded fallback. It MUST store bounded counts and approved identifiers,
not prompt, artifact, tool-output, or model-output payloads.

#### Scenario: Fully observed dispatch produces an attributable record

- GIVEN a supported dispatch whose host exposes token and artifact counters
- WHEN CX0 persists its measurement
- THEN each available counter MUST include its value, source, and coverage
- AND the record MUST identify the phase, classification, profile, and host

### Requirement: Context KPIs Preserve Measurement Semantics {#REQ-context-measurement-002}

The system MUST derive unique context, duplicated context, and amplification
only from compatible covered inputs. Amplification MUST use formula version
`amplification/v1` and equal `(unique_context + duplicated_context) /
unique_context`. Its numerator MUST contain only the compatible covered unique
and duplicated context components; output tokens and artifact or tool counters
MUST remain separate metrics. Amplification MUST be available only when both
components are available, compatible, and covered and `unique_context > 0`.
Every KPI MUST declare formula version and derived coverage. Missing,
incompatible, partially available, or zero-denominator inputs MUST yield
unavailable with a stable reason code, never inferred savings from legacy
zero-filled data. Fallback MUST have a stable reason code and MUST NOT be a
token measure.

#### Scenario: Covered and incomplete inputs preserve KPI semantics

- GIVEN a record with compatible covered `unique_context` and
  `duplicated_context` inputs
- WHEN the amplification KPI is derived
- THEN it MUST equal `(unique_context + duplicated_context) / unique_context`
  under formula version `amplification/v1`
- AND the result MUST include derived coverage
- AND its source MUST identify it as runtime-derived

### Requirement: Deterministic Cohort Percentiles With Coverage {#REQ-context-measurement-003}

The system MUST aggregate immutable CX0 records deterministically into cohorts
keyed by phase, classification, profile, and host. Eligible metrics MUST report
P50/P90, cohort size, eligible/unavailable counts, source composition, and
formula version. Identical valid records and version MUST produce byte-equivalent
results. A metric with no eligible observations MUST be unavailable, not zero.

#### Scenario: Equivalent inputs yield equivalent cohort percentiles

- GIVEN two aggregation runs with the same valid CX0 records and version
- WHEN each run groups records by all required cohort dimensions
- THEN their P50/P90 values and coverage summaries MUST be byte-equivalent

#### Scenario: Cohort contains only unavailable metric values

- GIVEN a host cohort whose tool-output metric is unavailable in every record
- WHEN the report is generated
- THEN that metric's P50 and P90 MUST be unavailable
- AND the report MUST state the cohort and unavailable-observation counts

### Requirement: Hypothesis Comparison Is Advisory Only {#REQ-context-measurement-004}

The system MUST compare each declared CX0 hypothesis against coverage-aware
cohorts and label it supported, contradicted, or insufficient evidence. The
comparison MUST cite scope, aggregation version, and coverage. CX0 MUST NOT
approve/reject a Candidate, alter budgets/defaults, route/block work, grant
authority, or promote `full` to a compiled form.

#### Scenario: Evidence contradicts a CX0 hypothesis

- GIVEN a hypothesis and covered cohort results that contradict it
- WHEN CX0 publishes the comparison
- THEN it MUST label the hypothesis contradicted with its coverage basis
- AND no gate, routing, or authority decision MUST change

### Requirement: CX0 Is Additive and Non-Authoritative {#REQ-context-measurement-005}

CX0 records and reports MUST be additive and compatible with legacy phase-cost readers. A legacy zero fallback MAY remain readable, but MUST NOT become host-observed CX0 evidence without field provenance and coverage. CX0 MUST NOT modify semantic authorities, assurance guarantees, K6d, or route-critical behavior. Quality Review KPI derivation MUST reuse CX0 and phase-cost inputs only; it MUST NOT introduce a parallel telemetry subsystem.

(Previously: did not name Quality Review KPI reuse explicitly.)

#### Scenario: Legacy phase-cost data remains readable

- GIVEN a legacy phase-cost row that omits CX0 provenance and coverage
- WHEN a compatible reader processes the row beside CX0 records
- THEN the legacy row MUST remain readable
- AND it MUST NOT supply observed CX0 evidence for an unavailable field

#### Scenario: Quality KPI module reuses existing rows

- GIVEN CX0 and phase-cost records exist for a completed gate
- WHEN Quality Review KPIs are derived
- THEN derivation MUST read those existing stores only
- AND MUST NOT require a new persistence file or pipeline

### Requirement: Quality Review Gate KPIs via CX0 and Phase Cost {#REQ-context-measurement-006}

The system MUST derive Quality Review Gate success metrics from existing CX0 records and legacy `phase-costs.jsonl` rows without creating a second measurement pipeline. Required KPIs MUST be attributable per gate invocation:

| KPI | Meaning |
|-----|---------|
| `semantic_router_invocation_rate` | Share of gates that invoked `review-change` |
| `specialists_per_gate` | Count of quality specialists dispatched |
| `zero_model_gate_rate` | Share of sufficient classifications completing with zero model calls |
| `full_review_rate` | Share of gates dispatching all four quality specialists |
| `tokens_per_quality_gate` | Estimated tokens summed across gate-related dispatches |
| `tokens_per_finding` | Gate tokens divided by blocking findings when findings exist |
| `router_delta_rate` | Share of `review-change` invocations that added ≥1 domain not selected deterministically |

Each KPI MUST declare source (`host-observed`, `runtime-derived`, or `estimated`), coverage, and unavailable reason codes when inputs are missing. CX0 MUST remain additive and non-authoritative: these KPIs MUST NOT approve candidates, alter routing, or override gate verdicts.

#### Scenario: Zero-model gate is measurable

- GIVEN a gate completes with sufficient classification and no review dispatches
- WHEN KPI derivation runs
- THEN `zero_model_gate_rate` numerator MUST include that gate
- AND `semantic_router_invocation_rate` MUST record zero router invocation for it

#### Scenario: Router delta counts semantic additions

- GIVEN deterministic selection is `[runtime]` and `review-change` adds `evolution`
- WHEN `router_delta_rate` is computed
- THEN that invocation MUST count as a router delta
- AND `specialists_per_gate` MUST reflect the final union dispatch count

#### Scenario: Missing cost data yields unavailable KPI fields

- GIVEN phase-cost rows omit token estimates for a gate dispatch
- WHEN KPI derivation runs
- THEN affected token KPIs MUST be unavailable with stable reason codes
- AND derivation MUST NOT invent host-observed values from legacy zero fallbacks

#### Scenario: CX0 KPIs do not alter routing

- GIVEN KPI results contradict an expected cost reduction hypothesis
- WHEN CX0 publishes the comparison
- THEN no gate, routing, or archive decision MUST change because of the KPI alone

