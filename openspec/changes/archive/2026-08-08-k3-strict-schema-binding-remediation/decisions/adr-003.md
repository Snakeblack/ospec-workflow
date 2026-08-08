# ADR-003: Coherent V1 Kind Discrimination

- Status: proposed
- Change: k3-strict-schema-binding-remediation
- Date: 2026-08-08

## Context
`EXPECTED_KINDS` required `SourceSnapshot` → `"source-snapshot/v1"` and `WorkResult` → `"work-result/v1"`, but the published `source-snapshot/v1.schema.json` and `work-result/v1.schema.json` schemas had `additionalProperties: false` without declaring `kind`. Payloads with `kind` failed schema validation, while payloads without `kind` failed `validateIdentityKind`.

## Decision
Declare optional `kind: "source-snapshot/v1"` in `source-snapshot/v1.schema.json` and `kind: "work-result/v1"` in `work-result/v1.schema.json`, and update `validateIdentityKind` so schema-valid v1 payloads pass both schema and kind validation.

## Alternatives
- Removing `kind` checks for v1: Rejected because positive identity discrimination is required across all identity surfaces.

## Consequences
v1 identity objects can carry `kind` without triggering schema validation errors.
