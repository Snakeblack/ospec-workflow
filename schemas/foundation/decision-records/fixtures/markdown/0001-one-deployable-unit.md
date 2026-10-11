# 0001. One deployable unit owns its data

- Status: accepted
- Date: 2026-10-10
- Evidence: schemas/foundation/decision-records/v1.schema.json:1, schemas/foundation/decision-records/v1.schema.json:4

## Context and drivers
A single write path keeps the latency scenario observable. Drivers:
`scenario:latency-under-load` and `constraint:one-team`.

## Options considered
1. One deployable unit: one write path and one failure domain.
2. PostgreSQL per service: rejected here; a product name belongs in the
   technology record.

## Decision
One deployable unit owns its data and its write path.

## Consequences
A second unit needs a new ADR. Independent scaling is not available.

## Fitness function
A dependency rule rejects a domain import of an adapter.

## Review trigger
A second team needs to deploy on its own cadence.
