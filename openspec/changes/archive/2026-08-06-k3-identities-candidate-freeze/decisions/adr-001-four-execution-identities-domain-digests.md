# ADR-001: Dedicated Domain-Prefixed Fingerprints for Four Execution Identities

- Status: proposed
- Change: k3-identities-candidate-freeze
- Date: 2026-08-07

## Context
The kernel lifecycle requires cryptographic content addressing for execution entities to guarantee deterministic tracking, auditability, and separation of concerns. Without distinct digest domains, structurally similar JSON payloads across different identities could lead to digest collisions or cross-type aliasing.

## Decision
We establish dedicated domain-prefixed SHA-256 fingerprints for `SourceSnapshotId`, `WorkOrderId`, `WorkResultId`, and `CandidateId` via `canonical-json.js`. Each identity uses a distinct domain prefix (`source-snapshot/v1`, `work-order/v1`, `work-result/v1`, `candidate/v1`).

## Alternatives
- Raw SHA-256 over arbitrary JSON strings: Rejected because uncanonicalized keys or missing domain tags allow payload aliasing and collision.
- Shared domain prefix across all kernel IDs: Rejected because cross-type substitution could not be detected at the cryptographic digest level.

## Consequences
- Guarantees cryptographic non-aliasing across all 4 execution identity types.
- Modifying any byte in base tree, diff, modes, or metadata alters the resulting identity digest.
