# ADR-001: Additive evidence and verification v2 contracts

- Status: proposed
- Change: k6b-verifier-evidence-assurance-graph
- Date: 2026-08-27

## Context

K6b requires Candidate-bound provenance and strict evidence/verdict separation. K1 `evidence/v1`, `verification/v1`, their fixtures, and `K1_SCHEMA_BASELINE` are frozen compatibility contracts.

## Decision

Publish `evidence/v2` and `verification/v2` with explicit kinds, closed properties, SHA-256 bindings, and negative non-aliasing fixtures. Register both as additive manifest and contract-claim entries. Keep every v1 byte and K1 pin unchanged.

## Alternatives

- Mutate v1: rejected because it invalidates frozen pins and existing consumers.
- Encode provenance only inside the v1 payload: rejected because it remains optional and cannot enforce verdict separation.
- Create an unversioned K6b envelope: rejected because consumers could not pin a stable contract.

## Consequences

Consumers opt into v2 explicitly and old consumers remain valid. Registry and fixture maintenance grows, but rollback is additive and straightforward. Retirement of v1, if ever justified, requires a separate compatibility change.
