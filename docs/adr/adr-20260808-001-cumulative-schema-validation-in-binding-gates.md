# ADR-001: Cumulative Schema Validation in Binding Gates

- Status: proposed
- Change: k3-strict-schema-binding-remediation
- Date: 2026-08-08

## Context
`validateWorkOrderBinding` and `validateWorkResultBinding` previously recomputed digests from input objects but did not validate the inputs against their JSON Schemas. Incomplete objects missing required fields could generate self-consistent hashes and pass binding validation with `{ ok: true }`.

## Decision
Require that `validateWorkOrderBinding` and `validateWorkResultBinding` validate `SourceSnapshot`, `WorkOrder`, and `WorkResult` objects against their schemas and required fields before or during cryptographic digest recompute. Payloads failing schema validation fail binding validation.

## Alternatives
- Pure digest recomputing: Rejected because cryptographic integrity without schema validity permits invalid domain payloads.

## Consequences
Payloads must be both schema-valid and digest-valid to pass bindings.
