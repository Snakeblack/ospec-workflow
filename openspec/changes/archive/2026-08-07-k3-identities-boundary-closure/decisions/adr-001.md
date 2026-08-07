# ADR-001: Canonical Candidate/WorkOrder v2 Schema Publication

- Status: proposed
- Change: k3-identities-boundary-closure
- Date: 2026-08-07

## Context
v2 schemas were published under wrong trees `candidate-v2/` and `work-order-v2/` with `$id` values `ospec://schemas/kernel/*-v2/v2`, and were never registered in `manifest.json` / `contract-claims.json`.

## Decision
Publish at `schemas/kernel/candidate/v2.schema.json` and `schemas/kernel/work-order/v2.schema.json` with `$id` `ospec://schemas/kernel/candidate/v2` and `ospec://schemas/kernel/work-order/v2`. Register as manifest/claims keys `candidate-v2` / `work-order-v2` pointing at those paths. Delete the wrong directory layouts and migrate fixtures/tests.

## Alternatives
- Keep `candidate-v2/` filesystem layout — rejected; violates canonical path contract.
- Overwrite the v1 `candidate` / `work-order` manifest entries — rejected; breaks K1 pin inventory.

## Consequences
`loadSchemaById` can resolve v2 by `$id`. Callers and `k3-schema-fixtures.test.js` must update paths. Manifest/claims digests in `K1_SCHEMA_BASELINE` must be refreshed after the registry edit (not a pin-only v1 retarget).
