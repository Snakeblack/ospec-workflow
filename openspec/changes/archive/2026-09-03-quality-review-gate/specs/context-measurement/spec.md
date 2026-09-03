# Delta for context-measurement

## ADDED Requirements

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

## MODIFIED Requirements

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
