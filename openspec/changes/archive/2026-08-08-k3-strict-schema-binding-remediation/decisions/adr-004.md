# ADR-004: Refining K1 Schema Baseline Inventory

- Status: proposed
- Change: k3-strict-schema-binding-remediation
- Date: 2026-08-08

## Context
`K1_SCHEMA_BASELINE` in `scripts/lib/lifecycle-kernel/k1-compat.js` previously included `schemas/kernel/manifest.json` and `schemas/kernel/contract-claims.json`. These registry manifests evolve whenever new schema families or versions (e.g. v2) are registered, causing their pins to drift from the original K1 era.

## Decision
Exclude evolutionary registry manifests (`manifest.json` and `contract-claims.json`) from `K1_SCHEMA_BASELINE`, keeping the pin inventory focused strictly on immutable K1 schema files and fixtures.

## Alternatives
- Re-pinning `manifest.json` on every schema release: Rejected because it misrepresents evolutionary catalogs as frozen K1 contracts.

## Consequences
`K1_SCHEMA_BASELINE` cleanly asserts immutability of K1 schema files and fixtures without breaking when new schemas are registered in the manifest.
