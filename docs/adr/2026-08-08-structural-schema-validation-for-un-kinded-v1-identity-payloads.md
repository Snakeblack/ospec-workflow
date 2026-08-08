# ADR-002: Structural Schema Validation for Un-kinded V1 Identity Payloads

## Status
Accepted

## Context
`validateIdentityKind` allows `SourceSnapshot` and `WorkResult` payloads to omit `kind` for backwards compatibility with v1. However, returning `{ ok: true }` without verifying the payload's structure against the corresponding v1 schema allowed arbitrary un-kinded objects like `{}` to pass `validateIdentityKind({}, "SourceSnapshot")` and `validateIdentityKind({}, "WorkResult")`.

## Decision
Require schema validation for un-kinded `SourceSnapshot` and `WorkResult` payloads in `validateIdentityKind`.
When `kind` is `undefined` for `SourceSnapshot` or `WorkResult`, `validateIdentityKind` MUST validate `payload` against `source-snapshot/v1` or `work-result/v1` schema. Return `{ ok: true }` only if schema validation passes.

## Consequences
- Empty or malformed objects fail `validateIdentityKind` fail-closed.
- V1 payloads without explicit `kind` remain compatible provided they are structurally schema-valid.
