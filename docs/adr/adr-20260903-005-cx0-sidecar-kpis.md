# ADR-005: Quality Review KPIs as CX0 Sidecar

- Status: proposed
- Change: quality-review-gate
- Date: 2026-09-03

## Context

Slice 6 requires seven gate KPIs (`router_delta_rate`, tokens per gate/finding, specialist counts, zero-model and full-review rates). CX0’s required `METRICS` set is closed; adding columns would invalidate existing records. A parallel telemetry pipeline is out of scope.

## Decision

Add `scripts/lib/quality-review-kpis.js` as a pure derivation over existing CX0 records, `phase-costs.jsonl` rows, and the Quality Review gate audit. KPI envelopes reuse CX0 `available|unavailable` / `source` / `coverage` / `reason_code` with `formula_version: quality-review-kpis/v1`. No new persistence file. Legacy phase-cost zeros must not become host-observed. KPIs must not import into routing or lineage modules.

## Alternatives

- Extend CX0 `METRICS` — breaks every stored CX0 document.
- New JSONL pipeline — forbidden parallel subsystem.

## Consequences

Archive/eval reports can print KPIs without changing gate verdicts. Token KPIs degrade to `unavailable` when estimates are missing. `review-change` model tier stays empirical, driven later by `router_delta_rate`.
