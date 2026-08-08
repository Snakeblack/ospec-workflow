# ADR-002: Strict Shape Validation in Identity Compute Functions

- Status: proposed
- Change: k3-strict-schema-binding-remediation
- Date: 2026-08-08

## Context
`computeSourceSnapshotId`, `computeWorkOrderId`, and `computeWorkResultId` previously defaulted missing required fields (such as `repository_id`, `dependencies`, `ownership`, `allowed_paths`, `commands`, `logs`, `filesystem_inventory`) to empty strings `""`, empty arrays `[]`, or empty objects `{}`. This violated REQ-007 and allowed malformed objects to generate digests.

## Decision
All identity compute functions (`computeSourceSnapshotId`, `computeWorkOrderId`, `computeWorkResultId`, `computeCandidateId`) must fail closed immediately when required fields are missing or enums are invalid (`projection` restricted to `"workspace" | "staged" | "commit"`), eliminating silent default substitution.

## Alternatives
- Silent default substitution: Rejected because it hides missing required fields and violates REQ-007.

## Consequences
Compute functions throw immediately when passed objects with missing or ill-typed required properties.
