# ADR-002: Pre-Evaluation Route Eligibility Filtering via Route Metadata

- Status: proposed
- Change: live-routing-eligibility-and-risk-floors
- Date: 2026-09-05

## Context
In active repositories (`project.status: active`), `standard` evaluates before `lite` and matches unconditionally, shadowing `lite` even when the change is classified as `trivial` or `small`. Moving routes around in YAML does not solve classification filtering or protect custom routes.

## Decision
Filter candidate routes against their declared `route.classification` metadata before evaluating `route.conditions`. A route is ineligible for selection unless its declared classification list contains the resolved change classification.

## Alternatives
- Reorder routes in `openspec/config.yaml` only: rejected because `standard` would still match if `lite` conditions fail, and `lite` would shadow `standard` without resolving `trivial`.
- Hardcoded route name heuristics in dispatcher code: rejected because it violates declarative configuration principles and breaks custom route extensibility.

## Consequences
Decouples route condition matching from classification eligibility. Enables `lite` to be safely selected in active projects when classified as `trivial` or `small`, while preventing `standard` from matching small changes. High reversibility via configuration and helper logic.
