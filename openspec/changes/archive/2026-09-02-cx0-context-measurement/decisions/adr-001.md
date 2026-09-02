# ADR-001: Separate CX0 telemetry from legacy phase costs

- Status: proposed
- Change: cx0-context-measurement
- Date: 2026-09-01

## Context
Legacy phase-cost rows use zero-compatible estimated counters and carry an existing attestation contract. CX0 must represent unavailable fields honestly without breaking those readers or making telemetry canonical state.

## Decision
Persist CX0 records in append-only `.ospec/session/{change}/context-measurements.jsonl` through the existing locked-file pattern. Emit after the legacy phase-cost append and isolate all CX0 failures.

## Alternatives
- Extend `phase-costs.jsonl`: couples new coverage semantics to legacy zero behavior and attestation.
- Replace O1: breaks backward compatibility.
- Store under `state.yaml`: incorrectly promotes observations into workflow authority.

## Consequences
Legacy compatibility and rollback are simple, and CX0 absence cannot alter execution. Consumers must join two evidence streams explicitly when they need both; retiring either stream requires a later migration.
